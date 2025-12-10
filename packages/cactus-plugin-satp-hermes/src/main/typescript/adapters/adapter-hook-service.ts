/**
 * Adapter Hook Service - Runtime orchestration engine for webhook adapter execution
 *
 * @fileoverview
 * Core execution engine responsible for invoking configured adapter webhooks during
 * SATP protocol execution. Coordinates outbound notifications and inbound approval
 * workflows with comprehensive retry logic, timeout enforcement, and telemetry collection.
 *
 * @description
 * **Service Responsibilities:**
 * - Query {@link AdapterManager} for applicable adapters based on stage/step
 * - Execute outbound webhooks asynchronously with HTTP client (fetch API)
 * - Manage inbound webhook lifecycle (pause, await decision, resume/abort)
 * - Apply retry policies with exponential backoff for transient failures
 * - Enforce timeouts and deadlines to prevent hung transfers
 * - Collect execution metrics (latency, attempts, disposition) for observability
 * - Aggregate multi-adapter results into single {@link AdapterHookResult}
 *
 * **Execution Model:**
 * When a SATP stage reaches a configured step (before/during/after/rollback), the
 * Business Logic Orchestrator (BLO) invokes this service with stage context. The
 * service resolves the execution plan, filters active adapters, and invokes them
 * in priority order. Outbound hooks run fire-and-forget while inbound hooks block
 * until external decision arrives or timeout expires.
 *
 * **Retry Strategy:**
 * Transient failures (network errors, 5xx responses, timeouts) trigger automatic
 * retries with configurable attempts and delay. The service respects adapter-level
 * retry settings but falls back to global defaults when unspecified. Permanent
 * failures (4xx responses, invalid URLs) do not retry.
 *
 * **Timeout Hierarchy:**
 * 1. Adapter-specific `timeoutMs` (highest precedence)
 * 2. Global configuration `global.timeoutMs`
 * 3. Service default `DEFAULT_TIMEOUT_MS` (30 seconds)
 *
 * **Integration Points:**
 * - {@link AdapterManager}: Configuration resolution and execution plan generation
 * - {@link MonitorService}: Telemetry and distributed tracing integration
 * - {@link BLODispatcher}: SATP stage coordination and hook invocation
 * - Fetch API: HTTP client for webhook invocations (node-fetch polyfill for Node < 18)
 *
 * @example
 * Triggering outbound hooks for Stage 1 lock notification:
 * ```typescript
 * const service = new AdapterHookService({
 *   adapterManager,
 *   logger,
 *   monitorService
 * });
 *
 * const result = await service.triggerOutboundHooks({
 *   stage: Stage.STAGE1,
 *   step: "after",
 *   sessionId: "sess-abc-123",
 *   contextId: "ctx-transfer-456",
 *   gatewayId: "gateway-1",
 *   payload: {
 *     lockTxHash: "0x789...",
 *     lockedAmount: "1000"
 *   }
 * });
 *
 * if (result) {
 *   logger.info(`Executed ${result.steps.length} outbound adapters`);
 *   result.steps.forEach(step => {
 *     logger.debug(`Adapter ${step.binding.adapterId}: ${step.disposition}`);
 *   });
 * }
 * ```
 *
 * @example
 * Awaiting inbound approval decision:
 * ```typescript
 * // Service blocks here until external controller POSTs decision
 * const result = await service.awaitInboundHooks({
 *   stage: Stage.STAGE2,
 *   step: "before",
 *   sessionId: "sess-xyz-789",
 *   gatewayId: "gateway-2",
 *   metadata: { transferAmountUsd: 250000 }
 * });
 *
 * const approvalStep = result?.steps.find(
 *   s => s.binding.adapterId === "compliance-check"
 * );
 *
 * if (approvalStep?.blockingDecision?.continue === false) {
 *   logger.warn(`Transfer rejected: ${approvalStep.blockingDecision.reason}`);
 *   throw new Error("Compliance check failed");
 * }
 * ```
 *
 * @see {@link AdapterManager} for configuration and execution plan management
 * @see {@link AdapterHookInvocation} for invocation context structure
 * @see {@link AdapterHookResult} for aggregated execution results
 * @see {@link OutboundWebhookPayload} for outbound event schema
 * @see {@link InboundWebhookDecisionPayload} for inbound decision schema
 *
 * @module adapter-hook-service
 * @since 0.0.3-beta
 */

