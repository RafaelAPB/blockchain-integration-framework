# Temporal × IETF SATP Crash Recovery — Integration Architecture

> **Status**: Living document — updated as Temporal workflows are implemented  
> **IETF Draft**: [`draft-belchior-satp-gateway-recovery-04`](https://www.ietf.org/archive/id/draft-belchior-satp-gateway-recovery-04.txt)  
> **Temporal SDK**: `@temporalio/*` ≥ 1.11.x (Node.js ≥ 18, glibc-based image only)  
> **Related knowledge bases**:
> - [temporal-ts.md](../knowledge/temporal-ts.md) — Temporal TypeScript SDK reference
> - [ietf-crash-recovery.md](../knowledge/ietf-crash-recovery.md) — IETF draft reference

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [SATP Core and Crash Recovery Relationship](#2-satp-core-and-crash-recovery-relationship)
3. [Concept Mapping — IETF Draft to Temporal Primitives](#3-concept-mapping--ietf-draft-to-temporal-primitives)
4. [Component Architecture](#4-component-architecture)
5. [Workflow Hierarchy](#5-workflow-hierarchy)
6. [SATP Session State Machine](#6-satp-session-state-machine)
7. [Logging Model](#7-logging-model)
8. [Recovery Models](#8-recovery-models)
9. [Self-Healing: Crash Recovery Flow](#9-self-healing-crash-recovery-flow)
10. [Primary-Backup: Handover Flow](#10-primary-backup-handover-flow)
11. [Rollback Sub-Protocol Flow](#11-rollback-sub-protocol-flow)
12. [Recovery Scenarios per SATP Phase](#12-recovery-scenarios-per-satp-phase)
13. [Data Model — TypeScript Interfaces](#13-data-model--typescript-interfaces)
14. [Temporal Worker and Testing Configuration](#14-temporal-worker-and-testing-configuration)
15. [Key Design Decisions](#15-key-design-decisions)
16. [Security Considerations](#16-security-considerations)

---

## 1. Introduction

This document maps IETF `draft-belchior-satp-gateway-recovery-04` crash recovery concepts to Temporal TypeScript SDK primitives and defines the integration architecture for the SATP Hermes plugin's fault-tolerant gateway implementation.

The IETF crash recovery draft ensures that cross-ledger asset transfers maintain **ACID properties** even when gateways crash. It defines:

- A **logging model** where gateways write log entries before and after each protocol step.
- Two recovery models: **self-healing** (same gateway recovers) and **primary-backup** (backup gateway takes over).
- A **crash recovery sub-protocol** (5 messages: RECOVER, RECOVER-UPDATE, RECOVER-SUCCESS, ROLLBACK, ROLLBACK-ACK).
- A **session resumption protocol** for primary-backup mode (X.509 certificate validation chain).

Temporal provides the durable execution runtime that naturally implements these guarantees through its event history replay, activity heartbeating, and workflow signal/update primitives.

---

## 2. SATP Core and Crash Recovery Relationship

The crash recovery draft is **protocol-agnostic** with respect to SATP phase content. It wraps SATP phases 1–3 (Transfer Initiation, Lock-Evidence, Commitment Establishment).

![SATP Core and Crash Recovery Relationship](../../assets/diagrams/png/temporal-satp-core-recovery-relationship.png)

---

## 3. Concept Mapping — IETF Draft to Temporal Primitives

| IETF Draft Concept | Temporal Primitive | Rationale |
|---|---|---|
| **LogEntry** | Activity heartbeat detail | Heartbeats carry arbitrary JSON and are checkpointed per execution; on Activity retry, `activityInfo().heartbeatDetails` provides resume context — matching a pre-execution log entry. |
| **writeLogEntry (init-\*)** | Activity heartbeat at start | Call `context.heartbeat({ operation: 'init-...' })` at the top of each activity. |
| **writeLogEntry (done-\*)** | Activity return value | A completed Activity writes its outcome to Workflow history — the Event Log equivalent of a `done-*` log entry. |
| **RECOVER** message | Workflow Signal (`defineSignal`) | Fire-and-forget; non-blocking on sender. Durably queued. See [§15.1](#151-why-signals-for-recover-and-rollback-ack). |
| **RECOVER-UPDATE** message | Workflow Update (`defineUpdate`) | Returns the log diff synchronously. Durable, recorded in event history. See [§15.2](#152-why-updates-for-recover-update-and-rollback). |
| **RECOVER-SUCCESS** message | Update return value | The resolved value of the `RECOVER-UPDATE` Update call. |
| **ROLLBACK / ROLLBACK-ACK** | Saga compensation activities | `CancellationScope.nonCancellable` activities that burn/unlock assets; ensures cleanup completes even if the workflow is cancelled. |
| **Log Storage API** | External service Activity | Wraps `writeLogEntry`, `getLogDiff`, etc. as idempotent Activity calls behind a LogStorageClient. |
| **Self-healing recovery** | Workflow replay | On Worker restart, Temporal replays Event History up to the last recorded step — matching the draft's "execute from last logged action". |
| **Primary-backup detection** | Heartbeat timeout | `heartbeatTimeout` on backup monitoring Activity signals take-over; mirrors the IETF heartbeat timeout. |
| **Primary-backup takeover** | Child Workflow (backup gateway) | Backup runs as a parallel Child Workflow; on primary timeout, receives Signal to become active. |
| **ACP timeout (lock expiry)** | `CancellationScope.withTimeout` | Wraps lock-phase activities; timeout triggers cancellation and rollback. |
| **Recovery dispute** | Non-retryable `ApplicationFailure` | `ApplicationFailure.nonRetryable('RECOVER-DISPUTE')` halts the workflow for human resolution. |
| **X.509 backup validation** | Dedicated Validation Activity | Three-step cert chain check runs as an Activity with its own retry policy. |
| **Session state query** | Workflow Query (`defineQuery`) | `defineQuery('getSessionState')` returns SATP phase, operation stack, and log metadata synchronously. |
| **Log operation types** | Activity lifecycle | `init-*` = heartbeat at activity start; `exec-*` = activity in progress; `done-*` = activity completion; `ack-*` = counterparty confirmation; `fail-*` = `ApplicationFailure`. |

---

## 4. Component Architecture

### 4.1 Temporal Infrastructure

The Worker never stores durable state — everything durable goes through the Temporal Server. This is what makes crash recovery transparent.

![Temporal Component Architecture](../../assets/diagrams/png/temporal-component-architecture.png)

**Key insight**: On crash/restart, the Worker **replays** Event History deterministically — re-executing the Workflow function but substituting history values for each awaited step instead of re-executing them.

### 4.2 SATP Gateway Deployment

Each gateway domain runs its own Temporal Worker connected to a shared or federated Temporal cluster. Workflows communicate across domains via Signals and Updates.

![SATP Component Architecture](../../assets/diagrams/png/temporal-satp-component-architecture.png)

---

## 5. Workflow Hierarchy

![Workflow Hierarchy](../../assets/diagrams/png/temporal-satp-workflow-hierarchy.png)

**Workflow design rules**:

- Each Phase Workflow is a **Child Workflow** — failure in one cannot corrupt parent state. Child Workflows have their own Event History and appear as separate entries in the Temporal Web UI.
- `RecoveryWorkflow` is **not** started unless a crash is detected; triggered by a Signal from the counterparty or by heartbeat timeout detection.
- `BackupReadinessWorkflow` runs _in parallel_ from the start of a transfer, receiving heartbeats from the primary and transitioning to active on timeout.
- `RollbackWorkflow` implements the Saga compensation pattern with `CancellationScope.nonCancellable` to ensure cleanup completes.

---

## 6. SATP Session State Machine

![Session State Machine](../../assets/diagrams/png/temporal-satp-session-state-machine.png)

The state machine captures the full lifecycle of a SATP transfer including normal flow, crash detection, recovery, lock timeout, and rollback paths. Any running phase can transition to `CRASH_DETECTED` via heartbeat timeout, and recovery always rejoins the protocol at the last confirmed step.

---

## 7. Logging Model

### 7.1 Log as a Stack

Per the IETF draft, the log is a **stack of log entries** (newest at top). For every protocol step a gateway performs:

1. Write a **pre-execution** entry (`init-*`) **before** the step.
2. Execute the step.
3. Write a **post-execution** entry (`done-*`) **after** the step.
4. Write an **acknowledgment** entry (`ack-*`) when counterparty confirms.

### 7.2 Mapping to Temporal Activity Lifecycle

| Log operation | Temporal equivalent | Implementation |
|---|---|---|
| `init-*` | Activity heartbeat at start | `context.heartbeat({ operation: 'init-lockAsset' })` |
| `exec-*` | Activity in progress | Activity body executing |
| `done-*` | Activity return value recorded in Event History | `ActivityTaskCompleted` event |
| `ack-*` | Counterparty Signal/Update received | Signal handler sets workflow state |
| `fail-*` | `ApplicationFailure` thrown | Caught by retry policy or Saga compensations |

### 7.3 Log Storage API

The Log Storage API abstracts over different storage backends (relational, on-chain, IPFS):

| Endpoint | Method | Parameters | Returns |
|---|---|---|---|
| `POST /writeLogEntry/:logId` | WRITE | `logId`: entry to append | Entry index |
| `GET /getLogEntry/:id` | READ | `id`: entry id | Log entry (JSON) |
| `GET /getLogLength` | READ | none | Length |
| `POST /getLogDiff/:log` | READ | `log`: log to compare | Diff (JSON) |
| `GET /getLastEntry` | READ | none | Latest log entry |
| `GET /getLog` | READ | none | Full log |

### 7.4 Log Storage Modes

| Mode | Storage | Integrity | Privacy | Recommended for |
|---|---|---|---|---|
| **Public Decentralized** | Blockchain / IPFS | Hash on chain | Low (public) | Relay Mode (different orgs) |
| **Public Centralized** | Multi-org bulletin | Redundancy | Medium | Multi-org consortium |
| **Private Centralized** | Local / cloud | Weakest | High | Single-org, speed-critical |
| **Private Decentralized** | Private blockchain | Chain hash | High | Trusted consortium |

**Default**: If gateways belong to **different institutions**, use **decentralized log storage**.

### 7.5 Log Chaining Integrity

Each `ILogEntry` contains `lastEntryHash` pointing to the previous entry. This hash chain is verified by the `WriteLogEntryActivity` before appending:

```typescript
// In WriteLogEntryActivity:
const lastEntry = await logStorageClient.getLastEntry(sessionId);
const expectedHash = sha256(JSON.stringify(lastEntry));
if (entry.lastEntryHash !== expectedHash) {
  throw ApplicationFailure.nonRetryable(
    "LOG_CHAIN_BROKEN",
    `lastEntryHash mismatch: expected ${expectedHash}`
  );
}
```

A broken hash chain triggers a non-retryable failure — the equivalent of `RECOVER-DISPUTE` in the IETF draft.

---

## 8. Recovery Models

![Recovery State Machine](../../assets/diagrams/png/temporal-satp-recovery-state-machine.png)

### 8.1 Self-Healing Model

**Assumption**: After a crash, the gateway **eventually recovers** and:
- Retains its long-term key pair.
- Can re-establish all TLS connections.

**Temporal mapping**: On Worker restart, Temporal replays Event History deterministically up to the crash point. The Workflow function re-executes but Activity results are fed from history (not re-executed). The Workflow resumes from the last incomplete Activity.

**Recovery steps**: Crash → Temporal replay → RECOVER Signal → State sync via RECOVER-UPDATE → Resume.

### 8.2 Primary-Backup Model

**Assumption**: Primary gateway may **never recover**. Backup is detected by:
- Heartbeat messages between primary and backup (Temporal `heartbeatTimeout`).
- Conservative timeout period.

**Temporal mapping**: `BackupReadinessWorkflow` runs as a parallel Child Workflow. It monitors heartbeats via `CancellationScope.withTimeout`. When timeout fires, it runs `ValidateBackupCertActivity` (3-step X.509 check) and, if authorized, signals the counterparty to establish a new session.

---

## 9. Self-Healing: Crash Recovery Flow

**Scenario**: G1 crashes during Phase 2 (after writing `init-lockAsset` but before receiving `done-lockAsset`). G1 restarts. G2's log has advanced; G1's has not.

![Self-Healing Crash Recovery Flow](../../assets/diagrams/png/temporal-satp-self-healing-flow.png)

### Signal vs Update Decision

| Step | Message | Temporal Mechanism | Why |
|---|---|---|---|
| G1 notifies G2 it recovered | RECOVER | **Signal** | Notification only; G1 does not block. Wakes G2's `RecoveryWorkflow`. |
| G2 sends log diff to G1 | RECOVER-UPDATE | **Update** | G1 blocks until diff arrives; recorded in history. |
| G1 confirms logs synced | RECOVER-SUCCESS | **Update return value** | The resolved value constitutes the acknowledgment. |

---

## 10. Primary-Backup: Handover Flow

**Scenario**: Primary gateway (G1) crashes. Backup gateway (B) detects the crash via heartbeat timeout. B validates X.509 certificate chain and takes over.

![Primary-Backup Handover Flow](../../assets/diagrams/png/temporal-satp-primary-backup-flow.png)

### Backup Activation Conditions

![Backup Activation Conditions](../../assets/diagrams/png/temporal-satp-backup-activation.png)

### X.509 Validation Steps

The backup must pass three checks before it can take over:

1. **Certification path algorithm**: Validate B's certificate chain to a trusted root CA.
2. **Same legal authority**: `B.parentCert == G1.parentCert` (same VASP CA).
3. **Authorized backup list**: `hash(B.cert) ∈ G1.cert.extensions.authorizedBackups`.

The backup must itself designate its own authorized backups in its X.509 certificate extensions.

---

## 11. Rollback Sub-Protocol Flow

**Scenario**: G1 sends `COMMIT-PREPARE` to G2 (Phase 3). G1 crashes. G2 detects via timeout. G2 executes rollback and sends ROLLBACK to G1 when G1 recovers.

![Rollback Sub-Protocol Flow](../../assets/diagrams/png/temporal-satp-rollback-flow.png)

### Saga Compensation Pattern

```typescript
import {
  proxyActivities,
  CancellationScope,
  isCancellation,
  ActivityFailure,
} from "@temporalio/workflow";

const { lockAsset, unlockAsset, mintAsset, burnAsset, writeLogEntry } =
  proxyActivities<SatpActivities>({ startToCloseTimeout: "60 seconds" });

const compensations: Array<() => Promise<void>> = [];

async function satpPhase3Workflow(ctx: SatpContext): Promise<void> {
  compensations.unshift(() => unlockAsset(ctx.assetId));
  await lockAsset(ctx.assetId);
  await writeLogEntry({ ...ctx, operation: "done-lockAsset" });

  compensations.unshift(() => burnAsset(ctx.mintedAssetId));
  await mintAsset(ctx.assetDefinition);
  await writeLogEntry({ ...ctx, operation: "done-mintAsset" });

  try {
    await commitEstablishment(ctx);
  } catch (err) {
    if (err instanceof ActivityFailure || isCancellation(err)) {
      await CancellationScope.nonCancellable(async () => {
        for (const compensate of compensations) {
          await compensate();
        }
      });
      await writeLogEntry({ ...ctx, operation: "done-rollback" });
      throw err;
    }
    throw err;
  }
}
```

**Why `nonCancellable`**: If the Workflow is cancelled mid-compensation, cleanup Activities would also be cancelled — leaving the system inconsistent. `nonCancellable` ensures compensation completes.

### Rollback List per Phase

| SATP Step | Origin Gateway Action | Destination Gateway Action |
|---|---|---|
| 2.1A — pre-lock | Add `pre-lock` tx to origin rollback list | — |
| 2.1B — denied | Abort + apply origin rollback | — |
| 3.4A — lock | Add `lock` tx to origin rollback list | — |
| 3.4B — commit fails | Abort + apply origin rollback | — |
| 3.6A — mint/create | — | Add `create-asset` tx to destination rollback list |
| 3.8 — success | SATP terminates | SATP terminates |
| 3.8 — last commit fails | Abort + apply **both** rollback lists | Abort + apply **both** rollback lists |

---

## 12. Recovery Scenarios per SATP Phase

### Complete Recovery Protocol

![Complete Recovery Protocol](../../assets/diagrams/png/temporal-satp-recovery-protocol.png)

### 12.1 Phase 1: Transfer Initiation

No ledger changes have occurred yet. Recovery is straightforward — re-establish state and resume. The RECOVER + RECOVER-UPDATE exchange synchronizes logs and the protocol continues.

### 12.2 Phase 2: Lock-Evidence

**Critical constraint**: Crash recovery must complete **within the asset lock timeout**. If recovery takes longer than the lock TTL, the **rollback protocol** is triggered.

Temporal mapping: `CancellationScope.withTimeout(lockDuration)` wraps the lock-phase activities. If the timer fires, the scope is cancelled and Saga compensations unlock the asset.

### 12.3 Phase 3: Commitment Establishment

Most complex phase. Blockchain transactions cannot be directly undone — rollback requires **issuing new inverse transactions** (burn ↔ unlock). Both gateways maintain rollback lists tracking which on-chain transactions can be inverted.

### Recovery Message Types

| Message | URN | Direction |
|---|---|---|
| RECOVER | `urn:ietf:SATP-2pc:msgtype:recover-msg` | Recovered → Counterparty |
| RECOVER-UPDATE | `urn:ietf:SATP-2pc:msgtype:recover-update-msg` | Counterparty → Recovered |
| RECOVER-SUCCESS | `urn:ietf:SATP-2pc:msgtype:recover-update-ack-msg` | Recovered → Counterparty |
| ROLLBACK | `urn:ietf:SATP-2pc:msgtype:rollback-msg` | Non-crashed → Recovered |
| ROLLBACK-ACK | `urn:ietf:SATP-2pc:msgtype:rollback-ack-msg` | Recovered → Non-crashed |

---

## 13. Data Model — TypeScript Interfaces

### 13.1 ILogEntry

Maps all 26 mandatory + 2 optional fields from §4 of the IETF draft.

```typescript
type SatpPhase =
  | "transfer-initiation"
  | "transfer-commence"
  | "lock-assertion"
  | "lock-assertion-receipt"
  | "commitment-prepare"
  | "commitment-ready"
  | "commitment-final"
  | "transfer-complete";

type LogOperation =
  | `init-${string}`
  | `exec-${string}`
  | `done-${string}`
  | `ack-${string}`
  | `fail-${string}`;

export interface ILogEntry {
  // --- SATP schema fields (from SATP Core) ---
  version: string;
  sessionId: string;
  contextId: string;
  seqNumber: number;
  satpPhase: SatpPhase;
  resourceURL: string;
  developerURN: string;
  actionResponse: string;
  credentialProfile: "SAML" | "OAuth" | "X.509";
  credentialBlock: string;
  payloadProfile: string;
  applicationProfile: string;
  payload: Record<string, unknown>;
  payloadHash: string;

  // --- Crash recovery required fields ---
  timestamp: number;
  originGatewayPubkey: string;
  originGatewaySystem: string;
  destinationGatewayPubkey: string;
  destinationGatewaySystem: string;
  loggingProfile: string;
  messageSignature: string;
  lastEntryHash: string;
  accessControlProfile: string;
  operation: LogOperation;

  // --- Optional crash recovery fields ---
  recoveryMessage?: string;
  recoveryPayload?: Record<string, unknown>;
}
```

### 13.2 IRecoverMessage

```typescript
export interface IRecoverMessage {
  sessionId: string;
  contextId: string;
  messageType: "urn:ietf:SATP-2pc:msgtype:recover-msg";
  satpPhase: SatpPhase;
  seqNumber: number;
  isBackup: boolean;
  newIdentityPublicKey?: string;
  lastEntryTimestamp: number;
  senderSignature: string;
}
```

### 13.3 IRecoverUpdateMessage

```typescript
export interface IRecoverUpdateMessage {
  sessionId: string;
  contextId: string;
  messageType: "urn:ietf:SATP-2pc:msgtype:recover-update-msg";
  hashRecoverMessage: string;
  recoveredLogs: ILogEntry[];
  senderSignature: string;
}
```

### 13.4 IRecoverSuccessMessage

```typescript
export interface IRecoverSuccessMessage {
  sessionId: string;
  contextId: string;
  messageType: "urn:ietf:SATP-2pc:msgtype:recover-update-ack-msg";
  hashRecoverUpdateMessage: string;
  success: boolean;
  entriesChanged: string[];
  senderSignature: string;
}
```

### 13.5 IRollbackMessage

```typescript
export interface IRollbackMessage {
  sessionId: string;
  contextId: string;
  messageType:
    | "urn:ietf:SATP-2pc:msgtype:rollback-msg"
    | "urn:ietf:SATP-2pc:msgtype:rollback-ack-msg";
  success: boolean;
  actionsPerformed: Array<"UNLOCK" | "BURN" | "REVERT" | string>;
  proofs: Array<{ networkId: string; txId: string; proof: string }>;
  senderSignature: string;
}
```

### 13.6 Workflow Signal, Update, and Query Definitions

```typescript
import { defineSignal, defineUpdate, defineQuery } from "@temporalio/workflow";

// Signals (fire-and-forget, no return value)
export const recoverSignal =
  defineSignal<[IRecoverMessage]>("RECOVER");
export const rollbackAckSignal =
  defineSignal<[IRollbackMessage]>("ROLLBACK-ACK");
export const sessionResumptionSignal =
  defineSignal<[{ newGatewayPubkey: string }]>("SESSION-RESUMPTION");

// Updates (durable, return a value, can have validators)
export const recoverUpdateUpdate =
  defineUpdate<IRecoverSuccessMessage, [IRecoverUpdateMessage]>("RECOVER-UPDATE");
export const rollbackUpdate =
  defineUpdate<IRollbackMessage, [IRollbackMessage]>("ROLLBACK");

// Queries (read-only, synchronous, no side effects)
export const getSessionStateQuery =
  defineQuery<ISatpSessionState>("getSessionState");
export const getRollbackListQuery =
  defineQuery<string[]>("getRollbackList");
```

---

## 14. Temporal Worker and Testing Configuration

### 14.1 Worker Setup

```typescript
import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities";

const worker = await Worker.create({
  workflowsPath: require.resolve("./workflows"),
  activities,
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "satp-recovery",
  connection: await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  }),
  namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  maxConcurrentActivityTaskExecutions: 100,
  maxConcurrentWorkflowTaskExecutions: 40,
  shutdownGraceTime: "30s",
});

await worker.run();
```

**Docker requirements**: Must use glibc-based images (`node:20-bullseye`, not Alpine). Pre-bundle workflows for production with `bundleWorkflowCode()`.

### 14.2 Testing Strategy

| Type | API | Use case |
|---|---|---|
| Time-skipping | `TestWorkflowEnvironment.createTimeSkipping()` | Workflows with long timers (lock timeouts) |
| Local (no time skip) | `TestWorkflowEnvironment.createLocal()` | Real-time integration tests |
| Mock Activity | `MockActivityEnvironment` | Unit-test Activities in isolation |
| Replay testing | `Worker.runReplayHistory()` | Backward compatibility after code changes |

### 14.3 Determinism Rules for Workflow Code

| Allowed in Workflow | Forbidden in Workflow |
|---|---|
| `sleep()` (durable timer) | `setTimeout` / `setInterval` |
| `Math.random()` (SDK-patched) | `crypto.randomUUID()` |
| `new Date()` (SDK-patched) | Direct `fetch` / `http.get` |
| `proxyActivities()` | Direct Activity function calls |
| `executeChild()` | Direct Workflow function calls |
| `log` from `@temporalio/workflow` | `console.log` (suppressed on replay) |

---

## 15. Key Design Decisions

### 15.1 Why Signals for RECOVER and ROLLBACK-ACK?

The IETF draft describes RECOVER as a notification message — the recovered gateway informs the counterparty it is ready to resume. The counterparty then initiates log sync. This is semantically equivalent to a **Temporal Signal**: unidirectional, fire-and-forget, durably queued, non-blocking on the sender.

ROLLBACK-ACK is also a fire-and-forget acknowledgment.

### 15.2 Why Updates for RECOVER-UPDATE and ROLLBACK?

RECOVER-UPDATE and ROLLBACK require the sender to **block until a response is received** and the response must be **durably recorded** in history. Temporal Updates satisfy both:
- The handler executes as a Workflow step — recorded in history.
- The return value provides the sync response (log diff / rollback proofs).
- Failed Updates can be retried without duplicating side effects (idempotency via history).

Update handlers can also have **validators** that reject invalid requests before they are recorded.

### 15.3 Determinism in Recovery Workflows

Recovery Workflows must be deterministic (Temporal requirement) AND handle log entries from external sources:

1. **Log diff fetching** happens in an Activity (non-deterministic I/O).
2. The diff result is **returned to the Workflow** and stored in event history.
3. The Workflow **applies the diff** deterministically.
4. **Writing updated entries** happens in another Activity.

### 15.4 Crash Detection Timeout Tuning

| Parameter | IETF Concept | Temporal Setting | Guidance |
|---|---|---|---|
| Heartbeat G1↔Backup | Primary-backup heartbeat | `heartbeatTimeout` on `BackupHeartbeatActivity` | Must be << lock expiry timeout |
| Lock phase deadline | Lock timeout (on-chain) | `CancellationScope.withTimeout(lockDuration)` | Ledger's lock TTL minus safety margin |
| Recovery phase deadline | Recovery before lock expires | RECOVER + RECOVER-UPDATE + RECOVER-SUCCESS RTT | Sum RTT bounds; if exceeded, trigger rollback |
| RECOVER message retry | Reliable delivery | `startToCloseTimeout` on activities | Short (5–10 s), high retry count |

---

## 16. Security Considerations

| Assumption | Detail |
|---|---|
| **Authenticated channel** | TLS/HTTPS between gateways. Messages cannot be spoofed or altered. |
| **Crash-fault tolerant only** | Protocol handles silent crashes. **Not Byzantine-fault tolerant** — gateways are trusted. |
| **Log integrity** | Hash chaining (`lastEntryHash`) + ECDSA signatures on entries. Broken chain → `RECOVER-DISPUTE`. |
| **Log confidentiality** | Storage service must provide AuthN/AuthZ (OAuth+OIDC), TLS in transit. |
| **Log availability** | Mode-dependent: decentralized storage for highest guarantees. |
| **Log access control** | `accessControlProfile` per entry. ACLs for simple authorization. |
| **Credential management** | OAuth2.0 client credential schemes for gateway-to-gateway auth. |
| **Determinism safety** | Workflow code runs in V8 sandbox; no direct I/O prevents injection of non-deterministic state. |

### Attack Surface

Log entries are attractive attack targets:
- Compromise log integrity → false state reconstruction → double-spend or incorrect rollback.
- Mitigation: hash chaining, ECDSA signatures, decentralized storage for highest guarantees.
- Temporal's Event History provides an additional audit trail independent of the SATP log.
