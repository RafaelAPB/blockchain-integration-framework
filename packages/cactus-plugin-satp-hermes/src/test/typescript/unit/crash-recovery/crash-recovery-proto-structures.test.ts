/**
 * Unit tests for the new crash-recovery protobuf message structures.
 *
 * Tests use the protoc-gen-es v2.x create() pattern:
 *   create(XxxSchema, { field: value })
 *
 * Covers:
 *   - common/crash_recovery_log.proto  (LogEntry, LogDiff, LogOperation, LogStorageMode)
 *   - service/crash_recovery_subprotocol.proto  (RecoverV2Request, etc.)
 *   - service/rollback_subprotocol.proto  (RollbackV2Request, RollbackProof, etc.)
 *
 * Pattern mirrors the existing v13-proto-structures.test.ts.
 */
import "jest-extended";
import { create } from "@bufbuild/protobuf";
import {
  LogEntrySchema,
  LogDiffSchema,
  LogOperation,
  LogStorageMode,
} from "../../../../main/typescript/generated/proto/cacti/satp/v13/common/crash_recovery_log_pb";
import {
  RecoverV2RequestSchema,
  RecoverUpdateRequestSchema,
  RecoverUpdateAckRequestSchema,
  RecoverSuccessV2RequestSchema,
  CrashRecoverySubProtocolService,
} from "../../../../main/typescript/generated/proto/cacti/satp/v13/service/crash_recovery_subprotocol_pb";
import {
  RollbackV2RequestSchema,
  RollbackAckRequestSchema,
  RollbackProofSchema,
} from "../../../../main/typescript/generated/proto/cacti/satp/v13/service/rollback_subprotocol_pb";

