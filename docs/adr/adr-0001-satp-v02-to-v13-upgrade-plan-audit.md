---
title: "ADR-0001: SATP v02-to-v13 Upgrade Plan Specification Audit"
status: "Accepted"
date: "2026-03-31"
authors: "SATP Development Team"
tags: ["architecture", "decision", "satp", "specification-compliance", "audit"]
supersedes: ""
superseded_by: ""
---

## Status

**Accepted**

## Context

The `cactus-plugin-satp-hermes` package maintains a master upgrade plan
(`packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md`)
that maps every divergence point between IETF SATP Core draft-02 and draft-13
to concrete implementation tasks. This plan governs all protocol-layer changes
across protobuf definitions, TypeScript services, session management, error
handling, and test suites.

Because the plan drives feature work on the `feat/satpv13andtemporal` branch,
any inaccuracy could lead to incorrect implementations, missed fields, or
wrong assumptions about the specification. A field-by-field audit against the
actual IETF specifications was therefore necessary before Phase 2
implementation begins.

**Source specifications audited:**
- v02: https://www.ietf.org/archive/id/draft-ietf-satp-core-02.txt (July 2023)
- v13: https://www.ietf.org/archive/id/draft-ietf-satp-core-13.txt (March 2026)

**Document audited:**
- `upgrade-satp-core-v02-to-v13.md` (version 6.0, dated 2026-03-26)

## Decision

Perform a comprehensive line-by-line audit of the upgrade plan against both
IETF specifications, fix all identified inaccuracies in place, and record the
audit findings in this ADR for future reference.

The audit covers all 17 requirement/constraint sections (1.1–1.17)
and the implementation phases (2.x). Each field mapping table, error code,
IANA URN, message definition, and protocol flow was cross-referenced against
the normative text of both specs.

### Findings Summary

Four inaccuracies were identified and corrected. One specification-internal
inconsistency was noted (not a plan error). All other sections were verified
correct.

### Issue 1 — Section 1.6: NetworkCapabilities Field Removal Count

- **Severity**: Error
- **Before**: "Net result" stated "8 fields removed"
- **After**: Corrected to "9 fields removed" (the table listed 9 `Remove` rows)
- **Spec reference**: v02 §6 / v13 §5.3.3

### Issue 2 — Section 1.4: CommonSatp Shared-Fields Description

- **Severity**: Minor inaccuracy
- **Before**: "Net result" stated "4 shared fields (`messageType`, `sessionId`, `transferContextId`, `version`)"
- **After**: Expanded to note that `version` appears only in 3 of the 14 v13 message types (transfer-proposal-request-msg, transfer-proposal-receipt-msg, transfer-commence-request-msg) and that `transferContextId` is absent from error-msg and session-abort-msg
- **Spec reference**: v13 §§8.1–11.4

### Issue 3 — Section 1.7: Reject Message Origin Description

- **Severity**: Minor inaccuracy
- **Before**: Described `INIT_REJECT` as "part of TransferProposalResponse"
- **After**: Corrected to "a separate Transfer Proposal Reject message — v02 Section 7.5"
- **Spec reference**: v02 §7.5 (distinct `INIT_REJECT` message definition)

### Issue 4 — Section 1.8: lockAssertionExpiration Type Change

- **Severity**: Minor inaccuracy
- **Before**: `lockAssertionExpiration` row mapped the rename but did not flag the type change
- **After**: Added note: "Also changes type from `uint64` to `string` (ISO 8601 datetime per v13 §9.1)"
- **Spec reference**: v02 §8 (uint64 `lockExpirationTime`) / v13 §9.1 (string `lockAssertionExpiration`)

### Specification-Internal Inconsistency (Not a Plan Error)

v13 §5.3.2 lists `ack-prepare-msg` in the "Stage 2: Locking" message flow,
but §10.2 (message definition) and §13.4.9 (IANA registry) both use
`commit-ready-msg`. The upgrade plan correctly follows the IANA registry
naming. No action required.

## Consequences

### Positive

- **POS-001**: All field mapping tables in the upgrade plan are now verified
  accurate against both IETF specifications, eliminating the risk of
  implementing incorrect field names or counts.
- **POS-002**: The type change for `lockAssertionExpiration` (uint64 → string)
  is now explicitly documented, preventing a silent type mismatch in protobuf
  definitions.
- **POS-003**: The audit trail in this ADR provides a reference point for
  future spec version upgrades, establishing a precedent for verification
  before implementation.
- **POS-004**: Identified a v13 spec-internal naming inconsistency
  (`ack-prepare-msg` vs `commit-ready-msg`) that implementers should be aware
  of when reading the specification.

### Negative

- **NEG-001**: The audit was performed against draft-13, which may still
  change before final RFC publication. A re-audit will be needed if the draft
  is revised.
- **NEG-002**: The audit scope was limited to the upgrade plan document. It
  did not verify that the existing TypeScript implementation matches even the
  v02 specification in all details.
- **NEG-003**: Some plan sections describe fields at a summary level (e.g.,
  "4 shared fields") which are now annotated with caveats. This adds
  complexity to what was previously a simple summary.

## Alternatives Considered

### No Audit — Trust the Plan As-Written

- **ALT-001**: **Description**: Proceed with implementation using the upgrade
  plan without cross-referencing the specifications.
- **ALT-002**: **Rejection Reason**: The plan drives all protobuf and
  TypeScript changes. Undetected errors would propagate into the
  implementation and would be harder to fix after code is written and tests
  are built around incorrect assumptions.

### Partial Audit — Spot-Check Only

- **ALT-003**: **Description**: Audit only the highest-risk sections (message
  formats, error codes) rather than all 17 sections.
- **ALT-004**: **Rejection Reason**: The field count error (Issue 1) was in a
  section that might not be considered "highest risk." A comprehensive audit
  was justified given the plan's role as the single source of truth for the
  upgrade.

### External Review — Defer to IETF Working Group

- **ALT-005**: **Description**: Submit the plan to the IETF SATP working
  group for review instead of self-auditing.
- **ALT-006**: **Rejection Reason**: Would introduce significant delay and
  the working group's scope is the specification itself, not implementation
  plans. Self-audit is faster and sufficient for catching transcription
  errors.

## Implementation Notes

- **IMP-001**: All four fixes have been applied directly to
  `packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md`
  (version 6.0 → updated in place, `last_updated: 2026-03-31`).
- **IMP-002**: The `ack-prepare-msg` vs `commit-ready-msg` inconsistency in
  v13 should be monitored in future draft revisions. If IETF resolves it, the
  plan should be updated accordingly.
- **IMP-003**: Re-audit is recommended when draft-13 is superseded or when
  the plan is updated for new implementation phases.
- **IMP-004**: Success criteria: all field mapping tables in the plan match
  the normative spec text; no implementation work is blocked or misdirected
  by plan inaccuracies.

## References

- **REF-001**: [Upgrade Plan](../../packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md)
- **REF-002**: [IETF SATP Core draft-02](https://www.ietf.org/archive/id/draft-ietf-satp-core-02.txt)
- **REF-003**: [IETF SATP Core draft-13](https://www.ietf.org/archive/id/draft-ietf-satp-core-13.txt)
- **REF-004**: [SATP Hermes Plugin Instructions](../../.github/instructions/satp-hermes.instructions.md)
