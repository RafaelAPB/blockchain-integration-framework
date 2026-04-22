# SATP Hermes Review Remediation Backlog 2026-04-22

## Backlog Items

| Item ID | Severity | Owner | Risk if Unresolved | Description | Verification Mapping | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RB-001 | High | SATP Hermes Maintainers | Package remains non-buildable and blocks all downstream validation | Restore missing exports in `src/main/typescript/public-api.ts` and package entrypoint exports consumed by runtime/tests (`NetworkId`, `TokenType`, Oracle/API models). | Re-run `yarn workspace @hyperledger/cactus-plugin-satp-hermes run tsc --noEmit` expecting exit 0. | ✅ **CLOSED 2026-04-22** — 185 errors → 0 via `export * from "./generated/gateway-client/typescript-axios"` + selected named re-exports. CLI TS2322 also fixed. |
| RB-002 | High | Cross-chain/Oracle Maintainers | Runtime type drift and potential behavior regressions in bridge/oracle flows | Fix oracle and bridge type incompatibilities (`IOracleBesuOptions`, `OracleAbstractOptions`, leaf interface extension conflicts). | Re-run `tsc --noEmit` and targeted unit suites for oracle/bridge modules. | ✅ **CLOSED 2026-04-22** — Root cause was RB-001 (missing `export *` from generated client); all TS2339/TS2320/TS2353 type-incompatibility errors resolved together. |
| RB-003 | High | Temporal/Crash-Recovery Maintainers | Crash recovery path remains unreliable and can deadlock CI/QA | Align Temporal workflow bundle exports and invocation names so `rollbackWorkflow` and `crashRecoveryChildWorkflow` are resolvable in integration run path. | Re-run `yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:integration:crash-recovery` expecting completion and exit 0. | ✅ **CLOSED 2026-04-22** — Added `export { rollbackWorkflow } from "./rollback-workflow"` to both `satp-transfer-workflow.ts` and `crash-recovery-workflow.ts`. `temporal-crash-recovery-workflow.test.ts` upgraded from FAIL to PASS. |
| RB-004 | High | SATP Hermes Maintainers | Unit gate stays red, masking protocol regressions | After RB-001 and RB-002, rerun unit suite and fix remaining compile-gated test failures. | Re-run `yarn workspace @hyperledger/cactus-plugin-satp-hermes run test:unit` expecting exit 0. | ✅ **CLOSED 2026-04-22** — Unit suite: 34 suites / 439 tests, all PASS (exit 0). |
| RB-005 | Medium | Temporal/Crash-Recovery Maintainers | PONR correctness remains partially inferred and not fully integrated | Re-execute PONR and saga compensation suites after Temporal export fix to confirm rollback boundary semantics under integration conditions. | Re-run `rollback-workflow-ponr.test.ts` and `saga-compensation.test.ts` in integration command set. | ⚠️ **PARTIALLY CLOSED 2026-04-22** — `rollback-workflow-ponr.test.ts` 3/3 PASS, `rollback-workflow.test.ts` 2/2 PASS. `saga-compensation.test.ts` hangs (pre-existing: test queries workflow state before `worker.runUntil()` in time-skipping env). See RB-007. |
| RB-006 | Medium | Release/QA | Risk of releasing with stale gate assumptions | Update QA runlog and review report with post-fix rerun evidence and final gate decision. | Update `qa-runlog-2026-04-22.md` and `review-report-2026-04-22.md` with passing outputs. | 🔄 **IN PROGRESS 2026-04-22** — Being updated with current evidence. |
| RB-007 | Medium | Temporal/Crash-Recovery Maintainers | saga-compensation and backup-gateway-promotion tests hang indefinitely | `saga-compensation.test.ts` and `backup-gateway-promotion.test.ts` deadlock: both query workflow state before `worker.runUntil()` in `createTimeSkipping()` env. Worker hasn't started polling yet when query is issued. | Fix test to issue query inside a deferred callback or after `worker.runUntil()` has started, or use `TestWorkflowEnvironment.createLocal()` instead. | ✅ **CLOSED 2026-04-22** — Wrapped query+result calls inside `worker.runUntil(async () => { ... })` so the worker is still polling when queries are dispatched. Also removed an incorrect guard in `satp-transfer-workflow.ts` that suppressed the `ABORTED` checkpoint when state was `ROLLBACK_STARTED`, which contradicted the documented saga-compensation log contract. Full crash-recovery integration suite now: **6/6 suites, 16/16 tests PASS**. |
| RB-008 | Low | Infrastructure / Test Tooling | Gateway e2e suite blocked by Docker API mismatch between fabric-peer client (req v1.52) and DinD daemon (max v1.43) inside `cactus-fabric2-all-in-one:v2.1.0` | `satp-e2e-transfer-*` tests fail with: `client version 1.52 is too new. Maximum supported API version is 1.43`. Root cause is the bundled DinD engine in the AIO image being older than the fabric-peer's Go docker SDK request version. | Either pin the peer client (`DOCKER_API_VERSION=1.43`) or bump the DinD base in `tools/docker/fabric-all-in-one/Dockerfile_v2.x`. Then rebuild + republish AIO image (or override `imageName`/`imageVersion` in `FabricTestLedgerV1` for local runs). Gateway e2e suite expected exit 0 after image refresh. | 🟡 **PARTIALLY ADDRESSED 2026-04-22** — Source fix landed: `Dockerfile_v2.x` now injects `DOCKER_API_VERSION=1.43` into both `peer0.org1` and `peer0.org2` services via `yq`. Pending: rebuild AIO image (`DOCKER_BUILDKIT=1 docker build ./tools/docker/fabric-all-in-one/ -f ./tools/docker/fabric-all-in-one/Dockerfile_v2.x -t faio2x`), republish to `ghcr.io/hyperledger-cacti/cactus-fabric2-all-in-one:vX.Y.Z`, bump `FABRIC_25_LTS_AIO_IMAGE_VERSION` in `cactus-test-tooling`, then re-run `test:integration:gateway`. |

