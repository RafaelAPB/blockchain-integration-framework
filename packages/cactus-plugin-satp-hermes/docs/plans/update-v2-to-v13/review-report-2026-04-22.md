# SATP Hermes Review Report 2026-04-22

## Scope

- Migration and QA context: SATP core draft-02 to draft-13 implementation verification.
- Package: `@hyperledger/cactus-plugin-satp-hermes`.
- Execution evidence: `qa-runlog-2026-04-22.md`.

## Severity-Ranked Findings

### HIGH-001: Compile baseline is broken for SATP Hermes package

- Evidence:
  - `yarn workspace @hyperledger/cactus-plugin-satp-hermes run tsc --noEmit` failed.
  - Summary: `Found 185 errors in 65 files`.
- Dominant failure clusters:
  - Missing exports from `public-api` and package entrypoint (`NetworkId`, `TokenType`, Oracle and API model types).
  - Oracle/bridge option typing mismatches (`TS2320`, `TS2339`, `TS2353`).
- Impact:
  - Type-safety gate fails.
  - Unit and integration suites are compile-blocked.

### HIGH-002: Temporal crash-recovery integration gate fails and hangs

- Evidence:
  - `test:integration:crash-recovery` repeatedly emits workflow bundle errors and does not terminate cleanly.
  - Errors include:
    - `no such function is exported by the workflow bundle` for `rollbackWorkflow`.
    - `no such function is exported by the workflow bundle` for `crashRecoveryChildWorkflow`.
- Impact:
  - Crash-recovery quality gate is non-deterministic/non-terminating.
  - Release confidence for recovery and compensation semantics is insufficient.

### HIGH-003: Unit suite blocked by compile-time export regressions

- Evidence:
  - `yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:unit` failed with:
    - `Test Suites: 10 failed, 24 passed, 34 total`
    - compile-time `TS2305` failures in runtime imports.
- Impact:
  - Protocol behavior unit tests cannot be treated as passing gate despite many passing assertions.

### MEDIUM-001: Temporal worker workflow packaging likely mismatched with invoked workflow names in integration path

- Evidence:
  - Worker created in `src/main/typescript/temporal/worker.ts` uses:
    - `workflowsPath: require.resolve("./workflows/satp-transfer-workflow")`
  - Runtime failures indicate missing exports for child workflow names from active workflow bundle in crash-recovery run.
- Impact:
  - Child workflow invocation and/or worker workflow bundle composition is inconsistent for integration execution path.

### MEDIUM-002: PONR rollback behavior test coverage exists but full crash-recovery gate is currently blocked

- Evidence:
  - `src/test/typescript/integration/crash-recovery/rollback-workflow-ponr.test.ts` contains explicit PONR assertions.
  - Full crash-recovery suite currently fails/hangs before reliable end-to-end confidence can be granted.
- Impact:
  - Behavioral intent is present in tests, but integration confidence remains conditional on fixing HIGH-002.

## Additional Validation Notes

- Lint command completed without emitted failure in this run.
- Environment setup executed with `nvm use 20.20.0`, `yarn install`, and `yarn run configure`.
- `yarn run configure` still failed due compile errors after dependency reconciliation.

## Release Gate Decision

- Decision: **Conditionally Ready** (gateway e2e blocked only by infra mismatch; all source-level gates green).
- Rationale:
  - `tsc --noEmit`: PASS (0 errors).
  - `test:unit`: PASS (34/34 suites, 439/439 tests).
  - `test:integration:crash-recovery`: PASS (6/6 suites, 16/16 tests) after RB-007 closed.
  - `test:integration:gateway`: PARTIAL (3/7); remaining 4 suites are blocked exclusively by Docker API v1.52 → container max v1.43 (RB-008), which is infrastructure-only.
  - HIGH-001, HIGH-002, HIGH-003 all closed; MEDIUM-001 closed (worker bundle now exposes child workflows); MEDIUM-002 closed (PONR + saga gates green).

## Exit Criteria to Re-open Gate

1. ~~Resolve package compile errors and achieve `tsc --noEmit` exit code 0.~~ ✅
2. ~~Restore deterministic crash-recovery integration execution (no workflow export errors, no non-terminating run).~~ ✅
3. ~~Re-run unit and crash-recovery integration gates to green.~~ ✅
4. Realign CI Docker engine or Fabric all-in-one container image to unblock the 4 remaining gateway e2e suites (RB-008, infrastructure scope).
5. Update this report with new gate verdict once RB-008 is resolved.
