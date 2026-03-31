/**
 * Unit tests for Stage*RollbackStrategy classes.
 *
 * These tests serve as the activity contract — they verify the rollback
 * strategies produce correct RollbackState output.  All OTel and logging
 * dependencies are mocked so no SDK or network is required.
 *
 * The strategies are not modified for Temporal; they become activity
 * implementations by wrapping.  These tests MUST keep passing throughout
 * the migration.
 */
import "jest-extended";
import { ROOT_CONTEXT } from "@opentelemetry/api";
import { Stage1RollbackStrategy } from "../../../../main/typescript/core/crash-management/rollback/stage1-rollback-strategy";
import { Type } from "../../../../main/typescript/generated/proto/cacti/satp/v13/session/session_pb";
import type { SATPSession } from "../../../../main/typescript/core/satp-session";
import type { MonitorService } from "../../../../main/typescript/services/monitoring/monitor";
import type { SATPLogger } from "../../../../main/typescript/core/satp-logger";

// ---------------------------------------------------------------------------
// Minimal mocks
// ---------------------------------------------------------------------------

function makeMockSpan() {
  return {
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
    setAttribute: jest.fn(),
  };
}

function makeMockMonitorService(): MonitorService {
  const mockSpan = makeMockSpan();
  return {
    startSpan: jest.fn().mockReturnValue({
      span: mockSpan,
      context: ROOT_CONTEXT,
    }),
  } as unknown as MonitorService;
}

function makeMockLog(): SATPLogger {
  return {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as SATPLogger;
}

function buildMockSession(role: Type): SATPSession {
  const sessionId = `test-session-${Date.now()}`;
  const clientData = { id: sessionId };
  const serverData = { id: sessionId };
  return {
    getSessionId: () => sessionId,
    hasClientSessionData: () => role === Type.CLIENT,
    hasServerSessionData: () => role === Type.SERVER,
    getClientSessionData: () => clientData,
    getServerSessionData: () => serverData,
  } as unknown as SATPSession;
}

function buildFailingMockSession(): SATPSession {
  const sessionId = `test-fail-${Date.now()}`;
  const failingClientData = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "id") throw new Error("simulated client data failure");
        return undefined;
      },
    },
  );
  return {
    getSessionId: () => sessionId,
    hasClientSessionData: () => true,
    hasServerSessionData: () => false,
    getClientSessionData: () => failingClientData,
    getServerSessionData: () => ({ id: sessionId }),
  } as unknown as SATPSession;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Stage1RollbackStrategy", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns COMPLETED status for a successful client-side rollback", async () => {
    const mockLog = makeMockLog();
    const mockMonitor = makeMockMonitorService();
    const strategy = new Stage1RollbackStrategy(mockLog, mockMonitor);
    const session = buildMockSession(Type.CLIENT);

    const state = await strategy.execute(session, Type.CLIENT);

    expect(state.status).toBe("COMPLETED");
    expect(state.rollbackLogEntries.length).toBeGreaterThan(0);
    expect(state.rollbackLogEntries[0].status).toBe("SUCCESS");
  });

  it("returns COMPLETED status for a successful server-side rollback", async () => {
    const mockLog = makeMockLog();
    const mockMonitor = makeMockMonitorService();
    const strategy = new Stage1RollbackStrategy(mockLog, mockMonitor);
    const session = buildMockSession(Type.SERVER);

    const state = await strategy.execute(session, Type.SERVER);

    expect(state.status).toBe("COMPLETED");
    expect(state.rollbackLogEntries[0].status).toBe("SUCCESS");
  });

  it("returns FAILED status when client session data access throws", async () => {
    const mockLog = makeMockLog();
    const mockMonitor = makeMockMonitorService();
    const strategy = new Stage1RollbackStrategy(mockLog, mockMonitor);
    const session = buildFailingMockSession();

    const state = await strategy.execute(session, Type.CLIENT);

    expect(state.status).toBe("FAILED");
    expect(state.rollbackLogEntries.some((e) => e.status === "FAILED")).toBe(
      true,
    );
  });

  it("calls startSpan on MonitorService for each tracked method", async () => {
    const mockLog = makeMockLog();
    const mockMonitor = makeMockMonitorService();
    const strategy = new Stage1RollbackStrategy(mockLog, mockMonitor);
    const session = buildMockSession(Type.CLIENT);

    await strategy.execute(session, Type.CLIENT);

    // execute() + handleClientSideRollback() each call startSpan once
    expect(mockMonitor.startSpan).toHaveBeenCalledTimes(2);
  });

  it("includes sessionId in the rollback log entries", async () => {
    const mockLog = makeMockLog();
    const mockMonitor = makeMockMonitorService();
    const strategy = new Stage1RollbackStrategy(mockLog, mockMonitor);
    const session = buildMockSession(Type.CLIENT);
    const sessionId = session.getSessionId();

    const state = await strategy.execute(session, Type.CLIENT);

    expect(state.sessionId).toBe(sessionId);
    expect(state.rollbackLogEntries[0].sessionId).toBe(sessionId);
  });
});
