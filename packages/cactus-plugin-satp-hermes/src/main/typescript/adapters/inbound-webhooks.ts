/**
 * Inbound Webhook Decision Contracts - Approval workflow schemas for external controllers
 *
 * @fileoverview
 * Defines the request/response contracts that external approval controllers must use
 * when posting decisions to the SATP gateway's inbound webhook endpoints. These schemas
 * enable human-in-the-loop workflows, compliance automation, and policy enforcement by
 * allowing external systems to pause and resume SATP transfers.
 *
 * @description
 * **Inbound Webhook Workflow:**
 * 1. SATP gateway reaches a stage/step with configured inbound adapter
 * 2. Gateway pauses execution and waits for external decision POST
 * 3. External controller evaluates business rules, compliance checks, or manual review
 * 4. Controller POSTs decision payload to gateway's inbound endpoint
 * 5. Gateway validates decision, logs justification, and resumes or aborts transfer
 *
 * **Decision Semantics:**
 * - `continue: true`: Approve transfer continuation; gateway proceeds to next stage
 * - `continue: false`: Reject transfer; gateway aborts and may trigger rollback
 * - `reason`: Human-readable justification stored in audit logs
 * - `metadata`: Opaque context from external system (approval IDs, timestamps, etc.)
 *
 * **Timeout Handling:**
 * Each inbound webhook declares an `inboundDeadlineMs` timeout. If no decision arrives
 * within this window, the gateway treats it as a rejection and aborts the transfer.
 * Operators should configure timeouts based on SLA requirements and approval workflow
 * complexity (e.g., 30s for automated checks, 5min for manual review).
 *
 * **Security Considerations:**
 * - Inbound endpoints should use authentication (API keys, mTLS, JWT validation)
 * - Decision payloads must include session/context IDs to prevent replay attacks
 * - Gateway validates that adapter ID and stage match the paused session state
 * - All decisions are logged with timestamps for non-repudiation
 *
 * @example
 * External controller approving a high-value transfer after manual review:
 * ```typescript
 * const decision: InboundWebhookDecisionPayload = {
 *   adapterId: "manager-approval",
 *   stage: Stage.STAGE2,
 *   sessionId: "sess-abc-123",
 *   contextId: "ctx-transfer-456",
 *   timestamp: new Date().toISOString(),
 *   metadata: {
 *     approverUserId: "manager@example.com",
 *     approvalTicketId: "TICKET-789",
 *     reviewDurationMs: 120000
 *   },
 *   continue: true,
 *   reason: "Transfer approved by operations manager after KYC verification",
 *   schemaVersion: "v1.0.0"
 * };
 *
 * // POST to: https://gateway.example.com/api/v1/adapters/inbound/manager-approval
 * const response = await fetch(inboundUrl, {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json", "Authorization": "Bearer ..." },
 *   body: JSON.stringify(decision)
 * });
 * ```
 *
 * @example
 * Automated compliance system rejecting a sanctioned transfer:
 * ```typescript
 * const rejection: InboundWebhookDecisionPayload = {
 *   adapterId: "sanctions-check",
 *   stage: Stage.STAGE1,
 *   sessionId: "sess-xyz-789",
 *   contextId: "ctx-transfer-999",
 *   timestamp: new Date().toISOString(),
 *   metadata: {
 *     sanctionListMatch: "OFAC-SDN",
 *     matchedEntity: "entity-12345",
 *     complianceRuleId: "RULE-AML-001"
 *   },
 *   continue: false,
 *   reason: "Transfer rejected: counterparty matches OFAC sanctions list",
 *   schemaVersion: "v1.0.0"
 * };
 * ```
 *
 * @see {@link AdapterHookService} for inbound webhook coordination
 * @see {@link OutboundWebhookPayload} for outbound notification schema
 * @see {@link InboundWebhookConfig} for endpoint configuration
 *
 * @module inbound-webhooks
 * @since 0.0.3-beta
 */

import { Stage } from "../types/satp-protocol";
import { AdapterExecutionPointDefinition } from "./api3-adapter-types";

/**
 * Payload schema that external controllers must POST to the gateway's inbound
 * webhook in order to either resume or halt a paused SATP session.
 *
 * @description
 * This contract establishes the decision interface between external approval
 * systems and the SATP gateway. All fields are required unless marked optional
 * to ensure auditability and prevent ambiguous approvals.
 *
 * **Required Fields:**
 * - `adapterId`, `stage`, `sessionId`, `contextId`: Must match the paused session
 * - `continue`: Boolean decision (true = approve, false = reject)
 * - `timestamp`: ISO 8601 timestamp when decision was made
 * - `schemaVersion`: Payload version for client compatibility checks
 *
 * **Optional Fields:**
 * - `reason`: Human-readable justification (recommended for audit trails)
 * - `metadata`: Opaque context from external system (approval IDs, user info, etc.)
 *
 * @since 0.0.3-beta
 */
export interface InboundWebhookDecisionPayload {
  /** Adapter identifier that originally paused the SATP stage. */
  adapterId: string;
  /** SATP stage awaiting approval. */
  executionPoints: AdapterExecutionPointDefinition;
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
