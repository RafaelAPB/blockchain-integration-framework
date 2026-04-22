import {
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  startChild,
} from "@temporalio/workflow";
import { crashRecoveryChildWorkflow } from "./crash-recovery-workflow";
import { rollbackWorkflow } from "./rollback-workflow";

// Re-export child workflows so the Temporal workflow bundle (rooted at this
// module) exposes them by name. Without these re-exports the bundler drops the
// child workflow function names from the top-level namespace and Temporal's
// `startChild()` calls fail with
// `Failed to initialize workflow of type 'rollbackWorkflow' / 'crashRecoveryChildWorkflow'`.
export { crashRecoveryChildWorkflow } from "./crash-recovery-workflow";
export { rollbackWorkflow } from "./rollback-workflow";

// ---------------------------------------------------------------------------
// Signal definitions — emitted by crash-handler.ts T19 signal bridge
// ---------------------------------------------------------------------------

export interface RecoverRequestPayload {
  sessionId: string;
}

export interface RollbackRequestPayload {
  sessionId: string;
}

export const recoverRequestSignal =
  defineSignal<[RecoverRequestPayload]>("recoverRequest");
export const rollbackRequestSignal =
  defineSignal<[RollbackRequestPayload]>("rollbackRequest");

// ---------------------------------------------------------------------------
// Query definitions
// ---------------------------------------------------------------------------

export const transferSessionStateQuery = defineQuery<string>(
  "transferSessionState",
);
export const transferLogQuery = defineQuery<string[]>("transferLog");

// ---------------------------------------------------------------------------
// Activity proxies
// (Use "unknown" return/param types because proto message objects cannot
//  be imported into the workflow sandbox — they flow through opaquely)
// ---------------------------------------------------------------------------

const {
  sendNewSessionRequest,
  sendPreSatpTransferRequest,
  sendTransferProposalRequest,
  sendTransferCommenceRequest,
  sendLockAssertionRequest,
  sendCommitPreparationRequest,
  sendCommitFinalAssertionRequest,
  sendTransferCompleteRequest,
} = proxyActivities<{
  sendNewSessionRequest(sessionId: string): Promise<unknown>;
  sendPreSatpTransferRequest(
    response: unknown,
    sessionId: string,
  ): Promise<unknown>;
  sendTransferProposalRequest(
    sessionId: string,
    response: unknown,
  ): Promise<unknown>;
  sendTransferCommenceRequest(response: unknown): Promise<unknown>;
  sendLockAssertionRequest(response: unknown): Promise<unknown>;
  sendCommitPreparationRequest(response: unknown): Promise<unknown>;
  sendCommitFinalAssertionRequest(response: unknown): Promise<unknown>;
  sendTransferCompleteRequest(response: unknown): Promise<void>;
}>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3 },
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Main SATP asset-transfer orchestrator workflow.
 *
 * Drives the full stage 0→3 forward path, maintaining a Saga compensation
 * array so any failure can trigger rollback in reverse order.
 *
 * Signal handlers (registered before any await):
 *  - recoverRequestSignal  — counterparty asks crashed GW to begin recovery
 *  - rollbackRequestSignal — counterparty asks crashed GW to abort + rollback
 *
 * Query handlers:
 *  - transferSessionState — current human-readable state string
 *  - transferLog          — ordered list of completed stages
 *
 * On any activity failure the workflow:
 *  1. Starts a crashRecoveryChildWorkflow for forward recovery
 *  2. Falls back to rollbackWorkflow if recovery times out or fails
 *
 * @param sessionId  SATP session identifier.
 */
export async function satpTransferWorkflow(sessionId: string): Promise<void> {
  let state = "STARTING";
  const log: string[] = [];
  let recoverRequested = false;
  let rollbackRequested = false;

  // Register signal handlers before any await (Temporal determinism rule)
  setHandler(recoverRequestSignal, () => {
    recoverRequested = true;
  });
  setHandler(rollbackRequestSignal, () => {
    rollbackRequested = true;
  });
  setHandler(transferSessionStateQuery, () => state);
  setHandler(transferLogQuery, () => [...log]);

  function checkpoint(stage: string): void {
    state = stage;
    log.push(stage);
  }

  async function runWithRecovery<T>(
    stage: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      checkpoint(`FAILED:${stage}`);
      // Try crash recovery first, then rollback
      try {
        checkpoint("RECOVERY_STARTED");
        await startChild(crashRecoveryChildWorkflow, { args: [sessionId] });
        // Re-attempt the activity after recovery
        return await fn();
      } catch {
        checkpoint("ROLLBACK_STARTED");
        await startChild(rollbackWorkflow, { args: [sessionId] });
        throw err;
      }
    }
  }

  // Check for external abort signals (non-blocking — inspect state)
  function checkAbort(): void {
    if (rollbackRequested) {
      throw new Error(`Rollback requested for session ${sessionId}`);
    }
    if (recoverRequested) {
      // Recovery is driven by crashRecoveryChildWorkflow
    }
  }

  try {
    // -- Stage 0 --
    checkpoint("STAGE0_NEW_SESSION");
    const newSessionReq = await runWithRecovery("newSession", () =>
      sendNewSessionRequest(sessionId),
    );

    checkAbort();
    checkpoint("STAGE0_PRE_SATP");
    const preSatpReq = await runWithRecovery("preSatpTransfer", () =>
      sendPreSatpTransferRequest(newSessionReq, sessionId),
    );

    // -- Stage 1 --
    checkpoint("STAGE1_TRANSFER_PROPOSAL");
    checkAbort();
    const proposalReq = await runWithRecovery("transferProposal", () =>
      sendTransferProposalRequest(sessionId, preSatpReq),
    );

    checkpoint("STAGE1_TRANSFER_COMMENCE");
    checkAbort();
    const commenceReq = await runWithRecovery("transferCommence", () =>
      sendTransferCommenceRequest(proposalReq),
    );

    // -- Stage 2 --
    checkpoint("STAGE2_LOCK_ASSERTION");
    checkAbort();
    const lockReq = await runWithRecovery("lockAssertion", () =>
      sendLockAssertionRequest(commenceReq),
    );

    // -- Stage 3 --
    checkpoint("STAGE3_COMMIT_PREPARATION");
    checkAbort();
    const commitPrepReq = await runWithRecovery("commitPreparation", () =>
      sendCommitPreparationRequest(lockReq),
    );

    checkpoint("STAGE3_COMMIT_FINAL_ASSERTION");
    checkAbort();
    const commitFinalReq = await runWithRecovery("commitFinalAssertion", () =>
      sendCommitFinalAssertionRequest(commitPrepReq),
    );

    checkpoint("STAGE3_TRANSFER_COMPLETE");
    checkAbort();
    await runWithRecovery("transferComplete", () =>
      sendTransferCompleteRequest(commitFinalReq),
    );

    checkpoint("COMPLETED");
  } catch (err) {
    // Always emit ABORTED on the failure path. Rollback (when started) is a
    // separate compensating workflow; the parent transfer workflow itself
    // still reaches an aborted terminal state and that fact must be visible
    // both via the transferLog and the transferSessionState query.
    checkpoint("ABORTED");
    throw err;
  }
}