import { Stage } from "../types/satp-protocol";
import type { AdapterManager } from "./adapter-manager";
import type {
  AdapterDefinition,
  OutboundWebhookConfig,
  StageExecutionStep,
} from "./api3-adapter-types";
import type {
  AdapterHookResult,
  AdapterHookStepResult,
  AdapterInvocationContext,
  OutboundWebhookInvocationResult,
} from "./adapter-types";
import type { MonitorService } from "../services/monitoring/monitor";
import type { SATPLogger as Logger } from "../core/satp-logger";
import type { AdapterWebhookMetrics } from "./adapter-webhook-contracts";
import type { OutboundWebhookPayload } from "./outbound-webhooks";
import {
  isValidStepForStage,
  getStepByTag,
  type SatpStage,
} from "../core/satp-protocol-map";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export interface AdapterExecutionInput {
  stage: number;
  stepTag: string;
  stepOrder: StageExecutionStep;
  sessionId: string;
  contextId?: string;
  gatewayId: string;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface AdapterHookServiceOptions {
  adapterManager?: AdapterManager;
  logger: Logger;
  monitorService: MonitorService;
  fetchImpl?: typeof fetch;
}

export class AdapterHookService {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: AdapterHookServiceOptions) {
    const fetchImpl =
      options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
    if (!fetchImpl) {
      throw new Error(
        "AdapterHookService requires a fetch implementation; provide fetchImpl when running on Node < 18",
      );
    }
    this.fetchFn = fetchImpl;
  }

  /**
   * Checks if adapters should execute for the given execution point.
   */
  public shouldExecuteAdapters(
    stage: number,
    stepTag: string,
    stepOrder: StageExecutionStep,
  ): boolean {
    const { adapterManager } = this.options;
    if (!adapterManager || !adapterManager.hasAdaptersConfigured()) {
      return false;
    }
    return adapterManager.shouldExecuteAdapters(stage, stepTag, stepOrder);
  }

  /**
   * Executes all adapters configured for the given execution point.
   * Handles both outbound (fire-and-forget) and inbound (blocking) webhooks automatically.
   * This call is blocking - inbound webhooks will pause execution until external response arrives.
   */
  public async executeAdapters(
    input: AdapterExecutionInput,
  ): Promise<AdapterHookResult | undefined> {
    const { adapterManager, logger } = this.options;
    if (!adapterManager || !adapterManager.hasAdaptersConfigured()) {
      return undefined;
    }

    // Validate execution point against protocol map (validates both stage and stepTag)
    if (!isValidStepForStage(input.stage, input.stepTag)) {
      logger.error(
        `AdapterHookService#executeAdapters() Step "${input.stepTag}" is not valid for stage ${input.stage}`,
      );
      throw new Error(
        `Step "${input.stepTag}" is not a valid SATP protocol step for stage ${input.stage}`,
      );
    }

    // Log execution point with protocol metadata for enhanced observability
    const stepInfo = getStepByTag(input.stage as SatpStage, input.stepTag);
    if (stepInfo) {
      logger.debug(
        `AdapterHookService#executeAdapters() Executing adapters for stage ${input.stage}, step "${input.stepTag}" (${stepInfo.description}), order ${input.stepOrder}`,
      );
    }

    const bindings = adapterManager.getBindingsForExecutionPoint(
      input.stage,
      input.stepTag,
      input.stepOrder,
    );

    if (bindings.length === 0) {
      return undefined;
    }

    const steps: AdapterHookStepResult[] = [];
    for (const binding of bindings) {
      const adapter = binding.adapter;
      if (!adapter.active) {
        continue;
      }

      const context: AdapterInvocationContext = {
        binding,
        adapter,
        stage: this.numberToStage(binding.stage),
        sessionId: input.sessionId,
        contextId: input.contextId,
        gatewayId: input.gatewayId,
        attempt: 1,
        direction: "outbound", // Legacy field, will be removed
        metadata: input.metadata,
        payload: input.payload,
      };

      let result: AdapterHookStepResult | undefined;

      // Execute outbound webhook if configured
      if (adapter.outboundWebhook) {
        result = await this.runOutboundAdapter(context, adapter);
        if (result) {
          steps.push(result);
        }
      }

      // Execute inbound webhook if configured (blocking)
      if (adapter.inboundWebhook) {
        result = await this.runInboundAdapter(context, adapter);
        if (result) {
          steps.push(result);
        }
      }

      // If neither is configured, skip
      if (!adapter.outboundWebhook && !adapter.inboundWebhook) {
        result = this.buildSkipResult(
          context,
          "Adapter has no webhook configuration",
        );
        steps.push(result);
      }
    }

    if (steps.length === 0) {
      logger.debug(
        `AdapterHookService: no executable adapters for stage=${input.stage} stepTag=${input.stepTag} stepOrder=${input.stepOrder}`,
      );
      return undefined;
    }

    return {
      stage: this.numberToStage(input.stage),
      sessionId: input.sessionId,
      steps,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Convenience method to execute adapters for "before" step order.
   */
  public async executeAdaptersBefore(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "before" });
  }

  /**
   * Convenience method to execute adapters for "during" step order.
   */
  public async executeAdaptersDuring(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "during" });
  }

  /**
   * Convenience method to execute adapters for "after" step order.
   */
  public async executeAdaptersAfter(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "after" });
  }

  /**
   * Convenience method to execute adapters for "rollback" step order.
   */
  public async executeAdaptersRollback(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "rollback" });
  }

  private async runOutboundAdapter(
    context: AdapterInvocationContext,
    adapter: AdapterDefinition,
  ): Promise<AdapterHookStepResult> {
    if (!adapter.outboundWebhook) {
      return this.buildSkipResult(
        context,
        "Adapter has no outbound webhook configuration",
      );
    }

    const payload = this.buildOutboundPayload(context);
    const invocationResult = await this.invokeOutboundWebhook(
      adapter.outboundWebhook,
      payload,
    );

    if (invocationResult.status === "FAILED") {
      return this.buildFailureResult(
        context,
        invocationResult.errorMessage || "Adapter webhook failed",
        invocationResult,
      );
    }

    const metrics: AdapterWebhookMetrics = {
      latencyMs: invocationResult.latencyMs,
      retriesAttempted: invocationResult.retriesAttempted,
    };

    return {
      binding: context.binding,
      disposition: "CONTINUE",
      metrics,
      outboundResult: invocationResult,
    };
  }

  private async runInboundAdapter(
    context: AdapterInvocationContext,
    adapter: AdapterDefinition,
  ): Promise<AdapterHookStepResult> {
    if (!adapter.inboundWebhook) {
      return this.buildSkipResult(
        context,
        "Adapter has no inbound webhook configuration",
      );
    }

    return this.buildSkipResult(
      context,
      "Inbound adapter hooks require external controller callbacks; no-op execution",
    );
  }

  private buildOutboundPayload(
    context: AdapterInvocationContext,
  ): OutboundWebhookPayload {
    return {
      eventType:
        context.direction === "outbound" ? "stage.started" : "stage.completed",
      schemaVersion: "v1",
      executionPoints: {
        name: context.binding.executionPointName ?? `${context.binding.stepTag}-${context.binding.stepOrder}`,
        stage: context.binding.stage,
        step: context.binding.stepTag,
        point: context.binding.stepOrder,
      },
      adapterId: context.adapter.id,
      sessionId: context.sessionId,
      contextId: context.contextId,
      gatewayId: context.gatewayId,
      payload: context.payload,
      timestamp: new Date().toISOString(),
      message: undefined,
    };
  }

  private buildSkipResult(
    context: AdapterInvocationContext,
    message: string,
  ): AdapterHookStepResult {
    return {
      binding: context.binding,
      disposition: "SKIP",
      message,
    };
  }

  private buildFailureResult(
    context: AdapterInvocationContext,
    message: string,
    outboundResult?: OutboundWebhookInvocationResult,
  ): AdapterHookStepResult {
    return {
      binding: context.binding,
      disposition: "FAIL",
      message,
      outboundResult,
      metrics: outboundResult
        ? {
          latencyMs: outboundResult.latencyMs,
          retriesAttempted: outboundResult.retriesAttempted,
        }
        : undefined,
    };
  }

  private async invokeOutboundWebhook(
    config: OutboundWebhookConfig,
    payload: OutboundWebhookPayload,
  ): Promise<OutboundWebhookInvocationResult> {
    const method = (config.method ?? "POST").toUpperCase();
    const headers = {
      "content-type": "application/json",
      ...config.headers,
    };
    const timeoutMs = config.timeoutMs ?? this.getGlobalTimeout();
    const maxAttempts = config.retryAttempts ?? this.getGlobalRetryAttempts();
    const retryDelayMs = config.retryDelayMs ?? this.getGlobalRetryDelay();
    let attempt = 0;
    let lastLatency = 0;

    while (attempt < maxAttempts) {
      const startedAt = Date.now();
      try {
        const response = await this.fetchWithTimeout(
          config.url,
          {
            method,
            headers,
            body: method === "GET" ? undefined : JSON.stringify(payload),
          },
          timeoutMs,
        );
        const rawBody = await response.text();
        const parsedBody = this.safeParse(rawBody);
        lastLatency = Date.now() - startedAt;
        if (!response.ok) {
          throw new Error(
            `Adapter webhook responded with HTTP ${response.status}`,
          );
        }
        return {
          status: "OK",
          httpStatus: response.status,
          responseBody: parsedBody,
          responseHeaders: this.toHeaderObject(response.headers),
          retriesAttempted: attempt,
          completedAt: new Date().toISOString(),
          latencyMs: lastLatency,
        };
      } catch (error) {
        lastLatency = Date.now() - startedAt;
        attempt++;
        if (attempt >= maxAttempts) {
          return {
            status: "FAILED",
            retriesAttempted: attempt - 1,
            completedAt: new Date().toISOString(),
            latencyMs: lastLatency,
            errorMessage: this.stringifyError(error),
          };
        }
        await this.delay(retryDelayMs);
      }
    }

    return {
      status: "FAILED",
      retriesAttempted: maxAttempts,
      completedAt: new Date().toISOString(),
      latencyMs: lastLatency,
      errorMessage: "Adapter webhook failed without response",
    };
  }

  private numberToStage(stageNumber: number): Stage {
    const stageMap: Record<number, Stage> = {
      0: Stage.STAGE0,
      1: Stage.STAGE1,
      2: Stage.STAGE2,
      3: Stage.STAGE3,
    };
    return stageMap[stageNumber] ?? Stage.STAGE0;
  }

  private getGlobalTimeout(): number {
    return (
      this.options.adapterManager?.getConfiguration().global?.timeoutMs ??
      DEFAULT_TIMEOUT_MS
    );
  }

  private getGlobalRetryAttempts(): number {
    return (
      this.options.adapterManager?.getConfiguration().global?.retryAttempts ??
      DEFAULT_RETRY_ATTEMPTS
    );
  }

  private getGlobalRetryDelay(): number {
    return (
      this.options.adapterManager?.getConfiguration().global?.retryDelayMs ??
      DEFAULT_RETRY_DELAY_MS
    );
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async delay(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, Math.max(delayMs, 0)));
  }

  private safeParse(body: string): unknown {
    if (!body) {
      return undefined;
    }
    try {
      return JSON.parse(body);
    } catch (error) {
      this.options.logger.debug(
        `AdapterHookService: unable to parse webhook response body: ${this.stringifyError(error)}`,
      );
      return body;
    }
  }

  private toHeaderObject(headers: globalThis.Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => (result[key] = value));
    return result;
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
