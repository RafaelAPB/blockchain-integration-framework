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
 *
 * **Timeout Handling:**
 * Each inbound webhook declares an `inboundDeadlineMs` timeout. If no decision arrives
 * within this window, the gateway treats it as a rejection and aborts the transfer.
 * Operators should configure timeouts based on SLA requirements and approval workflow
 * complexity (e.g., 30s for automated checks, 5min for manual review).
 *
 * **Security Considerations:**
 * - Inbound endpoints should use authentication (API keys, mTLS, JWT validation)
 * - Decision payloads must include adapter ID to match the paused session state
 * - All decisions are logged with timestamps for non-repudiation
 *
 * @example
 * External controller approving a transfer after manual review:
 * ```typescript
 * const decision: InboundWebhookDecisionResponse = {
 *   adapterId: "manager-approval",
 *   continue: true,
 *   reason: "Transfer approved by operations manager after KYC verification",
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
 * const rejection: InboundWebhookDecisionResponse = {
 *   adapterId: "sanctions-check",
 *   continue: false,
 *   reason: "Transfer rejected: counterparty matches OFAC sanctions list",
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

/**
 * Simplified payload schema for inbound webhook decisions.
 *
 * External controllers POST this payload to approve or reject a paused SATP transfer.
 * The gateway validates the `adapterId` matches the waiting adapter, then uses
 * `continue` to determine whether to proceed or abort.
 *
 * @since 0.0.3-beta
 */
export interface InboundWebhookDecisionResponse {
  /** Adapter identifier that originally paused the SATP stage. */
  adapterId: string;
  /**
   * When true the gateway resumes the paused stage; otherwise the transfer is
   * rejected and the provided reason is logged.
   */
  continue: boolean;
  /** Human-readable justification for auditing and operator visibility. */
  reason?: string;
  /** Optional data payload from external system. */
  data?: Record<string, unknown>;
}
