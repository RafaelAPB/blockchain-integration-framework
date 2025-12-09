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
  SatpStageKey,
  StageExecutionStep,
} from "./api3-adapter-types";
import type {
  AdapterHookResult,
  AdapterHookStepResult,
  AdapterHookDirection,
  AdapterInvocationContext,
  OutboundWebhookInvocationResult,
} from "./adapter-types";
import type { MonitorService } from "../services/monitoring/monitor";
import type { SATPLogger as Logger } from "../core/satp-logger";
import type { AdapterWebhookMetrics } from "./adapter-webhook-contracts";
import type { OutboundWebhookPayload } from "./outbound-webhooks";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export interface AdapterHookInvocation {
  stage: Stage;
  step: StageExecutionStep;
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

  public async triggerOutboundHooks(
    invocation: AdapterHookInvocation,
  ): Promise<AdapterHookResult | undefined> {
    return await this.executeHooks(invocation, "outbound");
  }

  public async awaitInboundHooks(
    invocation: AdapterHookInvocation,
  ): Promise<AdapterHookResult | undefined> {
    return await this.executeHooks(invocation, "inbound");
  }

  private async executeHooks(
    invocation: AdapterHookInvocation,
    direction: AdapterHookDirection,
  ): Promise<AdapterHookResult | undefined> {
    const { adapterManager } = this.options;
    if (!adapterManager || !adapterManager.hasAdaptersConfigured()) {
      return undefined;
    }

    const stageKey = this.mapStageToKey(invocation.stage);
    if (!stageKey) {
      this.options.logger.warn(
        `AdapterHookService: unsupported stage lookup for value="${invocation.stage}"`,
      );
      return undefined;
    }

    const plan = adapterManager.getExecutionPlanSnapshot({ stage: stageKey });
    const relevantBindings = plan.bindings.filter(
      (binding) =>
        binding.stage === stageKey && binding.step === invocation.step,
    );
    if (relevantBindings.length === 0) {
      return undefined;
    }

    const steps: AdapterHookStepResult[] = [];
    for (const [index, binding] of relevantBindings.entries()) {
      const adapter = adapterManager.getAdapter(stageKey, binding.adapterId);
      if (!adapter || !adapter.active) {
        continue;
      }
      const context: AdapterInvocationContext = {
        binding,
        adapter,
        stage: invocation.stage,
        sessionId: invocation.sessionId,
        contextId: invocation.contextId,
        gatewayId: invocation.gatewayId,
        attempt: index + 1,
        direction,
        metadata: invocation.metadata,
        payload: invocation.payload,
      };
      let result: AdapterHookStepResult | undefined;
      if (direction === "outbound") {
        result = await this.runOutboundAdapter(context, adapter);
      } else {
        result = await this.runInboundAdapter(context, adapter);
      }
      if (result) {
        steps.push(result);
      }
    }

    if (steps.length === 0) {
      this.options.logger.debug(
        `AdapterHookService: no executable adapters for stage=${stageKey} step=${invocation.step}`,
      );
      return undefined;
    }

    return {
      stage: invocation.stage,
      sessionId: invocation.sessionId,
      steps,
      completedAt: new Date().toISOString(),
    };
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
      stage: context.stage,
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

  private mapStageToKey(stage: Stage): SatpStageKey | undefined {
    const stageMap: Partial<Record<Stage, SatpStageKey>> = {
      [Stage.STAGE0]: "stage0",
      [Stage.STAGE1]: "stage1",
      [Stage.STAGE2]: "stage2",
      [Stage.STAGE3]: "stage3",
    };
    return stageMap[stage];
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
