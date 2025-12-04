import { describe, expect, it, jest } from "@jest/globals";
import { AdapterHookService } from "../../../../main/typescript/adapters/adapter-hook-service";
import { AdapterManager } from "../../../../main/typescript/adapters/adapter-manager";
import { Stage } from "../../../../main/typescript/types/satp-protocol";
import {
  createAdapterHarness,
  createFetchResponse,
  createLoggerStub,
  createMonitorStub,
} from "./adapter-test-helpers";
import { loadAdapterConfigFixture } from "./adapter-test-utils";

describe("AdapterHookService basic behaviors", () => {
  it("returns undefined when no adapters are configured", async () => {
    const { service, fetchMock, invocation } = createAdapterHarness({
      hasAdapters: false,
    });

    const result = await service.triggerOutboundHooks(invocation);

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns undefined when the stage has no bindings", async () => {
    const { service, fetchMock, invocation } = createAdapterHarness();
    const result = await service.triggerOutboundHooks({
      ...invocation,
      stage: Stage.STAGE2,
    });

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("produces a step result when an adapter executes successfully", async () => {
    const { service, invocation } = createAdapterHarness();

    const result = await service.triggerOutboundHooks(invocation);

    expect(result).toBeDefined();
    expect(result?.stage).toBe(invocation.stage);
    expect(result?.steps).toHaveLength(1);
    expect(result?.steps[0].disposition).toBe("CONTINUE");
    expect(result?.steps[0].outboundResult?.status).toBe("OK");
  });

  it("initializes adapter manager using a configuration fixture", async () => {
    const config = loadAdapterConfigFixture("basic-adapter-config.json");
    const adapterManager = new AdapterManager({
      config,
      monitorService: createMonitorStub(),
    });
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { success: true }));
    const service = new AdapterHookService({
      adapterManager,
      logger: createLoggerStub(),
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
    });
    const invocation = {
      stage: Stage.STAGE1,
      step: "before" as const,
      sessionId: "fixture-session",
      contextId: "fixture-context",
      gatewayId: "fixture-gateway",
      metadata: { example: true },
      payload: { foo: "bar" },
    };

    const result = await service.triggerOutboundHooks(invocation);
    const step = result?.steps[0];

    expect(result?.stage).toBe(Stage.STAGE1);
    expect(step?.binding.adapterId).toBe("fixture-audit");
    expect(step?.disposition).toBe("CONTINUE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
