import { describe, expect, it, jest } from "@jest/globals";
import { AdapterManager } from "../../../../main/typescript/adapters/adapter-manager";
import { Stage } from "../../../../main/typescript/types/satp-protocol";
import {
  createAdapterHarness,
  createFetchResponse,
  createMonitorStub,
  loadAdapterConfigFromYaml,
  createNewSessionRequestHarness,
  STAGE0_NEW_SESSION_REQUEST_CONFIG,
  TEST_SESSION_ID,
  TEST_CONTEXT_ID,
  TEST_GATEWAY_ID,
  TEST_LOG_LEVEL,
} from "../../adapter-test-utils";

describe("AdapterManager basic behaviors", () => {
  it("returns undefined when no adapters are configured", async () => {
    const { manager, fetchMock, invocation } = createAdapterHarness({
      hasAdapters: false,
    });

    const result = await manager.executeAdapters(invocation);

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns undefined when the stage has no bindings", async () => {
    const { manager, fetchMock, invocation } = createAdapterHarness();
    const result = await manager.executeAdapters({
      ...invocation,
      stage: 2,
      stepTag: "lockAsset",
    });

    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("produces a step result when an adapter executes successfully", async () => {
    const { manager, invocation } = createAdapterHarness();

    const result = await manager.executeAdapters(invocation);

    expect(result).toBeDefined();
    expect(result?.stage).toBe(Stage.STAGE1);
    expect(result?.steps).toHaveLength(1);
    expect(result?.steps[0].disposition).toBe("CONTINUE");
    expect(result?.steps[0].outboundResult?.status).toBe("OK");
  });

  it("initializes adapter manager using newSessionRequest YAML configuration", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration-newSessionRequest.yml",
    );
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { success: true }));
    const manager = new AdapterManager({
      config,
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
    });
    const invocation = {
      stage: 0,
      stepTag: "newSessionRequest",
      stepOrder: "before" as const,
      sessionId: TEST_SESSION_ID,
      contextId: TEST_CONTEXT_ID,
      gatewayId: TEST_GATEWAY_ID,
      metadata: { scenario: "yaml-config" },
      payload: { request: "newSession" },
    };

    const result = await manager.executeAdapters(invocation);
    const step = result?.steps[0];

    expect(result?.stage).toBe(Stage.STAGE0);
    expect(step?.binding.adapterId).toBe(
      "newSessionRequest-outbound-validator",
    );
    expect(step?.disposition).toBe("CONTINUE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the createNewSessionRequestHarness for Stage 0 tests", async () => {
    const { manager, fetchMock, invocation } = createNewSessionRequestHarness();

    const result = await manager.executeAdapters(invocation);

    expect(result).toBeDefined();
    expect(result?.stage).toBe(Stage.STAGE0);
    expect(result?.steps).toHaveLength(1);
    expect(result?.steps[0].binding.adapterId).toBe(
      "newSessionRequest-outbound-validator",
    );
    expect(result?.steps[0].disposition).toBe("CONTINUE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads configuration from STAGE0_NEW_SESSION_REQUEST_CONFIG constant", async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { approved: true }));
    const manager = new AdapterManager({
      config: STAGE0_NEW_SESSION_REQUEST_CONFIG,
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
      logLevel: TEST_LOG_LEVEL,
    });

    const invocation = {
      stage: 0,
      stepTag: "newSessionRequest",
      stepOrder: "before" as const,
      sessionId: TEST_SESSION_ID,
      contextId: TEST_CONTEXT_ID,
      gatewayId: TEST_GATEWAY_ID,
      metadata: { test: "constant-config" },
      payload: {},
    };

    const result = await manager.executeAdapters(invocation);

    expect(result?.stage).toBe(Stage.STAGE0);
    expect(result?.steps).toHaveLength(1);
    expect(result?.steps[0].binding.adapterId).toBe(
      "newSessionRequest-outbound-validator",
    );
  });
});

