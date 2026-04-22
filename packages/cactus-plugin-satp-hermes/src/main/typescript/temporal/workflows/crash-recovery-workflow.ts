import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  startChild,
} from "@temporalio/workflow";
import type { LocalLog } from "../../core/types";
import type { CrashRecoveryActivities } from "../activities/crash-recovery-activities";
import type { LogStorageActivities } from "../activities/log-storage-activities";
import { rollbackWorkflow } from "./rollback-workflow";

// Re-export so that when this module is used as the Temporal workflow bundle
// root, `rollbackWorkflow` is a top-level named export.  Without this the
// bundler includes the module's code but does not expose the function by name,
// causing Temporal to throw
// `Failed to initialize workflow of type 'rollbackWorkflow': no such function
// is exported by the workflow bundle`.
export { rollbackWorkflow } from "./rollback-workflow";

// ---------------------------------------------------------------------------
// Signal and query definitions
// ---------------------------------------------------------------------------

/**
 * Payload emitted by the ConnectRPC server handler (T19) when a
 * RecoverUpdate message arrives from the counterparty.
 */
export interface RecoverUpdatePayload {
  sessionId: string;
  /** Log entries from the counterparty's diff — ready to apply locally. */
  entries: LocalLog[];
}

/** Emitted by server-side handler when RecoverSuccess arrives. */
export interface RecoverSuccessPayload {
  sessionId: string;
}

export const recoverUpdateSignal =
  defineSignal<[RecoverUpdatePayload]>("recoverUpdate");
export const recoverSuccessSignal =
  defineSignal<[RecoverSuccessPayload]>("recoverSuccess");

export const sessionStateQuery = defineQuery<string>("sessionState");

// ---------------------------------------------------------------------------
// Activity proxies
// ---------------------------------------------------------------------------

const { sendRecoverActivity } = proxyActivities<CrashRecoveryActivities>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 3 },
});

const { applyLogDiffActivity } = proxyActivities<LogStorageActivities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3 },
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Crash-recovery child workflow — forward-recovery path.
 *
 * Implements the four-message sub-protocol from
 * draft-belchior-satp-gateway-recovery-04 §5.3:
 *
 *   1. RECOVER          — crashed GW sends RecoverRequest to counterparty
 *   2. RECOVER-UPDATE   — counterparty sends log diff (arrives via signal)
 *   3. (apply log diff) — workflow applies diff via log-storage activity
 *   4. RECOVER-SUCCESS  — counterparty confirms (arrives via signal)
 *
 * On timeout at steps 2 or 4, the workflow starts a `rollbackWorkflow` child.
 *
 * @param sessionId  The SATP session identifier.
 * @param timeoutMs  Per-step wait timeout in milliseconds (default 30 s).
 */
export async function crashRecoveryChildWorkflow(
  sessionId: string,
  timeoutMs = 30_000,
): Promise<void> {
  let state = "RECOVERING";
  let recoverUpdatePayload: RecoverUpdatePayload | undefined;
  let recoverSuccessReceived = false;

  setHandler(recoverUpdateSignal, (payload) => {
    recoverUpdatePayload = payload;
  });
  setHandler(recoverSuccessSignal, () => {
    recoverSuccessReceived = true;
  });
  setHandler(sessionStateQuery, () => state);

  // Step 1 — send RECOVER to counterparty
  state = "SENDING_RECOVER";
  await sendRecoverActivity(sessionId);

  // Step 2 — wait for RECOVER-UPDATE signal
  state = "WAITING_RECOVER_UPDATE";
  const updateReceived = await condition(
    () => recoverUpdatePayload !== undefined,
    timeoutMs,
  );
  if (!updateReceived) {
    state = "TIMED_OUT";
    await startChild(rollbackWorkflow, { args: [sessionId] });
    return;
  }

  // Step 3 — apply log diff received with RECOVER-UPDATE
  state = "APPLYING_LOG_DIFF";
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  await applyLogDiffActivity(recoverUpdatePayload!.entries);

  // Step 4 — wait for RECOVER-SUCCESS signal
  state = "WAITING_RECOVER_SUCCESS";
  const successReceived = await condition(
    () => recoverSuccessReceived,
    timeoutMs,
  );
  if (!successReceived) {
    state = "TIMED_OUT";
    await startChild(rollbackWorkflow, { args: [sessionId] });
    return;
  }

  state = "RECOVERED";
}
