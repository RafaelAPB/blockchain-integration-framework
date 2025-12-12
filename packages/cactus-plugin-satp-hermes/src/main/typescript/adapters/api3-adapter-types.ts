/**
 * API3 Adapter Type Definitions - External integration contracts for SATP gateway webhooks
 *
 * @fileoverview
 * Comprehensive type system for the API3 adapter framework enabling external systems
 * to integrate with SATP protocol execution through webhook-based event subscriptions
 * and approval workflows. This module defines the complete configuration contract
 * that operators use to declare adapter behavior per SATP stage.
 *
 * @description
 * The API3 adapter system allows external controllers, monitoring platforms, and
 * compliance systems to participate in SATP cross-chain transfers through two
 * primary mechanisms:
 *
 * **Outbound Webhooks (Fire-and-Forget):**
 * - Gateway notifies external systems when SATP lifecycle events occur
 * - Used for monitoring, logging, metrics collection, and audit trails
 * - Non-blocking: SATP execution continues regardless of webhook response
 * - Supports retry logic with exponential backoff for reliability
 *
 * **Inbound Webhooks (Blocking Approval):**
 * - Gateway pauses SATP execution until external system posts a decision
 * - Used for manual approvals, compliance checks, and business rule validation
 * - Blocking: SATP transfer waits for external controller response or timeout
 * - Enables human-in-the-loop workflows and policy enforcement
 *
 * **Configuration Architecture:**
 * Adapters are organized hierarchically by SATP stage (stage0-stage3, crash) and
 * optionally by execution step (before/during/after/rollback). Each adapter declares:
 * - Unique identifier and human-readable metadata
 * - Webhook endpoints (outbound URLs or inbound path suffixes)
 * - HTTP settings (method, headers, timeout, retry policy)
 * - Active/inactive flag for runtime toggling without config removal
 * - Priority ordering for deterministic multi-adapter execution
 *
 * **Execution Model:**
 * When a SATP stage reaches a configured step, the {@link AdapterManager} resolves
 * the applicable adapters and the {@link AdapterHookService} invokes them in
 * priority order. Outbound webhooks run concurrently while inbound webhooks
 * serialize to maintain clear approval semantics.
 *
 * @example
 * Minimal adapter configuration for stage 1 monitoring:
 * ```typescript
 * const config: AdapterLayerConfiguration = {
 *   adapters: [
 *     {
 *       id: "lock-monitor",
 *       name: "Asset Lock Notification",
 *       active: true,
 *       executionPoints: [
 *         { stage: 1, step: "checkTransferProposalRequestMessage", point: "before" }
 *       ],
 *       outboundWebhook: {
 *         url: "https://monitor.example.com/satp/lock-detected",
 *         timeoutMs: 5000
 *       }
 *     }
 *   ]
 * };
 * ```
 *
 * @example
 * Advanced configuration with inbound approval (priority only affects adapters at same execution point):
 * ```typescript
 * const config: AdapterLayerConfiguration = {
 *   adapters: [
 *     {
 *       id: "compliance-check",
 *       name: "AML/KYC Compliance Verification",
 *       active: true,
 *       priority: 1, // runs before audit-log at same execution point
 *       executionPoints: [
 *         { stage: 2, step: "checkLockAssertionRequest", point: "before" }
 *       ],
 *       inboundWebhook: {
 *         timeoutMs: 300000 // 5 min timeout
 *       }
 *     },
 *     {
 *       id: "audit-log",
 *       name: "Commitment Audit Logger",
 *       active: true,
 *       priority: 2, // runs after compliance-check at same execution point
 *       executionPoints: [
 *         { stage: 2, step: "checkLockAssertionRequest", point: "before" }
 *       ],
 *       outboundWebhook: {
 *         url: "https://audit.example.com/satp/commitments",
 *         retryAttempts: 5,
 *         retryDelayMs: 2000
 *       }
 *     }
 *   ],
 *   global: {
 *     timeoutMs: 30000,
 *     retryAttempts: 3,
 *     logLevel: "info"
 *   }
 * };
 * ```
 *
 * @see {@link AdapterManager} for configuration indexing and lookup
 * @see {@link AdapterHookService} for webhook execution orchestration
 * @see {@link OutboundWebhookPayload} for outbound event schema
 * @see {@link InboundWebhookDecisionResponse} for inbound decision schema
 * @see {@link https://www.ietf.org/archive/id/draft-ietf-satp-core-02.txt} IETF SATP Specification
 *
 * @module api3-adapter-types
 * @since 0.0.3-beta
 */

/**
 * Common retry policy applied to outbound/inbound webhook invocations.
 */
export interface RetryPolicy {
  /** Maximum number of attempts (initial + retries). */
  retryAttempts?: number;
  /** Backoff delay between attempts in milliseconds. */
  retryDelayMs?: number;
}

/**
 * Common HTTP attributes shared by adapter webhook definitions.
 */
