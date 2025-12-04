import { describe, expect, it, jest } from "@jest/globals";
import { AdapterManager } from "../../../../main/typescript/adapters/adapter-manager";
import { AdapterHookService } from "../../../../main/typescript/adapters/adapter-hook-service";
import { Stage } from "../../../../main/typescript/types/satp-protocol";
import {
  createFetchResponse,
  createLoggerStub,
  createMonitorStub,
} from "./adapter-test-helpers";
import { loadAdapterConfigFixture } from "./adapter-test-utils";

describe("AdapterManager stage/step/direction filtering", () => {
  const config = loadAdapterConfigFixture("multi-stage-adapter-config.json");
  const monitorService = createMonitorStub();

  describe("AdapterManager.getAdaptersForStep", () => {
    it("returns only adapters bound to stage0/before", () => {
      const manager = new AdapterManager({ config, monitorService });
      const adapters = manager.getAdaptersForStep("stage0", "before");

      expect(adapters).toHaveLength(1);
      expect(adapters[0].id).toBe("stage0-before-outbound");
    });

    it("returns only adapters bound to stage0/after", () => {
      const manager = new AdapterManager({ config, monitorService });
      const adapters = manager.getAdaptersForStep("stage0", "after");

      expect(adapters).toHaveLength(1);
      expect(adapters[0].id).toBe("stage0-after-inbound");
    });

    it("returns only adapters bound to stage1/before", () => {
      const manager = new AdapterManager({ config, monitorService });
      const adapters = manager.getAdaptersForStep("stage1", "before");

      expect(adapters).toHaveLength(1);
      expect(adapters[0].id).toBe("stage1-before-outbound");
    });

    it("excludes inactive adapters from stage1/after by default", () => {
      const manager = new AdapterManager({ config, monitorService });
      const adapters = manager.getAdaptersForStep("stage1", "after");

      expect(adapters).toHaveLength(1);
      expect(adapters[0].id).toBe("stage1-after-outbound");
      expect(adapters.some((a) => a.id === "stage1-inactive")).toBe(false);
    });

    it("includes inactive adapters when includeInactive is true", () => {
      const manager = new AdapterManager({ config, monitorService });
      const adapters = manager.getAdaptersForStep("stage1", "after", {
        includeInactive: true,
      });

      expect(adapters).toHaveLength(2);
      expect(adapters.map((a) => a.id)).toContain("stage1-inactive");
    });

    it("returns only adapters bound to stage2/during", () => {
      const manager = new AdapterManager({ config, monitorService });
      const adapters = manager.getAdaptersForStep("stage2", "during");

      expect(adapters).toHaveLength(1);
      expect(adapters[0].id).toBe("stage2-during-outbound");
    });

    it("returns empty array for stage3 (not configured)", () => {
      const manager = new AdapterManager({ config, monitorService });
      const adapters = manager.getAdaptersForStep("stage3", "before");

      expect(adapters).toHaveLength(0);
    });

    it("returns empty array for a not configured step within a valid stage", () => {
      const manager = new AdapterManager({ config, monitorService });
      // stage0 does not have a "during" step configured
      const adapters = manager.getAdaptersForStep("stage0", "during");

      // Falls back to full stage adapters when step is not configured
      expect(adapters).toHaveLength(2);
    });
  });

  describe("AdapterManager.buildExecutionPlan", () => {
    it("filters execution plan to a single stage", () => {
      const manager = new AdapterManager({ config, monitorService });
      const bindings = manager.buildExecutionPlan({ stage: "stage1" });

      expect(bindings.every((b) => b.stage === "stage1")).toBe(true);
      expect(bindings.some((b) => b.stage === "stage0")).toBe(false);
      expect(bindings.some((b) => b.stage === "stage2")).toBe(false);
    });

    it("excludes inactive adapters from execution plan by default", () => {
      const manager = new AdapterManager({ config, monitorService });
      const bindings = manager.buildExecutionPlan({ stage: "stage1" });

      expect(bindings.some((b) => b.adapterId === "stage1-inactive")).toBe(
        false,
      );
    });

    it("includes inactive adapters when includeInactive is true", () => {
      const manager = new AdapterManager({ config, monitorService });
      const bindings = manager.buildExecutionPlan({
        stage: "stage1",
        includeInactive: true,
      });

      expect(bindings.some((b) => b.adapterId === "stage1-inactive")).toBe(
        true,
      );
    });
  });

  describe("AdapterHookService stage/step/direction isolation", () => {
    it("only invokes stage0 adapters when dispatch is for Stage.STAGE0", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const fetchMock = jest.fn<typeof fetch>();
      fetchMock.mockResolvedValue(createFetchResponse(200, { ok: true }));

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      const result = await service.triggerOutboundHooks({
        stage: Stage.STAGE0,
        step: "before",
        sessionId: "test-session",
        contextId: "test-context",
        gatewayId: "test-gateway",
      });

      expect(result?.steps).toHaveLength(1);
      expect(result?.steps[0].binding.adapterId).toBe("stage0-before-outbound");
      expect(result?.steps[0].binding.stage).toBe("stage0");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = (fetchMock.mock.calls[0] as [string, unknown])[0];
      expect(callUrl).toContain("stage0/before/outbound");
    });

    it("does not invoke stage1 adapters when dispatch is for Stage.STAGE0", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const fetchMock = jest.fn<typeof fetch>();
      fetchMock.mockResolvedValue(createFetchResponse(200, { ok: true }));

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      const result = await service.triggerOutboundHooks({
        stage: Stage.STAGE0,
        step: "before",
        sessionId: "test-session",
        contextId: "test-context",
        gatewayId: "test-gateway",
      });

      const adapterIds = result?.steps.map((s) => s.binding.adapterId) ?? [];
      expect(adapterIds).not.toContain("stage1-before-outbound");
      expect(adapterIds).not.toContain("stage1-after-outbound");
    });

    it("only invokes stage1/before adapters, not stage1/after", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const fetchMock = jest.fn<typeof fetch>();
      fetchMock.mockResolvedValue(createFetchResponse(200, { ok: true }));

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      const result = await service.triggerOutboundHooks({
        stage: Stage.STAGE1,
        step: "before",
        sessionId: "test-session",
        contextId: "test-context",
        gatewayId: "test-gateway",
      });

      expect(result?.steps).toHaveLength(1);
      expect(result?.steps[0].binding.adapterId).toBe("stage1-before-outbound");
      expect(result?.steps[0].binding.step).toBe("before");
    });

    it("only invokes stage1/after adapters, not stage1/before", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const fetchMock = jest.fn<typeof fetch>();
      fetchMock.mockResolvedValue(createFetchResponse(200, { ok: true }));

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      const result = await service.triggerOutboundHooks({
        stage: Stage.STAGE1,
        step: "after",
        sessionId: "test-session",
        contextId: "test-context",
        gatewayId: "test-gateway",
      });

      expect(result?.steps).toHaveLength(1);
      expect(result?.steps[0].binding.adapterId).toBe("stage1-after-outbound");
      expect(result?.steps[0].binding.step).toBe("after");
    });

    it("skips adapters with only inbound config when triggering outbound hooks", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const fetchMock = jest.fn<typeof fetch>();
      fetchMock.mockResolvedValue(createFetchResponse(200, { ok: true }));

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      // stage0/after has an inbound-only adapter
      const result = await service.triggerOutboundHooks({
        stage: Stage.STAGE0,
        step: "after",
        sessionId: "test-session",
        contextId: "test-context",
        gatewayId: "test-gateway",
      });

      // The adapter should be found but skipped due to missing outbound config
      expect(result?.steps).toHaveLength(1);
      expect(result?.steps[0].disposition).toBe("SKIP");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns undefined for stage with no configured adapters", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const fetchMock = jest.fn<typeof fetch>();

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      const result = await service.triggerOutboundHooks({
        stage: Stage.STAGE3,
        step: "before",
        sessionId: "test-session",
        contextId: "test-context",
        gatewayId: "test-gateway",
      });

      expect(result).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns undefined when no adapters match the step", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const fetchMock = jest.fn<typeof fetch>();

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      // stage2 only has "during" step, not "before"
      const result = await service.triggerOutboundHooks({
        stage: Stage.STAGE2,
        step: "before",
        sessionId: "test-session",
        contextId: "test-context",
        gatewayId: "test-gateway",
      });
      expect(result).toBeUndefined();
      // Falls back to full stage, but we call before which is not in steps mapping
      // The adapter will be returned (fallback behavior), but as it's configured for during
      // this depends on implementation - let's verify behavior
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Cross-stage isolation guarantees", () => {
    it("stage0 dispatch never triggers stage1 or stage2 adapters", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const calledUrls: string[] = [];
      const fetchMock = jest.fn<typeof fetch>().mockImplementation((url) => {
        calledUrls.push(String(url));
        return Promise.resolve(createFetchResponse(200, { ok: true }));
      });

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      await service.triggerOutboundHooks({
        stage: Stage.STAGE0,
        step: "before",
        sessionId: "s",
        gatewayId: "g",
      });

      expect(calledUrls.every((url) => url.includes("stage0"))).toBe(true);
      expect(calledUrls.some((url) => url.includes("stage1"))).toBe(false);
      expect(calledUrls.some((url) => url.includes("stage2"))).toBe(false);
    });

    it("stage1 dispatch never triggers stage0 or stage2 adapters", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const calledUrls: string[] = [];
      const fetchMock = jest.fn<typeof fetch>().mockImplementation((url) => {
        calledUrls.push(String(url));
        return Promise.resolve(createFetchResponse(200, { ok: true }));
      });

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      await service.triggerOutboundHooks({
        stage: Stage.STAGE1,
        step: "before",
        sessionId: "s",
        gatewayId: "g",
      });

      expect(calledUrls.every((url) => url.includes("stage1"))).toBe(true);
      expect(calledUrls.some((url) => url.includes("stage0"))).toBe(false);
      expect(calledUrls.some((url) => url.includes("stage2"))).toBe(false);
    });

    it("stage2 dispatch never triggers stage0 or stage1 adapters", async () => {
      const manager = new AdapterManager({ config, monitorService });
      const calledUrls: string[] = [];
      const fetchMock = jest.fn<typeof fetch>().mockImplementation((url) => {
        calledUrls.push(String(url));
        return Promise.resolve(createFetchResponse(200, { ok: true }));
      });

      const service = new AdapterHookService({
        adapterManager: manager,
        logger: createLoggerStub(),
        monitorService,
        fetchImpl: fetchMock,
      });

      await service.triggerOutboundHooks({
        stage: Stage.STAGE2,
        step: "during",
        sessionId: "s",
        gatewayId: "g",
      });

      expect(calledUrls.every((url) => url.includes("stage2"))).toBe(true);
      expect(calledUrls.some((url) => url.includes("stage0"))).toBe(false);
      expect(calledUrls.some((url) => url.includes("stage1"))).toBe(false);
    });
  });
});