## Execution Order

1. ~~RB-001~~ ✅
2. ~~RB-002~~ ✅
3. ~~RB-003~~ ✅
4. ~~RB-004~~ ✅
5. ~~RB-005~~ ✅ (full closure via RB-007)
6. ~~RB-007~~ ✅
7. RB-006 (in progress)
8. RB-008 (infra, deferred)

## Completion Criteria

- ~~All High items (`RB-001` to `RB-004`) closed with attached command evidence.~~ ✅ All High items closed 2026-04-22.
- ~~Crash-recovery integration no longer hangs and returns deterministic exit code.~~ ✅ Full crash-recovery suite green (6/6, 16/16).
- ~~RB-007: saga-compensation + backup-gateway-promotion test architecture fix.~~ ✅ Closed via async-callback wrapping + `ABORTED` checkpoint correction.
- RB-008: host Docker API version realignment for full gateway e2e coverage. Deferred (infrastructure scope).
- Review report gate decision upgraded from `Not Ready` after all required gates pass.

## Evidence Summary (2026-04-22)

| Gate | Before | After | Method |
| --- | --- | --- | --- |
| `tsc --noEmit` | FAIL (185 errors) | **PASS (0 errors)** | public-api.ts + CLI cast fix |
| `lint` | PASS | **PASS** | No regressions |
| `test:unit` | FAIL (compile-blocked) | **PASS (34/34 suites, 439 tests)** | Unblocked by RB-001 |
| `test:integration:crash-recovery` | FAIL/HANG | **PASS (6/6 suites, 16/16 tests)** | RB-003 + RB-007 (async-callback wrapping + `ABORTED` checkpoint fix) |
| `test:integration:gateway` | FAIL (exit 1) | **PARTIAL: 3/7 suites PASS** | Non-Docker tests pass; e2e blocked by Docker API v1.52 vs v1.43 (RB-008, infra) |
