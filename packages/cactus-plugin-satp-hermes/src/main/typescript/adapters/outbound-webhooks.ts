import { Stage } from "../types/satp-protocol";

/**
 * Standardized list of outbound webhook events emitted by the SATP gateway when
 * adapter hooks fire.
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
	/** The SATP stage associated with the notification. */
	stage: Stage;
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
