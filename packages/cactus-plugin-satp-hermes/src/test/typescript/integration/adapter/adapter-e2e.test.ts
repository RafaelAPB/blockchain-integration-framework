import { describe, expect, it, jest } from "@jest/globals";
import { AdapterHookService } from "../../../../main/typescript/adapters/adapter-hook-service";
import type { AdapterManager } from "../../../../main/typescript/adapters/adapter-manager";
import type {
  AdapterDefinition,
  AdapterExecutionBinding,
} from "../../../../main/typescript/adapters/api3-adapter-types";
import { Stage } from "../../../../main/typescript/types/satp-protocol";
import {
  createFetchResponse,
  createLoggerStub,
  createMonitorStub,
} from "./adapter-test-helpers";

describe("AdapterHookService end-to-end execution", () => {
  it("runs multiple outbound adapters in the declared order", async () => {
    const adapters: AdapterDefinition[] = [
      {
        id: "audit-log",
        name: "Audit Log",
        description: "Records SATP events",
        active: true,
        outboundWebhook: {
          url: "https://adapter.example/audit",
        },
      },
      {
        id: "risk-engine",
        name: "Risk Engine",
        description: "Performs risk checks",
        active: true,
        outboundWebhook: {
          url: "https://adapter.example/risk",
        },
      },
    ];
    const bindings: AdapterExecutionBinding[] = [
      { adapterId: "audit-log", stage: "stage1", step: "before", order: 1 },
      { adapterId: "risk-engine", stage: "stage1", step: "before", order: 2 },
    ];
    const manager: Partial<AdapterManager> = {
      hasAdaptersConfigured: () => true,
      getExecutionPlanSnapshot: () => ({ bindings }),
      getAdapter: (stage, adapterId) =>
        stage === "stage1"
          ? adapters.find((adapter) => adapter.id === adapterId)
          : undefined,
      getConfiguration: () => ({
        satpStages: {},
        global: { timeoutMs: 250, retryAttempts: 3, retryDelayMs: 0 },
      }),
    };
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce(createFetchResponse(200, { adapter: "audit-log" }))
      .mockResolvedValueOnce(
        createFetchResponse(200, { adapter: "risk-engine" }),
      );
    const service = new AdapterHookService({
      adapterManager: manager as AdapterManager,
      logger: createLoggerStub(),
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
    });
    const invocation = {
      stage: Stage.STAGE1,
      step: "before" as const,
      sessionId: "session-e2e",
      contextId: "ctx-e2e",
      gatewayId: "gateway-e2e",
      metadata: { scenario: "multi" },
      payload: { message: "hello" },
    };

    const result = await service.triggerOutboundHooks(invocation);

    expect(result?.steps).toHaveLength(2);
    expect(result?.steps.map((step) => step.binding.adapterId)).toEqual([
      "audit-log",
      "risk-engine",
    ]);
    expect(result?.steps.every((step) => step.disposition === "CONTINUE")).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
