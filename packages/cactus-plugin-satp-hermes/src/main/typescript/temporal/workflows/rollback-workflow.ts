import {
  ApplicationFailure,
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type { CrashRecoveryActivities } from "../activities/crash-recovery-activities";

export interface RollbackAckPayload {
  sessionId: string;
}

export const rollbackAckSignal =
  defineSignal<[RollbackAckPayload]>("rollbackAck");
export const rollbackStateQuery = defineQuery<string>("rollbackState");

const { sendRollbackActivity, executeRollbackActivity } =
  proxyActivities<CrashRecoveryActivities>({
    startToCloseTimeout: "2 minutes",
    retry: { maximumAttempts: 3 },
  });

/**
 * Rollback sub-protocol workflow — ROLLBACK → ROLLBACK-ACK.
 *
 * Draft-belchior-satp-gateway-recovery-04 §5.4.
 *
 * Flow:
 *  1. executeRollbackActivity — runs the compensating strategy (unlocks asset, etc.)
 *  2. sendRollbackActivity — sends ROLLBACK message to counterparty
 *  3. Wait for rollbackAckSignal from the server-side handler (T19)
 *  4. If ack does not arrive within timeoutMs → fail with RollbackAckTimeout
 *
 * @param sessionId  SATP session identifier.
 * @param timeoutMs  Per-step wait timeout in milliseconds (default 30 s).
 */
export async function rollbackWorkflow(
  sessionId: string,
  timeoutMs = 30_000,
): Promise<void> {
  let state = "ROLLING_BACK";
  let rollbackAckReceived = false;

  setHandler(rollbackAckSignal, () => {
    rollbackAckReceived = true;
  });
  setHandler(rollbackStateQuery, () => state);

  // Step 1 — execute compensating strategy (unlock assets, reset ledger state)
  state = "EXECUTING_ROLLBACK";
  const rollbackState = await executeRollbackActivity(sessionId);

  // Step 2 — send ROLLBACK message to counterparty
  state = "SENDING_ROLLBACK";
  await sendRollbackActivity(sessionId, rollbackState);

  // Step 3 — wait for ROLLBACK-ACK
  state = "WAITING_ROLLBACK_ACK";
  const ackReceived = await condition(() => rollbackAckReceived, timeoutMs);
  if (!ackReceived) {
    state = "TIMED_OUT";
    throw ApplicationFailure.create({
      message: `ROLLBACK-ACK not received within ${timeoutMs}ms for session ${sessionId}`,
      type: "RollbackAckTimeout",
      nonRetryable: true,
    });
  }

  state = "ROLLED_BACK";
}
