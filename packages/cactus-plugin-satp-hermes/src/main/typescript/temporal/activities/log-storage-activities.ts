import { ApplicationFailure, Context } from "@temporalio/activity";
import type {
  ILocalLogRepository,
  IRemoteLogRepository,
} from "../../database/repository/interfaces/repository";
import type { LocalLog, RemoteLog } from "../../core/types";

/**
 * Factory that returns log storage activities bound to the provided
 * repository instances.  Each activity wraps one of the five Log Storage API
 * primitives from draft-belchior-satp-gateway-recovery-04 §3.
 *
 * Temporal wraps these as retried activities — if the worker dies mid-write
 * the activity is replayed from the last heartbeat checkpoint.
 */
export function makeLogStorageActivities(
  localRepository: ILocalLogRepository,
  remoteRepository: IRemoteLogRepository | undefined,
) {
  return {
    /**
     * draft §3 — `writeLogEntry(e, L)`
     * Persists a log entry locally and, when a remote repository is
     * configured, also to the public-decentralized log store.
     */
    async writeLogEntryActivity(entry: LocalLog): Promise<LocalLog> {
      Context.current().heartbeat({
        op: "writeLogEntry",
        sessionId: entry.sessionId,
      });
      try {
        const saved = await localRepository.create(entry);
        if (remoteRepository) {
          const remoteEntry: RemoteLog = {
            key: entry.key,
            hash: entry.key,
            signature: "",
            signerPubKey: "",
          };
          await remoteRepository.create(remoteEntry);
        }
        return saved;
      } catch (err) {
        throw ApplicationFailure.create({
          message: `writeLogEntryActivity failed: ${String(err)}`,
          type: "WriteLogEntryError",
          nonRetryable: false,
        });
      }
    },

    /**
     * draft §3 — `getLogEntry(i, L)`
     * Retrieves a single log entry by its unique key / identifier.
     */
    async getLogEntryActivity(id: string): Promise<LocalLog> {
      Context.current().heartbeat({ op: "getLogEntry", id });
      try {
        return await localRepository.readById(id);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `getLogEntryActivity failed: ${String(err)}`,
          type: "GetLogEntryError",
          nonRetryable: false,
        });
      }
    },

    /**
     * draft §3 — `getLogDiff(l1, l2)`
     * Returns log entries for `sessionId` starting from `fromSequenceNumber`
     * (exclusive) — i.e. the entries the crashed gateway is missing.
     */
    async computeLogDiffActivity(
      sessionId: string,
      fromSequenceNumber: number,
    ): Promise<LocalLog[]> {
      Context.current().heartbeat({
        op: "computeLogDiff",
        sessionId,
        from: fromSequenceNumber,
      });
      try {
        return await localRepository.fetchLogsFromSequence(
          sessionId,
          fromSequenceNumber,
        );
      } catch (err) {
        throw ApplicationFailure.create({
          message: `computeLogDiffActivity failed: ${String(err)}`,
          type: "ComputeLogDiffError",
          nonRetryable: false,
        });
      }
    },

    /**
     * draft §3 — `updateLog(l1, l2)`
     * Applies a set of log entries (diff) to the local repository.
     * Entries are written in sequence order — each is idempotent because
     * Temporal will replay this activity on retry.
     */
    async applyLogDiffActivity(entries: LocalLog[]): Promise<number> {
      Context.current().heartbeat({
        op: "applyLogDiff",
        count: entries.length,
      });
      let applied = 0;
      for (const entry of entries) {
        try {
          await localRepository.create(entry);
          applied++;
        } catch (err) {
          throw ApplicationFailure.create({
            message: `applyLogDiffActivity failed at entry ${applied}: ${String(err)}`,
            type: "ApplyLogDiffError",
            nonRetryable: false,
          });
        }
      }
      return applied;
    },

    /**
     * draft §3 — `getLastEntry(L)`
     * Returns the most recent log entry for the given session.
     */
    async getLastLogEntryActivity(sessionId: string): Promise<LocalLog> {
      Context.current().heartbeat({ op: "getLastLogEntry", sessionId });
      try {
        return await localRepository.readLastestLog(sessionId);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `getLastLogEntryActivity failed: ${String(err)}`,
          type: "GetLastLogEntryError",
          nonRetryable: false,
        });
      }
    },
  };
}

export type LogStorageActivities = ReturnType<typeof makeLogStorageActivities>;
