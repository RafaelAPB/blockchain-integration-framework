# Temporal Deployment Guide

How to deploy the Temporal infrastructure required by SATP Hermes' crash
recovery sub-protocol. Focused on operators wiring the gateway in
development, CI, or production.

> Background reading: [../knowledge/temporal-ts.md](../knowledge/temporal-ts.md)
> Architecture: [../integration-architecture.md](../integration-architecture.md)
> Workflows / activities mapping: [workflows-and-activities.md](./workflows-and-activities.md)

---

## 1. Prerequisites

| Component | Minimum | Notes |
|---|---|---|
| Node.js | 20.20.0 | Matches CI; required by `@temporalio/*` 1.15 native bindings (`glibc ≥ 2.31`) |
| Temporal server | 1.22 | Compatible with TS SDK 1.15. Self-hosted, Temporal Cloud, or `temporal server start-dev` for local |
| `@temporalio/{client,worker,workflow,activity}` | `1.15.0` | Pinned at workspace level |
| SATP Hermes | `feat/satpv13andtemporal` or later | Crash recovery wiring is conditional on `enableCrashRecovery=true` |

Crash recovery is **opt-in**. When `enableCrashRecovery` is `false` (default),
no Temporal connection is established and the env vars below are unused.

---

## 2. Configuration

### 2.1 Gateway-side (creator of the Worker)

Set via the plugin options object (preferred for programmatic use) or env
vars (preferred for CLI / containerized deployments):

| Config field | Env var | Default | Required when |
|---|---|---|---|
| `enableCrashRecovery` | — | `false` | — |
| `temporalAddress` | `TEMPORAL_ADDRESS` | `localhost:7233` | `enableCrashRecovery=true` |
| — | `TEMPORAL_NAMESPACE` | `satp-recovery` | always (worker only) |
| — | `TEMPORAL_TASK_QUEUE` | `satp-crash-recovery` | always (worker only) |

If `enableCrashRecovery=true` but neither `temporalAddress` nor
`TEMPORAL_ADDRESS` is set, the gateway fails fast at startup via
[`validate-satp-enable-crash-recovery.ts`](../../src/main/typescript/services/validation/config-validating-functions/validate-satp-enable-crash-recovery.ts).

### 2.2 TLS (production)

The worker uses mTLS to Temporal when these env vars are set and the
gateway is **not** started with `insecure: true`:

| Env var | Purpose |
|---|---|
| `TEMPORAL_TLS_CERT_PATH` | Client certificate (PEM) |
| `TEMPORAL_TLS_KEY_PATH` | Client private key (PEM) |
| `TEMPORAL_TLS_CA_CERT_PATH` | (Optional) Server root CA |

Behavior matrix:

| `insecure` | TLS env vars set? | Result |
|---|---|---|
| `true` (any) | any | Plain-text gRPC; certificate validation skipped (test only) |
| `false`/unset | both cert+key | mTLS connection |
| `false`/unset | missing | Plain-text gRPC (works for local dev-server) |

Source: [`temporal/worker.ts`](../../src/main/typescript/temporal/worker.ts).

---

## 3. Quickstart (Local Development)

```bash
# 1. Install Temporal CLI: https://docs.temporal.io/cli
temporal server start-dev --namespace satp-recovery

# 2. Set env (or pass via gateway config)
export TEMPORAL_ADDRESS=localhost:7233
export TEMPORAL_NAMESPACE=satp-recovery
export TEMPORAL_TASK_QUEUE=satp-crash-recovery

# 3. Start the gateway with crash recovery enabled
yarn workspace @hyperledger/cactus-plugin-satp-hermes run start
```

The Temporal Web UI runs at <http://localhost:8233> by default.

---

## 4. Production Notes

- **Namespace isolation**: every deployment environment (dev / staging /
  prod) MUST use a distinct `TEMPORAL_NAMESPACE`. Sessions in different
  namespaces are invisible to each other; crash recovery cannot cross them.
- **Task queue per cluster**: if you run multiple gateway clusters against
  one Temporal namespace, use a unique `TEMPORAL_TASK_QUEUE` per cluster
  to prevent workers from pulling each other's recovery tasks.
- **Worker capacity**: workers are stateless and horizontally scalable.
  The worker process owns the gateway's in-memory `SATPSession` map and
  ledger handlers — colocate the worker with its gateway.
- **mTLS**: always set the three TLS env vars in production; never run
  with `insecure: true`.
- **Heartbeats & timeouts**: configured on individual activities (see
  [workflows-and-activities.md](./workflows-and-activities.md)); operators
  should not need to tune these unless ledger latency profile changes.

---

## 5. Verification

The Phase A regression sweep verifies the Temporal wiring is intact after
upgrades or rebases. See
[../testing/v13-temporal-regression.md](../testing/v13-temporal-regression.md).
