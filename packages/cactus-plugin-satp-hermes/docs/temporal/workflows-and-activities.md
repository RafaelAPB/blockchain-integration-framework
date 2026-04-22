# Temporal Workflows & Activities

Reference map of how SATP Hermes's Temporal layer is structured. Use this
when adding new activities, debugging recovery, or onboarding to the
codebase. Source of truth is the code under
[../../src/main/typescript/temporal/](../../src/main/typescript/temporal/).

> Companion docs: [deployment-guide.md](./deployment-guide.md) ·
> [../integration-architecture.md](../integration-architecture.md) ·
> [../knowledge/temporal-ts.md](../knowledge/temporal-ts.md)

---

## 1. Workflows

All workflows are registered via a single Worker entry point
([`temporal/worker.ts`](../../src/main/typescript/temporal/worker.ts))
which resolves `workflows/satp-transfer-workflow.ts` and pulls the rest
through the workflow bundle.

| Workflow | File | Purpose |
|---|---|---|
| `satpTransferWorkflow` | [satp-transfer-workflow.ts](../../src/main/typescript/temporal/workflows/satp-transfer-workflow.ts) | Top-level: orchestrates a full Stage 0→3 transfer for one `sessionId`. Spawns child workflows on failure. |
| `crashRecoveryChildWorkflow` | [crash-recovery-workflow.ts](../../src/main/typescript/temporal/workflows/crash-recovery-workflow.ts) | Child: drives `RECOVER` / `RECOVER-UPDATE` exchange and replays interrupted stages. |
| `rollbackWorkflow` | [rollback-workflow.ts](../../src/main/typescript/temporal/workflows/rollback-workflow.ts) | Reverts ledger-side effects when a session is unrecoverable. Stage-aware (§11.4). |
| `heartbeatMonitorWorkflow` | [heartbeat-monitor-workflow.ts](../../src/main/typescript/temporal/workflows/heartbeat-monitor-workflow.ts) | Detects stale sessions and signals the owning `satpTransferWorkflow`. |
| `backupGatewayWorkflow` | [backup-gateway-workflow.ts](../../src/main/typescript/temporal/workflows/backup-gateway-workflow.ts) | Primary/backup failover for gateway high-availability. |

---

## 2. Activities

Activities are produced by `make*Activities(...)` factories so they can be
injected with gateway state (sessions, repositories, handlers). All are
registered on the same task queue (`TEMPORAL_TASK_QUEUE`).

| Factory | File | Activities |
|---|---|---|
| `makeLogStorageActivities` | [log-storage-activities.ts](../../src/main/typescript/temporal/activities/log-storage-activities.ts) | Persist local/remote SATP logs (proof of state for recovery). |
| `makeCrashRecoveryActivities` | [crash-recovery-activities.ts](../../src/main/typescript/temporal/activities/crash-recovery-activities.ts) | Invoke `CrashRecoveryHandler` and `RollbackStrategyFactory`. |
| `makeProtocolActivities` | [protocol-activities.ts](../../src/main/typescript/temporal/activities/protocol-activities.ts) | Drive Stage 0–3 handlers (`Stage{0..3}SATPHandler`). |
| `makeMonitorActivities` | [monitor-activities.ts](../../src/main/typescript/temporal/activities/monitor-activities.ts) | Stale-session detection; signals running workflows via the Temporal `Client`. |
| `makeBackupActivities` | [backup-activities.ts](../../src/main/typescript/temporal/activities/backup-activities.ts) | Backup-gateway promotion; honors `insecure` for local testing. |

All inbound calls go through `OtelActivityInboundInterceptor` for tracing.

---

## 3. SATP Stage ↔ Temporal Mapping

| SATP Stage | Driven by | Activities |
|---|---|---|
| Stage 0 (init) | `satpTransferWorkflow` | `stage0Handler` activities + log writes |
| Stage 1 (agreement) | `satpTransferWorkflow` | `stage1Handler` activities + log writes |
| Stage 2 (lock evidence) | `satpTransferWorkflow` | `stage2Handler` activities + log writes |
| Stage 3 (commitment) | `satpTransferWorkflow` | `stage3Handler` activities + log writes |
| Recovery | `crashRecoveryChildWorkflow` (spawned on failure) | `makeCrashRecoveryActivities` |
| Rollback | `rollbackWorkflow` | `makeCrashRecoveryActivities` + ledger reverts |
| Liveness | `heartbeatMonitorWorkflow` (long-running) | `makeMonitorActivities` |
| HA failover | `backupGatewayWorkflow` | `makeBackupActivities` |

For a deeper sequence-level view of these interactions see
[../integration-architecture.md](../integration-architecture.md) §1.

---

## 4. Diagrams

Mermaid sources in [../diagrams/](../diagrams/):

- [temporal-component-architecture.mmd](../diagrams/temporal-component-architecture.mmd)
- [temporal-satp-component-architecture.mmd](../diagrams/temporal-satp-component-architecture.mmd)
- [temporal-satp-workflow-hierarchy.mmd](../diagrams/temporal-satp-workflow-hierarchy.mmd)
- [temporal-satp-recovery-protocol.mmd](../diagrams/temporal-satp-recovery-protocol.mmd)
- [temporal-satp-recovery-state-machine.mmd](../diagrams/temporal-satp-recovery-state-machine.mmd)
- [temporal-satp-rollback-flow.mmd](../diagrams/temporal-satp-rollback-flow.mmd)
- [temporal-satp-self-healing-flow.mmd](../diagrams/temporal-satp-self-healing-flow.mmd)
- [temporal-satp-primary-backup-flow.mmd](../diagrams/temporal-satp-primary-backup-flow.mmd)
- [temporal-satp-backup-activation.mmd](../diagrams/temporal-satp-backup-activation.mmd)
- [temporal-satp-session-state-machine.mmd](../diagrams/temporal-satp-session-state-machine.mmd)
- [temporal-satp-core-recovery-relationship.mmd](../diagrams/temporal-satp-core-recovery-relationship.mmd)

Render via `yarn workspace @hyperledger/cactus-plugin-satp-hermes run docs:diagrams`.

---

## 5. Adding a New Activity

1. Create the implementation in a new or existing
   `temporal/activities/*-activities.ts` factory.
2. Add the factory's return to the `activities` object in
   [`temporal/worker.ts`](../../src/main/typescript/temporal/worker.ts).
3. Call the activity from a workflow via `proxyActivities<...>` with
   appropriate `startToCloseTimeout` / `retry` policy.
4. Keep the activity **idempotent** — Temporal will retry it.
5. Cover with a unit test under
   `src/test/typescript/unit/temporal/` and (if it touches a real ledger)
   an integration test under `src/test/typescript/integration/`.

See [../knowledge/temporal-ts.md](../knowledge/temporal-ts.md) for
TS-SDK conventions (determinism, signals, queries).
