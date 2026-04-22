# SATP v13 Migration Guide

Integrator-facing summary of the upgrade from **IETF SATP Core draft-02** to
**draft-13** in `cactus-plugin-satp-hermes`. This document points at the
authoritative engineering sources rather than duplicating them.

> Authoritative engineering record: [../plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md](../plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md)
> Detailed changelog: [../../CHANGELOG.md](../../CHANGELOG.md)
> Quick reference card: [breaking-changes.md](./breaking-changes.md)

---

## 1. Version Matrix

All version constants live in
[../../src/main/typescript/core/constants.ts](../../src/main/typescript/core/constants.ts).

| Constant | Value | Notes |
|---|---|---|
| `SATP_VERSION` | `"v13"` | SATP Core draft tracked by this plugin |
| `SATP_CORE_VERSION` | `"v13"` | Mirrors `SATP_VERSION` |
| `SATP_ARCHITECTURE_VERSION` | `"v13"` | SATP Architecture draft |
| `SATP_PROTOCOL_VERSION` | `"1.0"` | Wire `version` field per v13 §5.3.1 (major.minor) |
| `SATP_CRASH_VERSION` | `"v02"` | Independent — tracks `draft-belchior-satp-gateway-recovery` (non-standard extension, see REQ-004 in the plan) |

The crash recovery sub-protocol is explicitly **not** part of SATP Core v13 and
is versioned separately. Do not bump `SATP_CRASH_VERSION` to align with the
core version.

---

## 2. What Changed

### 2.1 Message envelope (`CommonSatp`)

`CommonSatp` shrank from 15 fields to 4 (`version`, `messageType`, `sessionId`,
`transferContextId`). Removed fields: `sequence_number`, `resource_url`,
`action_response`, `credential_block`, `payload_profile`, `payload`,
`payload_hash`, `client_gateway_pubkey`, `server_gateway_pubkey`, `error`,
`error_code`. Per-message hashes (`hashPrevMessage`, `hashTransferInitClaim`,
`timestamp`) are now top-level on individual messages, not on the envelope.

See plan §1.4 for the full table.

### 2.2 Field renames

Most user-visible: keys are now **purpose-specific**. Examples:

- `originator_pubkey` → `originatorPublicKey`
- `beneficiary_pubkey` → `beneficiaryPublicKey`
- `client_gateway_pubkey` → `senderGatewaySignaturePublicKey`
- `server_gateway_pubkey` → `receiverGatewaySignaturePublicKey`

The "four-key classification" (signature, secure channel, identity,
gateway-owner identity — v13 §4.4, SEC-003) is the underlying reason. Full
field-by-field rename tables are in plan §1.5–§1.10.

### 2.3 New message types

- `reject-msg` — generic rejection, allowed at any stage, carries
  `reasonCode` from the IANA registry. Replaces the v02-specific
  `INIT_REJECT` counter-proposal mechanism. Session terminates on receipt.
- `error-msg` — out-of-band protocol error.
- `session-abort-msg` — explicit session abort. Effectiveness depends on
  stage (v13 §11.4): reversible before `commit-final-msg`, not after.

Factories: [../../src/main/typescript/core/protocol-message-service.ts](../../src/main/typescript/core/protocol-message-service.ts).

### 2.4 Signatures

Per-message signature fields are removed. All messages are now wrapped in a
**JWS envelope** (RFC 7515) using ECDSA P-256 + SHA-256 as the minimum
(SEC-002). JWS helpers: [../../src/main/typescript/core/jws-utils.ts](../../src/main/typescript/core/jws-utils.ts).

### 2.5 IANA error codes

73 IANA-registered error codes with stage-specific mappings. Lookup is in
[../../src/main/typescript/core/iana-message-types.ts](../../src/main/typescript/core/iana-message-types.ts)
and [../../src/main/typescript/core/errors/](../../src/main/typescript/core/errors/).

### 2.6 Crash recovery removed from Core

v13 §10.8 explicitly removes session recovery/resumption from the Core spec.
The HERMES crash recovery sub-protocol (RECOVER, RECOVER-UPDATE, ROLLBACK)
is preserved as a non-standard extension and orchestrated via Temporal — see
[../temporal/deployment-guide.md](../temporal/deployment-guide.md) and
[../temporal/workflows-and-activities.md](../temporal/workflows-and-activities.md).

### 2.7 Security baseline (SEC-001 … SEC-004)

- TLS 1.3 minimum (`TLS_AES_128_GCM_SHA256` mandatory). HTTP/gRPC enforcement
  is partial — see plan "Deferred Work, SEC-001".
- JWS-signed messages (ECDSA P-256 + SHA-256 min).
- Four-key classification.
- JWT + OAuth 2.0 minimum for App-to-Gateway authentication (v13 §5.3.8).

---

## 3. Upgrade Checklist for Integrators

1. Update any direct references to renamed proto fields (see plan §1.5–§1.10).
2. Replace ad-hoc per-message signature handling with JWS envelopes via
   [`jws-utils.ts`](../../src/main/typescript/core/jws-utils.ts).
3. Replace usage of removed `CommonSatp` fields (`sequence_number`,
   `payload_*`, `error`, `error_code`) with the new top-level message fields
   or the dedicated `error-msg` / `reject-msg` types.
4. Map old error enums to IANA codes via
   [`iana-message-types.ts`](../../src/main/typescript/core/iana-message-types.ts).
5. Wire the gateway to Temporal for crash recovery —
   [../temporal/deployment-guide.md](../temporal/deployment-guide.md).
6. Run the v13 regression sweep:
   [../testing/v13-temporal-regression.md](../testing/v13-temporal-regression.md).

---

## 4. Related Documents

- Plan: [../plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md](../plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md)
- Conformance review: [../plans/update-v2-to-v13/conformance-code-review-2026-04-22.md](../plans/update-v2-to-v13/conformance-code-review-2026-04-22.md)
- QA run log: [../plans/update-v2-to-v13/qa-runlog-2026-04-22.md](../plans/update-v2-to-v13/qa-runlog-2026-04-22.md)
- Architecture: [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
- IETF SATP Core v13: <https://datatracker.ietf.org/doc/html/draft-ietf-satp-core-13>
