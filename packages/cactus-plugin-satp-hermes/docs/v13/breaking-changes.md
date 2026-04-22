# v13 Breaking Changes — Quick Reference

One-page lookup for the most common v02 → v13 migration questions. For full
context see [migration-guide.md](./migration-guide.md) and the
[upgrade plan](../plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md).

## Renames

| v02 (snake_case proto) | v13 (camelCase wire) | Notes |
|---|---|---|
| `originator_pubkey` | `originatorPublicKey` | Required |
| `beneficiary_pubkey` | `beneficiaryPublicKey` | Required |
| `client_gateway_pubkey` | `senderGatewaySignaturePublicKey` | Purpose-specific (signature key) |
| `server_gateway_pubkey` | `receiverGatewaySignaturePublicKey` | Purpose-specific (signature key) |
| `sender_gateway_owner_id` | `senderGatewayOwnerId` | Now OPTIONAL |
| `receiver_gateway_owner_id` | `receiverGatewayOwnerId` | Now OPTIONAL |
| `hash_previous_message` | `hashPrevMessage` | Per-message, not envelope |
| `message_type` (enum) | `messageType` (IANA URN string) | See `iana-message-types.ts` |

## Removed from `CommonSatp`

`sequence_number`, `resource_url`, `action_response`, `credential_block`,
`payload_profile`, `payload`, `payload_hash`, `client_gateway_pubkey`,
`server_gateway_pubkey`, `error`, `error_code`.

Surviving envelope fields: `version`, `messageType`, `sessionId`,
`transferContextId`.

## Removed from `TransferClaims`

`max_retries`, `max_timeout`, `amount_from_originator`. Retry/timeout policy
now lives in Temporal Activity options — see
[../temporal/workflows-and-activities.md](../temporal/workflows-and-activities.md).

## New Messages

| Message | Purpose | When |
|---|---|---|
| `reject-msg` | Generic rejection with IANA `reasonCode` | Any stage; terminates session |
| `error-msg` | Out-of-band protocol error | Any stage |
| `session-abort-msg` | Explicit abort | Reversible before `commit-final-msg`, otherwise no-op (§11.4) |

Factories: [../../src/main/typescript/core/protocol-message-service.ts](../../src/main/typescript/core/protocol-message-service.ts).

## Behavior Changes

| Concern | v02 | v13 |
|---|---|---|
| Signatures | Ad-hoc per-message fields | JWS envelope (ECDSA P-256 + SHA-256 min) |
| Error reporting | `CommonSatp.error` + `error_code` enum | `error-msg` / `reject-msg` with IANA `reasonCode` |
| Session recovery | Part of core spec | Removed from core (§10.8); HERMES Temporal extension only |
| Counter-proposal | `INIT_REJECT` chain | Removed; single `reject-msg` terminates session |
| `transferContextId` | Effectively optional | REQUIRED in all messages (except `error-msg`, `session-abort-msg`) |
| TLS | 1.2 allowed | 1.3 minimum, `TLS_AES_128_GCM_SHA256` mandatory |
| Auth (App→Gateway) | Unspecified | JWT + OAuth 2.0 minimum |

## Version Constants

| Constant | Value | Don't change without |
|---|---|---|
| `SATP_VERSION` / `SATP_CORE_VERSION` / `SATP_ARCHITECTURE_VERSION` | `"v13"` | New IETF draft release |
| `SATP_PROTOCOL_VERSION` | `"1.0"` | v13 §5.3.1 update |
| `SATP_CRASH_VERSION` | `"v02"` | New `draft-belchior-satp-gateway-recovery` release — **independent** of Core |
