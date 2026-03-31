# Temporal × IETF SATP Crash Recovery — Integration Architecture

> This document maps IETF `draft-belchior-satp-gateway-recovery-04` concepts to  
> Temporal TypeScript SDK primitives. Read alongside:  
> - [temporal-ts.md](./temporal-ts.md) — Temporal SDK reference  
> - [ietf-crash-recovery.md](./ietf-crash-recovery.md) — IETF draft reference

---

## Table of Contents

1. [Concept Mapping](#1-concept-mapping)
2. [Component Architecture](#2-component-architecture)
3. [Workflow Hierarchy](#3-workflow-hierarchy)
4. [SATP Session State Machine](#4-satp-session-state-machine)
5. [Self-Healing: Crash Recovery Flow](#5-self-healing-crash-recovery-flow)
6. [Primary-Backup: Handover Flow](#6-primary-backup-handover-flow)
7. [Rollback Sub-Protocol Flow](#7-rollback-sub-protocol-flow)
8. [Data Model — TypeScript Interfaces](#8-data-model--typescript-interfaces)
9. [Key Design Decisions](#9-key-design-decisions)

---

## 1. Concept Mapping

| IETF Draft Concept | Temporal Primitive | Rationale |
|---|---|---|
| **LogEntry** | Activity heartbeat detail | Heartbeats carry arbitrary details (JSON) and are checkpointed per execution; if Activity is retried, the last heartbeat `details` provides resume context — exactly like a pre-execution log entry. |
| **writeLogEntry (init-\*)** | Activity heartbeat at start | Call `context.heartbeat({ operation: 'init-...' })` at the top of each activity. |
| **writeLogEntry (done-\*)** | Activity return value | A successfully completed Activity writes its outcome to Workflow history — the Temporal Event Log equivalent of a `done-*` log entry. |
| **RECOVER** message | Workflow Signal | Fire-and-forget; the recovered workflow (or backup) notifies the counterparty workflow that it is ready to resume. Signal is non-blocking on the sender side. |
| **RECOVER-UPDATE** message | Workflow Update (request/response) | Returns the log diff synchronously in response. Update handler is durable and its execution is recorded in the event history. |
| **RECOVER-SUCCESS** message | Update return value | The resolved value of the `RECOVER-UPDATE` Update call. |
| **ROLLBACK** / **ROLLBACK-ACK** | Saga compensation activities | `nonCancellable` activities that burn/unlock assets; the ack is another compensation activity on the counterparty side. |
| **Log Storage API** | External service Activity | Wraps `writeLogEntry`, `getLogDiff`, etc. as idempotent Activity calls behind a LogStorageClient. |
| **Self-healing recovery** | Workflow replay | On Worker restart after crash, Temporal replays Event History up to the last recorded step — matching the draft's concept of "executing from the last logged action". |
| **Primary-backup detection** | Heartbeat timeout | `scheduleToCloseTimeout` / `heartbeatTimeout` signal backup take-over; mirrors the IETF heartbeat timeout used to detect primary failure. |
| **Primary-backup takeover** | Child Workflow (backup gateway)| Backup runs as a parallel Child Workflow; on primary timeout, backup Child Workflow receives Signal to become the active gateway and runs Session Resumption. |
| **ACP timeout (lock expiry)** | `CancellationScope.withTimeout` | Wraps lock-phase activities; if the timer fires before the lock completes, the scope is cancelled and rollback activities are triggered. |
| **Recovery dispute** | Non-retryable ApplicationFailure | When log inconsistency is detected, throw `ApplicationFailure.nonRetryable('RECOVER-DISPUTE')` to halt the workflow for human resolution. |
| **X.509 backup validation** | Dedicated Validation Activity | Three-step cert chain check runs as an Activity so it has its own retry policy and result is reliably persisted. |
| **Session state query** | Workflow Query | `defineQuery('getSessionState')` returns current SATP phase, operation stack, and log metadata synchronously without advancing the Workflow. |

---

## 2. Component Architecture

```mermaid
graph TB
  subgraph "Origin Domain"
    direction TB
    G1_CLIENT[G1 API Client\nExpress / gRPC]
    G1_WORKER[G1 Temporal Worker\nNode.js — glibc container]
    G1_WF[G1 SatpWorkflow\nSatpCrashRecoveryWorkflow]
    G1_LOG[G1 Log Storage\nPostgres / Fabric on-chain]
  end

  subgraph "Destination Domain"
    direction TB
    G2_CLIENT[G2 API Client\nExpress / gRPC]
    G2_WORKER[G2 Temporal Worker\nNode.js — glibc container]
    G2_WF[G2 SatpWorkflow\nSatpCrashRecoveryWorkflow]
    G2_LOG[G2 Log Storage\nPostgres / Fabric on-chain]
  end

  subgraph "Temporal Cluster"
    TS[Temporal Server\nFrontend + History + Matching + Worker services]
    TDB[(Temporal DB\nPostgres / Cassandra)]
    TQ1[Task Queue: satp-g1]
    TQ2[Task Queue: satp-g2]
  end

  subgraph "External Networks"
    FABRIC[Hyperledger Fabric\nAsset source ledger]
    ETH[Ethereum / Besu\nAsset destination ledger]
  end

  G1_CLIENT -->|Start / Signal / Query| TS
  G2_CLIENT -->|Start / Signal / Query| TS

  TS <-->|persist event history| TDB
  TS -->|dispatch tasks| TQ1
  TS -->|dispatch tasks| TQ2

  TQ1 --> G1_WORKER
  TQ2 --> G2_WORKER

  G1_WORKER -->|execute Workflow code| G1_WF
  G2_WORKER -->|execute Workflow code| G2_WF

  G1_WF -->|Activity: writeLogEntry| G1_LOG
  G2_WF -->|Activity: writeLogEntry| G2_LOG

  G1_WF -->|Activity: lockAsset / burnAsset| FABRIC
  G2_WF -->|Activity: mintAsset / createAsset| ETH

  G1_WF <-->|Signal: RECOVER\nUpdate: RECOVER-UPDATE| G2_WF
  G2_WF <-->|Signal: ROLLBACK\nUpdate: ROLLBACK-ACK| G1_WF
```

---

## 3. Workflow Hierarchy

```mermaid
graph TD
  subgraph "SatpCrashRecoveryWorkflow (G1)"
    ROOT[SatpTransferWorkflow\nParent / Orchestrator]
    P1[Phase1Workflow\nTransfer Initiation]
    P2[Phase2Workflow\nLock-Evidence]
    P3[Phase3Workflow\nCommitment Establishment]
    REC[RecoveryWorkflow\nCrash Recovery Sub-Protocol]
    RB_WF[RollbackWorkflow\nRollback Sub-Protocol]
    BACKUP_WF[BackupReadinessWorkflow\nPrimary-Backup Mode]
  end

  ROOT --> P1
  P1 --> P2
  P2 --> P3
  ROOT --> REC
  ROOT --> RB_WF
  ROOT --> BACKUP_WF

  ROOT -->|heartbeat to| BACKUP_WF

  subgraph "Activities"
    WLE[WriteLogEntryActivity]
    GLD[GetLogDiffActivity]
    LOCK[LockAssetActivity]
    MINT[MintAssetActivity]
    UNLOCK[UnlockAssetActivity]
    BURN[BurnAssetActivity]
    CERT[ValidateBackupCertActivity]
  end

  P2 --> WLE & LOCK
  P3 --> WLE & MINT
  REC --> WLE & GLD
  RB_WF --> UNLOCK & BURN
  BACKUP_WF --> CERT
```

**Workflow design rules**:
- Each Phase Workflow is a Child Workflow — failure in one cannot corrupt parent state.
- `RecoveryWorkflow` is **not** started unless a crash is detected; it is triggered by a Signal from the counterparty or by heartbeat timeout detection.
- `BackupReadinessWorkflow` runs _in parallel_ from the start of a transfer, receiving heartbeats from the primary and transitioning to active on timeout.

---

## 4. SATP Session State Machine

```mermaid
stateDiagram-v2
  [*] --> INIT : startTransfer()

  INIT --> PHASE1_RUNNING : Phase1Workflow started
  PHASE1_RUNNING --> PHASE1_DONE : Transfer Initiation agreed

  PHASE1_DONE --> PHASE2_RUNNING : Phase2Workflow started
  PHASE2_RUNNING --> PHASE2_DONE : Lock-Evidence completed
  PHASE2_RUNNING --> LOCK_TIMEOUT : CancellationScope timeout

  LOCK_TIMEOUT --> ROLLBACK_RUNNING : lock expired without commit\ntrigger rollback

  PHASE2_DONE --> PHASE3_RUNNING : Phase3Workflow started
  PHASE3_RUNNING --> PHASE3_DONE : Commitment Established\n(mint confirmed)
  PHASE3_DONE --> [*] : Transfer complete

  PHASE1_RUNNING --> CRASH_DETECTED : heartbeatTimeout / silence
  PHASE2_RUNNING --> CRASH_DETECTED
  PHASE3_RUNNING --> CRASH_DETECTED

  CRASH_DETECTED --> RECOVERY_RUNNING : RecoveryWorkflow started\nself-healing or backup takes over

  RECOVERY_RUNNING --> LOG_SYNC : RECOVER-UPDATE received
  LOG_SYNC --> RECOVERY_DONE : RECOVER-SUCCESS sent
  RECOVERY_DONE --> PHASE1_RUNNING : Resume from last confirmed step
  RECOVERY_DONE --> PHASE2_RUNNING
  RECOVERY_DONE --> PHASE3_RUNNING

  ROLLBACK_RUNNING --> ROLLBACK_DONE : ROLLBACK-ACK received
  ROLLBACK_DONE --> [*] : Transfer aborted
```

---

## 5. Self-Healing: Crash Recovery Flow

**Scenario**: G1 crashes during Phase 2 (after writing `init-lockAsset` but before G1 receives `done-lockAsset` confirmation from G2). G1 restarts. G2's log has advanced; G1's has not.

```mermaid
sequenceDiagram
  participant G1_WF as G1:SatpTransferWorkflow\n(Temporal Workflow replay)
  participant G1_ACT as G1:Activities
  participant LOG_API as Log Storage API
  participant G2_WF as G2:SatpTransferWorkflow

  Note over G1_WF: Worker crashes mid-Activity

  rect rgb(240, 240, 255)
    Note over G1_WF: TEMPORAL REPLAY\n(Worker restarts — Event History replayed up to crash point)
    G1_WF ->> G1_WF: Replay events[0..N-1]\n(WriteLogEntry, LockAsset schedules already in history)
    Note over G1_WF: Reaches last incomplete Activity\ndetects divergence via heartbeat details
  end

  G1_WF ->> G2_WF: Signal: RECOVER\n{ sessionId, seqNum=N, isBackup=false }

  G2_WF ->> G2_WF: Signal handler wakes RecoveryWorkflow
  G2_WF ->> G1_ACT: Activity: GetLogDiffActivity\n(getLogDiff(G1.log, G2.log))
  G1_ACT ->> LOG_API: GET /getLogDiff
  LOG_API -->> G1_ACT: entries[N..M]
  G1_ACT -->> G2_WF: diff result

  G2_WF ->> G1_WF: Update: RECOVER-UPDATE\n{ recoveredLogs: entries[N..M] }

  G1_WF ->> G1_ACT: Activity: WriteLogEntryActivity\n(for each missing entry)
  G1_ACT ->> LOG_API: POST /writeLogEntry (×M-N)
  LOG_API -->> G1_ACT: success

  G1_WF -->> G2_WF: Update resolves: RECOVER-SUCCESS\n{ success: true, entriesChanged: [...hashes] }

  Note over G1_WF,G2_WF: Logs now consistent

  G1_WF ->> G1_WF: Resume Phase 2 from seqNum=M\n(executeChild(Phase2Workflow, {continueFrom: M}))
```

### Signal vs Update decision

| Step | Message | Temporal Mechanism | Why |
|---|---|---|---|
| G1 notifies G2 it recovered | RECOVER | **Signal** | Notification only; G1 does not block. The signal wakes G2's `RecoveryWorkflow`. |
| G2 sends log diff to G1 | RECOVER-UPDATE | **Update** | G1 needs to block until the diff arrives; Update is durable and its handler execution is recorded in history. |
| G1 confirms logs synced | RECOVER-SUCCESS | **Update resolved value** | The result value of the Update call constitutes the acknowledgment. |

---

## 6. Primary-Backup: Handover Flow

**Scenario**: Primary gateway (G1) crashes. Backup gateway (B) detects the crash via heartbeat timeout. B validates its X.509 certificate chain and takes over.

```mermaid
sequenceDiagram
  participant G1 as G1:Primary\n(crashed — silent)
  participant B as B:BackupReadinessWorkflow\n(Temporal Child Workflow)
  participant G2_WF as G2:SatpTransferWorkflow
  participant CA as Certificate Authority

  loop Every heartbeatInterval
    G1 ->> B: heartbeat() — primary is alive
  end

  Note over G1: CRASH — heartbeats stop

  Note over B: heartbeatTimeout fires\nCancellationScope.withTimeout resolves

  B ->> B: Activity: ValidateBackupCertActivity\n[1] Run certification path algorithm on B's cert
  B ->> CA: Validate certificate chain to root
  CA -->> B: chain valid
  B ->> B: [2] B.parentCert == G1.parentCert\n(same legal authority / VASP CA)
  B ->> B: [3] hash(B.cert) ∈ G1.cert.extensions.authorizedBackups

  Note over B: All 3 checks pass → B is authorized

  B ->> G2_WF: Signal: SESSION-RESUMPTION\n{ newGatewayPubkey: B.pubkey }
  G2_WF ->> G2_WF: Validate signal against cert checks (Query mode)
  G2_WF -->> B: Acknowledge new TLS session

  B ->> G2_WF: Signal: RECOVER\n{ isBackup: true, newIdentityPublicKey: B.pubkey, seqNum=N }

  Note over B,G2_WF: Resume standard crash recovery\nsub-protocol (§5) with B as G1
```

### Backup activation conditions

```mermaid
flowchart LR
  HB[Heartbeat received] -->|reset timer| TIMER[heartbeatTimeout timer]
  TIMER --timeout--> DETECT[Timeout exceeded]
  DETECT --> CERT[ValidateBackupCertActivity\n3-step X.509 validation]
  CERT --valid--> SIGNAL[Signal G2:\nSESSION-RESUMPTION]
  CERT --invalid--> FAIL[ApplicationFailure.nonRetryable\nUNAUTHORIZED_BACKUP]
  SIGNAL --> RECOVER_SIGNAL[Signal G2:\nRECOVER isBackup=true]
```

---

## 7. Rollback Sub-Protocol Flow

**Scenario**: G1 sends `COMMIT-PREPARE` to G2 (Phase 3). G1 crashes. G2 detects via timeout. G2 executes rollback and sends ROLLBACK to G1 when G1 recovers.

```mermaid
sequenceDiagram
  participant G1_WF as G1:SatpTransferWorkflow
  participant G1_SAGA as G1:SagaCompensations
  participant G2_WF as G2:SatpTransferWorkflow
  participant G2_SAGA as G2:SagaCompensations
  participant FABRIC as Fabric Ledger
  participant ETH as Ethereum Ledger

  G1_WF ->> G2_WF: COMMIT-PREPARE (Phase 3)
  Note over G1_WF: CRASH

  Note over G2_WF: Timeout detecting G1 crash

  rect rgb(255, 240, 240)
    Note over G2_SAGA: G2 Saga compensations (CancellationScope.nonCancellable)
    G2_SAGA ->> ETH: Activity: BurnAssetActivity\n(if asset was minted)
    ETH -->> G2_SAGA: burn receipt
    G2_SAGA ->> G2_SAGA: writeLogEntry(exec-rollback)\nwriteLogEntry(done-rollback)
  end

  G2_WF ->> G2_WF: Wait for G1 RECOVER signal\n(condition: recoverSignalReceived)

  Note over G1_WF: G1 RECOVERS (Temporal Worker restarts)
  G1_WF ->> G1_WF: Replay Event History to crash point

  G1_WF ->> G2_WF: Signal: RECOVER\n{ seqNum=N, isBackup=false }

  G2_WF ->> G1_WF: Update: RECOVER-UPDATE\n{ recoveredLogs: rollback entries }
  G1_WF ->> G1_WF: applyLogDiff — discovers G2 rolled back

  G1_WF -->> G2_WF: Update resolves: RECOVER-SUCCESS

  rect rgb(255, 240, 240)
    Note over G1_SAGA: G1 Saga compensations (CancellationScope.nonCancellable)
    G1_SAGA ->> FABRIC: Activity: UnlockAssetActivity
    FABRIC -->> G1_SAGA: unlock receipt
    G1_SAGA ->> G1_SAGA: writeLogEntry(exec-rollback)\nwriteLogEntry(done-rollback)
  end

  G1_WF ->> G2_WF: Signal: ROLLBACK-ACK\n{ success: true, actionsPerformed: [UNLOCK], proofs: [...] }

  Note over G1_WF,G2_WF: Both gateways rolled back\nAssets restored
```

### Saga compensation pattern in TypeScript

```typescript
import {
  proxyActivities,
  CancellationScope,
  isCancellation,
  ActivityFailure,
} from "@temporalio/workflow";

const { lockAsset, unlockAsset, mintAsset, burnAsset, writeLogEntry } =
  proxyActivities<SatpActivities>({ startToCloseTimeout: "60 seconds" });

// Rollback list — built up as transfer progresses
const compensations: Array<() => Promise<void>> = [];

async function satpPhase3Workflow(ctx: SatpContext): Promise<void> {
  // Phase 3 step 1: lock asset on origin ledger
  compensations.unshift(() => unlockAsset(ctx.assetId)); // register compensation first
  await lockAsset(ctx.assetId);
  await writeLogEntry({ ...ctx, operation: "done-lockAsset" });

  // Phase 3 step 2: mint asset on destination ledger
  compensations.unshift(() => burnAsset(ctx.mintedAssetId));
  const mintedId = await mintAsset(ctx.assetDefinition);
  await writeLogEntry({ ...ctx, operation: "done-mintAsset" });

  // Phase 3 step 3: commit — may timeout if counterparty crashes
  try {
    await commitEstablishment(ctx);
  } catch (err) {
    if (err instanceof ActivityFailure || isCancellation(err)) {
      // Execute compensations in LIFO order; use nonCancellable so they
      // run even if the workflow is being cancelled
      await CancellationScope.nonCancellable(async () => {
        for (const compensate of compensations) {
          await compensate();
        }
      });
      await writeLogEntry({ ...ctx, operation: "done-rollback" });
      throw err; // re-throw to notify parent workflow
    }
    throw err;
  }
}
```

---

## 8. Data Model — TypeScript Interfaces

### 8.1 ILogEntry

Maps all 26 mandatory + 2 optional fields from §4 of the IETF draft.

```typescript
/** SATP Phase values from SATP Core draft */
type SatpPhase =
  | "transfer-initiation"
  | "transfer-commence"
  | "lock-assertion"
  | "lock-assertion-receipt"
  | "commitment-prepare"
  | "commitment-ready"
  | "commitment-final"
  | "transfer-complete";

/** Operation types matching IETF draft §3 */
type LogOperation =
  | `init-${string}`
  | `exec-${string}`
  | `done-${string}`
  | `ack-${string}`
  | `fail-${string}`;

/** Full LogEntry as defined in draft-belchior-satp-gateway-recovery-04 §4 */
export interface ILogEntry {
  // --- SATP schema fields (from SATP Core) ---
  version: string;                  // SATP protocol version (major.minor)
  sessionId: string;                // UUID v2 unique session identifier
  contextId: string;                // UUID v2 from setup stage
  seqNumber: number;                // monotonically increasing per message
  satpPhase: SatpPhase;             // current protocol phase
  resourceURL: string;              // resource location
  developerURN: string;             // developer/app identity assertion
  actionResponse: string;           // HTTP method + args, or response code
  credentialProfile: "SAML" | "OAuth" | "X.509";
  credentialBlock: string;          // auth token or certificate
  payloadProfile: string;           // asset provenance + capabilities
  applicationProfile: string;       // vendor/app profile
  payload: Record<string, unknown>; // phase-specific payload
  payloadHash: string;              // SHA-256 of payload

  // --- Crash recovery required fields ---
  timestamp: number;                // UNIX timestamp
  originGatewayPubkey: string;      // origin gateway public key (hex or PEM)
  originGatewaySystem: string;      // source network identifier
  destinationGatewayPubkey: string; // destination gateway public key
  destinationGatewaySystem: string; // destination network identifier
  loggingProfile: string;           // log storage mode (default: "Local Store")
  messageSignature: string;         // ECDSA signature of this entry by its writer
  lastEntryHash: string;            // SHA-256 of previous log entry (chain)
  accessControlProfile: string;     // confidentiality profile (default: "GatewayOnly")
  operation: LogOperation;          // init-* | exec-* | done-* | ack-* | fail-*

  // --- Optional crash recovery fields ---
  recoveryMessage?: string;         // recovery message type if in recovery procedure
  recoveryPayload?: Record<string, unknown>; // recovery payload
}
```

### 8.2 IRecoverMessage

```typescript
export interface IRecoverMessage {
  sessionId: string;
  contextId: string;
  messageType: "urn:ietf:SATP-2pc:msgtype:recover-msg";
  satpPhase: SatpPhase;
  seqNumber: number;
  isBackup: boolean;
  newIdentityPublicKey?: string;    // if isBackup === true
  lastEntryTimestamp: number;
  senderSignature: string;
}
```

### 8.3 IRecoverUpdateMessage

```typescript
export interface IRecoverUpdateMessage {
  sessionId: string;
  contextId: string;
  messageType: "urn:ietf:SATP-2pc:msgtype:recover-update-msg";
  hashRecoverMessage: string;       // SHA-256 of received RECOVER message
  recoveredLogs: ILogEntry[];       // missing log entries (diff result)
  senderSignature: string;
}
```

### 8.4 IRecoverSuccessMessage

```typescript
export interface IRecoverSuccessMessage {
  sessionId: string;
  contextId: string;
  messageType: "urn:ietf:SATP-2pc:msgtype:recover-update-ack-msg";
  hashRecoverUpdateMessage: string; // SHA-256 of received RECOVER-UPDATE
  success: boolean;                 // false triggers RECOVER-DISPUTE
  entriesChanged: string[];         // array of hashes of applied entries
  senderSignature: string;
}
```

### 8.5 IRollbackMessage

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

### 8.6 Workflow Signal & Update Definitions

```typescript
import { defineSignal, defineUpdate, defineQuery } from "@temporalio/workflow";

// Signals (fire-and-forget, no return value)
export const recoverSignal =
  defineSignal<[IRecoverMessage]>("RECOVER");
export const rollbackAckSignal =
  defineSignal<[IRollbackMessage]>("ROLLBACK-ACK");
export const sessionResumptionSignal =
  defineSignal<[{ newGatewayPubkey: string }]>("SESSION-RESUMPTION");

// Updates (durable, return a value)
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

## 9. Key Design Decisions

### 9.1 Why Signals for RECOVER and ROLLBACK-ACK?

The IETF draft describes RECOVER as a message that the crashed/recovered gateway sends to the counterparty to _notify_ it of recovery. The counterparty then initiates the differential log sync. This is semantically equivalent to a **Temporal Signal**: unidirectional, fire-and-forget, durably queued, and does not block the sender.

ROLLBACK-ACK is also a fire-and-forget acknowledgment — using a Signal models this correctly.

### 9.2 Why Updates for RECOVER-UPDATE and ROLLBACK?

RECOVER-UPDATE and ROLLBACK require the sender to **block until a response is received** and the response must be **durably recorded** in the Workflow's event history. Temporal Updates satisfy both requirements:
- The Update handler executes as a step in the Workflow — recorded in history.
- The return value provides the sync response (log diff / rollback proofs).
- Unlike Signals, failed Updates can be retried without duplicating side effects (idempotency via Workflow history).

### 9.3 Determinism in Recovery Workflows

Crash recovery Workflows must be deterministic (required by Temporal) AND must handle log entries from an external source. The pattern:

1. **Log diff fetching** happens in an Activity (non-deterministic I/O).
2. The diff result is **returned to the Workflow** and stored in event history.
3. The Workflow **applies the diff** to its own in-memory state deterministically.
4. **Writing updated entries** happens in another Activity.

This preserves Temporal's determinism constraint while handling arbitrary log content.

### 9.4 Log Chaining Integrity

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

### 9.5 Crash Detection Timeout Tuning

| Parameter | IETF Concept | Temporal Setting | Guidance |
|---|---|---|---|
| Heartbeat between G1↔Backup | Heartbeat between primary and backup | `heartbeatTimeout` on `BackupHeartbeatActivity` | Must be << lock expiry timeout |
| Lock phase deadline | Lock timeout (asset locked on ledger) | `CancellationScope.withTimeout(lockDuration)` | Set to ledger's configured lock TTL minus safety margin |
| Recovery phase deadline | Recovery must complete before lock expires | Total of RECOVER + RECOVER-UPDATE + RECOVER-SUCCESS RTT | Sum RTT bounds; if exceeded, trigger rollback |
| RECOVER message retry | Reliable delivery of RECOVER | `startToCloseTimeout` on activities | Short (5–10 s), high retry count |
