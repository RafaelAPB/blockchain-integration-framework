import type { Stage } from "../types/satp-protocol";
import type {
  AdapterDefinition,
  SatpStageKey,
  StageExecutionStep,
} from "./api3-adapter-types";

/**
 * Enumerates the possible outcomes returned by an adapter webhook execution.
 */
export type AdapterWebhookDisposition = "CONTINUE" | "PAUSE" | "SKIP" | "FAIL";

/**
 * Generic telemetry envelope emitted after each webhook run.
 */
export interface AdapterWebhookMetrics {
  latencyMs?: number;
  retriesAttempted?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Shared input contract propagated to all webhook implementations.
 */
export interface AdapterWebhookInputBase {
  stage: SatpStageKey;
  stageEnum?: Stage;
  step: StageExecutionStep;
  adapterId: string;
  sessionId: string;
  contextId: string;
  attempt: number;
  invokedAt: string;
  gatewayId: string;
  adapter?: AdapterDefinition;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

/**
 * Input contract specific to the "before stage" hook.
 */
export interface PreStageWebhookInput extends AdapterWebhookInputBase {
  stageSnapshot?: Record<string, unknown>;
  plannedChanges?: Record<string, unknown>;
}

/**
 * Input contract specific to the "during stage" hook.
 */
export interface DuringStageWebhookInput extends AdapterWebhookInputBase {
  protocolMessage?: Record<string, unknown>;
  executionContext?: Record<string, unknown>;
}

/**
 * Input contract specific to the "after stage" hook.
 */
export interface PostStageWebhookInput extends AdapterWebhookInputBase {
  stageResult?: Record<string, unknown>;
  settlementProof?: Record<string, unknown>;
}

/**
 * Base output schema returned by every webhook.
 */
export interface AdapterWebhookOutputBase {
  disposition: AdapterWebhookDisposition;
  message?: string;
  telemetry?: Record<string, unknown>;
  mutations?: Record<string, unknown>;
}

/** Output schema emitted by pre-stage webhooks. */
export interface PreStageWebhookOutput extends AdapterWebhookOutputBase {
  updatedStageSnapshot?: Record<string, unknown>;
}

/** Output schema emitted by during-stage webhooks. */
export interface DuringStageWebhookOutput extends AdapterWebhookOutputBase {
  outboundPayload?: Record<string, unknown>;
}

/** Output schema emitted by post-stage webhooks. */
export interface PostStageWebhookOutput extends AdapterWebhookOutputBase {
  auditTrail?: Record<string, unknown>;
}

/** Result envelope standardised for all webhooks. */
export interface AdapterWebhookResult<
  TOutput extends AdapterWebhookOutputBase,
> {
  output: TOutput;
  metrics?: AdapterWebhookMetrics;
}

/** Retry semantics communicated back to hook orchestrators. */
export interface AdapterWebhookRetryDirective {
  maxAttempts?: number;
  initialIntervalMs?: number;
  maxIntervalMs?: number;
  backoffCoefficient?: number;
  nextAttemptDelayMs?: number;
}

/** Optional fields when constructing an {@link AdapterWebhookError}. */
export interface AdapterWebhookErrorOptions {
  retryable?: boolean;
  retryDirective?: AdapterWebhookRetryDirective;
  details?: Record<string, unknown>;
}

/**
 * Canonical error type thrown by adapter webhooks.
 */
export class AdapterWebhookError extends Error {
  public readonly retryable: boolean;
  public readonly retryDirective?: AdapterWebhookRetryDirective;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: AdapterWebhookErrorOptions = {}) {
    super(message);
    this.retryable = options.retryable ?? true;
    this.retryDirective = options.retryDirective;
    this.details = options.details;
    this.name = "AdapterWebhookError";
  }
}

/**
 * Generic abstract adapter webhook. Concrete classes must implement
 * {@link execute} and may call {@link fail} for typed errors.
 */
export abstract class AdapterWebhook<
  TInput extends AdapterWebhookInputBase,
  TOutput extends AdapterWebhookOutputBase,
> {
  public abstract execute(
    input: TInput,
  ): Promise<AdapterWebhookResult<TOutput>>;

  protected fail(message: string, options?: AdapterWebhookErrorOptions): never {
    throw new AdapterWebhookError(message, options);
  }
}

/**
 * Abstract hook executed before a SATP stage handler mutates protocol state.
 */
export abstract class PreStageWebhook extends AdapterWebhook<
  PreStageWebhookInput,
  PreStageWebhookOutput
> {}

/**
 * Abstract hook executed while a SATP stage handler processes its core logic.
 */
export abstract class DuringStageWebhook extends AdapterWebhook<
  DuringStageWebhookInput,
  DuringStageWebhookOutput
> {}

/**
 * Abstract hook executed after a SATP stage handler completes and emits results.
 */
export abstract class PostStageWebhook extends AdapterWebhook<
  PostStageWebhookInput,
  PostStageWebhookOutput
> {}
