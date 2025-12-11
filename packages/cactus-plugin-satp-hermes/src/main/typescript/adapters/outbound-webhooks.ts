/**
 * Outbound Webhook Payload Definitions - Event notification contracts for external systems
 *
 * @fileoverview
 * Defines the standardized payload schemas delivered by the SATP gateway to external
 * monitoring, logging, and automation systems via outbound webhook invocations. These
 * payloads capture SATP lifecycle events with complete session context for correlation
 * and audit trail construction.
 *
 * @description
 * **Outbound Webhook Purpose:**
 * Outbound webhooks enable external systems to observe SATP protocol execution in
 * real-time without blocking gateway operations. The gateway fires outbound notifications
 * when configured lifecycle events occur, providing full session context and stage-specific
 * metadata to the receiving endpoint.
 *
 * **Event Types:**
 * - `stage.started`: SATP stage has begun execution (outbound hooks at 'before' step)
 * - `stage.completed`: SATP stage finished successfully (outbound hooks at 'after' step)
 * - `stage.failed`: SATP stage encountered an error and may trigger rollback
 * - `adapter.retry`: Adapter webhook is retrying after transient failure
 * - `adapter.skipped`: Adapter was bypassed (inactive or condition not met)
 *
 * **Payload Structure:**
 * All outbound payloads follow a consistent envelope containing:
 * - Event type and schema version for client-side parsing logic
 * - SATP session/context identifiers for correlation across stages
 * - Gateway identity for multi-gateway deployment visibility
 * - ISO 8601 timestamp for precise event ordering
 * - Stage-specific payload with DLT proofs, transaction hashes, or error details
 *
 * **Integration Patterns:**
 * - **Monitoring Dashboards**: Visualize transfer progress and latency metrics
 * - **Audit Systems**: Record immutable event logs for compliance and forensics
 * - **Alerting Platforms**: Trigger notifications on transfer failures or anomalies
 * - **Analytics Pipelines**: Aggregate events for performance analysis and reporting
 * - **Secondary Workflows**: Initiate downstream processes based on transfer completion
 *
 * @example
 * Outbound webhook payload for Stage 1 lock detection:
 * ```typescript
 * const payload: OutboundWebhookPayload = {
 *   eventType: "stage.completed",
 *   schemaVersion: "v1.0.0",
 *   stage: Stage.STAGE1,
 *   adapterId: "lock-monitor",
 *   sessionId: "sess-abc-123",
 *   contextId: "ctx-transfer-456",
 *   gatewayId: "gateway-fabric-1",
 *   payload: {
 *     lockTxHash: "0x789def...",
 *     lockedAmount: "1000.00",
 *     lockedAsset: "USDC",
 *     sourceChain: "fabric-network",
 *     lockProof: { }
 *   },
 *   timestamp: "2025-12-06T10:30:45.123Z",
 *   message: "Asset locked successfully on source ledger"
 * };
 * ```
 *
 * @example
 * Failure notification with error context:
 * ```typescript
 * const failurePayload: OutboundWebhookPayload = {
 *   eventType: "stage.failed",
 *   schemaVersion: "v1.0.0",
 *   stage: Stage.STAGE2,
 *   adapterId: "commitment-validator",
 *   sessionId: "sess-xyz-789",
 *   gatewayId: "gateway-besu-2",
 *   payload: {
 *     errorCode: "COMMITMENT_TIMEOUT",
 *     retryable: false,
 *     lastKnownState: "awaiting-counterparty-signature"
 *   },
 *   timestamp: "2025-12-06T10:31:15.456Z",
 *   message: "Commitment phase timed out after 5 minutes"
 * };
 * ```
 *
 * @see {@link AdapterHookService} for outbound webhook invocation
 * @see {@link InboundWebhookDecisionResponse} for inbound webhook schema
 * @see {@link OutboundWebhookConfig} for endpoint configuration
 *
 * @module outbound-webhooks
 * @since 0.0.3-beta
 */

import type { StageExecutionStep } from "./api3-adapter-types";

/**
 * Execution point info embedded in outbound webhook payloads.
 * Includes a computed `name` for logging/display purposes.
 */
export interface OutboundWebhookExecutionPoint {
  /** Computed name for the execution point (stepTag-point format) */
  name: string;
  /** SATP stage number (0-3) */
  stage: number;
  /** Stage-specific step identifier */
  step: string;
  /** Execution order within the step */
  point: StageExecutionStep;
}

/**
 * Standardized list of outbound webhook events emitted by the SATP gateway when
 * adapter hooks fire.
 *
 * @description
 * Each event type represents a distinct lifecycle moment in SATP protocol execution.
 * External systems can filter and route events based on type to implement specialized
 * handling logic (e.g., send alerts only for 'stage.failed' events).
 *
 * @since 0.0.3-beta
 */
export type OutboundWebhookEventType =
  | "stage.started"
  | "stage.completed"
  | "stage.failed"
  | "adapter.retry"
  | "adapter.skipped";

/**
 * Outbound webhook payload delivering SATP transfer telemetry to external
 * monitoring or automation systems.
 */
export interface OutboundWebhookPayload {
  /** Event name describing the lifecycle moment for the adapter. */
  eventType: OutboundWebhookEventType;
  /** Semantic version of the payload contract (e.g., "v1.0.0"). */
  schemaVersion: string;
  /** The SATP execution point associated with the notification. */
  executionPoints: OutboundWebhookExecutionPoint;
  /** Adapter identifier (matches configuration id). */
  adapterId: string;
  /** SATP session identifier for correlation. */
  sessionId: string;
  /** Optional transfer context identifier propagated from API1. */
  contextId?: string;
  /** Gateway identifier emitting the notification. */
  gatewayId: string;
  /**
   * Stage-specific metadata. For example, Stage 1 includes lock proofs while
   * Stage 3 may contain mint/burn receipts.
   */
  payload?: Record<string, unknown>;
  /** ISO 8601 timestamp for when the event was emitted. */
  timestamp: string;
  /** Optional human-readable description or error message. */
  message?: string;
}
