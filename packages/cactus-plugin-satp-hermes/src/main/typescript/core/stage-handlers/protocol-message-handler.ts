/**
 * @fileoverview Protocol Message Handler for SATP v13 cross-stage control messages.
 *
 * Handles Reject, Error, and SessionAbort messages (v13 §8.5, §10.6, §10.7)
 * via a dedicated ConnectRPC service that runs at path `/protocol/...`.
 * These messages may be received at any point during a SATP session.
 *
 * @see {@link https://www.ietf.org/archive/id/draft-ietf-satp-core-13.txt} IETF SATP v13
 * @module core/stage-handlers/protocol-message-handler
 * @since 0.0.3-beta
 */

import type { ConnectRouter } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import type { LogLevelDesc } from "@hyperledger/cactus-common";
import { SATPLoggerProvider as LoggerProvider } from "../satp-logger-provider";
import type { SATPLogger as Logger } from "../satp-logger";
import {
  ProtocolMessageService,
  AbortSessionAckSchema,
  ErrorSessionAckSchema,
  RejectSessionAckSchema,
} from "../../generated/proto/cacti/satp/v13/service/protocol_messages_pb";
import type {
  AbortSessionAck,
  ErrorSessionAck,
  RejectSessionAck,
} from "../../generated/proto/cacti/satp/v13/service/protocol_messages_pb";
import type { RejectMessage } from "../../generated/proto/cacti/satp/v13/common/message_pb";
import type { ErrorMessage } from "../../generated/proto/cacti/satp/v13/common/message_pb";
import type { SessionAbortMessage } from "../../generated/proto/cacti/satp/v13/common/message_pb";
import { MessageType } from "../../generated/proto/cacti/satp/v13/common/message_pb";
import type { SATPSession } from "../satp-session";
import type { SATPHandler, SATPHandlerType } from "../../types/satp-protocol";
import { checkAbortEffectiveness } from "../stage-services/protocol-message-service";
import type { MonitorService } from "../../services/monitoring/monitor";
import { context, SpanStatusCode } from "@opentelemetry/api";

/**
 * Options for constructing a {@link ProtocolMessageHandler}.
 */
export interface IProtocolMessageHandlerOptions {
  /** Active sessions map shared with stage handlers. */
  sessions: Map<string, SATPSession>;
  /** Log level for this handler. */
  logLevel?: LogLevelDesc;
  /** Monitoring service for tracing and metrics. */
  monitorService: MonitorService;
}

/**
 * ConnectRPC handler for SATP v13 cross-stage protocol control messages.
 *
 * Registers the `ProtocolMessageService` at the `/protocol` path prefix and
 * routes incoming Reject, Error, and SessionAbort messages to the
 * `protocol-message-service.ts` utility functions.
 *
 * @since 0.0.3-beta
 */
export class ProtocolMessageHandler implements SATPHandler {
  public static readonly HANDLER_IDENTIFIER = "protocol-handler" as const;
  public static readonly STAGE = "protocol" as const;

  private readonly logger: Logger;
  private readonly sessions: Map<string, SATPSession>;
  private readonly monitorService: MonitorService;

  constructor(options: IProtocolMessageHandlerOptions) {
    this.sessions = options.sessions;
    this.monitorService = options.monitorService;
    this.logger = LoggerProvider.getOrCreate(
      {
        level: options.logLevel ?? "INFO",
        label: "ProtocolMessageHandler",
      },
      options.monitorService,
    );
  }

