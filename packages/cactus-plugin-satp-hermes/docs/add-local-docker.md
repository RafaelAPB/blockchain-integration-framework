# Add Local Docker Integration Tests

Plan for introducing a `docker-local` test suite that validates the locally
built Docker image, while simplifying the existing upstream-image tests to a
minimal acceptance check.

## Motivation

The existing `integration/docker/` suite runs four files against a pre-published
upstream image. This makes it impossible to catch regressions in the current
codebase before publishing. The goal is to:

- Add a comprehensive test suite that runs against an image built from current
  main (`docker-local`).
- Reduce the upstream suite to a fast acceptance smoke-test (`docker-upstream`).
- Add a CI job that builds the image from source and runs the local tests.

---

## Final Directory Structure

```
src/test/typescript/integration/
  docker-local/
    oracle-execute-docker-local.test.ts      # All active oracle scenarios
    satp-e2e-transfer-docker-local.test.ts   # All active transfer scenarios
  docker-upstream/
    docker-acceptance.test.ts                # Smoke: 1 oracle task + 1 transfer
```

The old `integration/docker/` directory and all four of its files are deleted.

---

## Decision Log

| # | Decision | Choice |
|---|----------|--------|
| 1 | docker-local file structure | Two files split by concern: oracle + transfer |
| 2 | Upstream test structure | Single file `docker-acceptance.test.ts` |
| 3 | Jest config / CI job naming | Rename to `docker-upstream`; new `docker-local` |
| 4 | Fabric test files | Not copied — all tests were skipped, dead code |
| 5 | `docker:build:local` script | Chains `build:bundle` (consistent with other scripts) |
| 6 | `docker-upstream` CI image pulls | Remove Fabric pull; keep Besu, Geth, SATP image, Postgres |
| 7 | `docker-local` CI `continue-on-error` | `true` for now, with TODO to gate on build job |
| 8 | `docker-local` CI `needs:` | Self-contained (no `needs:`); TODO to reuse build artifact |
| 9 | `docker-local` CI job placement | Immediately after `docker-upstream` job |
| 10 | `omitPull` in docker-local tests | Hardcoded `start(true)` — explicit, no env var indirection |

---

## Files to Create

### `jest.config-integration-docker-local.ts`

New jest config for `docker-local/`:

```typescript
const path = require("path");
module.exports = {
  preset: "ts-jest",
  logHeapUsage: true,
  testEnvironment: "node",
  maxWorkers: 1,
  maxConcurrency: 3,
  testTimeout: 60 * 60 * 1000,
  setupFilesAfterEnv: [
    "jest-extended/all",
    path.resolve(__dirname, "../../jest.setup.console.logs.js"),
  ],
  moduleNameMapper: {
    "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
    "^(.+)/(.+)_pb\\.js$": "$1/$2_pb",
  },
  testMatch: ["**/src/test/typescript/integration/docker-local/*.test.ts"],
  reporters: [
    "default",
    ["jest-junit", {
      outputDirectory: "reports/junit",
      outputName: "satp-hermes-tests-integration-docker-local.xml",
    }],
  ],
};
```

### `src/test/typescript/integration/docker-local/oracle-execute-docker-local.test.ts`

Copy of `oracle-execute-dockerization-fast.test.ts` with:

- Import `SATP_LOCAL_DOCKER_IMAGE_NAME` / `SATP_LOCAL_DOCKER_IMAGE_VERSION`
  from `../../constants` instead of upstream constants.
- All `gatewayRunner.start()` calls changed to `gatewayRunner.start(true)`
  (omitPull — image is already present locally).
- No Fabric imports or setup.
- All three active oracle describes preserved (UPDATE, READ_AND_UPDATE, event listener).

### `src/test/typescript/integration/docker-local/satp-e2e-transfer-docker-local.test.ts`

Copy of `satp-e2e-transfer-dev-dockerization-fast.test.ts` with:

- Import `SATP_LOCAL_DOCKER_IMAGE_NAME` / `SATP_LOCAL_DOCKER_IMAGE_VERSION`.
- All `gatewayRunner.start()` calls changed to `gatewayRunner.start(true)`.
- No Fabric imports or setup.
- All three active transfer describes preserved (1-gateway Besu→Eth,
  2-gateway Besu→Eth, 2-gateway Eth→Besu).

