/**
 * @fileoverview
 * Shared utility that orchestrates adapter hook execution for SATP handlers.
 *
 * @description
 * Each SATP stage handler wires this helper to guarantee consistent adapter
 * hook execution semantics. The runner centralizes logic for deadline enforcement,
 * context enrichment (session/gateway identifiers), and graceful logging so
 * individual handlers remain focused on business logic.
 * 
 * Adapters are executed at specific execution points defined by:
 * - stage (0-3)
 * - stepTag (stage-specific step identifier)
 * - stepOrder (before/during/after/rollback)
 */

import type { SATPLogger as Logger } from "../../satp-logger";
import type { AdapterHookService } from "../../../adapters/adapter-hook-service";
import type {
  StageExecutionStep,
} from "../../../adapters/api3-adapter-types";
import type { AdapterManager } from "../../../adapters/adapter-manager";
import type { SATPSession } from "../../satp-session";

/**
 * Execution point identification for adapter hook execution.
 * 
 * @property stage - Stage number (0-3).
 * @property stepTag - Stage-specific step identifier (e.g., "checkNewSessionRequest").
 * @property stepOrder - Execution order (before/during/after/rollback).
 */
export interface ExecutionPointIdentification {
  stage: number;
  stepTag: string;
  stepOrder: StageExecutionStep;
}

/**
 * Dependency bundle required by {@link AdapterHookRunner}.
 *
 * @property adapterManager - Optional registry used to resolve inbound deadlines.
 * @property adapterHooks - Low-level service responsible for HTTP/webhook calls.
 * @property logger - Stage-specific logger for diagnostics.
 * @property gatewayId - Unique identifier of the hosting gateway instance.
 * @property stage - Stage number (0-3).
 */
export interface AdapterHookRunnerContext {
  adapterManager?: AdapterManager;
  adapterHooks: AdapterHookService;
  logger: Logger;
  gatewayId: string;
  stage: number;
}

/**
 * Centralizes adapter hook invocation for SATP stage handlers.
 *
 * @description
 * The runner augments hook invocations with session metadata, enforces inbound
 * deadlines configured per adapter, and emits uniform diagnostics when a hook
 * fails. The adapter service automatically handles both outbound and inbound
 * webhooks based on adapter configuration.
 */
export class AdapterHookRunner {
  constructor(private readonly ctx: AdapterHookRunnerContext) { }

  /**
   * Executes adapters for a specific execution point.
   *
   * @param executionPoint - Execution point identification (stage, stepTag, stepOrder).
   * @param session - Live SATP session containing context IDs; ignored if absent.
   * @param metadata - Optional supplemental metadata forwarded to adapters.
   * @param payload - Optional payload data to send to adapters.
   */
  public async execute(
    executionPoint: ExecutionPointIdentification,
    session?: SATPSession,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!session) {
      return;
    }
    const sessionId = session.getSessionId();
    if (!sessionId) {
      return;
    }

    const { stage, stepTag, stepOrder } = executionPoint;

    // Check if we should execute adapters at this point
    if (!this.ctx.adapterHooks.shouldExecuteAdapters(stage, stepTag, stepOrder)) {
      return;
    }

    const contextId = this.getContextIdSafe(session);

