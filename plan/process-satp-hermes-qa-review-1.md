---
goal: SATP Hermes v02 to v13 Review and QA Implementation Plan
version: 1.0
date_created: 2026-04-22
last_updated: 2026-04-22
owner: SATP Hermes Team
status: 'Completed'
tags: [process, satp, qa, review, protocol-compliance, temporal]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

This plan defines a deterministic review and QA execution workflow to verify SATP Hermes compliance with SATP Core draft-02 to draft-13 migration requirements and validate Temporal-based crash recovery behavior before release. Phases 1–5 executed and documented on 2026-04-22. Phase 6 (remediation) executed on 2026-04-22: all High blockers (RB-001 to RB-004) resolved; tsc/lint/unit gates confirmed PASS; crash-recovery 4/6 and gateway 3/7 suites passing with remaining blockers classified as pre-existing test architecture issues (RB-007) and infrastructure environment constraints (RB-008).

## 1. Requirements & Constraints

- **REQ-001**: Validate implementation against provided reference drafts at workspace root: ietf-satp-2.txt.tmp and ietf-satp-13.txt.tmp.
- **REQ-002**: Verify Stage 1 to Stage 3 message schemas and handlers implement v13 message semantics, including reject-msg, error-msg, and session-abort-msg.
- **REQ-003**: Verify mandatory v13 security controls are implemented and operationally enforceable: TLS 1.3 transport and SATP message signatures.
- **REQ-004**: Validate Temporal crash recovery workflows, activities, and signal flows with deterministic test evidence.
- **REQ-005**: Produce objective pass/fail gates for compilation, unit tests, integration tests, and gateway integration tests.
- **SEC-001**: Confirm all gateway-to-gateway and gateway API transport paths can enforce TLS 1.3 in production mode.
- **SEC-002**: Confirm SATP message signature verification path is active in runtime paths, not only utility modules.
- **SEC-003**: Confirm session-abort effectiveness rules match draft-13 Stage 3 point-of-no-return behavior.
- **SEC-004**: Confirm JWT/OAuth2 capability for client-facing API calls is test-covered when enabled.
- **CON-001**: Do not modify generated code under src/main/typescript/generated.
- **CON-002**: Use package-local scripts from packages/cactus-plugin-satp-hermes/package.json for QA execution.
- **CON-003**: Treat Temporal test environment as first-class for crash recovery verification and keep tests self-contained.
- **GUD-001**: Follow repository interface naming and public API export conventions for all new review-fix work.
- **PAT-001**: Use a traceability matrix from draft requirement to concrete file/function/test evidence.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Build a draft-to-code traceability baseline and identify conformance-critical review targets.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---------- |
| TASK-001 | Create a traceability matrix file at packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/review-traceability-2026-04-22.md mapping each draft-13 requirement class (message fields, security, error handling, session abort, IANA message types) to source files and test files. | ✅ | 2026-04-22 |
| TASK-002 | Populate matrix row group for message schema evidence from packages/cactus-plugin-satp-hermes/src/main/proto/cacti/satp/v13/common/message.proto and stage proto files under packages/cactus-plugin-satp-hermes/src/main/proto/cacti/satp/v13/service/. | ✅ | 2026-04-22 |
| TASK-003 | Populate matrix row group for runtime handler evidence from packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-handlers/ and packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-services/. | ✅ | 2026-04-22 |

### Implementation Phase 2

- GOAL-002: Execute a specification conformance code review and produce actionable defect list.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-004 | Review reject-msg, error-msg, session-abort-msg creation and dispatch in packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-services/protocol-message-service.ts and packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-handlers/protocol-message-handler.ts against draft-13 sections 8.5, 10.6, 10.7, 11.4. | ✅ | 2026-04-22 |
| TASK-005 | Review common body and signature verification behavior in packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-services/data-verifier.ts; record whether runtime path enforces v13 signature MUST requirements. | ✅ | 2026-04-22 |
| TASK-006 | Review TLS enforcement logic in packages/cactus-plugin-satp-hermes/src/main/typescript/plugin-satp-hermes-gateway.ts and packages/cactus-plugin-satp-hermes/src/main/typescript/services/gateway/gateway-orchestrator.ts; record default behavior and production behavior deltas. | ✅ | 2026-04-22 |

### Implementation Phase 3

- GOAL-003: Execute QA gates and capture reproducible evidence.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-007 | Run environment bootstrap at repository root: nvm use 20.20.0 && yarn install; store command output summary in packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/qa-runlog-2026-04-22.md. | ✅ | 2026-04-22 |
| TASK-008 | Run package type and lint checks: yarn workspace @hyperledger/cactus-plugin-satp-hermes run tsc --noEmit and yarn workspace @hyperledger/cactus-plugin-satp-hermes run lint; capture pass/fail and error snippets in qa-runlog-2026-04-22.md. | ✅ | 2026-04-22 |
| TASK-009 | Run unit tests: yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:unit; record suite counts, failures, and flaky behavior indicators in qa-runlog-2026-04-22.md. | ✅ | 2026-04-22 |

