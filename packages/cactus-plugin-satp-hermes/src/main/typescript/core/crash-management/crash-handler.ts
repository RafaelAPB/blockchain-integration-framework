import type { ConnectRouter } from "@connectrpc/connect";
import type { WorkflowClient as TemporalWorkflowClient } from "@temporalio/client";
import type { SATPLogger as Logger } from "../../core/satp-logger";
import { CrashRecoveryService } from "../../generated/proto/cacti/satp/v13/service/crash_recovery_pb";
import type { RecoverSuccessResponse } from "../../generated/proto/cacti/satp/v13/service/crash_recovery_pb";
import type { CrashRecoveryServerService } from "./server-service";
import type { CrashRecoveryClientService } from "./client-service";
import type {
  RecoverRequest,
  RecoverResponse,
  RecoverSuccessRequest,
  RollbackRequest,
  RollbackResponse,
  RollbackState,
} from "../../generated/proto/cacti/satp/v13/service/crash_recovery_pb";
import { type SATPHandler, SATPHandlerType } from "../../types/satp-protocol";
import type { SessionData } from "../../generated/proto/cacti/satp/v13/session/session_pb";
import { context, SpanStatusCode } from "@opentelemetry/api";
import { MonitorService } from "../../services/monitoring/monitor";

// Signal name constants — mirrors definitions in temporal/workflows/satp-transfer-workflow.ts
// Defined locally to avoid importing from the Temporal workflow sandbox.
const RECOVER_REQUEST_SIGNAL = "recoverRequest";
const ROLLBACK_REQUEST_SIGNAL = "rollbackRequest";

export class CrashRecoveryHandler implements SATPHandler {
  private readonly log: Logger;
  private readonly workflowClient: TemporalWorkflowClient | undefined;

  constructor(
    private readonly serverService: CrashRecoveryServerService,
    private readonly clientService: CrashRecoveryClientService,
    log: Logger,
    private readonly monitorService: MonitorService,
    workflowClient?: TemporalWorkflowClient,
  ) {
    this.log = log;
    this.workflowClient = workflowClient;
    this.log.trace(`Initialized ${CrashRecoveryHandler.name}`);
    this.monitorService = monitorService;
  }

  public getHandlerIdentifier(): SATPHandlerType {
    return SATPHandlerType.CRASH;
  }

  public getHandlerSessions(): string[] {
    return [];
  }

  public getStage(): string {
    return "crash";
  }

  // Server-side

  private async recoverImplementation(
    req: RecoverRequest,
  ): Promise<RecoverResponse> {
    const fnTag = `${CrashRecoveryHandler.name}#recoverV2MessageImplementation`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, async () => {
      try {
        this.log.debug(`${fnTag} - Handling RecoverRequest: ${req}`);
        try {
          const response = await this.serverService.handleRecover(req);
          if (this.workflowClient) {
            const handle = this.workflowClient.getHandle(req.sessionId);
            handle
              .signal(RECOVER_REQUEST_SIGNAL, { sessionId: req.sessionId })
              .catch((err: unknown) => {
                this.log.warn(
                  `${fnTag} - Could not signal workflow for session ${req.sessionId}: ${err}`,
                );
              });
          }
          return response;
        } catch (error) {
          this.log.error(`${fnTag} - Error:`, error);
          throw error;
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async recoverSuccessImplementation(
    req: RecoverSuccessRequest,
  ): Promise<RecoverSuccessResponse> {
    const fnTag = `${CrashRecoveryHandler.name}#recoverSuccessImplementation`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, async () => {
      try {
        this.log.debug(`${fnTag} - Handling RecoverSuccessRequest:${req}`);
        try {
          return await this.serverService.handleRecoverSuccess(req);
        } catch (error) {
          this.log.error(`${fnTag} - Error:`, error);
          throw error;
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async rollbackImplementation(
    req: RollbackRequest,
  ): Promise<RollbackResponse> {
    const fnTag = `${CrashRecoveryHandler.name}#rollbackImplementation`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, async () => {
      try {
        this.log.debug(`${fnTag} - Handling RollbackRequest: ${req}`);
        try {
          const response = await this.serverService.handleRollback(req);
          if (this.workflowClient) {
            const handle = this.workflowClient.getHandle(req.sessionId);
            handle
              .signal(ROLLBACK_REQUEST_SIGNAL, { sessionId: req.sessionId })
              .catch((err: unknown) => {
                this.log.warn(
                  `${fnTag} - Could not signal workflow for session ${req.sessionId}: ${err}`,
                );
              });
          }
          return response;
        } catch (error) {
          this.log.error(`${fnTag} - Error:`, error);
          throw error;
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  public setupRouter(router: ConnectRouter): void {
    const fnTag = `${CrashRecoveryHandler.name}#setupRouter`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        // The generated CrashRecoveryService uses the older protoc-gen-connect-es v1.4
        // ServiceType API (MethodKind-based). @connectrpc/connect v2 expects DescService.
        // The type cast is safe at runtime: the generated object shape is compatible.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = CrashRecoveryService as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.service(svc, {
          async recover(req: RecoverRequest) {
            return await that.recoverImplementation(req);
          },
          async recoverSuccess(req: RecoverSuccessRequest) {
            return await that.recoverSuccessImplementation(req);
          },
          async rollback(req: RollbackRequest) {
            return await that.rollbackImplementation(req);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        this.log.info("Router setup completed for CrashRecoveryHandler");
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  // Client-side

  public async sendRecoverRequest(
    session: SessionData,
  ): Promise<RecoverRequest> {
    const fnTag = `${this.constructor.name}#createRecoverRequest`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, () => {
      try {
        try {
          return this.clientService.createRecoverRequest(session);
        } catch (error) {
          this.log.error(
            `${fnTag} - Failed to create RecoverRequest: ${error}`,
          );
          throw new Error(`Error in createRecoverRequest: ${error}`);
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  public async sendRecoverSuccessRequest(
    session: SessionData,
  ): Promise<RecoverSuccessRequest> {
    const fnTag = `${this.constructor.name}#createRecoverSuccessRequest`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, async () => {
      try {
        try {
          return await this.clientService.createRecoverSuccessRequest(session);
        } catch (error) {
          this.log.error(
            `${fnTag} - Failed to create RecoverSuccessRequest: ${error}`,
          );
          throw new Error(`Error in createRecoverSuccessRequest: ${error}`);
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  public async sendRollbackRequest(
    session: SessionData,
    rollbackState: RollbackState,
  ): Promise<RollbackRequest> {
    const fnTag = `${this.constructor.name}#createRollbackRequest`;
    const { span, context: ctx } = this.monitorService.startSpan(fnTag);
    return context.with(ctx, async () => {
      try {
        try {
          return await this.clientService.createRollbackRequest(
            session,
            rollbackState,
          );
        } catch (error) {
          this.log.error(
            `${fnTag} - Failed to create RollbackRequest: ${error}`,
          );
          throw new Error(`Error in createRollbackRequest: ${error}`);
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
