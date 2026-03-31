import { ApplicationFailure, Context } from "@temporalio/activity";
import { Client } from "@temporalio/client";
import type { ILocalLogRepository } from "../../database/repository/interfaces/repository";
import { recoverRequestSignal } from "../workflows/satp-transfer-workflow";

/**
 * Factory that returns heartbeat-monitor activities bound to the provided
 * log repository and Temporal client.
 *
 * These activities implement the draft §5.1 heartbeat-based failure detection:
 * - `findStaleSessionsActivity` — queries the log repository to find sessions
 *   whose last log entry is older than the configured threshold.
 * - `signalStaleSessionActivity` — sends `recoverRequestSignal` to the
 *   running `SatpTransferWorkflow` for the identified stale session.
 *
 * Both activities are called by `HeartbeatMonitorWorkflow`, which runs as a
 * Temporal Schedule (e.g. every 30 s).
 */
export function makeMonitorActivities(
  localRepository: ILocalLogRepository,
  temporalClient: Client,
) {
  return {
    /**
     * draft §5.1 — heartbeat failure detection.
     *
     * Returns the session IDs of SATP sessions that have had no new log
     * activity within the `staleThresholdMs` window.  A session is considered
     * stale when its most recent log entry timestamp is older than
     * `Date.now() - staleThresholdMs`.
     *
     * Algorithm:
     *  1. Get all unique session IDs by reading all non-proof log entries.
     *  2. Get session IDs that have had recent activity (cutoff = now − threshold).
     *  3. Return the difference: all sessions minus recently active ones.
     */
    async findStaleSessionsActivity(
      staleThresholdMs: number,
    ): Promise<string[]> {
      Context.current().heartbeat({
        op: "findStaleSessions",
        staleThresholdMs,
      });
      try {
        const cutoffDate = new Date(Date.now() - staleThresholdMs);
        const cutoffIso = cutoffDate.toISOString();

        const allLogs = await localRepository.readLogsNotProofs();
        const allSessionIds = new Set(allLogs.map((l) => l.sessionId));

        const recentLogs =
          await localRepository.readLogsMoreRecentThanTimestamp(cutoffIso);
        const recentSessionIds = new Set(recentLogs.map((l) => l.sessionId));

        return [...allSessionIds].filter((id) => !recentSessionIds.has(id));
      } catch (err) {
        throw ApplicationFailure.create({
          message: `findStaleSessionsActivity failed: ${String(err)}`,
          type: "FindStaleSessionsError",
          nonRetryable: false,
        });
      }
    },

    /**
     * draft §5.1 — signals the `SatpTransferWorkflow` of a stale session to
     * begin crash-recovery.
     *
     * Uses the Temporal client to deliver `recoverRequestSignal` to the
     * workflow identified as `satp-transfer-{sessionId}`. If the workflow is
     * no longer running, the error is swallowed (the session may have already
     * completed or aborted) and a non-retryable failure is NOT thrown.
     */
    async signalStaleSessionActivity(sessionId: string): Promise<void> {
      Context.current().heartbeat({ op: "signalStaleSession", sessionId });
      try {
        const handle = temporalClient.workflow.getHandle(
          `satp-transfer-${sessionId}`,
        );
        await handle.signal(recoverRequestSignal, { sessionId });
      } catch (err) {
        // WorkflowNotFoundError → session already completed; safe to ignore.
        const errStr = String(err);
        if (
          errStr.includes("workflow not found") ||
          errStr.includes("WorkflowExecutionAlreadyStartedError")
        ) {
          return;
        }
        throw ApplicationFailure.create({
          message: `signalStaleSessionActivity failed for session ${sessionId}: ${errStr}`,
          type: "SignalStaleSessionError",
          nonRetryable: false,
        });
      }
    },
  };
}

export type MonitorActivities = ReturnType<typeof makeMonitorActivities>;
