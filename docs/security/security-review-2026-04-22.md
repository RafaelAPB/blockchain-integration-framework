# Security Review — 2026-04-22

**Branch**: `bif-sec-vulnerability-fix`
**Base**: `upstream/main` (`hyperledger/cacti` main)
**Reviewer**: Hyperledger Cacti security maintenance
**Status**: Completed — fixes merged into branch, ready for PR review

## Scope

This review addresses dependency vulnerabilities surfaced by
`yarn npm audit --severity high --recursive` against the Cacti monorepo
on the `bif-sec-vulnerability-fix` branch. It covers: rebase onto the
latest upstream main, root `package.json` `resolutions` correctness,
targeted transitive package upgrades, and post-fix verification.

## Headline result

| Metric | Before this PR (`upstream/main`) | After this PR | Delta |
|---|---|---|---|
| Critical CVEs | 2 | **1** | −1 |
| High CVEs | 35 | **12** | **−23** |

All remaining issues are **dev-only** and either have **no upstream fix
released yet** or require a **major-version upgrade** that exceeds the
scope of a security PR. They are tracked in
[`WIP-review-2026-04-22.md`](./WIP-review-2026-04-22.md).

## What this PR fixes

### 1. Rebase + axios upgrade reconciliation

Branch was rebased onto `upstream/main` (HEAD at time of review:
`ef5d4d75b`). 42 `package.json` files had `axios` conflicts. Resolution
rule applied: take the higher version. Main's Dependabot bump
(`axios@1.15.0`) supersedes the branch's `1.13.6`, preserving the
security improvement while avoiding regression.

Root `package.json` `resolutions` block additions (`flatted`,
`serialize-javascript`, `sjcl`, `picomatch`, `minimatch`, `rollup`, `tar`,
`immutable`, `svgo`) merged cleanly with main's pre-existing
resolutions.

### 2. Resolution syntax correctness (the big fix)

The previous resolutions used descriptor-range keys like:

```jsonc
"minimatch@<3.1.4": "3.1.4",
"minimatch@>=5.0.0 <5.1.8": "5.1.8",
"picomatch@<2.3.2": "2.3.2",
"tar@>=7.0.0 <=7.5.10": "7.5.11",
"rollup@<2.80.0": "2.80.0"
```

**Yarn 4 silently ignores these keys** because they only match when a
depender's request is *literally* the descriptor `<3.1.4`, etc. Real
dependers request `^3.0.4` or similar, which never matches `<3.1.4`.

The fix replaces them with per-parent narrowed entries that Yarn 4
honors via its `parent/dep` lookup:

```jsonc
"eslint/minimatch": "3.1.5",
"eslint-plugin-import/minimatch": "3.1.5",
"@redocly/openapi-core/minimatch": "5.1.9",
"depcheck/minimatch": "7.4.9",
"@lerna-lite/version/minimatch": "9.0.9",
"@lerna-lite/core/minimatch": "9.0.9",
"@npmcli/arborist/minimatch": "9.0.9",
"glob/minimatch": "10.2.5",
"readdirp/picomatch": "2.3.2",
"tinyglobby/picomatch": "4.0.4",
"micromatch/picomatch": "2.3.2",
"jest-util/picomatch": "2.3.2",
"node-gyp/tar": "7.5.13"
```

A `yarn dedupe` pass then collapsed the remaining duplicates by
preferring the highest installed version for each request range. This
single command eliminated 7 high-severity findings on top of the
narrowed resolutions.

### 3. Targeted transitive upgrades

| Package | Before | After | Reason |
|---|---|---|---|
| `@nestjs/core/path-to-regexp` | 3.2.0 | **3.3.0** | GHSA: backtracking regex (high) |
| `get-uri/basic-ftp` | 5.2.1 | **5.3.0** | GHSA: CRLF injection + DoS (high) |
| `basic-ftp` (root) | `>=5.2.0` (range, ineffective) | **`5.3.0`** | Same advisory chain |
| `node-gyp/tar` | 7.5.7 | **7.5.13** | Multiple high (path traversal, race) |

### 4. CVE delta (per package)

Eliminated:
- **minimatch** — all 15 advisories resolved (versions 3.0.5, 3.1.2,
  5.1.6, 7.4.6, 9.0.3, 9.0.5, 10.1.2 → 3.1.5 / 5.1.9 / 7.4.9 / 9.0.9 / 10.2.5)
