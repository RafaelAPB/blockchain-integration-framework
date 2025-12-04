/**
 * @fileoverview
 * Shared utility that orchestrates adapter hook execution for SATP handlers.
 *
 * @description
 * Each SATP stage handler wires this helper to guarantee consistent inbound and
 * outbound adapter hook execution semantics. The runner centralizes logic for
 * deadline enforcement, context enrichment (session/gateway identifiers), and
 * graceful logging so individual handlers remain focused on business logic.
 */

import { Stage } from "../../../types/satp-protocol";
import type { SATPLogger as Logger } from "../../satp-logger";
import type { AdapterHookService } from "../../../adapters/adapter-hook-service";
import type { AdapterHookDirection } from "../../../adapters/adapter-hook-types";
import type {
  SatpStageKey,
  StageExecutionStep,
} from "../../../adapters/api3-adapter-types";
import type { AdapterManager } from "../../../adapters/adapter-manager";
import type { SATPSession } from "../../satp-session";

/**
 * Dependency bundle required by {@link AdapterHookRunner}.
 *
 * @property adapterManager - Optional registry used to resolve inbound deadlines.
 * @property adapterHooks - Low-level service responsible for HTTP/webhook calls.
 * @property logger - Stage-specific logger for diagnostics.
 * @property gatewayId - Unique identifier of the hosting gateway instance.
 * @property stageKey - Stage identifier ("stage0".."stage3").
 * @property stage - {@link Stage} enum counterpart used by adapter payloads.
 */
export interface AdapterHookRunnerContext {
  adapterManager?: AdapterManager;
  adapterHooks: AdapterHookService;
  logger: Logger;
  gatewayId: string;
  stageKey: SatpStageKey;
  stage: Stage;
}

/**
 * Centralizes adapter hook invocation for SATP stage handlers.
 *
 * @description
 * The runner augments hook invocations with session metadata, enforces inbound
 * deadlines configured per adapter, and emits uniform diagnostics when a hook
 * fails. Outbound hooks are treated as best-effort notifications, whereas
 * inbound hooks propagate failures back to the caller so handlers can abort the
 * SATP transaction when approvals are missing or expired.
 */
export class AdapterHookRunner {
  constructor(private readonly ctx: AdapterHookRunnerContext) {}

  /**
   * Dispatches adapter hooks for the provided direction and stage step.
   *
   * @param direction - "inbound" (blocking approvals) or "outbound" notifications.
   * @param step - Stage execution step (before/during/after).
   * @param session - Live SATP session containing context IDs; ignored if absent.
   * @param metadata - Optional supplemental metadata forwarded to adapters.
   */
  public async dispatch(
    direction: AdapterHookDirection,
    step: StageExecutionStep,
    session?: SATPSession,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!session) {
      return;
    }
    const sessionId = session.getSessionId();
    if (!sessionId) {
      return;
    }
    const contextId = this.getContextIdSafe(session);
    const invocation = {
      stage: this.ctx.stage,
      step,
      sessionId,
      contextId,
      gatewayId: this.ctx.gatewayId,
      metadata,
    };
    try {
      if (direction === "outbound") {
        await this.ctx.adapterHooks.triggerOutboundHooks(invocation);
      } else {
        await this.runInboundHooksWithDeadline(step, invocation);
      }
    } catch (error) {
      const message = `Adapter hook invocation failed for session ${sessionId} (${direction}/${step}): ${String(error)}`;
      if (direction === "inbound") {
        this.ctx.logger.warn(message);
        throw error;
      }
      this.ctx.logger.debug(message);
    }
  }

  /** Ensures inbound adapters honor the tightest configured deadline. */
  private async runInboundHooksWithDeadline(
    step: StageExecutionStep,
    invocation: Parameters<AdapterHookService["awaitInboundHooks"]>[0],
  ): Promise<void> {
    const deadlineMs = this.resolveInboundDeadlineMs(step);
    if (!deadlineMs) {
      await this.ctx.adapterHooks.awaitInboundHooks(invocation);
      return;
    }
    await this.runWithDeadline(
      () => this.ctx.adapterHooks.awaitInboundHooks(invocation),
      deadlineMs,
      () =>
        new AdapterHookTimeoutError(
          `Inbound adapter hooks timed out after ${deadlineMs}ms for session ${invocation.sessionId} (${step})`,
        ),
    );
  }

  /** Derives the smallest inbound timeout defined across adapters for a step. */
  private resolveInboundDeadlineMs(
    step: StageExecutionStep,
  ): number | undefined {
    if (!this.ctx.adapterManager) {
      return undefined;
    }
    const adapters = this.ctx.adapterManager.getAdaptersForStep(
      this.ctx.stageKey,
      step,
    );
    if (adapters.length === 0) {
      return undefined;
    }
    const globalTimeout =
      this.ctx.adapterManager.getConfiguration().global?.timeoutMs;
    let effectiveDeadline: number | undefined;
    for (const adapter of adapters) {
      const inbound = adapter.inboundWebhook;
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