  /** Strips control characters and truncates to 256 chars to prevent log injection. */
  private static sanitizeForLog(value: string): string {
    // eslint-disable-next-line no-control-regex -- intentional: strip control chars for log injection prevention
    return value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 256);
  }

  /** Implements {@link SATPHandler.getHandlerIdentifier}. */
  getHandlerIdentifier(): SATPHandlerType {
    return ProtocolMessageHandler.HANDLER_IDENTIFIER as SATPHandlerType;
  }

  /** Implements {@link SATPHandler.getHandlerSessions}. */
  getHandlerSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /** Implements {@link SATPHandler.getStage}. */
  getStage(): string {
    return ProtocolMessageHandler.STAGE;
  }

  /**
   * Register the {@link ProtocolMessageService} routes on the ConnectRouter.
   *
   * Called by {@link GatewayOrchestrator.startServices} when the GOL server
   * is started. The service handles RPC methods `RejectSession`, `ErrorSession`,
   * and `AbortSession`.
   */
  setupRouter(router: ConnectRouter): void {
    const fnTag = `${ProtocolMessageHandler.HANDLER_IDENTIFIER}#setupRouter()`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, () => {
      try {
        router.service(ProtocolMessageService, {
          rejectSession: (req) => this.handleRejectSession(req),
          errorSession: (req) => this.handleErrorSession(req),
          abortSession: (req) => this.handleAbortSession(req),
        });
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  // ============================================================================
  // SERVER-SIDE IMPLEMENTATIONS
  // ============================================================================

  /**
   * Handle an incoming Reject Message (v13 §8.5).
   *
   * Terminates the identified session immediately.
   */
  private async handleRejectSession(
    req: RejectMessage,
  ): Promise<RejectSessionAck> {
    const sessionId = req.common?.sessionId ?? "";
    const fnTag = `handleRejectSession(session=${ProtocolMessageHandler.sanitizeForLog(sessionId)})`;
    this.logger.info(
      `${fnTag}: received RejectMessage reasonCode=${ProtocolMessageHandler.sanitizeForLog(req.reasonCode)}`,
    );

    if (sessionId && this.sessions.has(sessionId)) {
      // Mark the session terminated; full rollback is handled by CrashManager.
      this.sessions.delete(sessionId);
      this.logger.info(`${fnTag}: session terminated by remote gateway`);
    } else {
      this.logger.warn(
        `${fnTag}: no active session found for id=${ProtocolMessageHandler.sanitizeForLog(sessionId)}`,
      );
    }

    return create(RejectSessionAckSchema, {
      sessionId,
      accepted: true,
      reason: `Reject received and processed (reasonCode=${req.reasonCode})`,
    });
  }

  /**
   * Handle an incoming Error Message (v13 §10.6).
   *
   * Logs the error and marks the session as errored.
   */
  private async handleErrorSession(
    req: ErrorMessage,
  ): Promise<ErrorSessionAck> {
    const sessionId = req.common?.sessionId ?? "";
    const fnTag = `handleErrorSession(session=${ProtocolMessageHandler.sanitizeForLog(sessionId)})`;
    this.logger.warn(
      `${fnTag}: received ErrorMessage type=${ProtocolMessageHandler.sanitizeForLog(req.errorType)} ` +
        `severity=${ProtocolMessageHandler.sanitizeForLog(req.errorSeverity)} ` +
        `msgType=${ProtocolMessageHandler.sanitizeForLog(req.errorMsgType)}`,
    );

    if (!sessionId || !this.sessions.has(sessionId)) {
      this.logger.warn(
        `${fnTag}: no active session found for id=${ProtocolMessageHandler.sanitizeForLog(sessionId)}`,
      );
      return create(ErrorSessionAckSchema, {
        sessionId,
        accepted: false,
        reason: "Session not found",
      });
    }

    return create(ErrorSessionAckSchema, {
      sessionId,
      accepted: true,
      reason: `Error received (type=${req.errorType} severity=${req.errorSeverity})`,
    });
  }

  /**
   * Handle an incoming Session Abort Message (v13 §10.7).
   *
   * Checks abort effectiveness per v13 §11.4 and, if effective, terminates
   * the session.
   */
  private async handleAbortSession(
    req: SessionAbortMessage,
  ): Promise<AbortSessionAck> {
    const sessionId = req.common?.sessionId ?? "";
    const fnTag = `handleAbortSession(session=${ProtocolMessageHandler.sanitizeForLog(sessionId)})`;
    this.logger.info(`${fnTag}: received SessionAbortMessage`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `${fnTag}: no active session found for id=${ProtocolMessageHandler.sanitizeForLog(sessionId)}`,
      );
      return create(AbortSessionAckSchema, {
        sessionId,
        accepted: false,
        reason: "Session not found",
      });
    }

    // Derive the last completed message type from server-side session state.
    // Using session-stored messages prevents a remote peer from manipulating
    // the effectiveness check via the req.common.messageType field (v13 §11.4).
    const sessionData =
      session.getClientSessionData() ?? session.getServerSessionData();
    const s3 = sessionData?.satpMessages?.stage3;

    let lastMsgType: MessageType = MessageType.UNSPECIFIED;
    if (s3?.transferCompleteResponseMessage != null) {
      lastMsgType = MessageType.COMMIT_TRANSFER_COMPLETE_RESPONSE;
    } else if (s3?.transferCompleteMessage != null) {
      lastMsgType = MessageType.COMMIT_TRANSFER_COMPLETE;
    } else if (s3?.commitFinalAcknowledgementReceiptResponseMessage != null) {
      lastMsgType = MessageType.ACK_COMMIT_FINAL;
    } else if (s3?.commitFinalAssertionRequestMessage != null) {
      lastMsgType = MessageType.COMMIT_FINAL;
    }

    const effectiveness = checkAbortEffectiveness(lastMsgType);
    this.logger.info(
      `${fnTag}: abort effectiveness=${effectiveness.effective} stage=${effectiveness.stage} reason=${effectiveness.reason}`,
    );

    if (effectiveness.effective) {
      this.sessions.delete(sessionId);
    }

    return create(AbortSessionAckSchema, {
      sessionId,
      accepted: effectiveness.effective,
      reason: effectiveness.reason,
    });
  }
}
