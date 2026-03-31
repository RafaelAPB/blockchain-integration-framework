import { proxyActivities } from "@temporalio/workflow";

export interface HeartbeatMonitorOptions {
  /** Milliseconds without log activity before a session is considered stale.
   *  Default: 60 000 (60 s). */
  staleThresholdMs?: number;
}

export interface HeartbeatMonitorActivities {
  /**
   * Queries the local log repository for sessions with no activity since
   * `(now - staleThresholdMs)`.  Returns their session IDs.
   */
  findStaleSessionsActivity(staleThresholdMs: number): Promise<string[]>;
  /**
   * Publishes a Temporal signal to the SatpTransferWorkflow for a stale
   * session, triggering crash-detection logic.
   */
  signalStaleSessionActivity(sessionId: string): Promise<void>;
}

const { findStaleSessionsActivity, signalStaleSessionActivity } =
  proxyActivities<HeartbeatMonitorActivities>({
    startToCloseTimeout: "2 minutes",
    retry: { maximumAttempts: 3 },
  });

/**
 * Heartbeat monitor workflow — one execution per Schedule tick.
 *
 * Finds SATP sessions with no recent log activity (stale) and signals their
 * running `SatpTransferWorkflow` instances so crash detection can begin.
 *
 * Deploy as a Temporal Schedule (e.g. every 30 s) rather than as a long-
 * running loop, to benefit from Temporal's scheduling, history compaction,
 * and visibility tooling.
 *
 * @param options Heartbeat monitor configuration.
 */
export async function heartbeatMonitorWorkflow(
  options?: HeartbeatMonitorOptions,
): Promise<string[]> {
  const staleThresholdMs = options?.staleThresholdMs ?? 60_000;

  const staleSessions = await findStaleSessionsActivity(staleThresholdMs);

  for (const sessionId of staleSessions) {
    await signalStaleSessionActivity(sessionId);
  }

  return staleSessions;
}
