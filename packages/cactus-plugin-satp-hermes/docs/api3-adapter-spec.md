# API3 Adapter Specification

**Version:** v1.0.0  
**Status:** Draft

This document standardizes the API3 adapter contract used by the SATP Hermes gateway to
invoke operator-defined webhooks before, during, and after SATP protocol stages. It
covers configuration structure, webhook payload formats, security expectations, and
versioning rules.

## 1. Configuration Model

Adapters are described via YAML/JSON using the structure defined in
`src/main/typescript/adapters/api3-adapter-types.ts`. The root object contains a
`satpStages` map (keys: `stage0`, `stage1`, `stage2`, `stage3`, `crash`) and an
optional `global` block for defaults.

```yaml
satpStages:
  stage0:
    adapters:
      - id: "phase0-adapter-1"
        name: "Transfer Validation Webhook"
        description: "Validates transfer initiation request"
        active: true
        priority: 1
        outboundWebhook:
          url: "https://ops.example.com/phase0"
          method: POST
          timeoutMs: 5000
          retryAttempts: 3
          retryDelayMs: 1000
          headers:
            Content-Type: "application/json"
          payloadTemplate: |
            {
              "stage": "stage0",
              "sessionId": "{{.sessionId}}",
              "contextId": "{{.contextId}}"
            }
        inboundWebhook:
          urlSuffix: "/phase0/decision"
          timeoutMs: 300000
          inboundDeadlineMs: 300000
          method: POST
          headers:
            Content-Type: "application/json"
          payloadTemplate: "{}" # not used for inbound
  stage1:
    adapters:
      - id: "lock-proof-feed"
        name: "Lock Proof Broadcaster"
        active: true
        priority: 10
        outboundWebhook:
          url: "https://ops.example.com/lock-events"
          method: POST
          timeoutMs: 3000

global:
  timeoutMs: 3000
  retryAttempts: 5
  retryDelayMs: 500
  logLevel: info
```

### 1.1 Adapter Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | yes | Stable identifier used for logging and inbound routing. |
| `name` | `string` | yes | Human friendly label. |
| `description` | `string` | no | Optional annotation for operators. |
| `active` | `boolean` | yes | Enables/disables the adapter. |
| `priority` | `number` | no | Lower values execute earlier within the stage. |
| `outboundWebhook` | `OutboundWebhookConfig` | yes | Notification endpoint. |
| `inboundWebhook` | `InboundWebhookConfig` | no | Optional approval endpoint. |

### 1.2 `OutboundWebhookConfig`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `url` | `string` | yes | HTTPS endpoint. |
| `method` | `WebhookHttpMethod` | no (default POST) | Verb for request. |
| `timeoutMs` | `number` | no | Request timeout. |
| `retryAttempts` | `number` | no | Includes initial attempt. |
| `retryDelayMs` | `number` | no | Delay between retries. |
| `headers` | `Record<string,string>` | no | Static headers (e.g., auth tokens). |
| `payloadTemplate` | `string` | no | String template rendered per invocation. |

### 1.3 `InboundWebhookConfig`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `urlSuffix` | `string` | yes | Appended to the gateway's API3 inbound base path. |
| `method` | `WebhookHttpMethod` | no | Verb accepted from callers. |
| `timeoutMs` | `number` | no | Server wait time per request. |
| `inboundDeadlineMs` | `number` | no | Global deadline for receiving inbound approval. |
| `retryAttempts`, `retryDelayMs`, `headers`, `payloadTemplate` | optional | Same semantics as outbound. |

## 2. Webhook Payloads

### 2.1 Outbound Payload (`OutboundWebhookPayload`)

```json
{
  "eventType": "stage.completed",
  "schemaVersion": "v1.0.0",
  "stage": "stage-1",
  "adapterId": "lock-proof-feed",
  "sessionId": "e54f6c8f-3c2d-4f87-9f43-821a",
  "contextId": "carbon-credit-2025-01",
  "gatewayId": "gateway-a",
  "timestamp": "2025-11-25T09:31:07.452Z",
  "payload": {
    "lockReceiptHash": "0xabc...",
    "sourceLedger": "fabric-local"
  }
}
```

- `eventType` enumerates lifecycle markers: `stage.started`, `stage.completed`,
  `stage.failed`, `adapter.retry`, `adapter.skipped`.
- `payload` is stage-specific metadata. Consumers must ignore unknown fields.

### 2.2 Inbound Payload (`InboundWebhookDecisionPayload`)

```json
{
  "schemaVersion": "v1.0.0",
  "adapterId": "phase0-adapter-1",
  "stage": "stage-0",
  "sessionId": "e54f6c8f-3c2d-4f87-9f43-821a",
  "contextId": "carbon-credit-2025-01",
  "timestamp": "2025-11-25T09:33:05.123Z",
  "continue": true,
  "reason": "Manual approval by compliance",
  "metadata": {
    "approver": "alice@ops.example.com"
  }
}
```

The gateway replies with `InboundWebhookDecisionResponse`:

```json
{
  "accepted": true,
  "processedAt": "2025-11-25T09:33:05.456Z",
  "message": "Stage resumed"
}
```

Inbound callers **must** provide `continue` (boolean) and SHOULD include `reason`.
When `continue` is `false`, the gateway aborts the SATP session and records the
reason for audit.

## 3. Authentication & Authorization

1. **TLS Enforcement**
   - Outbound & inbound webhooks use HTTPS with TLS 1.2+.
   - Mutual TLS is required: adapters present client certificates issued by an
     operator-controlled CA; the gateway presents its certificate to outbound peers.
2. **Header-Based Authorization (Optional)**
   - Additional bearer tokens or HMAC headers may be configured via `headers` in the
     adapter definition. These headers are injected into outbound requests and
     validated for inbound traffic.
3. **Certificate Pinning**
   - The gateway validates inbound certificates against a trust store defined in the
     deployment configuration (outside the adapter file). Certificates rotate
     without changes to adapter identifiers.

## 4. Versioning

- **Schema Versioning**
  - Payloads carry `schemaVersion` (`semver`). Breaking changes bump the major
    version (e.g., `v2.0.0`).
  - Gateways can accept multiple schema versions simultaneously; adapters specify
    the minimum version they understand.
- **Configuration Versioning**
  - `example.yml` corresponds to spec `v1.0.0`.
  - Future additions MUST be backward compatible (new optional fields) or require
    a configuration `specVersion` flag to opt in to new behavior.

## 5. Operational Guidance

- **Retries**: Use the global defaults for most adapters; override when stage
  operations are time sensitive.
- **Timeouts**: Ensure `inboundDeadlineMs` < SATP stage timeout to avoid partial
  state.
- **Auditing**: Include descriptive `reason` strings so that crash recovery logs
  explain why a transfer was paused or rejected.

This specification will evolve alongside the SATP Hermes release cadence.