describe("CrashRecoverySubProtocol proto structures", () => {
  describe("RecoverV2Request — §5.3.1", () => {
    it("has context_id field that was absent in legacy RecoverRequest", () => {
      const msg = create(RecoverV2RequestSchema, {
        sessionId: "s-001",
        contextId: "ctx-001",
        satpPhase: "transfer-initiation",
        sequenceNumber: BigInt(3),
        isBackup: false,
        lastEntryTimestamp: BigInt(Date.now()),
        senderSignature: "sig",
      });
      expect(msg.contextId).toBe("ctx-001");
    });

    it("sequence_number is BigInt (int64) not number (int32)", () => {
      const msg = create(RecoverV2RequestSchema, {
        sequenceNumber: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
      });
      expect(typeof msg.sequenceNumber).toBe("bigint");
    });

    it("defaults to empty strings and zero values", () => {
      const msg = create(RecoverV2RequestSchema, {});
      expect(msg.sessionId).toBe("");
      expect(msg.contextId).toBe("");
      expect(msg.isBackup).toBe(false);
      expect(msg.sequenceNumber).toBe(BigInt(0));
    });
  });

  describe("RecoverUpdateRequest — §5.3.2", () => {
    it("carries a typed LogDiff (not flat PersistLogEntry list)", () => {
      const entry = create(LogEntrySchema, {
        sessionId: "s-001",
        contextId: "ctx-001",
        sequenceNumber: BigInt(4),
        operation: LogOperation.EXEC,
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
      expect(msg.recoveredLogs?.toSequenceNumber).toBe(BigInt(4));
    });
  });

  describe("RecoverUpdateAckRequest — §5.3.3", () => {
    it("has hash_recover_update_message and success fields", () => {
      const msg = create(RecoverUpdateAckRequestSchema, {
        sessionId: "s-001",
        contextId: "ctx-001",
        hashRecoverUpdateMessage: "sha256-update-abc",
        success: true,
        senderSignature: "sig",
      });
      expect(msg.success).toBe(true);
      expect(msg.hashRecoverUpdateMessage).toBe("sha256-update-abc");
    });
  });

  describe("RecoverSuccessV2Request — §5.3.3", () => {
    it("has entries_changed as repeated string", () => {
      const msg = create(RecoverSuccessV2RequestSchema, {
        sessionId: "s-001",
        contextId: "ctx-001",
        success: true,
        entriesChanged: ["hash-a", "hash-b"],
        senderSignature: "sig",
      });
      expect(msg.entriesChanged).toHaveLength(2);
      expect(msg.entriesChanged[0]).toBe("hash-a");
    });
  });

  describe("CrashRecoverySubProtocolService — service definition", () => {
    it("exposes exactly 4 RPCs: recover, recoverUpdate, recoverUpdateAck, recoverSuccess", () => {
      const methods = Object.keys(CrashRecoverySubProtocolService.method);
      expect(methods).toHaveLength(4);
      expect(methods).toContain("recover");
      expect(methods).toContain("recoverUpdate");
      expect(methods).toContain("recoverUpdateAck");
      expect(methods).toContain("recoverSuccess");
    });
  });
});

describe("LogEntry proto structure — §4", () => {
  it("can be constructed with prototype fields", () => {
    const entry = create(LogEntrySchema, {
      version: "1.0",
      sessionId: "s-001",
      contextId: "ctx-001",
      sequenceNumber: BigInt(1),
      satpPhase: "transfer-initiation",
      operation: LogOperation.INIT,
      messageSignature: "jws-sig",
      lastEntryHash: "hash-prev",
      timestamp: BigInt(Date.now()),
      originGatewayPubkey: "pk-g1",
      originGatewaySystemId: "g1-sys",
      destGatewayPubkey: "pk-g2",
      destGatewaySystemId: "g2-sys",
    });
    expect(entry.version).toBe("1.0");
    expect(entry.operation).toBe(LogOperation.INIT);
    expect(entry.sequenceNumber).toBe(BigInt(1));
  });

  it("LogOperation enum covers all 5 draft §4.1 lifecycle values", () => {
    expect(LogOperation.INIT).toBeDefined();
    expect(LogOperation.EXEC).toBeDefined();
    expect(LogOperation.DONE).toBeDefined();
    expect(LogOperation.ACK).toBeDefined();
    expect(LogOperation.FAIL).toBeDefined();
  });

  it("LogStorageMode enum covers all 4 draft §3.3 topologies", () => {
    expect(LogStorageMode.PUBLIC_DECENTRALIZED).toBeDefined();
    expect(LogStorageMode.PUBLIC_CENTRALIZED).toBeDefined();
    expect(LogStorageMode.PRIVATE_CENTRALIZED).toBeDefined();
    expect(LogStorageMode.PRIVATE_DECENTRALIZED).toBeDefined();
  });
});

describe("LogDiff proto structure — §5.3.2", () => {
  it("entries is an array field", () => {
    const diff = create(LogDiffSchema, {
      fromSequenceNumber: BigInt(5),
      toSequenceNumber: BigInt(7),
      entries: [],
    });
    expect(diff.fromSequenceNumber).toBe(BigInt(5));
    expect(diff.toSequenceNumber).toBe(BigInt(7));
    expect(Array.isArray(diff.entries)).toBe(true);
    expect(diff.entries).toHaveLength(0);
  });
});

describe("RollbackSubProtocol proto structures — §5.3.4–5.3.5", () => {
  describe("RollbackProof — typed replacement for repeated string proofs", () => {
    it("has action, stage, proofHash, txId, timestamp fields", () => {
      const proof = create(RollbackProofSchema, {
        action: "unlock-asset",
        stage: "STAGE_1",
        proofHash: "sha256-xyz",
        txId: "besu-tx-0xabc",
        timestamp: BigInt(Date.now()),
      });
      expect(proof.action).toBe("unlock-asset");
      expect(proof.stage).toBe("STAGE_1");
      expect(proof.txId).toBe("besu-tx-0xabc");
    });
  });

  describe("RollbackV2Request — §5.3.4", () => {
    it("has context_id field (absent in legacy RollbackRequest)", () => {
      const proof = create(RollbackProofSchema, {
        action: "unlock-asset",
        stage: "STAGE_1",
        proofHash: "sha256-proof",
      });
      const msg = create(RollbackV2RequestSchema, {
        sessionId: "s-001",
        contextId: "ctx-001",
        success: true,
        actionsPerformed: ["unlock-asset on besu"],
        proofs: [proof],
        senderSignature: "sig",
      });
      expect(msg.contextId).toBe("ctx-001");
      expect(msg.proofs).toHaveLength(1);
      expect(msg.proofs[0].action).toBe("unlock-asset");
    });
  });

  describe("RollbackAckRequest — §5.3.5", () => {
    it("mirrors RollbackV2Request fields as an acknowledgement", () => {
      const msg = create(RollbackAckRequestSchema, {
        sessionId: "s-001",
        contextId: "ctx-001",
        success: true,
        actionsPerformed: ["unlock-asset on besu"],
        proofs: [],
        senderSignature: "sig",
      });
      expect(msg.success).toBe(true);
      expect(msg.contextId).toBe("ctx-001");
    });
  });
});
