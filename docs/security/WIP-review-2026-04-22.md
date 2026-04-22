# Security WIP — Plan for Remaining Vulnerabilities (2026-04-22)

**Branch**: `bif-sec-vulnerability-fix`
**Companion to**: [`security-review-2026-04-22.md`](./security-review-2026-04-22.md)
**Status**: Plan only — work not started in this PR

This document tracks the security advisories that remain after the
fixes landed in `bif-sec-vulnerability-fix`. Each item is **dev-only**
and either has **no upstream fix released** or requires a **major
version bump** that is out of scope for a security-focused PR.

## Current state

`yarn npm audit --severity high --recursive`: **1 critical, 12 high**.

| Package | Sev × n | Installed | Source dependents | Fix availability |
|---|---|---|---|---|
| `handlebars` | 1c × 1, h × 4 | 4.7.7, 4.7.8 | `conventional-changelog-writer@7.0.1`, `grpc_tools_node_protoc_ts@5.3.3` | **No fix released** in 4.7.x line; advisories specify `<=4.7.8` |
| `lodash-es` | h × 1 | 4.17.21, 4.17.23 | `chevrotain@11.0.3`, `mermaid@11.12.2` | **No fix released**; advisory `<=4.17.23` |
| `tar` (v6) | h × 6 | 6.2.1 | `@lerna-lite/publish@3.7.0` | **No fix in v6 line**; v7 fixed but `@lerna-lite/publish` requires v6 |
| `@angular/common` | h × 1 | 17.3.11 | workspace root pin | Fixed in `>=19.2.16`; **major bump 17 → 19** required |

---

## Plan A — `handlebars` (1 critical, 4 high)

### Root causes
Two transitive paths:

1. `@commitlint/cli@17.7.1` → `conventional-changelog-writer@7.0.1` → `handlebars@4.7.8`
2. `grpc_tools_node_protoc_ts@5.3.3` → `handlebars@4.7.7`

### Why this PR can't fix it
- Handlebars 4.7.8 is the latest; advisories cover all of 4.7.x.
- Forcing a non-existent version (e.g. `4.7.9`) would fail to install.
- `grpc_tools_node_protoc_ts` is **unmaintained** (last release 2022)
  and cannot be patched in place.

### Proposed work

#### A.1 — Replace `grpc_tools_node_protoc_ts` (high effort)
Migrate gRPC TypeScript codegen to a maintained generator:
- Preferred: `@bufbuild/protoc-gen-es` (already in monorepo as
  devDependency at version 1.8.0).
- Alternative: `@protobuf-ts/plugin`.

Affected packages (search for `grpc_tools_node_protoc_ts` consumers):
- `cactus-cmd-api-server` (gRPC service definitions)
- `cactus-plugin-ledger-connector-fabric`
- Any package with a `*.proto` file under `src/main/proto/`

Effort: ~1–2 days. Risk: medium — generated code shape differs
between generators; verify all gRPC clients/servers compile and tests
pass.

#### A.2 — Bump commitlint stack to drop `conventional-changelog-writer@7`
- Upgrade `@commitlint/cli` 17 → 19 (or latest).
- `@commitlint/config-conventional` 17 → 19.
- Verify `commitlint.config.js` and `changelog.config.js` still apply.
- Verify `husky` commit-msg hook still works.

Effort: ~2–4 hours. Risk: low — config-file format is largely stable
between commitlint majors.

### Mitigation in the meantime
Both consumers run **only at build / commit / release time on developer
machines and CI runners**. No production code paths execute Handlebars.
Acceptable risk profile, but should be documented in `SECURITY.md`.

---

## Plan B — `lodash-es` (1 high)

### Root causes
- `chevrotain@11.0.3` → `lodash-es@4.17.21` (parser library)
- `mermaid@11.12.2` → `lodash-es@4.17.23` (diagram rendering for docs)

### Why this PR can't fix it
- `lodash-es` 4.17.23 is current latest. Advisory affects all
  `<=4.17.23`. No patched release exists yet upstream.

### Proposed work

#### B.1 — Wait for upstream fix
Track <https://github.com/lodash/lodash/issues> for a 4.17.24+ release
and pin via `"lodash-es": "4.17.24"` resolution when available.

#### B.2 — If upstream fix is delayed > 30 days
- Evaluate replacing `mermaid` with `mermaid-cli` invoked at doc build
  only (no runtime mermaid in shipped packages).
- `chevrotain` is harder — used by some parser-heavy plugins; bump to
  v12 if available, evaluate API breakage.

### Mitigation in the meantime
- `mermaid` runs only at docs build (`yarn docs:diagrams`).
- `chevrotain` is dev-time only.
- Neither ships in production runtime bundles. Acceptable risk.