export interface BaseWebhookConfig extends RetryPolicy {
  /** Maximum time the gateway waits for the remote endpoint before aborting. */
  timeoutMs?: number;
  /** Optional Mustache/Handlebars-style payload template rendered per invocation. */
  payloadTemplate?: string;
}

/**
 * Outbound webhook definition used to notify external systems about SATP activity.
 * Always uses POST method with application/json content-type.
 */
export interface OutboundWebhookConfig extends BaseWebhookConfig {
  /** Absolute HTTPS endpoint the gateway should call. */
  url: string;
  /**
   * Priority for ordering multiple outbound webhooks within the same adapter.
   * Lower numbers execute first. Defaults to 1000 if not specified.
   */
  priority?: number;
}

/**
 * Inbound webhook definition used to pause SATP execution until an external
 * controller posts a decision. The gateway exposes endpoints under its API3
 * adapter base path, using the adapter ID and context ID for routing.
 */
export interface InboundWebhookConfig extends BaseWebhookConfig {
  /**
   * Priority for ordering multiple inbound webhooks within the same adapter.
   * Lower numbers execute first. Defaults to 1000 if not specified.
   */
  priority?: number;
}

/**
 * Combined webhook configuration used per adapter entry.
 * Supports multiple webhooks of each type, each with their own priority.
 */
export interface AdapterWebhookConfig {
  /** Single outbound webhook (for backward compatibility) or array of outbound webhooks. */
  outboundWebhook?: OutboundWebhookConfig;
  /** Array of outbound webhooks when multiple notifications are needed. */
  outboundWebhooks?: OutboundWebhookConfig[];
  /** Single inbound webhook (for backward compatibility) or array of inbound webhooks. */
  inboundWebhook?: InboundWebhookConfig;
  /** Array of inbound webhooks when multiple approvals are needed. */
  inboundWebhooks?: InboundWebhookConfig[];
}

/**
 * Execution point definition - where an adapter should execute.
 */
export interface AdapterExecutionPointDefinition {
  /** SATP stage number (0-3) */
  stage: number;
  /** Stage-specific step identifier (e.g., 'checkNewSessionRequest', 'newSessionResponse') */
  step: string;
  /** Execution order within the step (before/during/after/rollback) */
  point: StageExecutionStep;
}

/**
 * Adapter definition - a collection of webhooks for specific execution points.
 */
export interface AdapterDefinition extends AdapterWebhookConfig {
  /** Stable identifier used for logging and inbound routing. */
  id: string;
  /** Human-friendly adapter label. */
  name: string;
  /** Optional textual description for operators. */
  description?: string;
  /** Enables/disables adapter without removing its configuration. */
  active: boolean;
  /**
   * Priority ordering when multiple adapters are registered at the same execution point.
   * Lower numbers run earlier. Only affects ordering relative to other adapters
   * at the exact same stage/step/point combination.
   */
  priority?: number;
  /** Execution points where this adapter should be invoked. */
  executionPoints: AdapterExecutionPointDefinition[];
}

/**
 * Describes the adapters configured for a particular SATP execution stage.
 */
export interface SatpStageAdapterSet {
  /** Complete adapter catalog for the stage (matches `adapters` block in YAML). */
  adapters: AdapterDefinition[];
  /** Optional step-to-adapter mapping; values reference adapter ids from `adapters`. */
  steps?: Partial<Record<StageExecutionStep, string[]>>;
}

/**
 * Supported SATP stage identifiers that can host adapters.
 */
export type SatpStageKey = "stage0" | "stage1" | "stage2" | "stage3" | "crash";

/**
 * Execution steps inside a stage where adapters can hook into. Additional steps
 * can be added later without breaking existing configs.
 */
export type StageExecutionStep = "before" | "during" | "after" | "rollback";
/**
 * Root configuration structure loaded from adapters/example.yml (or similar files).
 */
export interface AdapterLayerConfiguration {
  /**
   * Flat list of adapters, each defining their own execution points.
   */
  adapters: AdapterDefinition[];
  /**
   * Global defaults applied to every adapter unless overridden at adapter level.
   */
  global?: GlobalAdapterDefaults;
}

/**
 * Global defaults for adapter execution.
 */
export interface GlobalAdapterDefaults extends RetryPolicy {
  timeoutMs?: number;
  logLevel?: "trace" | "debug" | "info" | "warn" | "error";
  headers?: Record<string, string>;
}

/**
 * Flattened execution binding - represents one adapter at one execution point.
 */
export interface AdapterExecutionBinding {
  /** Reference to the adapter */
  adapterId: string;
  adapter: AdapterDefinition;
  /** Execution stage (0-3) */
  stage: number;
  /** Stage-specific step identifier */
  stepTag: string;
  /** Execution order (before/during/after/rollback) */
  stepOrder: StageExecutionStep;
  /** Priority for ordering multiple adapters at same execution point */
  priority: number;
}

/**
 * Full execution plan derived from {@link AdapterLayerConfiguration} and used by the AdapterHookService.
 */
export interface AdapterExecutionPlan {
  bindings: AdapterExecutionBinding[];
}
