import type { Stage } from "../types/satp-protocol";
import type {
  AdapterDefinition,
  AdapterExecutionBinding,
  AdapterExecutionPlan,
} from "./api3-adapter-types";
import type {
  AdapterWebhookDisposition,
  AdapterWebhookMetrics,
} from "./adapter-webhook-contracts";
import type { OutboundWebhookPayload } from "./outbound-webhooks";
import type { InboundWebhookDecisionPayload } from "./inbound-webhooks";

export type AdapterHookDirection = "outbound" | "inbound";

/**
 * Context shared when executing a single adapter binding.
 */
export interface AdapterInvocationContext {
  binding: AdapterExecutionBinding;
  adapter: AdapterDefinition;
  stage: Stage;
  sessionId: string;
  contextId?: string;
  gatewayId: string;
  attempt: number;
  direction: AdapterHookDirection;
  metadata?: Record<string, unknown>;
  payload?: OutboundWebhookPayload["payload"];
}

export interface OutboundWebhookInvocationResult {
  status: "OK" | "FAILED";
  httpStatus?: number;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
  retriesAttempted: number;
  completedAt: string;
  latencyMs: number;
  errorMessage?: string;
}

export interface AdapterHookStepResult {
  binding: AdapterExecutionBinding;
  disposition: AdapterWebhookDisposition;
  message?: string;
  metrics?: AdapterWebhookMetrics;
  blockingDecision?: InboundWebhookDecisionPayload;
  outboundResult?: OutboundWebhookInvocationResult;
}

export interface AdapterHookResult {
  stage: Stage;
  sessionId: string;
  steps: AdapterHookStepResult[];
  completedAt: string;
}

export interface AdapterHookExecutionParams {
  stage: Stage;
  sessionId: string;
  contextId?: string;
  gatewayId: string;
  direction: AdapterHookDirection;
  plan: AdapterExecutionPlan;
  bindings?: AdapterExecutionBinding[];
  adapterCatalog?: Record<string, AdapterDefinition>;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  deadlineEpochMs?: number;
}