    try {
      const deadlineMs = this.resolveInboundDeadlineMs(stepTag, stepOrder);

      const executeAdapters = () => this.ctx.adapterHooks.executeAdapters({
        stage,
        stepTag,
        stepOrder,
        sessionId,
        contextId,
        gatewayId: this.ctx.gatewayId,
        metadata,
        payload,
      });

      if (deadlineMs) {
        await this.runWithDeadline(
          executeAdapters,
          deadlineMs,
          () =>
            new AdapterHookTimeoutError(
              `Adapter hooks timed out after ${deadlineMs}ms for session ${sessionId} at stage=${stage} step=${stepTag} order=${stepOrder}`,
            ),
        );
      } else {
        await executeAdapters();
      }
    } catch (error) {
      const message = `Adapter hook execution failed for session ${sessionId} at stage=${stage} step=${stepTag} order=${stepOrder}: ${String(error)}`;
      this.ctx.logger.warn(message);
      throw error;
    }
  }

  /**
   * Convenience method to execute adapters at "before" execution point.
   * 
   * @param executionPoint - Execution point identification.
   * @param session - Live SATP session containing context IDs.
   * @param metadata - Optional supplemental metadata forwarded to adapters.
   * @param payload - Optional payload data to send to adapters.
   */
  public async executeBefore(
    executionPoint: Omit<ExecutionPointIdentification, "stepOrder">,
    session?: SATPSession,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return this.execute({ ...executionPoint, stepOrder: "before" }, session, metadata, payload);
  }

  /**
   * Convenience method to execute adapters at "during" execution point.
   * 
   * @param executionPoint - Execution point identification.
   * @param session - Live SATP session containing context IDs.
   * @param metadata - Optional supplemental metadata forwarded to adapters.
   * @param payload - Optional payload data to send to adapters.
   */
  public async executeDuring(
    executionPoint: Omit<ExecutionPointIdentification, "stepOrder">,
    session?: SATPSession,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return this.execute({ ...executionPoint, stepOrder: "during" }, session, metadata, payload);
  }

  /**
   * Convenience method to execute adapters at "after" execution point.
   * 
   * @param executionPoint - Execution point identification.
   * @param session - Live SATP session containing context IDs.
   * @param metadata - Optional supplemental metadata forwarded to adapters.
   * @param payload - Optional payload data to send to adapters.
   */
  public async executeAfter(
    executionPoint: Omit<ExecutionPointIdentification, "stepOrder">,
    session?: SATPSession,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return this.execute({ ...executionPoint, stepOrder: "after" }, session, metadata, payload);
  }

  /**
   * Convenience method to execute adapters at "rollback" execution point.
   * 
   * @param executionPoint - Execution point identification.
   * @param session - Live SATP session containing context IDs.
   * @param metadata - Optional supplemental metadata forwarded to adapters.
   * @param payload - Optional payload data to send to adapters.
   */
  public async executeRollback(
    executionPoint: Omit<ExecutionPointIdentification, "stepOrder">,
    session?: SATPSession,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return this.execute({ ...executionPoint, stepOrder: "rollback" }, session, metadata, payload);
  }

  /** Derives the smallest inbound timeout defined across adapters for an execution point. */
  private resolveInboundDeadlineMs(
    stepTag: string,
    stepOrder: StageExecutionStep,
  ): number | undefined {
    if (!this.ctx.adapterManager) {
      return undefined;
    }
    const bindings = this.ctx.adapterManager.getBindingsForExecutionPoint(
      this.ctx.stage,
      stepTag,
      stepOrder,
    );
    if (bindings.length === 0) {
      return undefined;
    }
    const globalTimeout =
      this.ctx.adapterManager.getConfiguration().global?.timeoutMs;
    let effectiveDeadline: number | undefined;
    for (const binding of bindings) {
      const inbound = binding.adapter.inboundWebhook;
      if (!inbound) {
        continue;
      }
      const candidate =
        inbound.inboundDeadlineMs ?? inbound.timeoutMs ?? globalTimeout;
      if (!candidate || candidate <= 0) {
        continue;
      }
      effectiveDeadline =
        typeof effectiveDeadline === "number"
          ? Math.min(effectiveDeadline, candidate)
          : candidate;
    }
    return effectiveDeadline;
  }

  /** Executes the supplied promise with an upper-bound timeout guard. */
  private async runWithDeadline<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    onTimeout: () => Error,
  ): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) {
      return await operation();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(onTimeout()), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Safely extracts a context identifier from server or client session data.
   *
   * @param session - SATP session being processed by the handler.
   * @returns Transfer context id when available, otherwise `undefined`.
   */
  private getContextIdSafe(session: SATPSession): string | undefined {
    try {
      if (session.hasServerSessionData()) {
        return session.getServerSessionData().transferContextId;
      }
    } catch (error) {
      this.ctx.logger.trace(
        `Unable to read server context id for session ${session.getSessionId()}: ${String(error)}`,
      );
    }
    try {
      if (session.hasClientSessionData()) {
        return session.getClientSessionData().transferContextId;
      }
    } catch (error) {
      this.ctx.logger.trace(
        `Unable to read client context id for session ${session.getSessionId()}: ${String(error)}`,
      );
    }
    return undefined;
  }
}

export class AdapterHookTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterHookTimeoutError";
  }
}
