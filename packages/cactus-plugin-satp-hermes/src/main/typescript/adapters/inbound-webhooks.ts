import { Stage } from "../types/satp-protocol";

/**
 * Payload schema that external controllers must POST to the gateway's inbound
 * webhook in order to either resume or halt a paused SATP session.
 */
export interface InboundWebhookDecisionPayload {
	/** Adapter identifier that originally paused the SATP stage. */
	adapterId: string;
	/** SATP stage awaiting approval. */
	stage: Stage;
	/** Unique SATP session identifier. */
	sessionId: string;
	/** Business context identifier propagated across stages. */
	contextId: string;
	/** ISO 8601 timestamp representing when the decision was produced. */
	timestamp: string;
	/** Optional opaque metadata provided by the external system. */
	metadata?: Record<string, unknown>;
	/**
	 * When true the gateway resumes the paused stage; otherwise the transfer is
	 * rejected and the provided reason is logged.
	 */
	continue: boolean;
	/** Human-readable justification for auditing and operator visibility. */
	reason?: string;
	/** Semantic version of the payload schema (e.g., "v1.0.0"). */
	schemaVersion: string;
}

/**
 * Standardized acknowledgement returned to inbound webhook callers.
 */
export interface InboundWebhookDecisionResponse {
	/** Indicates whether the decision was accepted for processing. */
	accepted: boolean;
	/** Server-side timestamp (ISO 8601) for traceability. */
	processedAt: string;
	/** Optional diagnostic message explaining acceptance or rejection. */
	message?: string;
}
