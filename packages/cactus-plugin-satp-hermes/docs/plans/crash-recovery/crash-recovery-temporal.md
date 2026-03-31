---
goal: Plan for using Temporal TypeScript SDK to implement SATP crash recovery and rollbacks between gateways, including proto definitions, Docker infra, and test tooling
version: 3.0
date_created: 2026-03-30
last_updated: 2026-03-30
owner: SATP Development Team
status: Draft
tags: [temporal, crash-recovery, rollback, satp, fault-tolerance, durable-execution, ietf-draft, protobuf, docker, test-tooling, opentelemetry, tracing, logging]
---

# Temporal for SATP Crash Recovery and Gateway Rollbacks

![Status: Draft](https://img.shields.io/badge/status-Draft-blue)

> **Specification reference**: This document is grounded in
> [draft-belchior-satp-gateway-recovery-04](https://www.ietf.org/archive/id/draft-belchior-satp-gateway-recovery-04.txt)
> (expires 31 July 2026). The existing `CrashRecoveryHandler` / `RollbackStrategyFactory`
> implementation is **experimental** and may be replaced entirely; this plan targets a
> ground-up re-implementation aligned to the IETF draft.

---

## 1. Why Temporal TypeScript Is Well-Suited for SATP Crash Recovery

### 1.1 What the IETF Draft Requires

`draft-belchior-satp-gateway-recovery-04` (§5) specifies a crash-recovery
mechanism for SATP gateways that enforces **ACID properties** for cross-ledger
asset transfers. The draft defines two recovery models and a five-message
recovery sub-protocol built on top of a structured logging model.

**Recovery models** (§5.1):

| Model | Description |
|---|---|
| **Self-healing** | The crashed gateway eventually recovers, re-reads its log, and resumes from the last successful step. Keys are never lost. |
| **Primary-backup** | If a gateway does not recover within a timeout, a pre-authorised backup gateway detected by heartbeat takes over. Backup identity is validated via X.509 certificate extensions (§6.1). |

**Recovery sub-protocol messages** (§5.3):

| Message | Direction | Purpose |
|---|---|---|
| `RECOVER` | crashed → counterparty | Announces recovery; carries last known SATP phase, sequence number, log timestamp, and `isBackup` flag |
| `RECOVER-UPDATE` | counterparty → crashed | Sends the log diff between the crashed gateway's last known entry and the current head |
| `RECOVER-UPDATE-ACK` | crashed → counterparty | Confirms the log diff has been applied |
| `RECOVER-SUCCESS` | counterparty → crashed | Acknowledges shared state is consistent; normal protocol resumes |
| `ROLLBACK` | initiating → counterparty | Initiates rollback; carries `actionsPerformed` list and ledger `proofs` |
| `ROLLBACK-ACK` | counterparty → initiating | Confirms rollback completion |

**Logging model** (§3):

Every protocol step writes a log entry to a Log Storage API **before and after**
the operation executes. Each entry carries: `sessionId`, `contextId`,
`sequenceNumber`, `satpPhase`, `operation` (`init-`, `exec-`, `done-`, `ack-`,
`fail-`), `timestamp`, gateway public keys, ECDSA signature, and hash of the
previous entry. Log storage can be private-centralized (local Knex),
public-decentralized (IPFS/on-chain), or a hybrid. The Log Storage API exposes
`writeLogEntry`, `getLogEntry`, `getLogDiff`, and `updateLog` primitives.

**Rollback boundary** (§5.2.3):

A rollback list accumulates reversible operations per gateway as the protocol
advances. Once the final commitment acknowledgement is confirmed (SATP step 3.8),
the transfer is **irrevocable** — mint and assignment are on-chain. Before that
point, any gateway may initiate ROLLBACK.

### 1.2 Problems With the Current Experimental Implementation

The existing `CrashRecoveryHandler` and `RollbackStrategyFactory` are a partial
prototype. Key gaps relative to the draft:

| Draft requirement | Current gap |
|---|---|
| Log written **before and after** every step (§3) | Knex log is written at uneven points; `init-` / `exec-` / `done-` / `ack-` lifecycle not fully modelled |
| `RECOVER-UPDATE` carries the **log diff** (§5.3.2) | `RecoverUpdateV1Message` sends whole session data, not a true log diff |
| Rollback list with ledger proofs communicated via `ROLLBACK` (§5.3.4) | `rollbackActionsPerformed` / `rollbackProofs` fields exist but are not populated during the forward path |
| `RECOVER` must include `isBackup` and optionally a new public key (§5.3.1, §6.1) | `isBackup` field exists but X.509 certificate validation from §6.1 is absent |
| Stage 2/3 recovery timeout must not exceed the asset-transfer timeout (§5.2.2) | A global `maxTimeout` is used; no stage-aware deadline |
| On-restart recovery reads from the shared log if available (§5.2 step 2) | `recoverOpenSessions()` only reads the local Knex database |
| Retry of a crashed rollback is required (rollback itself may crash) | `rollback()` is a plain async call with no automatic retry |

Rather than patching these gaps piecemeal, Temporal provides a runtime that
**structurally enforces** the draft's requirements.

### 1.3 How Temporal Maps to the Draft

[Temporal](https://temporal.io) is a durable-execution platform. Every
`await activity()` call inside a Temporal Workflow is checkpointed as an
immutable event in Temporal's own event history before execution proceeds. If
the worker process crashes, Temporal replays the history on restart — the
developer writes linear async TypeScript and gets crash-safe execution.

| Draft §/ requirement | Temporal mechanism |
|---|---|
| §3 — log entry before and after each step | Explicit `writeLogEntryActivity` calls flanking each protocol activity, or pre/post activity interceptors |
| §5.1 — self-healing: resume from last successful step | Workflow event-history replay; already-completed activities are skipped |
| §5.1 — primary-backup: backup takes over after timeout | Temporal Signal from a backup worker + durable `sleep()` timer in the workflow |
| §5.2 — RECOVER → RECOVER-UPDATE → RECOVER-UPDATE-ACK → RECOVER-SUCCESS | `CrashRecoveryChildWorkflow` executes the exchange as ordered, retried activities |
| §5.3.4 — ROLLBACK with proofs, coordinated across gateways | Saga compensation array; proofs collected as activity return values |
| §5.2.3 — rollback list maintained during forward path | Compensation array accumulated inside `SatpTransferWorkflow` as each forward activity succeeds |
| §5.2.2 — stage-aware deadlines | Per-activity `startToCloseTimeout`; workflow-level `sleep()` for Stage 2/3 asset-transfer deadline |
| §3.3 — public decentralized log | Log-write activities call the IPFS remote-log repository; Temporal event history is the process-local equivalent |
| §6.1 — backup gateway X.509 validation | Certificate check runs as an activity in `BackupGatewayPromotionChildWorkflow` before promotion |

### 1.4 Alignment With SATP Core v13

SATP Core v13 §10.8 explicitly defers session recovery to external mechanisms.
`draft-belchior-satp-gateway-recovery-04` fills that gap. Temporal implements
the recovery draft without touching the v13 core wire format: IANA message URNs,
protobuf definitions, and stage handler logic are all unchanged. Temporal wraps
them.

---

## 2. Temporal Primitives for SATP Recovery

### 2.1 Workflows

A **Workflow** is a deterministic TypeScript function orchestrating activities.
Temporal sandboxes it to prevent non-determinism (no `Date.now()`, no direct I/O).

**`SatpTransferWorkflow`** — one instance per session, identified by `sessionId`:

```
SatpTransferWorkflow(sessionId, contextId)
  ├── [stage 0 activities]  Transfer Initiation
  ├── [stage 1 activities]  Lock Assertion
  ├── [stage 2 activities]  Commitment Establishment  ← rollback list closed here
  └── [stage 3 activities]  Transfer Completion
```

**`CrashRecoveryChildWorkflow`** — spawned by the main workflow on crash/timeout.
Implements the draft §5 recovery procedure as an ordered sequence of activities.
On completion, the main workflow either resumes from the correct step or
terminates after rollback.

**`BackupGatewayPromotionChildWorkflow`** — spawned when heartbeat monitoring
detects a primary gateway is silent beyond the configured timeout. Validates the
backup gateway's X.509 certificate chain per §6.1, then signals the main workflow
to update its session identity.

**Key guarantee**: if the worker process dies mid-workflow, Temporal replays all
recorded events on restart. Activities that already completed are not re-executed.

### 2.2 Activities

Activities are the side-effectful units — sending protocol messages, calling
ledger bridges, reading/writing log entries. They run in normal Node.js and each
carries a `RetryPolicy`.

**Log Storage activities** (§3 Log Storage API — wrap existing Knex + IPFS repos):

| Activity | Draft primitive |
|---|---|
| `writeLogEntryActivity(entry)` | `writeLogEntry(e, L)` |
| `getLogEntryActivity(i)` | `getLogEntry(i, L)` |
| `computeLogDiffActivity(l1, l2)` | `getLogDiff(l1, l2)` |
| `applyLogDiffActivity(diff)` | `updateLog(l1, l2)` |
| `getLastLogEntryActivity()` | `getLastEntry(L)` |

**Protocol message activities** (forward path — wrap existing stage handlers):

| Activity | SATP step | Stage |
|---|---|---|
| `sendTransferProposalRequest` | §2.1 | 0 |
| `sendTransferProposalReceiptMessage` | §2.2 | 0 |
| `sendLockAssertionMessage` | §2.3 | 1 |
| `sendLockAssertionReceiptMessage` | §2.4 | 1 |
| `sendCommitPreparationMessage` | §3.1 | 2 |
| `sendCommitReadyMessage` | §3.2 | 2 |
| `sendCommitFinalAssertionMessage` | §3.3 | 3 |
| `sendAssignmentAssertionMessage` | §3.4 | 3 |
| `sendAcknowledgeCommitmentMessage` | §3.5 | 3 |

**Recovery activities** (§5.3 messages — wrap existing `CrashRecoveryClientService` / `CrashRecoveryServerService`):

| Activity | Draft message |
|---|---|
| `sendRecoverMessage` | RECOVER (§5.3.1) |
| `receiveRecoverUpdateMessage` | waits for RECOVER-UPDATE (§5.3.2) |
| `sendRecoverUpdateAckMessage` | RECOVER-UPDATE-ACK (§5.3.3) |
| `receiveRecoverSuccessMessage` | waits for RECOVER-SUCCESS (§5.3.3) |

**Rollback activities** (§5.3.4–5.3.5 — wrap existing `Stage*RollbackStrategy`):

| Activity | Calls |
|---|---|
| `rollbackLockAssertion` | `Stage1RollbackStrategy.execute()` |
| `rollbackCommitPreparation` | `Stage2RollbackStrategy.execute()` |
| `rollbackCommitFinalAssertion` | `Stage3RollbackStrategy.execute()` (before PoNR only) |
| `sendRollbackMessage` | ROLLBACK (§5.3.4) with `actionsPerformed` + `proofs` |
| `receiveRollbackAckMessage` | waits for ROLLBACK-ACK (§5.3.5) |

**Retry policy** for all network-facing activities:

```typescript
const networkRetryPolicy = {
  initialInterval: "1s",
  backoffCoefficient: 2,
  maximumAttempts: 5,
  maximumInterval: "30s",
  nonRetryableErrorTypes: ["SATPAbortError", "PointOfNoReturnViolation"],
};
```

### 2.3 Saga Pattern for the Rollback List (§5.2.3)

The draft's rollback list maps directly to a Temporal Saga via a compensation
array accumulated during the forward path:

```typescript
// Inside SatpTransferWorkflow
const compensations: Array<() => Promise<RollbackState>> = [];

// Stage 1
await proxyActivities.sendLockAssertionMessage(session);
compensations.push(() => proxyActivities.rollbackLockAssertion(session));

// Stage 2 — commit-prepare
await proxyActivities.sendCommitPreparationMessage(session);
compensations.push(() => proxyActivities.rollbackCommitPreparation(session));

// Stage 2 — commit-ready: POINT OF NO RETURN
// Draft §5.2.3 step 7: stop appending to rollback list after this
await proxyActivities.sendCommitReadyMessage(session);
// DO NOT push anything after this line

// ... Stage 3 proceeds (irrevocable on-chain operations)
```

On failure before the point of no return, compensations run in reverse with
proofs forwarded to `ROLLBACK`:

```typescript
} catch (err) {
  const states: RollbackState[] = [];
  for (const comp of compensations.reverse()) {
    states.push(await comp()); // each is a retried activity
  }
  await proxyActivities.sendRollbackMessage(session, states);
  await proxyActivities.receiveRollbackAckMessage(session);
  throw err;
}
```

### 2.4 Durable Timers (`sleep`)

`sleep(duration)` inside a Temporal workflow survives process restarts. This
replaces the in-memory timestamp comparison inside `makeRequest()` which is
reset on crash:

```typescript
// Draft §5.2.2: crash recovery MUST complete before the asset-transfer timeout
const counterpartyResponded = await Promise.race([
  condition(() => peerResponded),
  sleep(stageTwoDeadline),
]);
if (!counterpartyResponded) {
  throw new SessionTimeoutError(sessionId);  // triggers rollback
}
```

The `stageTwoDeadline` is the asset-transfer timeout agreed during Transfer
Initiation — not a global `maxTimeout` constant — matching the draft's
stage-aware deadline requirement.

### 2.5 Signals

Signals allow external processes — the peer gateway, a backup worker, a CLI
operator — to push events into a running workflow without polling:

```typescript
const recoverSignal      = defineSignal<[RecoverPayload]>("satp.recover");
const rollbackSignal     = defineSignal<[RollbackPayload]>("satp.rollback");
const backupTakeoverSignal = defineSignal<[BackupPayload]>("satp.backup-takeover");

// Inside SatpTransferWorkflow
setHandler(recoverSignal, (payload) => { pendingRecover = payload; });
setHandler(rollbackSignal, ()       => { rollbackRequested = true; });
setHandler(backupTakeoverSignal, (p) => {
  sessionData.sourceBasePath = p.newBasePath;
  sessionData.sourcePubKey   = p.newPubKey;
});
```

This replaces the raw HTTP endpoints for RECOVER and ROLLBACK inter-gateway RPC.
The ConnectRPC `CrashRecoveryService` handler receives the incoming message and
forwards it as a Temporal Signal, then returns — no tight loop waiting for a
reply.

### 2.6 Queries

Queries expose live workflow state to external callers without side effects:

```typescript
const sessionStateQuery = defineQuery<SessionData>("satp.sessionState");
const logQuery          = defineQuery<LogEntry[]>("satp.log");

setHandler(sessionStateQuery, () => currentSessionData);
setHandler(logQuery,          () => inMemoryLog);
```

`GET /api/v1/.../sessions/{sessionId}` delegates to a Temporal query — always
consistent, no extra database round-trip.

### 2.7 Child Workflows

The RECOVER → RECOVER-UPDATE → RECOVER-UPDATE-ACK → RECOVER-SUCCESS exchange
(§5.2) is a child workflow:

```typescript
// Spawned when self-healing or primary-backup recovery activates
const recovery = await startChild(CrashRecoveryChildWorkflow, {
  workflowId: `satp-recovery-${sessionId}`,
  args: [{ sessionId, contextId, lastSequenceNumber, lastLogTimestamp, isBackup }],
});
const { logDiff, shouldRollback } = await recovery.result();
```

For primary-backup (§6.1), `BackupGatewayPromotionChildWorkflow` runs first to
validate the X.509 chain before the `backupTakeoverSignal` is emitted.

### 2.8 Schedules (Heartbeat Monitoring)

A Temporal **Schedule** triggers `HeartbeatMonitorWorkflow` every N seconds. It
scans sessions whose last log timestamp exceeds their configured timeout and
signals those workflows — implementing the draft §5.1 heartbeat-based failure
detection without a separate daemon:

```typescript
// HeartbeatMonitorWorkflow body
const stale = await findStaleSessionsActivity();
for (const sessionId of stale) {
  await temporalClient.workflow.signal(
    `satp-transfer-${sessionId}`,
    backupTakeoverSignal,
    { reason: "heartbeat-timeout" },
  );
}
```

### 2.9 Activity Heartbeats

Long-running activities (waiting for on-chain confirmation) call
`Context.current().heartbeat(progress)` periodically so Temporal can detect
worker death before `scheduleToCloseTimeout` expires:

```typescript
async function waitForLockConfirmation(sessionId: string): Promise<Receipt> {
  let receipt: Receipt | undefined;
  while (!receipt) {
    Context.current().heartbeat({ sessionId });
    receipt = await pollLedgerForLockReceipt(sessionId);
    if (!receipt) await sleep(2000);
  }
  return receipt;
}
```

---

## 3. Architecture

### 3.1 Component Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SATP Gateway Process (Node.js)                                          │
│                                                                           │
│  ┌───────────────────────┐    ┌─────────────────────────────────────────┐│
│  │  BLO API / ConnectRPC │    │  Temporal Worker                         ││
│  │  (Express + gRPC)     │    │  (workflows + activities registered)     ││
│  │                       │    │                                           ││
│  │  POST /transfer ──────┼───▶│  SatpTransferWorkflow.start()            ││
│  │  GET  /sessions/:id ──┼───▶│  SatpTransferWorkflow.query()            ││
│  │  POST /abort ─────────┼───▶│  SatpTransferWorkflow.signal(rollback)   ││
│  │  POST /recover* ──────┼───▶│  SatpTransferWorkflow.signal(recover)    ││
│  └───────────────────────┘    └──────────────────────┬──────────────────┘│
│                                                        │ dispatch          │
│  ┌─────────────────────────────────────────────────────▼────────────────┐ │
│  │  Activity Layer                                                        │ │
│  │  ┌───────────────────────────┐  ┌──────────────────────────────────┐  │ │
│  │  │ Protocol Message Activities│  │ Log Storage Activities (§3 API)  │  │ │
│  │  │ stage0..3-handler.ts      │  │ writeLogEntryActivity             │  │ │
│  │  │ crash-management/         │  │ computeLogDiffActivity            │  │ │
│  │  │   client-service.ts       │  │ applyLogDiffActivity              │  │ │
│  │  │   server-service.ts       │  │ (Knex local + IPFS remote)        │  │ │
│  │  └───────────────────────────┘  └──────────────────────────────────┘  │ │
│  │  ┌───────────────────────────┐  ┌──────────────────────────────────┐  │ │
│  │  │ Rollback Activities        │  │ Bridge Activities                 │  │ │
│  │  │ Stage1RollbackStrategy     │  │ lockAsset / unlockAsset           │  │ │
│  │  │ Stage2RollbackStrategy     │  │ mintAsset / burnAsset             │  │ │
│  │  │ Stage3RollbackStrategy     │  └──────────────────────────────────┘  │ │
│  │  └───────────────────────────┘                                         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
         │                                        │
   Temporal Server (PostgreSQL)             Peer SATP Gateway
   - Immutable event history                - ConnectRPC CrashRecoveryService
   - Workflow state (queryable)               receives RECOVER / ROLLBACK messages
   - Scheduled heartbeat monitor             and signals the running workflow
```

### 3.2 Workflow Hierarchy per Transfer

```
SatpTransferWorkflow {sessionId}                     [1 per transfer]
│
├── writeLogEntry(init-transfer-proposal)            ← draft §3: write before step
├── sendTransferProposalRequest
├── writeLogEntry(ack-transfer-proposal)             ← draft §3: write after step
│   ... (Stage 0 continues similarly)
│
├── writeLogEntry(init-lock-assertion)               ← draft §3.2 Fig.2 step 2
├── sendLockAssertionMessage                         ← compensations.push(rollbackLock)
├── writeLogEntry(ack-lock-assertion)                ← draft §3.2 Fig.2 step 9
│
├── sendCommitPreparationMessage                     ← compensations.push(rollbackCommit)
├── sendCommitReadyMessage                           ← POINT OF NO RETURN
│                                                      (§5.2.3 step 7)
│
├── sendCommitFinalAssertionMessage   \
├── sendAssignmentAssertionMessage     │  irrevocable on-chain; no compensation
├── sendAcknowledgeCommitmentMessage  /
└── writeLogEntry(done-transfer)
│
└── on any error before PoNR ──▶ CrashRecoveryChildWorkflow {sessionId}
                                      │
                                      ├── sendRecoverMessage            (§5.3.1)
                                      ├── receiveRecoverUpdateMessage   (§5.3.2)
                                      ├── computeLogDiff + applyLogDiff (§3 API)
                                      ├── sendRecoverUpdateAckMessage   (§5.3.3)
                                      ├── receiveRecoverSuccessMessage  (§5.3.3)
                                      │       ─ logs consistent  → resume main
                                      │       ─ inconsistency    → rollback
                                      └── [on rollback]
                                            compensations (reverse order)
                                            sendRollbackMessage         (§5.3.4)
                                            receiveRollbackAckMessage   (§5.3.5)
```

### 3.3 Self-Healing Recovery Sequence (draft §5.4.2)

G1 crashes after issuing a command. G2 detects the silence via timeout and
signals the Temporal workflow. G1's worker reconnects and the workflow replays:

```
G1 (crashed, restarting)    Temporal Server       G2 (server, live)
        │                         │                       │
        │  *** crash ***          │                       │
        │                         │◀── G2 timeout ────────│
        │                         │    signals satp.recover(payload)
        │                         │                       │
        │  (G1 worker reconnects) │                       │
        │◀── event replay ────────│                       │
        │    (to last checkpoint) │                       │
        │                         │                       │
        │── CrashRecoveryChildWorkflow starts             │
        │                         │                       │
        │── RECOVER ──────────────┼──────────────────────▶│  (§5.3.1)
        │                         │    [G2 calls getLogEntry on Log API]
        │◀─ RECOVER-UPDATE ───────┼───────────────────────│  (§5.3.2, log diff)
        │                         │                       │
        │── applyLogDiff ─────────┼──▶ Log API write      │
        │                         │                       │
        │── RECOVER-UPDATE-ACK ───┼──────────────────────▶│  (§5.3.3)
        │◀─ RECOVER-SUCCESS ──────┼───────────────────────│  (§5.3.3)
        │                         │                       │
        │── [resume normal protocol from corrected step]  │
```

### 3.4 Rollback After Counterparty Crash (draft §5.4.3)

G1 crashes mid-Stage 2. G2 times out, executes its local rollback, writes the
rollback log entries. G1 recovers, receives the log diff (which contains the
rollback entries), detects G2 already rolled back, and mirrors the rollback:

```
G1 (crashed)                Temporal Server       G2 (server, live)
        │                         │                       │
        │  *** crash at Stage 2 **│                       │
        │                         │◀── G2 timeout ────────│
        │                         │                       │── writeLogEntry(exec-rollback)
        │                         │                       │── [execute Stage2 rollback]
        │                         │                       │── writeLogEntry(done-rollback)
        │                         │                       │── writeLogEntry(ack-rollback)
        │                         │                       │
        │  (G1 recovers)          │                       │
        │◀── event replay ────────│                       │
        │                         │                       │
        │── RECOVER ──────────────┼──────────────────────▶│  (§5.3.1)
        │◀─ RECOVER-UPDATE ───────┼───────────────────────│  (diff includes rollback entries)
        │── applyLogDiff          │                       │
        │   [G1 detects G2 already rolled back]           │
        │── [G1 runs own rollback activities]             │
        │── ROLLBACK ─────────────┼──────────────────────▶│  (§5.3.4)
        │◀─ ROLLBACK-ACK ─────────┼───────────────────────│  (§5.3.5)
        │── session marked ABORTED│                       │
```

### 3.5 Primary-Backup Hand-off (draft §6.1)

```
G1_backup (backup)          Temporal Server       G2 (server, live)
        │                         │                       │
        │  [heartbeat monitor     │                       │
        │   detects G1_primary    │                       │
        │   is silent > timeout]  │                       │
        │                         │                       │
        │── BackupGatewayPromotionChildWorkflow starts    │
        │   validateX509CertChain()                       │
        │   verifyBackupHashInPrimaryExtensions()         │
        │                         │                       │
        │── signal(satp-transfer-{sessionId},             │
        │          backupTakeoverSignal,                  │
        │          { newBasePath, newPubKey })             │
        │                         │                       │
        │◀── workflow applies signal:                     │
        │    sourceBasePath/pubKey updated                │
        │                         │                       │
        │── CrashRecoveryChildWorkflow starts             │
        │   (isBackup=true, newIdentityPubKey)            │
        │── RECOVER ──────────────┼──────────────────────▶│  (§5.3.1)
        │   ... standard recovery flow ...
```

### 3.6 Integration With Existing Code

The existing handlers and strategies are **not deleted** — they become activity
implementations:

```
Temporal activity: sendLockAssertionMessage
  └── calls: Stage1Handler.handleLockAssertionMessage()

Temporal activity: rollbackLockAssertion
  └── calls: Stage1RollbackStrategy.execute(session, role)

Temporal activity: writeLogEntryActivity
  └── calls: KnexLocalLogRepository.writeLogEntry()   [private log §3.3]
             IPFSRemoteLogRepository.writeLogEntry()  [public decentralized §3.3]
```

The ConnectRPC `CrashRecoveryHandler` endpoints remain on the wire. Internally
they translate incoming RECOVER/ROLLBACK messages into Temporal Signals and
return immediately — eliminating polling loops and race conditions:

```typescript
// CrashRecoveryHandler.recoverImplementation()
async recoverImplementation(req: RecoverRequest): Promise<RecoverResponse> {
  await temporalClient.workflow.signal(
    `satp-transfer-${req.sessionId}`,
    recoverSignal,
    { sequenceNumber: req.sequenceNumber, lastLogTimestamp: req.lastLogEntryTimestamp },
  );
  // Response will be sent back by the CrashRecoveryChildWorkflow activity
  return { sessionId: req.sessionId, success: true };
}
```

### 3.7 Temporal Server Deployment

Production: self-hosted Temporal Server (PostgreSQL) or Temporal Cloud.
Development / CI: `@temporalio/testing` embedded server — no Docker required
(see §6 Test Tooling). The compose topology for development is defined in §5.

---

## 4. Proto Changes — Sub-protocol 1: Crash Recovery

### 4.1 Current state and gaps

`src/main/proto/cacti/satp/v13/service/crash_recovery.proto` currently defines
`CrashRecoveryService` with three RPCs:

```
Recover / RecoverSuccess / Rollback
```

Gaps relative to the IETF draft:

| Gap | Draft reference |
|---|---|
| No `RECOVER-UPDATE` RPC or message | §5.3.2 |
| `RECOVER-UPDATE-ACK` not present; its intent is fused into `RecoverSuccessRequest` | §5.3.3 |
| No `context_id` field on `RecoverRequest`, `RecoverSuccessRequest` | §5.3.1, §5.3.3 |
| `PersistLogEntry` does not model the §4 `LogEntry` format | §4 |
| No `LogDiff` type (the set of entries the non-crashed gateway sends back) | §5.3.2 |
| No `LogOperation` lifecycle enum (`init/exec/done/ack/fail`) | §4 §4.1 |
| No `LogStorageMode` enum (`public-decentralized`, etc.) | §3.3 |
| Both sub-protocols share one service, preventing independent Temporal routing | design |

### 4.2 New `LogEntry` message (draft §4)

Add to a new shared file `src/main/proto/cacti/satp/v13/common/crash_recovery_log.proto`:

```protobuf
// draft-belchior-satp-gateway-recovery-04 §4
message LogEntry {
  string version               = 1;   // REQUIRED — log format version
  string session_id            = 2;   // REQUIRED — SATP session identifier
  string context_id            = 3;   // REQUIRED — transfer context (§5.3.1)
  int64  sequence_number       = 4;   // REQUIRED — monotonically increasing
  string satp_phase            = 5;   // REQUIRED — e.g. "transfer-initiation"
  string resource_url          = 6;   // OPTIONAL — DLT resource URL
  string developer_urn         = 7;   // OPTIONAL — developer URN
  string action_response       = 8;   // OPTIONAL — SATP action or response
  string credential_profile    = 9;   // OPTIONAL
  string credential_block      = 10;  // OPTIONAL — base64-encoded credential
  string payload_profile       = 11;  // OPTIONAL
  string application_profile   = 12;  // OPTIONAL
  bytes  payload               = 13;  // OPTIONAL — raw payload
  string payload_hash          = 14;  // OPTIONAL — SHA-256 of payload
  int64  timestamp             = 15;  // REQUIRED — Unix epoch ms
  string origin_gateway_pubkey     = 16; // REQUIRED
  string origin_gateway_system_id  = 17; // REQUIRED
  string dest_gateway_pubkey       = 18; // REQUIRED
  string dest_gateway_system_id    = 19; // REQUIRED
  string logging_profile       = 20;  // OPTIONAL — see §3.3
  string message_signature     = 21;  // REQUIRED — JWS of this entry
  string last_entry_hash       = 22;  // REQUIRED — hash of previous LogEntry
  string access_control_profile = 23; // OPTIONAL
  LogOperation operation       = 24;  // REQUIRED — lifecycle state
  string recovery_message      = 25;  // OPTIONAL — only in recovery entries
  string recovery_payload      = 26;  // OPTIONAL — only in recovery entries
}

// draft §4.1 — lifecycle of a single operation
enum LogOperation {
  LOG_OPERATION_UNSPECIFIED = 0;
  LOG_OPERATION_INIT        = 1;  // "init"
  LOG_OPERATION_EXEC        = 2;  // "exec"
  LOG_OPERATION_DONE        = 3;  // "done"
  LOG_OPERATION_ACK         = 4;  // "ack"
  LOG_OPERATION_FAIL        = 5;  // "fail"
}

// draft §3.3 — log storage topology
enum LogStorageMode {
  LOG_STORAGE_MODE_UNSPECIFIED           = 0;
  LOG_STORAGE_MODE_PUBLIC_DECENTRALIZED  = 1;
  LOG_STORAGE_MODE_PUBLIC_CENTRALIZED    = 2;
  LOG_STORAGE_MODE_PRIVATE_CENTRALIZED   = 3;
  LOG_STORAGE_MODE_PRIVATE_DECENTRALIZED = 4;
}

// Used in RECOVER-UPDATE (§5.3.2) — the set of entries added after the
// crashed gateway's last known sequence number
message LogDiff {
  int64             from_sequence_number = 1; // exclusive lower bound
  int64             to_sequence_number   = 2; // inclusive upper bound
  repeated LogEntry entries              = 3;
}
```

### 4.3 New service: `CrashRecoverySubProtocolService`

Add to a new file `src/main/proto/cacti/satp/v13/service/crash_recovery_subprotocol.proto`.

Both gateways expose this service; each acts as client or server depending on
role at runtime.

```protobuf
// Separate service for crash-recovery (backup) sub-protocol — §5.3.1–5.3.3
service CrashRecoverySubProtocolService {
  // Step 1 — crashed gateway → non-crashed
  rpc Recover(RecoverV2Request) returns (RecoverV2Response);

  // Step 2 — non-crashed gateway → crashed (sends log diff)
  rpc RecoverUpdate(RecoverUpdateRequest) returns (RecoverUpdateResponse);

  // Step 3 — crashed gateway → non-crashed (acknowledges log update)
  rpc RecoverUpdateAck(RecoverUpdateAckRequest) returns (RecoverUpdateAckResponse);

  // Step 4 — non-crashed gateway → crashed (final confirmation)
  rpc RecoverSuccess(RecoverSuccessV2Request) returns (RecoverSuccessV2Response);
}
```

> **Naming note**: The `V2` suffix distinguishes the new messages from the
> existing `RecoverRequest` / `RecoverSuccessRequest` until the legacy service
> is removed (Phase 3 of §9 Transition Path).

#### Message definitions

```protobuf
// RECOVER (§5.3.1) — sent by crashed gateway
message RecoverV2Request {
  string session_id              = 1;  // REQUIRED
  string context_id              = 2;  // REQUIRED — added vs current proto
  string message_type            = 3;  // MSG_TYPE URN
  string satp_phase              = 4;
  int64  sequence_number         = 5;
  bool   is_backup               = 6;  // true if primary-backup model §6.1
  string new_identity_public_key = 7;  // non-empty if is_backup=true
  int64  last_entry_timestamp    = 8;  // Unix epoch ms of last known entry
  string sender_signature        = 9;
}

message RecoverV2Response {
  string session_id       = 1;
  bool   received         = 2;
  string server_signature = 3;
}

// RECOVER-UPDATE (§5.3.2) — sent by non-crashed gateway after log reconciliation
message RecoverUpdateRequest {
  string  session_id           = 1;
  string  context_id           = 2;
  string  message_type         = 3;
  string  hash_recover_message = 4;  // SHA-256 of the RECOVER message
  LogDiff recovered_logs       = 5;  // set of entries since last known seq
  string  sender_signature     = 6;
}

message RecoverUpdateResponse {
  string session_id       = 1;
  bool   received         = 2;
  string server_signature = 3;
}

// RECOVER-UPDATE-ACK (§5.3.3) — sent by crashed gateway after applying diff
message RecoverUpdateAckRequest {
  string session_id                  = 1;
  string context_id                  = 2;
  string message_type                = 3;
  string hash_recover_update_message = 4;
  bool   success                     = 5;
  string sender_signature            = 6;
}

message RecoverUpdateAckResponse {
  string session_id       = 1;
  bool   received         = 2;
  string server_signature = 3;
}

// RECOVER-SUCCESS (§5.3.3) — sent by non-crashed gateway as final step
message RecoverSuccessV2Request {
  string          session_id                  = 1;
  string          context_id                  = 2;
  string          message_type                = 3;
  string          hash_recover_update_message = 4;
  bool            success                     = 5;
  repeated string entries_changed             = 6;
  string          sender_signature            = 7;
}

message RecoverSuccessV2Response {
  string session_id       = 1;
  bool   received         = 2;
  string server_signature = 3;
}
```

---

## 5. Proto Changes — Sub-protocol 2: Rollback

### 5.1 Current state and gaps

The existing `Rollback` / `RollbackResponse` messages are usable but incomplete:

| Gap | Draft reference |
|---|---|
| No `context_id` field on either message | §5.3.4, §5.3.5 |
| `proofs` is `repeated string` — should be typed `RollbackProof` | §5.3.4 |
| No distinct ROLLBACK-ACK message type (response reuses request fields) | §5.3.5 |
| Mixed into the crash recovery service instead of a separate service | design |

### 5.2 New service: `RollbackSubProtocolService`

Add to a new file `src/main/proto/cacti/satp/v13/service/rollback_subprotocol.proto`.

```protobuf
// Separate service for rollback (non-crashed gateway) sub-protocol — §5.3.4–5.3.5
service RollbackSubProtocolService {
  // Step 1 — non-crashed gateway notifies the other party it has rolled back
  rpc Rollback(RollbackV2Request) returns (RollbackV2Response);

  // Step 2 — recipient acknowledges the rollback notification
  rpc RollbackAck(RollbackAckRequest) returns (RollbackAckResponse);
}
```

#### Message definitions

```protobuf
// A single atomic action executed during rollback, with optional on-chain proof
message RollbackProof {
  string action     = 1;  // e.g. "unlock-asset", "burn-asset", "mint-revert"
  string stage      = 2;  // SATPStage at which the action occurred
  string proof_hash = 3;  // hash of on-chain evidence, if available
  string tx_id      = 4;  // optional DLT transaction identifier
  int64  timestamp  = 5;
}

// ROLLBACK (§5.3.4) — non-crashed gateway announces rollback completion
message RollbackV2Request {
  string                session_id        = 1;
  string                context_id        = 2;  // ADDED
  string                message_type      = 3;
  bool                  success           = 4;
  repeated string       actions_performed = 5;  // human-readable summary
  repeated RollbackProof proofs           = 6;  // typed — replaces repeated string
  string                sender_signature  = 7;
}

message RollbackV2Response {
  string session_id       = 1;
  bool   received         = 2;
  string server_signature = 3;
}

// ROLLBACK-ACK (§5.3.5) — peer confirms it received the rollback
message RollbackAckRequest {
  string                session_id        = 1;
  string                context_id        = 2;
  string                message_type      = 3;
  bool                  success           = 4;
  repeated string       actions_performed = 5;
  repeated RollbackProof proofs           = 6;
  string                sender_signature  = 7;
}

message RollbackAckResponse {
  string session_id       = 1;
  bool   received         = 2;
  string server_signature = 3;
}
```

### 5.3 Retain `RollbackState` and `RollbackLogEntry`

`RollbackState` and `RollbackLogEntry` are used internally by the
`Stage*RollbackStrategy` classes and MUST NOT be removed. They are not wire
messages and are orthogonal to the sub-protocol definitions above.

---

## 6. Temporal Dependencies — Docker / Compose / Infra

### 6.1 Current `docker-compose-satp.yml` topology

```
satp-hermes-gateway ──depends_on──▶ otel-lgtm
```

### 6.2 Target topology

```
satp-hermes-gateway ──depends_on──▶ otel-lgtm
                    ──depends_on──▶ temporal
temporal            ──depends_on──▶ postgres
```

### 6.3 Services to add

#### PostgreSQL — Temporal's persistent store

```yaml
  postgres:
    image: postgres:16-alpine
    container_name: satp-temporal-postgres
    environment:
      POSTGRES_PASSWORD: temporal
      POSTGRES_USER: temporal
      POSTGRES_DB: temporal
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U temporal"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
```

#### Temporal server (auto-setup image)

`temporalio/auto-setup` runs the Temporal server, schema migration, and default
namespace creation in a single container. Suitable for development and CI;
**not** for production.

```yaml
  temporal:
    image: temporalio/auto-setup:1.27
    container_name: satp-temporal
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - DB=postgres12
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=postgres
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development-sql.yaml
    ports:
      - "7233:7233"    # Temporal frontend gRPC
      - "8233:8233"    # Temporal Web UI
    healthcheck:
      test: ["CMD", "tctl", "--address", "temporal:7233", "cluster", "health"]
      interval: 10s
      timeout: 5s
      retries: 15
    restart: unless-stopped
```

> Pin to a specific patch version (e.g. `1.27.0`) in production compose files.

#### Temporal UI (optional, recommended for development)

```yaml
  temporal-ui:
    image: temporalio/ui:2.34
    container_name: satp-temporal-ui
    depends_on:
      - temporal
    environment:
      TEMPORAL_ADDRESS: temporal:7233
      TEMPORAL_CORS_ORIGINS: "http://localhost:3000"
    ports:
      - "8080:8080"
    restart: unless-stopped
```

### 6.4 `satp-hermes-gateway` environment additions

```yaml
      TEMPORAL_ADDRESS: temporal:7233
      TEMPORAL_NAMESPACE: satp-recovery
      TEMPORAL_TASK_QUEUE: satp-crash-recovery
```

The gateway reads these via `process.env` and passes them to
`@temporalio/client`'s `Connection.connect({ address })` and
`WorkflowClient({ namespace })`.

### 6.5 `satp-hermes-gateway` `depends_on` update

```yaml
    depends_on:
      - otel-lgtm
      - temporal
```

### 6.6 Add Temporal `package.json` dependencies

Add to `packages/cactus-plugin-satp-hermes/package.json` `dependencies`:

| Package | Purpose |
|---|---|
| `@temporalio/client` | Scheduling and querying workflows |
| `@temporalio/worker` | Running workflow and activity workers |
| `@temporalio/workflow` | Workflow sandbox definitions |
| `@temporalio/activity` | Activity context and heartbeat helpers |

Add `@temporalio/testing` under `devDependencies` (test-only embedded server).

**Minimum version**: `1.11.x` — required for native OTel tracing with
`@temporalio/interceptors-opentelemetry`.

Run `yarn install` from the monorepo root after editing `package.json`.

---

## 7. Temporal Support in Test Ledgers

### 7.1 Why a dedicated test helper

Integration tests for crash-recovery workflows need a Temporal server with
controllable time (to drive timeouts and crashed heartbeats). The
`@temporalio/testing` package ships an **embedded Temporal test server** that:

- runs in-process — no Docker dependency in unit/integration tests
- supports `TestWorkflowEnvironment.sleep()` for fake-time advancement
- enables signal injection and `getHandle()` without external connectivity

The helper follows the same pattern as `PostgresTestContainer` in
`cactus-test-tooling`, using the embedded server instead of Docker.

### 7.2 New file: `TemporalTestServer`

**Location**:
`packages/cactus-test-tooling/src/main/typescript/temporal/temporal-test-server.ts`

```typescript
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker, type NativeConnection } from "@temporalio/worker";
import { WorkflowClient } from "@temporalio/client";

export interface ITemporalTestServerOptions {
  /** Temporal namespace — defaults to "test" */
  readonly namespace?: string;
  /** Task queue name — defaults to "satp-test" */
  readonly taskQueue?: string;
  readonly logLevel?: LogLevelDesc;
}

export class TemporalTestServer {
  private env: TestWorkflowEnvironment | undefined;

  constructor(public readonly options: ITemporalTestServerOptions = {}) {}

  /** Starts the embedded Temporal test server. Call in Jest `beforeAll`. */
  async start(): Promise<void> {
    this.env = await TestWorkflowEnvironment.createTimeSkipping();
  }

  /** Returns a pre-configured WorkflowClient bound to the embedded server. */
  getWorkflowClient(): WorkflowClient {
    if (!this.env) throw new Error("TemporalTestServer not started");
    return this.env.client;
  }

  /** Returns the native connection (used to create Workers in tests). */
  getNativeConnection(): NativeConnection {
    if (!this.env) throw new Error("TemporalTestServer not started");
    return this.env.nativeConnection;
  }

  /**
   * Advances fake time by `ms` milliseconds.
   * Triggers workflow sleep timers without wall-clock waiting.
   */
  async sleep(ms: number): Promise<void> {
    if (!this.env) throw new Error("TemporalTestServer not started");
    await this.env.sleep(ms);
  }

  /** Stops the embedded server. Call in Jest `afterAll`. */
  async stop(): Promise<void> {
    await this.env?.teardown();
    this.env = undefined;
  }
}
```

### 7.3 Export from `public-api.ts`

Add to `packages/cactus-test-tooling/src/main/typescript/public-api.ts`:

```typescript
export {
  TemporalTestServer,
  type ITemporalTestServerOptions,
} from "./temporal/temporal-test-server";
```

### 7.4 `@temporalio/testing` dependency

Add to `packages/cactus-test-tooling/package.json`:

```json
{
  "peerDependencies": {
    "@temporalio/testing": ">=1.11.0"
  },
  "devDependencies": {
    "@temporalio/testing": "1.11.x"
  }
}
```

### 7.5 Jest integration test pattern

```typescript
import { TemporalTestServer } from "@hyperledger/cactus-test-tooling";
import { Worker as TemporalWorker } from "@temporalio/worker";
import { crashRecoveryWorkflow } from "../../../../../../main/typescript/temporal/workflows";
import * as activities from "../../../../../../main/typescript/temporal/activities";

const TASK_QUEUE = "satp-crash-recovery-test";
let temporalServer: TemporalTestServer;
let worker: TemporalWorker;

beforeAll(async () => {
  temporalServer = new TemporalTestServer({ taskQueue: TASK_QUEUE });
  await temporalServer.start();

  worker = await TemporalWorker.create({
    connection: temporalServer.getNativeConnection(),
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve(
      "../../../../../../main/typescript/temporal/workflows",
    ),
    activities,
  });
  worker.run();
}, 60_000);

afterAll(async () => {
  worker.shutdown();
  await temporalServer.stop();
});

test("crash recovery workflow completes after RECOVER-UPDATE-ACK", async () => {
  const client = temporalServer.getWorkflowClient();
  const handle = await client.start(crashRecoveryWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId: "test-session-001",
    args: [{ sessionId: "test-session-001", contextId: "ctx-001" }],
  });
  await temporalServer.sleep(5_000); // advance past RECOVER_UPDATE_TIMEOUT
  const result = await handle.result();
  expect(result.success).toBe(true);
});
```

---

## 8. File Inventory

### 8.1 New files

| File | Purpose |
|---|---|
| `src/main/proto/cacti/satp/v13/common/crash_recovery_log.proto` | `LogEntry`, `LogDiff`, `LogOperation`, `LogStorageMode` (draft §4) |
| `src/main/proto/cacti/satp/v13/service/crash_recovery_subprotocol.proto` | `CrashRecoverySubProtocolService` + 4 message pairs |
| `src/main/proto/cacti/satp/v13/service/rollback_subprotocol.proto` | `RollbackSubProtocolService` + `RollbackProof`, 2 message pairs |
| `packages/cactus-test-tooling/src/main/typescript/temporal/temporal-test-server.ts` | `TemporalTestServer` class |

### 8.2 Modified files

| File | Change |
|---|---|
| `src/main/proto/cacti/satp/v13/service/crash_recovery.proto` | Keep `RollbackState`, `RollbackLogEntry`; add deprecation comments on `CrashRecoveryService` and `PersistLogEntry`; add import of `crash_recovery_log.proto` |
| `docker-compose-satp.yml` | Add `postgres` and `temporal` services; update `satp-hermes-gateway` `depends_on` and `environment` |
| `packages/cactus-plugin-satp-hermes/package.json` | Add `@temporalio/{client,worker,workflow,activity}` to `dependencies` |
| `packages/cactus-test-tooling/package.json` | Add `@temporalio/testing` to `devDependencies` and `peerDependencies` |
| `packages/cactus-test-tooling/src/main/typescript/public-api.ts` | Export `TemporalTestServer` |

### 8.3 Files that do NOT change

| File | Reason |
|---|---|
| `src/main/typescript/core/crash-management/rollback/stage*-rollback-strategy.ts` | Become Temporal activities by wrapping, not modifying |
| `src/main/typescript/core/crash-management/crash-handler.ts` | Extended to dispatch to Temporal in the workflows phase; structural change deferred |
| `src/main/proto/cacti/satp/v13/session/session.proto` | No change; `recovered_tried` flag and stage fields remain |

---

## 9. Proto Regeneration

After adding the new `.proto` files, regenerate TypeScript bindings:

```bash
cd packages/cactus-plugin-satp-hermes
yarn codegen
```

This runs `buf generate` via the existing `buf.gen.yaml` config and writes
generated files under
`src/main/typescript/generated/proto/cacti/satp/v13/service/`.

Verify these generated files appear:

- `crash_recovery_log_pb.ts`
- `crash_recovery_subprotocol_pb.ts`
- `rollback_subprotocol_pb.ts`
- `crash_recovery_subprotocol_connect.ts`
- `rollback_subprotocol_connect.ts`

---

## 10. Transition Path

### Phase 1 — Additive (this plan)

- New proto files added; existing `crash_recovery.proto` unchanged except for
  deprecation comments.
- New Docker services added; gateway resolves `TEMPORAL_ADDRESS` gracefully
  (warns and proceeds without Temporal if absent).
- `TemporalTestServer` added to `cactus-test-tooling`.

### Phase 2 — Migration

- Temporal workflows implemented (§3 component map).
- `CrashRecoveryHandler` updated to dispatch to Temporal Signals instead of
  calling `CrashRecoveryServerService` directly.
- Integration tests updated to use `TemporalTestServer`.
- Old `CrashRecoveryService` RPCs marked `@deprecated`.

### Phase 3 — Cleanup

- Remove `CrashRecoveryService` `Recover` / `RecoverSuccess` RPCs.
- Remove `PersistLogEntry` message.
- Remove `is_backup = false` hardcoding in `client-service.ts`.

---

## 11. Test Suite

This section defines a comprehensive test suite for the entire Temporal
crash-recovery implementation. It follows the same conventions as the existing
SATP Hermes test suite: separate Jest configs per category, `--runInBand`,
`jest-extended`, `ts-jest`, and the `TemporalTestServer` helper from
`cactus-test-tooling` (§7) instead of Docker for Temporal.

### 11.1 Test Categories and File Locations

| Category | Jest config | `testMatch` glob | Run script |
|---|---|---|---|
| **Unit** | `jest.config-unit.ts` | `**/unit/**/*.test.ts` | `test:unit` |
| **Integration — Temporal workflows** | `jest.config-integration.ts` | `**/integration/crash-recovery/**/*.test.ts` | `test:integration` |
| **Integration — gateway end-to-end** | `jest.config-integration-gateway.ts` | `**/integration/gateway/**/*.test.ts` | `test:integration:gateway` |

Temporal workflow tests use `TemporalTestServer` (embedded, no Docker). The
full gateway end-to-end tests reuse the existing `BesuTestEnvironment` /
`EthereumTestEnvironment` pattern and add a `TemporalTestServer` alongside them.

---

### 11.2 Unit Tests

All unit tests live under `src/test/typescript/unit/` and require no network,
no Docker, and no Temporal server. They use `@bufbuild/protobuf` `create()` to
build message fixtures.

#### 11.2.1 Proto structure tests
**File**: `unit/crash-recovery/crash-recovery-proto-structures.test.ts`

Mirrors the existing `v13-proto-structures.test.ts` pattern:

```typescript
import { create } from "@bufbuild/protobuf";
import {
  LogEntrySchema,
  LogOperation,
  LogStorageMode,
  LogDiffSchema,
} from "../../../main/typescript/generated/proto/cacti/satp/v13/common/crash_recovery_log_pb";
import {
  RecoverV2RequestSchema,
  RecoverUpdateRequestSchema,
  RecoverUpdateAckRequestSchema,
  RecoverSuccessV2RequestSchema,
} from "../../../main/typescript/generated/proto/cacti/satp/v13/service/crash_recovery_subprotocol_pb";
import {
  RollbackV2RequestSchema,
  RollbackAckRequestSchema,
  RollbackProofSchema,
} from "../../../main/typescript/generated/proto/cacti/satp/v13/service/rollback_subprotocol_pb";

describe("CrashRecoverySubProtocol proto structures", () => {
  it("RecoverV2Request has context_id field (was absent before)", () => {
    const msg = create(RecoverV2RequestSchema, {
      sessionId: "s-001",
      contextId: "ctx-001",  // was missing in old RecoverRequest
      satpPhase: "transfer-initiation",
      sequenceNumber: BigInt(3),
      isBackup: false,
      lastEntryTimestamp: BigInt(Date.now()),
      senderSignature: "sig",
    });
    expect(msg.contextId).toBe("ctx-001");
  });

  it("RecoverUpdateRequest carries a non-empty LogDiff", () => {
    const entry = create(LogEntrySchema, {
      sessionId: "s-001",
      contextId: "ctx-001",
      sequenceNumber: BigInt(4),
      operation: LogOperation.LOG_OPERATION_EXEC,
      timestamp: BigInt(Date.now()),
      originGatewayPubkey: "pk-g1",
      destGatewayPubkey: "pk-g2",
    });
    const diff = create(LogDiffSchema, {
      fromSequenceNumber: BigInt(3),
      toSequenceNumber: BigInt(4),
      entries: [entry],
    });
    const msg = create(RecoverUpdateRequestSchema, {
      sessionId: "s-001",
      contextId: "ctx-001",
      hashRecoverMessage: "sha256-abc",
      recoveredLogs: diff,
    });
    expect(msg.recoveredLogs?.entries).toHaveLength(1);
    expect(msg.recoveredLogs?.fromSequenceNumber).toBe(BigInt(3));
  });

  it("LogEntry has all 26 draft §4 fields", () => {
    const entry = create(LogEntrySchema, {
      version: "1.0",
      sessionId: "s-001",
      contextId: "ctx-001",
      sequenceNumber: BigInt(1),
      satpPhase: "transfer-initiation",
      operation: LogOperation.LOG_OPERATION_INIT,
      messageSignature: "jws-sig",
      lastEntryHash: "hash-prev",
      timestamp: BigInt(Date.now()),
      originGatewayPubkey: "pk-g1",
      originGatewaySystemId: "g1-sys",
      destGatewayPubkey: "pk-g2",
      destGatewaySystemId: "g2-sys",
    });
    expect(entry.version).toBe("1.0");
    expect(entry.operation).toBe(LogOperation.LOG_OPERATION_INIT);
  });

  it("RollbackProof uses typed fields instead of raw string", () => {
    const proof = create(RollbackProofSchema, {
      action: "unlock-asset",
      stage: "STAGE_1",
      proofHash: "sha256-xyz",
      txId: "besu-tx-0xabc",
      timestamp: BigInt(Date.now()),
    });
    expect(proof.action).toBe("unlock-asset");
    expect(proof.txId).toBe("besu-tx-0xabc");
  });

  it("LogOperation enum covers all 5 draft §4.1 lifecycle values", () => {
    expect(LogOperation.LOG_OPERATION_INIT).toBeDefined();
    expect(LogOperation.LOG_OPERATION_EXEC).toBeDefined();
    expect(LogOperation.LOG_OPERATION_DONE).toBeDefined();
    expect(LogOperation.LOG_OPERATION_ACK).toBeDefined();
    expect(LogOperation.LOG_OPERATION_FAIL).toBeDefined();
  });

  it("LogStorageMode enum covers all 4 draft §3.3 topologies", () => {
    expect(LogStorageMode.LOG_STORAGE_MODE_PUBLIC_DECENTRALIZED).toBeDefined();
    expect(LogStorageMode.LOG_STORAGE_MODE_PUBLIC_CENTRALIZED).toBeDefined();
    expect(LogStorageMode.LOG_STORAGE_MODE_PRIVATE_CENTRALIZED).toBeDefined();
    expect(LogStorageMode.LOG_STORAGE_MODE_PRIVATE_DECENTRALIZED).toBeDefined();
  });
});
```

#### 11.2.2 `validateSatpEnableCrashRecovery` update
**File**: `unit/config-validating-functions/validate-satp-enable-crash-recovery.test.ts`

The existing test asserts that `enableCrashRecovery: true` throws. Once
Temporal is wired in, that guard is lifted. Add a new `describe` block:

```typescript
describe("validateSatpEnableCrashRecovery — Temporal enabled", () => {
  it("passes when flag is true AND temporal address is provided", () => {
    const result = validateSatpEnableCrashRecovery({
      configValue: true,
      temporalAddress: "temporal:7233",
    });
    expect(result).toBe(true);
  });

  it("throws when flag is true but no temporal address", () => {
    expect(() =>
      validateSatpEnableCrashRecovery({ configValue: true }),
    ).toThrow("TEMPORAL_ADDRESS must be set");
  });
});
```

#### 11.2.3 Rollback strategy unit tests (unchanged, verified still pass)
**File**: `unit/crash-recovery/stage-rollback-strategies.test.ts`

These verify that the four `Stage*RollbackStrategy` classes produce a
`RollbackState` with correct `status` and `rollbackLogEntries` when given a
mock `SATPSession`. Since the strategies are not modified (they become Temporal
activities by wrapping), these tests serve as the **activity contract** — they
must keep passing throughout the migration.

```typescript
import { Stage1RollbackStrategy } from "../../../../main/typescript/core/crash-management/rollback/stage1-rollback-strategy";
import { create } from "@bufbuild/protobuf";
import { SessionDataSchema, Type } from "../../../../main/typescript/generated/proto/cacti/satp/v13/session/session_pb";

describe("Stage1RollbackStrategy", () => {
  it("returns COMPLETED status when client-side rollback succeeds", async () => {
    const mockSession = buildMockSession(Type.CLIENT);
    const strategy = new Stage1RollbackStrategy(mockLog, mockMonitor);
    const state = await strategy.execute(mockSession, Type.CLIENT);
    expect(state.status).toBe("COMPLETED");
  });

  it("returns FAILED when an unlock call throws", async () => {
    const mockSession = buildFailingMockSession(Type.CLIENT);
    const strategy = new Stage1RollbackStrategy(mockLog, mockMonitor);
    const state = await strategy.execute(mockSession, Type.CLIENT);
    expect(state.status).toBe("FAILED");
  });
});
```

---

### 11.3 Integration Tests — Temporal Workflow Behaviour

These tests use `TemporalTestServer` (embedded, time-skipping). They run under
`jest.config-integration.ts` with `--runInBand` (`testTimeout: 60 * 60 * 1000`).

Directory: `src/test/typescript/integration/crash-recovery/`

#### 11.3.1 `CrashRecoveryChildWorkflow` — happy path
**File**: `integration/crash-recovery/crash-recovery-workflow-happy.test.ts`

```typescript
import { TemporalTestServer } from "@hyperledger/cactus-test-tooling";
import { Worker } from "@temporalio/worker";
import { crashRecoveryWorkflow } from "../../../../main/typescript/temporal/workflows/crash-recovery-workflow";
import * as activities from "../../../../main/typescript/temporal/activities";

const TASK_QUEUE = "test-crash-recovery";
let server: TemporalTestServer;
let worker: Worker;

beforeAll(async () => {
  server = new TemporalTestServer({ taskQueue: TASK_QUEUE });
  await server.start();
  worker = await Worker.create({
    connection: server.getNativeConnection(),
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve(
      "../../../../main/typescript/temporal/workflows/crash-recovery-workflow",
    ),
    activities,
  });
  worker.run();
}, 60_000);

afterAll(async () => {
  worker.shutdown();
  await server.stop();
});

test("happy path: RECOVER → RECOVER-UPDATE → RECOVER-UPDATE-ACK → RECOVER-SUCCESS", async () => {
  const client = server.getWorkflowClient();
  const handle = await client.start(crashRecoveryWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId: "cr-happy-001",
    args: [{ sessionId: "cr-happy-001", contextId: "ctx-001", lastSequenceNumber: 3n }],
  });

  const result = await handle.result();
  expect(result.success).toBe(true);
  expect(result.entriesApplied).toBeGreaterThan(0);
});
```

#### 11.3.2 `CrashRecoveryChildWorkflow` — timeout / no response
**File**: `integration/crash-recovery/crash-recovery-workflow-timeout.test.ts`

Uses `server.sleep()` to advance fake time past `RECOVER_UPDATE_TIMEOUT` before
the counterparty sends `RECOVER-UPDATE`. Verifies the workflow transitions to
rollback rather than hanging.

```typescript
test("times out waiting for RECOVER-UPDATE and triggers rollback", async () => {
  const client = server.getWorkflowClient();
  const handle = await client.start(crashRecoveryWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId: "cr-timeout-001",
    args: [{ sessionId: "cr-timeout-001", contextId: "ctx-002",
             lastSequenceNumber: 2n, recoverUpdateTimeoutMs: 3_000 }],
  });

  // Advance time past RECOVER-UPDATE timeout without sending the signal
  await server.sleep(5_000);

  await expect(handle.result()).rejects.toThrow("SessionTimeoutError");
});
```

#### 11.3.3 `CrashRecoveryChildWorkflow` — signal injection
**File**: `integration/crash-recovery/crash-recovery-workflow-signals.test.ts`

Verifies that sending a `recoverUpdateSignal` after workflow start unblocks the
`condition()` and the workflow proceeds.

```typescript
test("RECOVER-UPDATE signal unblocks waiting condition", async () => {
  const handle = await client.start(crashRecoveryWorkflow, {
    workflowId: "cr-signal-001",
    taskQueue: TASK_QUEUE,
    args: [{ sessionId: "cr-signal-001", contextId: "ctx-003",
             lastSequenceNumber: 1n, recoverUpdateTimeoutMs: 30_000 }],
  });

  // Simulate counterparty sending the log diff
  await handle.signal("satp.recoverUpdate", {
    hashRecoverMessage: "sha256-abc",
    logDiff: { fromSequenceNumber: 1n, toSequenceNumber: 3n, entries: [] },
  });
  await server.sleep(100);

  const result = await handle.result();
  expect(result.success).toBe(true);
});
```

#### 11.3.4 `RollbackSubProtocolWorkflow` — happy path
**File**: `integration/crash-recovery/rollback-workflow-happy.test.ts`

Mirrors the crash recovery happy-path test for the non-crashed gateway side:
ROLLBACK → ROLLBACK-ACK. Uses the `Stage1RollbackStrategy` wrapped as an
activity, verifying that `actionsPerformed` and `proofs` are populated.

```typescript
test("rollback workflow emits ROLLBACK with typed RollbackProofs", async () => {
  const handle = await client.start(rollbackSubProtocolWorkflow, {
    workflowId: "rb-happy-001",
    taskQueue: TASK_QUEUE,
    args: [{ sessionId: "rb-happy-001", contextId: "ctx-rb-001",
             crashedStage: "STAGE_1", role: "CLIENT" }],
  });
  const result = await handle.result();
  expect(result.success).toBe(true);
  expect(result.proofs.length).toBeGreaterThan(0);
  expect(result.proofs[0].action).toBeTruthy();
  expect(result.proofs[0].txId).toBeTruthy();
});
```

#### 11.3.5 `RollbackSubProtocolWorkflow` — past point of no return
**File**: `integration/crash-recovery/rollback-workflow-ponr.test.ts`

Verifies that a rollback request arriving after Stage 2 commit-ready is
rejected with a `PointOfNoReturnViolation` error (non-retryable per §2.2
`networkRetryPolicy`).

```typescript
test("rollback after PoNR throws PointOfNoReturnViolation", async () => {
  const handle = await client.start(rollbackSubProtocolWorkflow, {
    workflowId: "rb-ponr-001",
    taskQueue: TASK_QUEUE,
    args: [{ sessionId: "rb-ponr-001", contextId: "ctx-rb-ponr",
             crashedStage: "STAGE_3", role: "SERVER" }],
  });
  await expect(handle.result()).rejects.toThrow("PointOfNoReturnViolation");
});
```

#### 11.3.6 Primary-backup handover
**File**: `integration/crash-recovery/backup-gateway-promotion.test.ts`

Sends a `backupTakeoverSignal` to a running `SatpTransferWorkflow` and verifies
that `sourceBasePath` and `sourcePubKey` are updated in the session state query.

```typescript
test("backupTakeoverSignal updates session identity before recovery starts", async () => {
  const handle = await client.start(satpTransferWorkflow, {
    workflowId: "bkp-001",
    taskQueue: TASK_QUEUE,
    args: [{ sessionId: "bkp-001", contextId: "ctx-bkp" }],
  });

  await handle.signal("satp.backup-takeover", {
    newBasePath: "https://backup-gateway:3011",
    newPubKey: "pk-backup",
  });

  const state = await handle.query("satp.sessionState");
  expect(state.sourceBasePath).toBe("https://backup-gateway:3011");
  expect(state.sourcePubKey).toBe("pk-backup");
});
```

#### 11.3.7 Saga compensation — compensations run in reverse on failure
**File**: `integration/crash-recovery/saga-compensation.test.ts`

Injects a failure after Stage 1 lock assertion and verifies:
1. Compensations execute in reverse order (Stage 1 rollback before Stage 0 rollback).
2. `ROLLBACK` message is emitted with `actionsPerformed` entries.
3. Session ends in `ABORTED` state (queryable via Temporal Query).

```typescript
test("saga compensations fire in reverse order on Stage 2 failure", async () => {
  const handle = await client.start(satpTransferWorkflow, {
    workflowId: "saga-001",
    taskQueue: TASK_QUEUE,
    args: [{ sessionId: "saga-001", contextId: "ctx-saga",
             injectFailureAtStage: "STAGE_2_COMMIT_PREPARE" }],
  });

  await expect(handle.result()).rejects.toThrow();
  const state = await handle.query("satp.sessionState");
  expect(state.status).toBe("ABORTED");

  const rollbackLog = await handle.query("satp.rollbackLog");
  expect(rollbackLog[0].stage).toBe("STAGE_1");  // stage 1 rolled back first
});
```

---

### 11.4 Integration Tests — Gateway End-to-End with Temporal

These tests extend the existing `satp-e2e-transfer-2-gateways.test.ts` pattern.
They require Docker for the DLT test ledgers (`BesuTestEnvironment`,
`EthereumTestEnvironment`) and use `TemporalTestServer` for Temporal (embedded,
no additional Docker compose).

Dir: `src/test/typescript/integration/gateway/`  
Jest config: `jest.config-integration-gateway.ts`  
Timeout: 15 minutes (`TIMEOUT = 900_000`)

#### 11.4.1 Crash recovery end-to-end across two gateways
**File**: `integration/gateway/satp-e2e-crash-recovery-2-gateways.test.ts`

```
G1 (client, Fabric → Besu)   Temporal   G2 (server)
```

Setup:
1. Start `BesuTestEnvironment` + `EthereumTestEnvironment`.
2. Start `TemporalTestServer` with task queue `"satp-e2e-crash-recovery"`.
3. Create `gateway1` (client role) and `gateway2` (server role) with
   `enableCrashRecovery: true` and `TEMPORAL_ADDRESS` pointing to the embedded
   server's `getNativeConnection()`.
4. Start a transfer via `TransactionApi.transact()` — same helper as the
   existing 2-gateway test.
5. Kill `gateway1` mid-Stage 2 by calling `gateway1.shutdown()`.
6. Restart `gateway1` (new instance, same config and Knex DB).
7. Assert that `gateway1`'s `SATPGateway` on restart re-attaches the Temporal
   workflow and completes the RECOVER → RECOVER-UPDATE → RECOVER-UPDATE-ACK →
   RECOVER-SUCCESS sequence.
8. Verify the asset has been correctly minted on the target ledger.

```typescript
test("gateway restarts mid-transfer and completes via crash recovery", async () => {
  // ... setup (same pattern as satp-e2e-transfer-2-gateways.test.ts)

  // Start transfer
  const txResult = await transactionApi.transact(getTransactRequest(...));
  expect(txResult.status).toBe(200);

  // Simulate mid-transfer crash of gateway1
  await gateway1.shutdown();

  // Restart gateway1 — Temporal workflow resumes from last checkpoint
  gateway1 = await createGateway(gatewayConfig1);
  await gateway1.start();

  // Wait for recovery to complete (up to 2 minutes)
  await waitForSessionCompletion(gateway1, sessionId, 120_000);

  // Verify final ledger state
  const balance = await ethereumEnv.getBalance(beneficiaryAddress);
  expect(balance).toBeGreaterThan(0);
}, TIMEOUT);
```

#### 11.4.2 Rollback end-to-end across two gateways
**File**: `integration/gateway/satp-e2e-rollback-2-gateways.test.ts`

Same setup as 11.4.1 but instead of restarting `gateway1`, `gateway2` detects
the silence, executes its rollback, and sends `ROLLBACK` → `ROLLBACK-ACK`.

Verification:
- Source asset (Fabric) is unlocked.
- Target asset (Besu/Ethereum) is not minted.
- Both gateway sessions end in state `ABORTED`.
- `ROLLBACK` message written to the Knex remote log contains typed `RollbackProof` entries.

```typescript
test("gateway2 detects G1 silence and rolls back successfully", async () => {
  // ... setup

  await transactionApi.transact(getTransactRequest(...));

  // Kill gateway1 permanently (no restart)
  await gateway1.shutdown();
  gateway1 = undefined;

  // Advance Temporal fake time past Stage-2 deadline to trigger G2 rollback
  await temporalServer.sleep(60_000);

  // G2 should have completed rollback
  const session = await gateway2.getSession(sessionId);
  expect(session.state).toBe("ABORTED");

  // Verify asset was unlocked on source ledger
  const locked = await fabricEnv.isAssetLocked(assetId);
  expect(locked).toBe(false);
}, TIMEOUT);
```

---

### 11.5 `jest.config-integration-crash-recovery.ts`

Add a dedicated Jest config for the new crash-recovery integration tests so
they can be run independently from the gateway e2e suite:

```typescript
// jest.config-integration-crash-recovery.ts
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
  testMatch: [
    "**/src/test/typescript/integration/crash-recovery/**/*.test.ts",
  ],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  reporters: [
    "default",
    ["jest-junit", {
      outputDirectory: "reports/junit",
      outputName: "satp-hermes-tests-integration-crash-recovery.xml",
    }],
  ],
};
```

Add the corresponding `package.json` script:

```json
"test:integration:crash-recovery": "NODE_OPTIONS=--max-old-space-size=4096 npx jest ./src/test/typescript/integration/crash-recovery --runInBand --forceExit --config=jest.config-integration-crash-recovery.ts"
```

---

### 11.6 Test Coverage Matrix

| Feature under test | Test file | Category | Temporal needed | Docker needed |
|---|---|---|---|---|
| `LogEntry` / `LogDiff` / `LogOperation` proto fields | `unit/crash-recovery/crash-recovery-proto-structures.test.ts` | Unit | No | No |
| `RollbackProof` typed fields | `unit/crash-recovery/crash-recovery-proto-structures.test.ts` | Unit | No | No |
| `Stage*RollbackStrategy` unchanged contract | `unit/crash-recovery/stage-rollback-strategies.test.ts` | Unit | No | No |
| `validateSatpEnableCrashRecovery` with Temporal | `unit/config-validating-functions/validate-satp-enable-crash-recovery.test.ts` | Unit | No | No |
| Recovery workflow: happy path (4-step) | `integration/crash-recovery/crash-recovery-workflow-happy.test.ts` | Integration | Embedded | No |
| Recovery workflow: timeout → rollback | `integration/crash-recovery/crash-recovery-workflow-timeout.test.ts` | Integration | Embedded | No |
| Recovery workflow: signal injection | `integration/crash-recovery/crash-recovery-workflow-signals.test.ts` | Integration | Embedded | No |
| Rollback workflow: happy path | `integration/crash-recovery/rollback-workflow-happy.test.ts` | Integration | Embedded | No |
| Rollback workflow: past PoNR | `integration/crash-recovery/rollback-workflow-ponr.test.ts` | Integration | Embedded | No |
| Primary-backup signal updates session identity | `integration/crash-recovery/backup-gateway-promotion.test.ts` | Integration | Embedded | No |
| Saga compensations fire in reverse | `integration/crash-recovery/saga-compensation.test.ts` | Integration | Embedded | No |
| Full crash + recovery across 2 gateways + DLT | `integration/gateway/satp-e2e-crash-recovery-2-gateways.test.ts` | Gateway E2E | Embedded | Yes |
| Full rollback across 2 gateways + DLT | `integration/gateway/satp-e2e-rollback-2-gateways.test.ts` | Gateway E2E | Embedded | Yes |

---

## 12. Open Questions

| # | Question | Impact |
|---|---|---|
| Q1 | Should `CrashRecoverySubProtocolService` and `RollbackSubProtocolService` share one `.proto` file? | Code organisation only; separate files preferred for cleaner `buf` imports |
| Q2 | Should `LogEntry` live in `common/crash_recovery_log.proto` or a new `common/log.proto`? | If log entries are reused for audit trails outside recovery, a standalone `log.proto` is better |
| Q3 | Temporal namespace: shared `satp-recovery` or per-gateway namespace? | Affects multi-gateway test setups |
| Q4 | Should `RollbackProof.proof_hash` reference an on-chain transaction or a signed statement? | Determines the trust model for proof verification |
| Q5 | Which Temporal task queue do the worker and the `satp-hermes-gateway` startup code share in the production compose? | Determines the `TEMPORAL_TASK_QUEUE` env var value |
| Q6 | Should recovery-specific OTel spans be child spans of the initiating `SatpTransferWorkflow` span, or sibling spans under the same `sessionId` trace? | Determines how traces render in Jaeger/Zipkin ||
| Q7 | Should `MonitorService` metrics for `recovery_attempts` and `rollback_count` reset per gateway restart or accumulate across restarts? | Affects monitoring alerting thresholds |

---

## 13. Comprehensive Logging & Tracing

The codebase already ships a full OpenTelemetry (OTel) stack via `MonitorService`
(`services/monitoring/monitor.ts`). All existing crash recovery operations
(`CrashRecoveryHandler`, `CrashRecoveryClientService`, `CrashRecoveryServerService`)
already call `monitorService.startSpan(fnTag)` and propagate the span context with
`context.with(ctx, ...)`. This section specifies how that infrastructure extends
into the Temporal layer and what additional instrumentation is required.

### 13.1 Existing OTel Infrastructure

| Component | File | OTel instrumentation present |
|---|---|---|
| `MonitorService` | `services/monitoring/monitor.ts` | NodeSDK + OTLP trace/metric/log exporters, `startSpan()` helper |
| `SATPLogger` | `core/satp-logger.ts` | Dual-output to `@hyperledger/cactus-common` logger + `MonitorService.createLog()` |
| `CrashRecoveryHandler` | `core/crash-management/crash-handler.ts` | `startSpan` on every public method |
| `CrashRecoveryClientService` | `core/crash-management/client-service.ts` | `startSpan` on `createRecoverRequest`, `createRecoverSuccessRequest`, `createRollbackRequest` |
| `CrashRecoveryServerService` | `core/crash-management/server-service.ts` | `startSpan` on `handleRecover`, `handleRecoverSuccess`, `handleRollback` |
| Stage handlers (0–3) | `core/stage-handlers/stage*-handler.ts` | `startSpan` on each handler method |
| `SATPSession` | `core/satp-session.ts` | `startSpan` on session state transitions |

Exporters default to `http://localhost:4318` (Jaeger / OpenTelemetry Collector)
or the value of `OTEL_EXPORTER_OTLP_ENDPOINT`. All are configurable at gateway
startup via `MonitorServiceOptions`.

