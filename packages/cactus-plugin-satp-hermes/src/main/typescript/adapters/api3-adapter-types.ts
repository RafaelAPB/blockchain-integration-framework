/**
 * API3 Adapter Type Definitions
 *
 * Simple configuration contract aligned with `adapters/example.yml`. Each SATP
 * stage declares a list of adapter definitions (containing outbound/inbound
 * webhook settings). Stages may optionally describe execution *steps* that
 * reference adapters by identifier so that a single adapter can be reused across
 * multiple stage checkpoints (e.g., before & after Stage 0).
 */

/** Supported HTTP methods for adapter webhooks. */
export type WebhookHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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
	/** HTTP method used for the invocation. Defaults to POST when omitted. */
	method?: WebhookHttpMethod;
	/** Free-form header list applied to the request. */
	headers?: Record<string, string>;
	/** Optional Mustache/Handlebars-style payload template rendered per invocation. */
	payloadTemplate?: string;
}

/**
 * Outbound webhook definition used to notify external systems about SATP activity.
 */
export interface OutboundWebhookConfig extends BaseWebhookConfig {
	/** Absolute HTTPS endpoint the gateway should call. */
	url: string;
}

/**
 * Inbound webhook definition used to pause SATP execution until an external
 * controller posts a decision. The gateway exposes the suffix under its API3
 * adapter base path.
 */
export interface InboundWebhookConfig extends BaseWebhookConfig {
	/** Relative URL suffix registered by the gateway (e.g., "/inbound/phase0"). */
	urlSuffix: string;
	/**
	 * Hard deadline (ms) for receiving the inbound call before the SATP session
	 * is cancelled. Defaults to the adapter/global timeout when omitted.
	 */
	inboundDeadlineMs?: number;
}

/**
 * Combined webhook configuration used per adapter entry.
 */
export interface AdapterWebhookConfig {
	outboundWebhook?: OutboundWebhookConfig;
	inboundWebhook?: InboundWebhookConfig;
}

/**
 * Adapter definition bound to a SATP stage.
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
	/** Lower numbers run earlier when multiple adapters are registered. */
	priority?: number;
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
export interface Api3AdapterConfiguration {
	/**
	 * Stage-specific adapter collections. Missing stages simply do not trigger
	 * adapter hooks.
	 */
	satpStages: Partial<Record<SatpStageKey, SatpStageAdapterSet>>;
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
