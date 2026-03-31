import { ApplicationFailure, Context } from "@temporalio/activity";
import type { CrashRecoveryHandler } from "../../core/crash-management/crash-handler";
import type { RollbackStrategyFactory } from "../../core/crash-management/rollback/rollback-strategy-factory";
import type { SATPSession } from "../../core/satp-session";
import type { RollbackState } from "../../generated/proto/cacti/satp/v13/service/crash_recovery_pb";
import type { MonitorService } from "../../services/monitoring/monitor";

/**
 * Factory that returns crash-recovery activities bound to the provided
 * handler, strategy factory, and session map.
 *
 * All activities accept a plain `sessionId: string` (Temporal-serializable)
 * so that no proto objects are transported through the Temporal data converter.
 * Sessions are looked up at runtime from the injected `sessions` map.
 *
 * Design note: existing handler methods are NOT modified — they are called
 * verbatim from inside each activity function.
 */
export function makeCrashRecoveryActivities(
  sessions: Map<string, SATPSession>,
  handler: CrashRecoveryHandler,
  rollbackStrategyFactory: RollbackStrategyFactory,
  monitorService: MonitorService,
) {
  function requireSession(sessionId: string): SATPSession {
    const s = sessions.get(sessionId);
    if (!s) {
      throw ApplicationFailure.create({
        message: `Session not found: ${sessionId}`,
        type: "SessionNotFoundError",
        nonRetryable: true,
      });
    }
    return s;
  }

  return {
    /**
     * RECOVER (draft §5.3.1) — sent by the crashed gateway to the counterparty.
     * Corresponds to `CrashRecoveryHandler.sendRecoverRequest`.
     */
    async sendRecoverActivity(sessionId: string): Promise<void> {
      Context.current().heartbeat({ stage: "sendRecover", sessionId });
      await monitorService.updateCounter("crash_recovery_attempts", 1, {
        "satp.session_id": sessionId,
      });
      const session = requireSession(sessionId);
      const sessionData =
        session.getClientSessionData() || session.getServerSessionData();
      try {
        await handler.sendRecoverRequest(sessionData);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendRecoverActivity failed: ${String(err)}`,
          type: "RecoverSendError",
          nonRetryable: false,
        });
      }
    },

    /**
     * RECOVER-SUCCESS (draft §5.3.3) — sent by the crashed gateway after
     * applying the log diff to confirm synchronisation.
     * Corresponds to `CrashRecoveryHandler.sendRecoverSuccessRequest`.
     */
    async sendRecoverSuccessActivity(sessionId: string): Promise<void> {
      Context.current().heartbeat({ stage: "sendRecoverSuccess", sessionId });
      const session = requireSession(sessionId);
      const sessionData =
        session.getClientSessionData() || session.getServerSessionData();
      try {
        await handler.sendRecoverSuccessRequest(sessionData);
        await monitorService.updateCounter("crash_recovery_successes", 1, {
          "satp.session_id": sessionId,
        });
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendRecoverSuccessActivity failed: ${String(err)}`,
          type: "RecoverSuccessSendError",
          nonRetryable: false,
        });
      }
    },

    /**
     * ROLLBACK (draft §5.3.4) — sends the rollback request to the counterparty.
     * Corresponds to `CrashRecoveryHandler.sendRollbackRequest`.
     */
    async sendRollbackActivity(
      sessionId: string,
      rollbackState: RollbackState,
    ): Promise<void> {
      Context.current().heartbeat({ stage: "sendRollback", sessionId });
      await monitorService.updateCounter("rollback_count", 1, {
        "satp.session_id": sessionId,
      });
      const session = requireSession(sessionId);
      const sessionData =
        session.getClientSessionData() || session.getServerSessionData();
      try {
        await handler.sendRollbackRequest(sessionData, rollbackState);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendRollbackActivity failed: ${String(err)}`,
          type: "RollbackSendError",
          nonRetryable: false,
        });
      }
    },

    /**
     * Executes the appropriate rollback strategy for the given session by
     * delegating to `RollbackStrategyFactory.createStrategy().execute()`.
     */
    async executeRollbackActivity(sessionId: string): Promise<RollbackState> {
      const satpSession = requireSession(sessionId);
      const sessionData =
        satpSession.getClientSessionData() ||
        satpSession.getServerSessionData();
      Context.current().heartbeat({ stage: "executeRollback", sessionId });
      const startMs = Date.now();
      try {
        const strategy = rollbackStrategyFactory.createStrategy(sessionData);
        const role = sessionData.role;
        const state = await strategy.execute(satpSession, role);
        await monitorService.recordHistogram(
          "rollback_duration_ms",
          Date.now() - startMs,
          { "satp.session_id": sessionId },
        );
        return state;
      } catch (err) {
        if (err instanceof ApplicationFailure) throw err;
        throw ApplicationFailure.create({
          message: `executeRollbackActivity failed: ${String(err)}`,
          type: "ExecuteRollbackError",
          nonRetryable: false,
        });
      }
    },
  };
}

export type CrashRecoveryActivities = ReturnType<
  typeof makeCrashRecoveryActivities
>;