### 13.2 Propagating Trace Context Through Temporal

#### 13.2.1 The Problem

Temporal activities run inside a sandboxed Worker process. OTel trace context
created in the main gateway process (e.g., when the ConnectRPC router receives
a RECOVER message) is not automatically visible inside the Temporal Worker.
Without explicit propagation, each activity starts a fresh root span, breaking
the end-to-end trace for a single recovery session.

#### 13.2.2 Solution: Temporal Activity Interceptors + W3C TraceContext

Temporal supports [interceptors](https://docs.temporal.io/develop/typescript/interceptors)
that fire before/after every Activity schedule and execution. Use them to
serialise the active OTel span context into Temporal headers on schedule, and
deserialise + restore on execution:

```typescript
// src/main/typescript/temporal/interceptors/otel-activity-interceptor.ts
import {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  ActivityOutboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { propagation, context as otelContext, ROOT_CONTEXT } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

const propagator = new W3CTraceContextPropagator();

// On the Worker side: extract trace context injected into the Temporal header
export class OtelActivityInboundInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    const carrier: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.headers)) {
      if (v) carrier[k] = Buffer.from(v.data).toString();
    }
    const ctx = propagator.extract(ROOT_CONTEXT, carrier);
    return otelContext.with(ctx, () => next(input));
  }
}

// On the client (workflow-schedule) side: inject active span context into headers
export class OtelActivityOutboundInterceptor
  implements ActivityOutboundCallsInterceptor
{
  scheduleActivity(
    input: ActivityExecuteInput,
    next: Next<ActivityOutboundCallsInterceptor, "scheduleActivity">,
  ) {
    const carrier: Record<string, string> = {};
    propagator.inject(otelContext.active(), carrier);
    const headers = { ...input.headers };
    for (const [k, v] of Object.entries(carrier)) {
      headers[k] = { data: Buffer.from(v) };
    }
    return next({ ...input, headers });
  }
}
```

Register the interceptors in the Worker:

```typescript
const worker = await Worker.create({
  workflowsPath: require.resolve("./workflows"),
  taskQueue: SATP_TASK_QUEUE,
  interceptors: {
    activityInbound: [(ctx) => new OtelActivityInboundInterceptor()],
    activity: [(ctx) => new OtelActivityOutboundInterceptor()],
  },
});
```

With this in place, a RECOVER message received by the ConnectRPC handler creates
a root span with `sessionId` as an attribute. That span context flows through the
Temporal header into the `sendRecoverActivity`, `receiveRecoverUpdateActivity`,
and `sendRecoverSuccessActivity` — all appearing as child spans in the same trace
tree.

#### 13.2.3 Trace Attribute Conventions

Every span in a recovery flow must carry these attributes for cross-signal
correlation:

| Attribute key | Value | Set by |
|---|---|---|
| `satp.session_id` | `sessionData.id` | All crash recovery activities |
| `satp.context_id` | `sessionData.contextId` | All crash recovery activities |
| `satp.recovery_stage` | `"RECOVER"` / `"ROLLBACK"` etc. | Recovery activities |
| `satp.is_backup` | `true` / `false` | `sendRecoverActivity` |
| `satp.sequence_number` | last known sequence number | `sendRecoverActivity` |
| `temporal.workflow_id` | Temporal workflow ID | Activity outbound interceptor |
| `temporal.run_id` | Temporal run ID | Activity outbound interceptor |

Add these via `span.setAttributes(...)` inside each activity's OTel span using
the existing `monitorService.startSpan(fnTag)` pattern.

### 13.3 Crash Recovery Metrics

Extend `MonitorService.init()` with recovery-specific counters and histograms.
These supplement the existing `initiated_transactions` / `failed_transactions`
counters with recovery-granularity visibility:

```typescript
// In MonitorService.init() — add after existing counter registrations:
this.createCounter(
  "crash_recovery_attempts",
  "Total number of crash recovery sub-protocol invocations initiated",
);
this.createCounter(
  "crash_recovery_successes",
  "Total number of crash recoveries completed successfully",
);
this.createCounter(
  "crash_recovery_failures",
  "Total number of crash recoveries that ended in rollback or dispute",
);
this.createCounter(
  "rollback_count",
  "Total number of ROLLBACK sub-protocol invocations",
);
this.createCounter(
  "rollback_ack_count",
  "Total number of ROLLBACK-ACK confirmations received",
);
this.createCounter(
  "backup_gateway_promotions",
  "Total number of primary-backup handovers executed",
);
this.createHistogram(
  "crash_recovery_duration_ms",
  "End-to-end crash recovery sub-protocol duration (RECOVER → RECOVER-SUCCESS)",
  "ms",
);
this.createHistogram(
  "log_diff_entry_count",
  "Number of log entries returned in a RECOVER-UPDATE log diff",
  "entries",
);
this.createHistogram(
  "rollback_duration_ms",
  "Duration of ROLLBACK sub-protocol (ROLLBACK → ROLLBACK-ACK)",
  "ms",
);
```

Usage inside activities (see §14 for activity implementations):

```typescript
// In sendRecoverActivity, on initiating the recovery:
monitorService.incrementCounter("crash_recovery_attempts", 1, {
  "satp.session_id": sessionId,
});

// In receiveRecoverSuccessActivity, on confirmed success:
monitorService.incrementCounter("crash_recovery_successes", 1, {
  "satp.session_id": sessionId,
});
monitorService.recordHistogram("crash_recovery_duration_ms", elapsedMs, {
  "satp.session_id": sessionId,
});
monitorService.recordHistogram("log_diff_entry_count", diff.length, {
  "satp.session_id": sessionId,
});
```

### 13.4 Structured Log Correlation

`ILocalLog` (the Knex log entry) carries `sessionID`, `type`, `operation`, and
`data`. OTel spans carry `satp.session_id` as an attribute. To correlate a
log entry with the span that wrote it:

1. **In `writeLogEntryActivity`**: capture the active span's `traceId` and
   `spanId` from `trace.getActiveSpan()?.spanContext()`, and inject them as
   additional fields in the `data` JSON before persisting:

   ```typescript
   const spanCtx = trace.getActiveSpan()?.spanContext();
   const logData = {
     ...parsedPayload,
     _traceId: spanCtx?.traceId,
     _spanId: spanCtx?.spanId,
   };
   await localLogRepository.create({
     ...entry,
     data: JSON.stringify(logData),
   });
   ```

2. **In `SATPLogger`**: emit an OTel log record for every `info`+ call via
   `logsAPI.logs.getLogger("satp-logger").emit(...)` — this is already done
   by `MonitorService.createLog()`. Ensure `sessionId` is passed as a
   `logsAPI.LogAttributes` field so the log is queryable:

   ```typescript
   monitorService.createLog("info", message, { "satp.session_id": sessionId });
   ```

### 13.5 Temporal UI as a Secondary Trace Vehicle

Temporal's own UI at `http://localhost:8080` provides a timeline of every
Workflow event and Activity execution. While not a substitute for OTel traces,
it is an additional debugging surface:

- **Workflow ID**: `satp-transfer-{sessionId}` — links directly to the session.
- **Activity failure details**: Temporal stores the full stack trace on activity
  failure. This is visible under the workflow's event history without any
  additional instrumentation.
- **Replay debugging**: `Worker.runReplayHistory(workflowHistory)` can be run
  locally with a downloaded history from the Temporal UI for post-mortem analysis
  without restarting Docker services.

---

## 14. Wrapping Existing Crash Recovery Operations in Temporal Activities

The existing `CrashRecoveryHandler`, `CrashRecoveryClientService`, and
`CrashRecoveryServerService` implement all five recovery messages and the
rollback sub-protocol with full OTel instrumentation. **These are not replaced**
by the Temporal implementation — they are **wrapped** inside Temporal Activity
functions so that durable execution, retries, and heartbeating apply on top of
the existing logic.

### 14.1 Operation-to-Activity Mapping

| Existing operation | Class | Temporal Activity name | Direction |
|---|---|---|---|
| `createRecoverRequest(sessionData)` | `CrashRecoveryClientService` | `sendRecoverActivity` | Client (G1 → G2) |
| `handleRecover(req)` | `CrashRecoveryServerService` | `handleRecoverActivity` | Server (G2 processes RECOVER) |
| `createRecoverSuccessRequest(sessionData)` | `CrashRecoveryClientService` | `sendRecoverSuccessActivity` | Client (G1 → G2) |
| `handleRecoverSuccess(req)` | `CrashRecoveryServerService` | `handleRecoverSuccessActivity` | Server (G2 processes RECOVER-SUCCESS) |
| `createRollbackRequest(sessionData, state)` | `CrashRecoveryClientService` | `sendRollbackActivity` | Client (G1 → G2) |
| `handleRollback(req)` | `CrashRecoveryServerService` | `handleRollbackActivity` | Server (G2 processes ROLLBACK) |
| Log diff fetch: `logRepository.fetchLogsFromSequence` | `CrashRecoveryServerService.handleRecover` | `computeLogDiffActivity` | Internal |
| Log diff apply: `localRepository.create` per entry | `writeLogEntryActivity` (§2.2) | `applyLogDiffActivity` | Internal |

### 14.2 ConnectRPC Router as Signal Bridge

The ConnectRPC `CrashRecoveryService` router (`CrashRecoveryHandler.setupRouter`)
remains unchanged as the **network boundary** for incoming recovery messages.
Instead of calling handler logic directly and waiting for a reply, it:

1. Receives the incoming RECOVER / ROLLBACK message.
2. Looks up the Temporal Workflow ID for the session (`satp-transfer-{sessionId}`).
3. Signals the running `SatpTransferWorkflow` using the appropriate signal
   (`recoverSignal`, `rollbackSignal`).
4. Returns `200 OK` immediately — Temporal handles durability.

The signal triggers a `condition()` inside `CrashRecoveryChildWorkflow`, which
then dispatches activities that call back into the existing handler operations:

```
ConnectRPC inbound RECOVER
  └─► CrashRecoveryHandler.setupRouter() → router.service(CrashRecoveryService, ...)
        (unchanged — still validates signature via serverService.handleRecover)
          └─► temporalClient.signal("satp-transfer-{sessionId}", recoverSignal, req)
                └─► SatpTransferWorkflow (condition: pendingRecoverSignal)
                      └─► startChild(CrashRecoveryChildWorkflow, ...)
                            └─► sendRecoverSuccessActivity()
                                  └─► crashRecoveryHandler.sendRecoverSuccessRequest(session)
                                        └─► clientService.createRecoverSuccessRequest(session)
```

### 14.3 Activity Implementations

#### 14.3.1 `sendRecoverActivity`

```typescript
// src/main/typescript/temporal/activities/crash-recovery-activities.ts
import { ApplicationFailure, Context } from "@temporalio/activity";
import type { CrashRecoveryHandler } from "../../core/crash-management/crash-handler";
import type { SessionData } from "../../generated/proto/cacti/satp/v13/session/session_pb";
import type { MonitorService } from "../../services/monitoring/monitor";

export function makeCrashRecoveryActivities(
  handler: CrashRecoveryHandler,
  monitorService: MonitorService,
) {
  return {
    async sendRecoverActivity(sessionData: SessionData): Promise<void> {
      const fnTag = "sendRecoverActivity";
      Context.current().heartbeat({ stage: "sendRecover", sessionId: sessionData.id });
      monitorService.incrementCounter("crash_recovery_attempts", 1, {
        "satp.session_id": sessionData.id,
      });
      try {
        await handler.sendRecoverRequest(sessionData);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendRecoverActivity failed: ${err}`,
          type: "RecoverSendError",
          nonRetryable: false,
        });
      }
    },

    async sendRecoverSuccessActivity(sessionData: SessionData): Promise<void> {
      const fnTag = "sendRecoverSuccessActivity";
      Context.current().heartbeat({ stage: "sendRecoverSuccess", sessionId: sessionData.id });
      try {
        await handler.sendRecoverSuccessRequest(sessionData);
        monitorService.incrementCounter("crash_recovery_successes", 1, {
          "satp.session_id": sessionData.id,
        });
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendRecoverSuccessActivity failed: ${err}`,
          type: "RecoverSuccessSendError",
          nonRetryable: false,
        });
      }
    },

    async sendRollbackActivity(
      sessionData: SessionData,
      rollbackState: import("../../generated/proto/cacti/satp/v13/service/crash_recovery_pb").RollbackState,
    ): Promise<void> {
      Context.current().heartbeat({ stage: "sendRollback", sessionId: sessionData.id });
      monitorService.incrementCounter("rollback_count", 1, {
        "satp.session_id": sessionData.id,
      });
      try {
        await handler.sendRollbackRequest(sessionData, rollbackState);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendRollbackActivity failed: ${err}`,
          type: "RollbackSendError",
          nonRetryable: false,
        });
      }
    },
  };
}
```

> **Pattern**: All activities follow the same structure:
> 1. Heartbeat immediately at the top (so Temporal detects Worker death).
> 2. Increment the appropriate `MonitorService` counter.
> 3. Delegate to the existing `CrashRecoveryHandler` operation.
> 4. Wrap errors in `ApplicationFailure.create(...)` with a typed `type` string so the
>    Workflow can distinguish retryable from non-retryable failures.

#### 14.3.2 Retry Policies for Recovery Activities

Recovery activities use different retry policies from forward-path protocol activities:

```typescript
const crashRecoveryRetryPolicy = {
  startToCloseTimeout: "30s",     // each attempt has 30 s to complete
  scheduleToCloseTimeout: "5m",   // total recovery window before workflow aborts
  backoffCoefficient: 1.5,
  initialInterval: "2s",
  maximumAttempts: 10,
  // RECOVER and ROLLBACK messages are idempotent per session; safe to retry
  nonRetryableErrorTypes: ["SATPAbortError", "SignatureVerificationError"],
};