### Implementation Phase 4

- GOAL-004: Validate Temporal crash recovery and protocol-stage integration behavior.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-010 | Run crash recovery integration tests: yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:integration:crash-recovery; collect failure triage by test file and workflow signal name. | ✅ | 2026-04-22 |
| TASK-011 | Validate temporal worker configuration paths in packages/cactus-plugin-satp-hermes/src/main/typescript/temporal/worker.ts and activities under packages/cactus-plugin-satp-hermes/src/main/typescript/temporal/activities/ for secure and insecure mode behavior. | ✅ | 2026-04-22 |
| TASK-012 | Verify abort point-of-no-return behavior with tests in packages/cactus-plugin-satp-hermes/src/test/typescript/integration/crash-recovery/rollback-workflow-ponr.test.ts and related stage-3 tests; document conformance verdict. | ✅ | 2026-04-22 |

### Implementation Phase 5

- GOAL-005: Produce closure artifacts and release-readiness recommendation.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-013 | Create review report at packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/review-report-2026-04-22.md with severity-ranked findings and exact file references. | ✅ | 2026-04-22 |
| TASK-014 | Create remediation backlog at packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/review-remediation-backlog-2026-04-22.md with item ID, owner, risk, and verification test mapping. | ✅ | 2026-04-22 |
| TASK-015 | Gate decision: mark release as Ready, Conditionally Ready, or Not Ready based on unresolved High severity findings and failed QA gates; store decision in review-report-2026-04-22.md. | ✅ | 2026-04-22 |
| TASK-016 | Run gateway integration tests: yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:integration:gateway; collect failure triage and confirm same export-blocking errors as unit tests. | ✅ | 2026-04-22 |

### Implementation Phase 6 — Remediation Execution

- GOAL-006: Apply all High remediation items and re-run gates to upgrade release verdict.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| TASK-017 | Restore `public-api.ts` to export all generated client symbols via `export *` plus explicit named exports for proto types, bridge types, constants, and config DTOs (RB-001). | ✅ | 2026-04-22 |
| TASK-018 | Fix `plugin-satp-hermes-gateway-cli.ts` TS2322 error by casting `config.temporalAddress` as `string | undefined` (remaining 1/185 error after RB-001). | ✅ | 2026-04-22 |
| TASK-019 | Add `export { crashRecoveryChildWorkflow }` and `export { rollbackWorkflow }` to `satp-transfer-workflow.ts` so Temporal bundle exposes child workflow names (RB-003). | ✅ | 2026-04-22 |
| TASK-020 | Add `export { rollbackWorkflow }` to `crash-recovery-workflow.ts` so bundles rooted at that module also expose `rollbackWorkflow` by name (RB-003). | ✅ | 2026-04-22 |
| TASK-021 | Re-run `tsc --noEmit`, `lint`, `test:unit`; confirm all gates pass (RB-004). | ✅ | 2026-04-22 |
| TASK-022 | Re-run crash-recovery integration suite per file; record 4/6 pass, 2/6 pre-existing hang (RB-005). | ✅ | 2026-04-22 |
| TASK-023 | Re-run gateway integration suite; record 3/7 pass, 4/7 infra-blocked (Docker API v1.52 > v1.43). | ✅ | 2026-04-22 |
| TASK-024 | Update `review-remediation-backlog-2026-04-22.md` — close RB-001/002/003/004, partial-close RB-005, open RB-007/008 for remaining items. | ✅ | 2026-04-22 |
| TASK-025 | Update `qa-runlog-2026-04-22.md` — add CMD-009 through CMD-013 with post-fix evidence and updated gate status table. | ✅ | 2026-04-22 |

## 3. Alternatives

- **ALT-001**: Perform only unit-test-based validation without integration runs. Not chosen because protocol and crash recovery behavior depends on end-to-end interactions and signal timing.
- **ALT-002**: Validate only proto schema and skip runtime handlers. Not chosen because conformance risk is concentrated in runtime verification and dispatch logic.
- **ALT-003**: Treat optional security flags as full compliance evidence. Not chosen because draft-13 normative language requires validated enforceability, not passive availability.

## 4. Dependencies

- **DEP-001**: Node.js 20.20.0 via nvm.
- **DEP-002**: Yarn 4 workspace installation completed with lockfile-consistent dependency map.
- **DEP-003**: Temporal testing libraries in package devDependencies.
- **DEP-004**: Docker runtime for gateway integration test suites that require containerized services.
- **DEP-005**: Access to draft reference files at workspace root: ietf-satp-2.txt.tmp and ietf-satp-13.txt.tmp.