### `src/test/typescript/integration/docker-upstream/docker-acceptance.test.ts`

New single-file smoke test containing:

- One oracle describe: `"Oracle executing UPDATE tasks successfully"` (simplest case).
- One transfer describe: `"1 SATPGateway sending a token from Besu to Ethereum"`.
- Uses `SATP_DOCKER_IMAGE_NAME` / `SATP_DOCKER_IMAGE_VERSION` (upstream image).
- `gatewayRunner.start()` with default `omitPull = false` (pulls upstream image).

---

## Files to Modify

### `src/test/typescript/constants.ts`

Add local image constants:

```typescript
export const SATP_LOCAL_DOCKER_IMAGE_NAME = "cacti-satp-hermes-gateway";
export const SATP_LOCAL_DOCKER_IMAGE_VERSION = "latest";
```

### `package.json` — new scripts

```json
"docker:build:local": "yarn build:bundle && cd ../.. && docker build --file ./packages/cactus-plugin-satp-hermes/satp-hermes-gateway.Dockerfile -t cacti-satp-hermes-gateway:latest ./packages/cactus-plugin-satp-hermes",
"test:integration:docker-local": "NODE_OPTIONS=--max-old-space-size=4096 npx jest ./src/test/typescript/integration/docker-local --runInBand --forceExit --config=jest.config-integration-docker-local.ts",
"test:integration:docker-upstream": "NODE_OPTIONS=--max-old-space-size=4096 npx jest ./src/test/typescript/integration/docker-upstream --runInBand --forceExit --config=jest.config-integration-docker-upstream.ts"
```

### `jest.config-integration-docker.ts` → renamed to `jest.config-integration-docker-upstream.ts`

Update `testMatch` to `**/integration/docker-upstream/*.test.ts` and JUnit
output name to `satp-hermes-tests-integration-docker-upstream.xml`.

---

## Files to Delete

```
src/test/typescript/integration/docker/oracle-execute-dockerization-fast.test.ts
src/test/typescript/integration/docker/satp-e2e-transfer-dev-dockerization-fast.test.ts
src/test/typescript/integration/docker/satp-e2e-transfer-1-gateway-dockerization.test.ts
src/test/typescript/integration/docker/satp-e2e-transfer-2-gateways-dockerization.test.ts
jest.config-integration-docker.ts
```

---

## CI Changes — `.github/workflows/satp-hermes-workflow.yaml`

### Rename existing job

`run-satp-tests-integration-docker` → `run-satp-tests-integration-docker-upstream`

Update:

- `JEST_TEST_PATTERN` → `integration/docker-upstream/.*/*.test.ts`
- Remove `docker-pull` for `cactus-fabric2-all-in-one` (not used by upstream test).
- Update `report_name` → `"satp-gateway-docker-upstream-tests-report"`.
- Update artifact name → `coverage-reports-satp-hermes-gateway-docker-upstream`.

### Add new job (immediately after upstream job)

```yaml
run-satp-tests-integration-docker-local:
  runs-on: ubuntu-22.04
  # TODO: gate on build-satp job and reuse satp-hermes-build-output artifact
  continue-on-error: true
  timeout-minutes: 60
  permissions:
    actions: read
    checks: write
    contents: read
  env:
    JEST_TEST_PATTERN: packages/cactus-plugin-satp-hermes/src/test/typescript/integration/docker-local/.*/*.test.ts
    JEST_TEST_COVERAGE_PATH: ./code-coverage-ts/cactus-plugin-satp-hermes
  steps:
    - uses: actions/checkout@<sha> #v6.0.3

    - name: CI environment clean-up
      run: ./tools/ci-env-clean-up.sh

    - uses: ./.github/actions/docker-pull/
      with:
        image: ghcr.io/hyperledger/cactus-besu-all-in-one:2024-06-09-cc2f9c5

    - uses: ./.github/actions/docker-pull/
      with:
        image: ghcr.io/hyperledger/cacti-geth-all-in-one:2023-07-27-2a8c48ed6

    - uses: ./.github/actions/docker-pull/
      with:
        image: postgres:17.2

    - name: build
      uses: ./.github/actions/configure-repo/
      with:
        node_version: ${{ inputs.node_version }}
        yarn_hardened_mode: '0'

    - name: Build local Docker image
      run: |
        set -euo pipefail
        cd packages/cactus-plugin-satp-hermes
        yarn docker:build:local

    - name: Run Jest Tests
      uses: ./.github/actions/jest-runner/
      with:
        run_code_coverage: ${{ inputs.run_code_coverage }}
        jest_test_pattern: ${{ env.JEST_TEST_PATTERN }}
        jest_test_coverage_path: ${{ env.JEST_TEST_COVERAGE_PATH }}
        github_secret: ${{ secrets.GITHUB_TOKEN }}
        report_name: "satp-gateway-docker-local-tests-report"

    - name: Upload coverage reports as artifacts
      if: ${{inputs.run_code_coverage == 'true' }}
      uses: actions/upload-artifact@<sha> #v7.0.1
      with:
        name: coverage-reports-satp-hermes-gateway-docker-local
        path: ./code-coverage-ts/**/
```