- **picomatch** — 2 advisories resolved (2.3.1, 4.0.3 → 2.3.2, 4.0.4)
- **path-to-regexp** — 1 advisory resolved (3.2.0 → 3.3.0)
- **basic-ftp** — 2 advisories resolved (5.2.1 → 5.3.0)
- **tar** (v7.x line) — 6 advisories resolved (7.5.7 → 7.5.13)

Improved per-package security posture:

| Package | Before | After | Notes |
|---|---|---|---|
| `axios` | 1.13.6 | 1.15.0 (from main rebase) | Higher than branch's bump |
| Root `resolutions` overrides | many silent no-ops | actually applied | Verified via `yarn why` |

## Verification matrix

All checks were run against the merged/fixed state on
`bif-sec-vulnerability-fix` after the resolution corrections.

| Check | Command | Result |
|---|---|---|
| Install | `yarn install` | OK — only pre-existing peer-dep warnings |
| Full TS build | `yarn run configure` | Exit 0 |
| Composite build re-run | `yarn tsc` | All projects up to date, no errors |
| Lint + Prettier + CSpell | `yarn lint` | 1386 files, 0 issues |
| Ethereum connector unit | `yarn jest packages/cactus-plugin-ledger-connector-ethereum/src/test/typescript/unit/` | 10/10 pass |
| SATP `test:unit` | `cd packages/cactus-plugin-satp-hermes && yarn test:unit` | 256 pass / 3 fail / 15 skipped — **identical to upstream/main**, failures pre-exist (see Pre-existing issues below) |
| Vulnerability audit | `yarn npm audit --severity high --recursive` | 1 critical / 12 high (see headline result) |

## Branch state

- 8 commits ahead of `upstream/main`.
- Working tree clean.
- Lockfile in sync with `package.json`.
- Safety backup branch: `bif-sec-vulnerability-fix.bak.1776808316`.

## Pre-existing issues (out of scope, not regressions)

### SATP `shutdown-state.test.ts` — 3 failures
File: [packages/cactus-plugin-satp-hermes/src/test/typescript/unit/shutdown-state.test.ts](../../packages/cactus-plugin-satp-hermes/src/test/typescript/unit/shutdown-state.test.ts), lines 114, 166, 233.
Root cause: `KnexOracleLogRepository` constructor at
[packages/cactus-plugin-satp-hermes/src/main/typescript/database/repository/knex-oracle-log-repository.ts:25](../../packages/cactus-plugin-satp-hermes/src/main/typescript/database/repository/knex-oracle-log-repository.ts#L25)
passes a `Knex.Config` missing the required `client` field. Triggered by
`SATPGateway` instantiation at
[packages/cactus-plugin-satp-hermes/src/main/typescript/plugin-satp-hermes-gateway.ts:687](../../packages/cactus-plugin-satp-hermes/src/main/typescript/plugin-satp-hermes-gateway.ts#L687).
Reproduces identically on plain `upstream/main` with no branch changes
applied. Should be filed as a separate bug against main.

## Remaining vulnerabilities (tracked separately)

All remaining issues are documented with proposed fixes and effort
estimates in [WIP-review-2026-04-22.md](./WIP-review-2026-04-22.md).
Summary:

| Package | Sev × n | Why deferred |
|---|---|---|
| `handlebars` 4.7.x | 1c × 1, h × 4 | No upstream fix; requires replacing `grpc_tools_node_protoc_ts` (unmaintained) and bumping commitlint stack |
| `lodash-es` 4.17.x | h × 1 | Used only by `mermaid` and `chevrotain`; no upstream fix yet |
| `tar` 6.2.1 | h × 6 | Pulled by `@lerna-lite/publish`; no fix in v6 line |
| `@angular/common` 17.3.11 | h × 1 | Pinned for compat; needs Angular 17→19 major bump (separate PR) |

## Recommended follow-up

1. Push: `git push --force-with-lease origin bif-sec-vulnerability-fix`
   (not `--force`).
2. Watch CI: <https://github.com/hyperledger-cacti/cacti/actions>.
3. File follow-up issues per [WIP-review-2026-04-22.md](./WIP-review-2026-04-22.md).
4. Consider re-running `yarn dedupe` periodically (or in CI) — it
   meaningfully reduces dependency duplication.

## Repo memory artifacts

- `/memories/repo/bif-sec-vulnerability-fix-report.md` — first-pass
  rebase report.
- `/memories/repo/bif-sec-vulnerability-fix-remaining-plan.md` — original
  plan that informed this fix.