const { sendRecoverActivity, sendRecoverSuccessActivity, sendRollbackActivity } =
  proxyActivities<ReturnType<typeof makeCrashRecoveryActivities>>(crashRecoveryRetryPolicy);
```

The `scheduleToCloseTimeout` of 5 minutes must be shorter than the remaining
asset-transfer lock timeout (§2.4) so that a stuck recovery triggers rollback
before the lock expires on the ledger.

### 14.4 Server-Side Handler Operations in Temporal Context

Server-side operations (`handleRecover`, `handleRecoverSuccess`, `handleRollback`
in `CrashRecoveryServerService`) are **not** wrapped as Temporal activities —
they run inline inside the ConnectRPC request handler and return a synchronous
response to the calling gateway. The response is then signalled into the
counterparty Temporal workflow.

However, the `RollbackStrategyFactory.executeRollback()` call inside
`handleRollback` — which interacts with ledger bridges — **should** be extracted
into a separate `executeRollbackActivity` with heartbeating and retry, because
ledger interactions can be long-running and are susceptible to Worker crashes:

```typescript
async executeRollbackActivity(
  sessionData: SessionData,
): Promise<RollbackState> {
  const fnTag = "executeRollbackActivity";
  Context.current().heartbeat({ stage: "executeRollback", sessionId: sessionData.id });
  // Delegates to the existing RollbackStrategyFactory:
  const strategy = rollbackStrategyFactory.getStrategy(sessionData);
  const state = await strategy.execute(sessionData);
  monitorService.recordHistogram("rollback_duration_ms", state.durationMs, {
    "satp.session_id": sessionData.id,
  });
  return state;
}
```

### 14.5 Span Composition: Existing Services + Temporal Layer

Because the existing services already call `monitorService.startSpan(fnTag)`,
and Temporal activities restore the parent trace context via the interceptors
in §13.2, the resulting OTel trace tree for a full crash recovery flow looks like:

```
[root trace: sessionId=abc-123]
  │
  ├─ CrashRecoveryHandler#recoverV2MessageImplementation       ← ConnectRPC inbound (G2)
  │    └─ CrashRecoveryServerService#handleRecover              ← existing service span
  │
  ├─ Temporal Activity: sendRecoverSuccessActivity              ← Temporal outbound (G1)
  │    └─ CrashRecoveryClientService#createRecoverSuccessReq    ← existing service span (child)
  │
  ├─ Temporal Activity: sendRollbackActivity (if needed)        ← Temporal outbound (G1)
  │    └─ CrashRecoveryClientService#createRollbackRequest      ← existing service span (child)
  │
  └─ Temporal Activity: executeRollbackActivity (if needed)     ← new activity
       └─ RollbackStrategyFactory#execute                        ← bridge call