Note: replace `<sha>` placeholders with the same pinned SHAs used by adjacent
jobs in the workflow file.

---

## Known Pre-Existing Issues That Will Surface in `docker-local`

These issues already surface against the upstream-pinned image and will surface
identically against a freshly built local image, since they are bugs in the
gateway codebase itself, not in the published image. Document here so that
`docker-local` CI failures are not misread as new regressions.

### 1. `auditRepository` initialization (FIXED on this branch)

The default audit repository was initialized with `knexLocalInstance.default`,
pointing the audit DB at the local-logs SQLite file. Migrations registered for
the audit schema (`audit_entries`) were then applied to a different connection
than the one used for inserts, producing
`SQLITE_ERROR: no such table: audit_entries`.

Fix: pass `knexAuditInstance.default` when the user-supplied
`config.auditRepository` is absent, so the migration runner and the insert
queries share the same connection.

See [plugin-satp-hermes-gateway.ts](../src/main/typescript/plugin-satp-hermes-gateway.ts).

### 2. `express-openapi-validator` `hasOwnProperty` crash (UPSTREAM)

The `5.2.0` validator pinned across `cactus-core`, `cactus-cmd-api-server`,
`cactus-plugin-ledger-connector-polkadot`, and
`cactus-plugin-ledger-connector-corda` calls `req[field].hasOwnProperty(p)`
directly on the parsed query object. When `req.query` is created with a `null`
prototype (newer parsers, Express 5 defaults, or upstream `qs` changes), the
call throws `TypeError: req[field].hasOwnProperty is not a function`.

The `installOpenapiValidationMiddleware` error handler recovers the request by
calling `next()`, so the crash is logged at DEBUG only and does not fail the
request. It is, however, visible in CI logs and inflates noise.

Upstream fix (already present on `master`, released in
`express-openapi-validator >= 5.2.x`): swap the direct call for
`Object.prototype.hasOwnProperty.call(req[field], p)`.

Local fix: bump the four `package.json` pins from `5.2.0` to `5.6.2` (current
latest). Out of scope for the docker-local feature, tracked separately.

### 3. Hardcoded port `3010` cascade in gateway integration tests

When a test in `integration/gateway/` fails before its trailing
`await shutdownGateways()` line (for example on an EVM revert mid-transfer),
the connect server stays bound to port `3010`, and every subsequent test suite
that hardcodes `gatewayServerPort: 3010` fails with
`listen EADDRINUSE: address already in use ::1:3010`.

Partial fix on this branch: `satp-e2e-transfer-2-gateways.test.ts` now
defines an `afterEach` that always tears the gateways down, even on test
failure, and `shutdownGateways()` is hardened to release both gateways
independently.

Recommended long-term fix per
[`testing.instructions.md`](../../../.github/instructions/testing.instructions.md):
use port `0` everywhere so the OS picks a free port and tests are parallel-safe.

---

## CI Posture for `docker-local`

Until issues 1–3 above are fully resolved across all affected packages, the
new `docker-local` CI job MUST stay at `continue-on-error: true` (same as the
existing upstream docker and gateway integration jobs). This mirrors the
posture of [`satp-hermes-workflow.yaml`](../../../.github/workflows/satp-hermes-workflow.yaml)
for `run-satp-tests-integration-docker` and
`run-satp-tests-integration-gateway`, and prevents pre-existing bugs from
blocking unrelated PRs while the underlying problems are tracked and fixed.

Once issues 1–3 are closed, flip `continue-on-error` to `false` (or remove
the line) to gate merges on the docker-local suite.

