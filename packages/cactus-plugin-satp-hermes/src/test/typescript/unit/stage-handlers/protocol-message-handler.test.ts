/**
 * Unit tests for ProtocolMessageHandler (SATP v13 §8.5, §10.6, §10.7).
 *
 * Covers:
 *  - SATPHandler identity contract (getHandlerIdentifier, getHandlerSessions, getStage)
 *  - setupRouter delegates to ConnectRouter.service
 *  - handleRejectSession: known session deleted; unknown session warned
 *  - handleErrorSession: logs error info, returns accepted ack; unknown session rejected
 *  - handleAbortSession: not found → rejected; pre-commit-final → effective;
 *    post-commit-final → not effective (derived from server-side session state)
 *
 * All OTel and logging dependencies are mocked — no network required.
 */
import "jest-extended";
import { ROOT_CONTEXT } from "@opentelemetry/api";
import { create } from "@bufbuild/protobuf";
import { ProtocolMessageHandler } from "../../../../main/typescript/core/stage-handlers/protocol-message-handler";
import type { IProtocolMessageHandlerOptions } from "../../../../main/typescript/core/stage-handlers/protocol-message-handler";
import type { SATPSession } from "../../../../main/typescript/core/satp-session";
import type { MonitorService } from "../../../../main/typescript/services/monitoring/monitor";
import {
  CommonSatpSchema,
  RejectMessageSchema,
  ErrorMessageSchema,
  SessionAbortMessageSchema,
  MessageType,
} from "../../../../main/typescript/generated/proto/cacti/satp/v13/common/message_pb";
import type {
  RejectMessage,
  ErrorMessage,
  SessionAbortMessage,
} from "../../../../main/typescript/generated/proto/cacti/satp/v13/common/message_pb";
import type {
  RejectSessionAck,
  ErrorSessionAck,
  AbortSessionAck,
} from "../../../../main/typescript/generated/proto/cacti/satp/v13/service/protocol_messages_pb";
import type { ConnectRouter } from "@connectrpc/connect";

/**
 * Typed access to the private RPC handler methods under test.
 * Using `unknown` cast avoids `any` while still reaching private methods.
 */