---

## Plan C — `tar` v6 (6 high)

### Root cause
`@lerna-lite/publish@3.7.0` declares `tar@^6` as a dependency. v6 is
in maintenance mode and the listed advisories have **no v6 fixes**.

### Why this PR can't fix it
- `tar@7.x` exists with fixes, but `@lerna-lite/publish` requires v6
  API; forcing v7 would break `lerna publish`.

### Proposed work

#### C.1 — File issue with `@lerna-lite` upstream
Request that `@lerna-lite/publish` migrates to `tar@7`. Track in
<https://github.com/lerna-lite/lerna-lite/issues>.

#### C.2 — Evaluate alternative publish tooling
If `@lerna-lite` won't move, options:
- `changesets` (`@changesets/cli`) — actively maintained, no `tar`
  dependency.
- Switch to native Lerna v8 if it has migrated to `tar@7`.

Effort: ~1 day to swap publish tooling and update release docs.

### Mitigation in the meantime
`@lerna-lite/publish` runs **only during release** by maintainers on
trusted CI runners over npm-published archives. No untrusted input.
Acceptable risk; document in `SECURITY.md`.

---

## Plan D — `@angular/common` 17.3.11 (1 high)

### Root cause
Angular HTTP client XSRF token leakage via protocol-relative URLs
(GHSA covers `<19.2.16`). Workspace pins Angular at 17.3.11 for
compatibility with `cacti-ledger-browser` and other Angular consumers.

### Why this PR can't fix it
Major-version upgrade (17 → 19) requires:
- Updating `@angular/cli`, all `@angular/*` packages.
- Refactoring any uses of removed/changed APIs (standalone components
  default, control flow syntax, etc.).
- Re-validating `cacti-ledger-browser` UI.

### Proposed work

#### D.1 — Standalone PR: Angular 17 → 19 upgrade
- Use `ng update` workflow.
- Run `cacti-ledger-browser` end-to-end smoke tests.
- Update any other Angular consumer packages.
- Estimated effort: 2–4 days. Risk: medium-high.

### Mitigation in the meantime
- `cacti-ledger-browser` is opt-in tooling, not a core
  interoperability runtime.
- XSRF leakage requires a malicious protocol-relative URL passed to
  Angular HTTP client. Document operational guidance in
  `cacti-ledger-browser` README to avoid such URLs.

---

## Plan E — Operational hardening (cross-cutting)

Independent of specific CVEs, these would reduce future audit noise:

### E.1 — Run `yarn dedupe` in CI
Add a CI step that fails if `yarn dedupe --check` would consolidate
versions. Prevents drift back to duplicated transitive deps.

### E.2 — Renovate / Dependabot grouping
Configure Dependabot/Renovate to group security updates per package
ecosystem to reduce PR noise but ensure no advisory sits unpatched.

### E.3 — `npm audit` gate in CI
Add a `yarn npm audit --severity high --recursive` step that fails the
build if **new** high/critical vulnerabilities appear (compared to a
checked-in baseline). Avoids regressions.

### E.4 — Document accepted risks in `SECURITY.md`
Add a section listing the transitively-vulnerable dev-only packages
above with rationale, pointing to this WIP doc.

---

## Tracking

After this PR merges, file these GitHub issues against `hyperledger-cacti/cacti`:

1. `chore(deps): replace grpc_tools_node_protoc_ts with @bufbuild/protoc-gen-es` — Plan A.1
2. `chore(deps): upgrade commitlint stack from 17 to 19` — Plan A.2
3. `chore(deps): track lodash-es upstream fix for mermaid/chevrotain` — Plan B
4. `chore(deps): migrate from @lerna-lite/publish to changesets (tar v6 CVEs)` — Plan C
5. `chore(deps): upgrade Angular from 17 to 19 (XSRF advisory)` — Plan D
6. `ci(security): add yarn dedupe and npm audit gates` — Plan E.1, E.3
7. `bug(satp): KnexOracleLogRepository missing 'client' config breaks shutdown-state.test.ts` — pre-existing on main, surfaced during this verification

## Definition of done for this WIP cycle

- [ ] All 7 follow-up issues filed.
- [ ] Plan A.2, C, E.1, E.3, E.4 — small enough to land in one or two
  follow-up PRs.
- [ ] Plan A.1, D — separate dedicated PRs (large, risky).
- [ ] Plan B — passive monitoring; pin when upstream fix lands.

When all of A through D are resolved, expected residual: **0 critical /
0 high** for direct + transitive deps, modulo new advisories disclosed
between now and then.