```

All spans share the same `traceId` because the W3C trace context is propagated
through the Temporal header (§13.2.2), resulting in a **single end-to-end trace**
per recovery session in Jaeger/Zipkin/OpenTelemetry Collector.

### 14.6 Impact on Existing Integration Tests

The existing recovery integration tests (`crash-handler.test.ts`,
`server-service.test.ts`, `client-service.test.ts`) continue to pass unchanged
because the service classes themselves are not modified. New Temporal-layer
tests (§11.3) mock the handler operations via `MockActivityEnvironment` —
the mock surfaces the same TypeScript interface as the real handler, so test
coverage of the service layer is orthogonal to test coverage of the workflow
orchestration layer.

Add the following entry to the §11.6 Test Coverage Matrix:

| Feature under test | Test file | Category | Temporal needed | Docker needed |
|---|---|---|---|---|
| OTel span propagation through activity interceptors | `unit/crash-recovery/otel-interceptor.test.ts` | Unit | Embedded (mock worker) | No |
| Recovery metrics incremented on success/failure | `unit/crash-recovery/recovery-metrics.test.ts` | Unit | No | No |
| `sendRecoverActivity` delegates to `CrashRecoveryHandler` | `unit/crash-recovery/crash-recovery-activities.test.ts` | Unit | Embedded (mock worker) | No |
| `executeRollbackActivity` calls `RollbackStrategyFactory` | `unit/crash-recovery/crash-recovery-activities.test.ts` | Unit | Embedded (mock worker) | No |
