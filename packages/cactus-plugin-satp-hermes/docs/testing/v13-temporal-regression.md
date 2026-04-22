# v13 + Temporal Regression Sweep

A repeatable verification procedure to run after rebases, dependency bumps,
or codegen changes on the `feat/satpv13andtemporal` branch (or its
descendants). Codifies the Phase A sweep performed during the v13 upgrade.

> Run from the repo root. All commands assume Node `20.20.0` and Yarn 4
> with the workspace's `nodeLinker: pnpm`.

---

## A1 — Sanity

```bash
git status                  # tree must be clean before starting
git grep -nE '<<<<<<<|=======|>>>>>>>' || echo "no conflict markers"
```

Fail-stop: any conflict markers indicate an incomplete rebase.

---

## A2 — Codegen Drift (proto + OpenAPI)

> ⚠️ **Hazard**: `buf.gen.yaml` has `clean: true`. If `protoc-gen-es` is
> missing from `node_modules/.bin/`, buf will delete every file under
> `src/main/typescript/generated/proto/` *before* failing. Always start
> from a committed tree so `git checkout -- src/main/typescript/generated`
> can restore the loss.

### Yarn pnpm-linker workaround

Yarn 4 with `nodeLinker: pnpm` (this repo) does not populate
`node_modules/.bin/` for transitively hoisted binaries. `codegen:proto`
invokes `./node_modules/.bin/protoc-gen-es` directly, which fails. Create
a one-time shim:

```bash
cd packages/cactus-plugin-satp-hermes
mkdir -p node_modules/.bin
ln -sf ../@bufbuild/protoc-gen-es/bin/protoc-gen-es node_modules/.bin/protoc-gen-es
```

This shim is **not** committed; recreate after `yarn install` if removed.

### Run

```bash
yarn workspace @hyperledger/cactus-plugin-satp-hermes run codegen
git diff --stat packages/cactus-plugin-satp-hermes/src/main/typescript/generated
```

Expect: zero diff. Any change indicates source-vs-generated drift that
must be either committed or rolled back.

---

## A3 — Lint

```bash
yarn workspace @hyperledger/cactus-plugin-satp-hermes run lint:protobuf
yarn workspace @hyperledger/cactus-plugin-satp-hermes run lint:code
# yarn workspace @hyperledger/cactus-plugin-satp-hermes run lint:oapi
```

> Known pre-existing quirk: `lint:oapi` (vacuum) silently exits 1 in this
> environment, regardless of input. Not a regression introduced by v13 or
> Temporal work; track separately if it blocks CI.

---

## A4 — Unit Tests

```bash
yarn workspace @hyperledger/cactus-plugin-satp-hermes run jest:unit
```

Baseline: **486/486 pass** on `feat/satpv13andtemporal` (post-fixes).

Targeted v13 constants check:

```bash
yarn workspace @hyperledger/cactus-plugin-satp-hermes \
  jest --testPathPattern='constants-v13'
```

Common regressions caught here:

| Symptom | Likely cause | Fix |
|---|---|---|
| `SATP_CRASH_VERSION` expected `"v13"` | Test author assumed all versions track Core | Restore expected to `"v02"` — crash recovery is independent (see [../v13/migration-guide.md](../v13/migration-guide.md#1-version-matrix)) |
| Unused `ICrashRecoveryManagerOptions` import error | Rebase leftover | Remove the import from `plugin-satp-hermes-gateway.ts` |

---

## A5 — Integration Tests (deferred / on-demand)

Heavy (Docker-based). Run before release or when touching
`temporal/`, `core/`, `cross-chain-mechanisms/`, or any ledger adapter.

```bash
yarn workspace @hyperledger/cactus-plugin-satp-hermes run jest:integration:crash-recovery
yarn workspace @hyperledger/cactus-plugin-satp-hermes run jest:integration:gateway
yarn workspace @hyperledger/cactus-plugin-satp-hermes run jest:integration:bridge
yarn workspace @hyperledger/cactus-plugin-satp-hermes run jest:integration:oracle
yarn workspace @hyperledger/cactus-plugin-satp-hermes run jest:integration:adapter
yarn workspace @hyperledger/cactus-plugin-satp-hermes run jest:integration:docker
```

---

## A6 — Full Workspace TypeScript Build

Always run from the **repo root** so project references build dependencies
in the correct order:

```bash
yarn tsc
echo "EXIT=$?"
```

Workspace-scoped `yarn workspace ... tsc` will surface
"Cannot find module @hyperledger/cactus-*" — this is expected when
dependent workspaces aren't pre-built and is **not** a regression.

---

## Quick Triage Checklist

After a rebase:

1. ☐ A1 sanity
2. ☐ A2 codegen (with shim) — zero diff
3. ☐ A3 lint (skip `lint:oapi` until vacuum quirk resolves)
4. ☐ A4 unit tests — 486/486
5. ☐ A6 root `yarn tsc` — `EXIT=0`
6. ☐ A5 only when touching protocol / ledger / temporal code

If any step fails, do **not** push. Investigate against the listed
"common regressions" table or open a debugger session.