## 5. Files

- **FILE-001**: packages/cactus-plugin-satp-hermes/src/main/proto/cacti/satp/v13/common/message.proto
- **FILE-002**: packages/cactus-plugin-satp-hermes/src/main/proto/cacti/satp/v13/service/stage_1.proto
- **FILE-003**: packages/cactus-plugin-satp-hermes/src/main/proto/cacti/satp/v13/service/stage_2.proto
- **FILE-004**: packages/cactus-plugin-satp-hermes/src/main/proto/cacti/satp/v13/service/stage_3.proto
- **FILE-005**: packages/cactus-plugin-satp-hermes/src/main/proto/cacti/satp/v13/service/protocol_messages.proto
- **FILE-006**: packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-services/data-verifier.ts
- **FILE-007**: packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-services/protocol-message-service.ts
- **FILE-008**: packages/cactus-plugin-satp-hermes/src/main/typescript/core/stage-handlers/protocol-message-handler.ts
- **FILE-009**: packages/cactus-plugin-satp-hermes/src/main/typescript/plugin-satp-hermes-gateway.ts
- **FILE-010**: packages/cactus-plugin-satp-hermes/src/main/typescript/services/gateway/gateway-orchestrator.ts
- **FILE-011**: packages/cactus-plugin-satp-hermes/src/main/typescript/temporal/worker.ts
- **FILE-012**: packages/cactus-plugin-satp-hermes/src/test/typescript/integration/crash-recovery/temporal-crash-recovery-workflow.test.ts
- **FILE-013**: packages/cactus-plugin-satp-hermes/src/test/typescript/integration/crash-recovery/rollback-workflow-ponr.test.ts
- **FILE-014**: packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/review-traceability-2026-04-22.md
- **FILE-015**: packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/qa-runlog-2026-04-22.md
- **FILE-016**: packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/conformance-code-review-2026-04-22.md
- **FILE-017**: packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/review-report-2026-04-22.md
- **FILE-018**: packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/review-remediation-backlog-2026-04-22.md
- **FILE-019**: packages/cactus-plugin-satp-hermes/src/main/typescript/public-api.ts (modified)
- **FILE-020**: packages/cactus-plugin-satp-hermes/src/main/typescript/plugin-satp-hermes-gateway-cli.ts (modified)
- **FILE-021**: packages/cactus-plugin-satp-hermes/src/main/typescript/temporal/workflows/satp-transfer-workflow.ts (modified)
- **FILE-022**: packages/cactus-plugin-satp-hermes/src/main/typescript/temporal/workflows/crash-recovery-workflow.ts (modified)

## 6. Testing

- **TEST-001**: Type safety gate: yarn workspace @hyperledger/cactus-plugin-satp-hermes run tsc --noEmit returns exit code 0.
- **TEST-002**: Lint gate: yarn workspace @hyperledger/cactus-plugin-satp-hermes run lint returns exit code 0.
- **TEST-003**: Unit gate: yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:unit returns exit code 0.
- **TEST-004**: Crash recovery integration gate: yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:integration:crash-recovery returns exit code 0.
- **TEST-005**: Gateway integration gate: yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:integration:gateway returns exit code 0.
- **TEST-006**: Security-mode gate: run one suite with security.requireTLS true and one with false; verify expected startup pass/fail conditions.
- **TEST-007**: Signature enforcement gate: inject unsigned or invalidly signed protocol message and assert reject/error handling path is triggered.

## 7. Risks & Assumptions

- **RISK-001**: Security feature toggles may allow non-compliant default runtime posture if production configuration is incomplete.
- **RISK-002**: Signature utilities may exist without full runtime wiring, creating false confidence in protocol security compliance.
- **RISK-003**: Temporal integration may pass in test harness while failing in containerized runtime due configuration drift.
- **RISK-004**: Partial draft excerpts may hide edge-case normative requirements not covered in current test matrix.
- **ASSUMPTION-001**: Workspace can install dependencies and execute Yarn workspace scripts.
- **ASSUMPTION-002**: Docker is available for gateway integration suites when required.
- **ASSUMPTION-003**: Draft files at workspace root are accepted as the review source of truth for this QA cycle.

## 8. Related Specifications / Further Reading

- ietf-satp-2.txt.tmp
- ietf-satp-13.txt.tmp
- packages/cactus-plugin-satp-hermes/docs/plans/update-v2-to-v13/upgrade-satp-core-v02-to-v13.md
- packages/cactus-plugin-satp-hermes/ARCHITECTURE.md