interface IPrivateHandler {
  handleRejectSession(req: RejectMessage): Promise<RejectSessionAck>;
  handleErrorSession(req: ErrorMessage): Promise<ErrorSessionAck>;
  handleAbortSession(req: SessionAbortMessage): Promise<AbortSessionAck>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockMonitorService(): MonitorService {
  const mockSpan = {
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
    setAttribute: jest.fn(),
  };
  return {
    startSpan: jest.fn().mockReturnValue({
      span: mockSpan,
      context: ROOT_CONTEXT,
    }),
    createLog: jest.fn().mockResolvedValue(undefined),
  } as unknown as MonitorService;
}

/** Build a minimal SATPSession-like object without a real DB/logger. */
function makeFakeSession(sessionId: string): SATPSession {
  return {
    getSessionId: () => sessionId,
    hasClientSessionData: () => true,
    hasServerSessionData: () => false,
    getClientSessionData: () => ({
      id: sessionId,
      lastSequenceNumber: BigInt(0),
    }),
    getServerSessionData: () => undefined,
  } as unknown as SATPSession;
}

function makeHandler(
  sessions: Map<string, SATPSession>,
  logLevel = "SILENT" as const,
): ProtocolMessageHandler {
  const opts: IProtocolMessageHandlerOptions = {
    sessions,
    logLevel,
    monitorService: makeMockMonitorService(),
  };
  return new ProtocolMessageHandler(opts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProtocolMessageHandler — SATPHandler identity contract", () => {
  it("getHandlerIdentifier returns 'protocol-handler'", () => {
    // Arrange
    const handler = makeHandler(new Map());
    // Act + Assert
    expect(handler.getHandlerIdentifier()).toBe("protocol-handler");
  });

  it("getStage returns 'protocol'", () => {
    const handler = makeHandler(new Map());
    expect(handler.getStage()).toBe("protocol");
  });

  it("getHandlerSessions returns session ids from the shared map", () => {
    // Arrange
    const id1 = "session-aaa";
    const id2 = "session-bbb";
    const sessions = new Map([
      [id1, makeFakeSession(id1)],
      [id2, makeFakeSession(id2)],
    ]);
    const handler = makeHandler(sessions);
    // Act
    const ids = handler.getHandlerSessions();
    // Assert
    expect(ids).toHaveLength(2);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });
});

describe("ProtocolMessageHandler — setupRouter", () => {
  it("calls router.service once to register ProtocolMessageService", () => {
    // Arrange
    const handler = makeHandler(new Map());
    const mockRouter = { service: jest.fn() } as unknown as ConnectRouter;
    // Act
    handler.setupRouter(mockRouter);
    // Assert
    expect(mockRouter.service).toHaveBeenCalledTimes(1);
  });
});

describe("ProtocolMessageHandler — handleRejectSession", () => {
  it("deletes a known active session and returns accepted=true", async () => {
    // Arrange
    const sessionId = "s-reject-known";
    const sessions = new Map([[sessionId, makeFakeSession(sessionId)]]);
    const handler = makeHandler(sessions);
    const req = create(RejectMessageSchema, {
      common: create(CommonSatpSchema, {
        sessionId,
        messageType: MessageType.INIT_REJECT,
      }),
      reasonCode: "err_1.1",
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleRejectSession(req);
    // Assert
    expect(ack.accepted).toBe(true);
    expect(ack.sessionId).toBe(sessionId);
    expect(sessions.has(sessionId)).toBe(false);
  });

  it("returns accepted=true even when the session is not found", async () => {
    // Arrange — empty sessions map
    const sessions = new Map<string, SATPSession>();
    const handler = makeHandler(sessions);
    const req = create(RejectMessageSchema, {
      common: create(CommonSatpSchema, {
        sessionId: "s-nonexistent",
        messageType: MessageType.INIT_REJECT,
      }),
      reasonCode: "err_2.3",
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleRejectSession(req);
    // Assert
    expect(ack.accepted).toBe(true);
    expect(ack.sessionId).toBe("s-nonexistent");
  });

  it("includes the reasonCode in the ack reason text", async () => {
    // Arrange
    const sessionId = "s-reject-reason";
    const sessions = new Map([[sessionId, makeFakeSession(sessionId)]]);
    const handler = makeHandler(sessions);
    const req = create(RejectMessageSchema, {
      common: create(CommonSatpSchema, { sessionId }),
      reasonCode: "err_5.7",
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleRejectSession(req);
    // Assert
    expect(ack.reason).toContain("err_5.7");
  });
});

describe("ProtocolMessageHandler — handleErrorSession", () => {
  it("returns accepted=true and echoes back the sessionId", async () => {
    // Arrange — session must exist in the map for accepted=true
    const sessionId = "s-error-test";
    const sessions = new Map([[sessionId, makeFakeSession(sessionId)]]);
    const handler = makeHandler(sessions);
    const req = create(ErrorMessageSchema, {
      common: create(CommonSatpSchema, {
        sessionId,
        messageType: MessageType.ERROR,
      }),
      errorType: "protocol-violation",
      errorSeverity: "high",
      errorMsgType: "INIT_RECEIPT",
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleErrorSession(req);
    // Assert
    expect(ack.accepted).toBe(true);
    expect(ack.sessionId).toBe(sessionId);
  });

  it("includes errorType and errorSeverity in the ack reason", async () => {
    // Arrange — session must exist in the map for accepted=true
    const sessionId = "s-err-reason";
    const sessions = new Map([[sessionId, makeFakeSession(sessionId)]]);
    const handler = makeHandler(sessions);
    const req = create(ErrorMessageSchema, {
      common: create(CommonSatpSchema, { sessionId }),
      errorType: "timeout",
      errorSeverity: "fatal",
      errorMsgType: "COMMIT_READY",
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleErrorSession(req);
    // Assert
    expect(ack.reason).toContain("timeout");
    expect(ack.reason).toContain("fatal");
  });

  it("returns accepted=false when sessionId is not in the active sessions map", async () => {
    // Arrange — empty sessions map simulates unknown / already-cleaned-up session
    const handler = makeHandler(new Map());
    const req = create(ErrorMessageSchema, {
      common: create(CommonSatpSchema, {
        sessionId: "s-error-unknown",
        messageType: MessageType.ERROR,
      }),
      errorType: "timeout",
      errorSeverity: "low",
      errorMsgType: "INIT_PROPOSAL",
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleErrorSession(req);
    // Assert
    expect(ack.accepted).toBe(false);
    expect(ack.reason).toMatch(/not found/i);
  });
});

describe("ProtocolMessageHandler — handleAbortSession", () => {
  it("returns accepted=false when no session is found", async () => {
    // Arrange
    const handler = makeHandler(new Map());
    const req = create(SessionAbortMessageSchema, {
      common: create(CommonSatpSchema, {
        sessionId: "s-no-session",
        messageType: MessageType.SESSION_ABORT,
      }),
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleAbortSession(req);
    // Assert
    expect(ack.accepted).toBe(false);
    expect(ack.sessionId).toBe("s-no-session");
    expect(ack.reason).toMatch(/not found/i);
  });

  it("aborts effectively before commit-final and removes session", async () => {
    // Arrange — session has no satpMessages.stage3 stored (pre-commit-final)
    const sessionId = "s-abort-pre-commit";
    const sessions = new Map([[sessionId, makeFakeSession(sessionId)]]);
    const handler = makeHandler(sessions);
    const req = create(SessionAbortMessageSchema, {
      common: create(CommonSatpSchema, {
        sessionId,
        messageType: MessageType.SESSION_ABORT,
      }),
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleAbortSession(req);
    // Assert: effective → accepted, session removed
    expect(ack.accepted).toBe(true);
    expect(sessions.has(sessionId)).toBe(false);
  });

  it("abort is NOT effective after commit-final, session is kept", async () => {
    // Arrange — session state shows commitFinalAssertionRequestMessage was stored,
    // indicating COMMIT_FINAL was already processed server-side.
    // The req.common.messageType is NOT used for this check (would be a security bug).
    const sessionId = "s-abort-post-commit";
    const postCommitSession = {
      getSessionId: () => sessionId,
      hasClientSessionData: () => true,
      hasServerSessionData: () => false,
      getClientSessionData: () => ({
        id: sessionId,
        satpMessages: {
          stage3: {
            // Non-null entry proves COMMIT_FINAL message was processed server-side
            commitFinalAssertionRequestMessage: {},
          },
        },
      }),
      getServerSessionData: () => undefined,
    } as unknown as SATPSession;
    const sessions = new Map([[sessionId, postCommitSession]]);
    const handler = makeHandler(sessions);

    // Note: messageType in the request is SESSION_ABORT — the effectiveness check
    // reads from server-side session state, not from req.common.messageType.
    const req = create(SessionAbortMessageSchema, {
      common: create(CommonSatpSchema, {
        sessionId,
        messageType: MessageType.SESSION_ABORT,
      }),
    });
    // Act
    const priv = handler as unknown as IPrivateHandler;
    const ack = await priv.handleAbortSession(req);
    // Assert: NOT effective → rejected, session still in map
    expect(ack.accepted).toBe(false);
    expect(sessions.has(sessionId)).toBe(true);
  });
});