describe("AdapterManager configuration examples", () => {
  it("loads adapter-configuration-simple.example.yml correctly", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration-simple.example.yml",
    );

    expect(config).toBeDefined();
    expect(config.adapters).toHaveLength(2);
    expect(config.adapters[0].id).toBe("validation-adapter-1");
    expect(config.adapters[1].id).toBe("phase0-adapter-2");
    expect(config.global?.logLevel).toBe("debug");
  });

  it("initializes AdapterManager with adapter-configuration-simple.example.yml", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration-simple.example.yml",
    );
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { validated: true }));

    const manager = new AdapterManager({
      config,
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
      logLevel: TEST_LOG_LEVEL,
    });

    expect(manager).toBeDefined();

    // Test execution for validation-adapter-1 (checkNewSessionRequest - before)
    const result = await manager.executeAdapters({
      stage: 0,
      stepTag: "checkNewSessionRequest",
      stepOrder: "before",
      sessionId: TEST_SESSION_ID,
      contextId: TEST_CONTEXT_ID,
      gatewayId: TEST_GATEWAY_ID,
      metadata: { test: "simple-config" },
      payload: {},
    });

    expect(result?.stage).toBe(Stage.STAGE0);
    // Adapter with both outbound and inbound webhooks creates 2 steps
    expect(result?.steps).toHaveLength(2);
    expect(result?.steps[0].binding.adapterId).toBe("validation-adapter-1");
    expect(result?.steps[0].disposition).toBe("CONTINUE"); // outbound step
    expect(result?.steps[1].disposition).toBe("SKIP"); // inbound step (no-op)
  });

  it("loads adapter-configuration.example.yml (comprehensive) correctly", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration.example.yml",
    );

    expect(config).toBeDefined();
    expect(config.adapters).toHaveLength(5);

    // Verify all adapter IDs
    const adapterIds = config.adapters.map((a) => a.id);
    expect(adapterIds).toContain("phase0-adapter-1");
    expect(adapterIds).toContain("phase0-adapter-2");
    expect(adapterIds).toContain("stage1-compliance-adapter");
    expect(adapterIds).toContain("stage2-lock-monitor");
    expect(adapterIds).toContain("stage3-finalization-adapter");

    expect(config.global?.logLevel).toBe("debug");
  });

  it("initializes AdapterManager with adapter-configuration.example.yml", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration.example.yml",
    );
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { status: "ok" }));

    const manager = new AdapterManager({
      config,
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
      logLevel: TEST_LOG_LEVEL,
    });

    expect(manager).toBeDefined();

    // Test execution for phase0-adapter-1 (checkNewSessionRequest - before)
    const stage0Result = await manager.executeAdapters({
      stage: 0,
      stepTag: "checkNewSessionRequest",
      stepOrder: "before",
      sessionId: TEST_SESSION_ID,
      contextId: TEST_CONTEXT_ID,
      gatewayId: TEST_GATEWAY_ID,
      metadata: { test: "comprehensive-config" },
      payload: {},
    });

    expect(stage0Result?.stage).toBe(Stage.STAGE0);
    // Adapter with both outbound and inbound webhooks creates 2 steps
    expect(stage0Result?.steps).toHaveLength(2);
    expect(stage0Result?.steps[0].binding.adapterId).toBe("phase0-adapter-1");
    expect(stage0Result?.steps[0].disposition).toBe("CONTINUE"); // outbound step
    expect(stage0Result?.steps[1].disposition).toBe("SKIP"); // inbound step (no-op)
    expect(fetchMock).toHaveBeenCalled();
  });

  it("executes stage1-compliance-adapter from comprehensive config", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration.example.yml",
    );
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { compliant: true }));

    const manager = new AdapterManager({
      config,
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
      logLevel: TEST_LOG_LEVEL,
    });

    // Test execution for stage1-compliance-adapter
    const result = await manager.executeAdapters({
      stage: 1,
      stepTag: "checkTransferProposalRequestMessage",
      stepOrder: "before",
      sessionId: TEST_SESSION_ID,
      contextId: TEST_CONTEXT_ID,
      gatewayId: TEST_GATEWAY_ID,
      metadata: { test: "compliance-check" },
      payload: {},
    });

    expect(result?.stage).toBe(Stage.STAGE1);
    // Adapter with both outbound and inbound webhooks creates 2 steps
    expect(result?.steps).toHaveLength(2);
    expect(result?.steps[0].binding.adapterId).toBe(
      "stage1-compliance-adapter",
    );
    expect(result?.steps[0].disposition).toBe("CONTINUE"); // outbound step
    expect(result?.steps[1].disposition).toBe("SKIP"); // inbound step (no-op)
  });

  it("executes stage2-lock-monitor adapter from comprehensive config", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration.example.yml",
    );
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { monitored: true }));

    const manager = new AdapterManager({
      config,
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
      logLevel: TEST_LOG_LEVEL,
    });

    // Test execution for stage2-lock-monitor (checkLockAssertionRequest - after)
    const result = await manager.executeAdapters({
      stage: 2,
      stepTag: "checkLockAssertionRequest",
      stepOrder: "after",
      sessionId: TEST_SESSION_ID,
      contextId: TEST_CONTEXT_ID,
      gatewayId: TEST_GATEWAY_ID,
      metadata: { test: "lock-monitor" },
      payload: {},
    });

    expect(result?.stage).toBe(Stage.STAGE2);
    expect(result?.steps).toHaveLength(1);
    expect(result?.steps[0].binding.adapterId).toBe("stage2-lock-monitor");
  });

  it("executes stage3-finalization-adapter from comprehensive config", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration.example.yml",
    );
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(createFetchResponse(200, { finalized: true }));

    const manager = new AdapterManager({
      config,
      monitorService: createMonitorStub(),
      fetchImpl: fetchMock,
      logLevel: TEST_LOG_LEVEL,
    });

    // Test execution for stage3-finalization-adapter (commitReadyResponse - after)
    const result = await manager.executeAdapters({
      stage: 3,
      stepTag: "commitReadyResponse",
      stepOrder: "after",
      sessionId: TEST_SESSION_ID,
      contextId: TEST_CONTEXT_ID,
      gatewayId: TEST_GATEWAY_ID,
      metadata: { test: "finalization" },
      payload: {},
    });

    expect(result?.stage).toBe(Stage.STAGE3);
    expect(result?.steps).toHaveLength(1);
    expect(result?.steps[0].binding.adapterId).toBe(
      "stage3-finalization-adapter",
    );
  });

  it("loads adapter-configuration-integration-test.yml for real endpoint testing", async () => {
    const config = loadAdapterConfigFromYaml(
      "adapter-configuration-integration-test.yml",
    );

    expect(config).toBeDefined();
    expect(config.adapters).toHaveLength(2);
    expect(config.adapters[0].id).toBe("integration-outbound-test");
    expect(config.adapters[1].id).toBe("integration-inbound-test");

    // Verify outbound webhook points to jsonplaceholder.typicode.com
    expect(config.adapters[0].outboundWebhook?.url).toBe(
      "https://jsonplaceholder.typicode.com/posts",
    );
    expect(config.global?.logLevel).toBe("debug");
  });
});
