import { jest } from "@jest/globals";
import { AdapterHookService } from "../../../../main/typescript/adapters/adapter-hook-service";
import type { AdapterHookInvocation } from "../../../../main/typescript/adapters/adapter-hook-service";
import type { AdapterManager } from "../../../../main/typescript/adapters/adapter-manager";
import type {
  AdapterDefinition,
  AdapterExecutionBinding,
  GlobalAdapterDefaults,
} from "../../../../main/typescript/adapters/api3-adapter-types";
import { Stage } from "../../../../main/typescript/types/satp-protocol";
import type { SATPLogger as Logger } from "../../../../main/typescript/core/satp-logger";
import type { MonitorService } from "../../../../main/typescript/services/monitoring/monitor";

export interface AdapterHarnessOptions {
  step?: AdapterExecutionBinding["step"];
  stage?: Stage;
  adapterOverrides?: Partial<AdapterDefinition>;
  globalDefaults?: GlobalAdapterDefaults;
  hasAdapters?: boolean;
}

export interface AdapterHarness {
  service: AdapterHookService;
  fetchMock: jest.MockedFunction<typeof fetch>;
  binding: AdapterExecutionBinding;
  adapter: AdapterDefinition;
  invocation: AdapterHookInvocation;
}

export function createAdapterHarness(
  overrides: AdapterHarnessOptions = {},
): AdapterHarness {
  const adapter: AdapterDefinition = {
    id: overrides.adapterOverrides?.id ?? "audit-hook",
    name: overrides.adapterOverrides?.name ?? "Audit Hook",
    description:
      overrides.adapterOverrides?.description ?? "Integration test adapter",
    active: overrides.adapterOverrides?.active ?? true,
    outboundWebhook: {
      url:
        overrides.adapterOverrides?.outboundWebhook?.url ??
        "https://adapter.test/outbound",
      method: overrides.adapterOverrides?.outboundWebhook?.method ?? "POST",
      retryAttempts:
        overrides.adapterOverrides?.outboundWebhook?.retryAttempts ?? 3,
      retryDelayMs:
        overrides.adapterOverrides?.outboundWebhook?.retryDelayMs ?? 0,
      timeoutMs: overrides.adapterOverrides?.outboundWebhook?.timeoutMs ?? 250,
      headers: overrides.adapterOverrides?.outboundWebhook?.headers ?? {
        "content-type": "application/json",
      },
    },
    inboundWebhook: overrides.adapterOverrides?.inboundWebhook,
  };

  const binding: AdapterExecutionBinding = {
    adapterId: adapter.id,
    stage: "stage1",
    step: overrides.step ?? "before",
    order: 1,
  };

  const manager: Partial<AdapterManager> = {
    hasAdaptersConfigured: () => overrides.hasAdapters ?? true,
    getExecutionPlanSnapshot: () => ({ bindings: [binding] }),
    getAdapter: (stage: string, adapterId: string) => {
      if (stage === binding.stage && adapterId === adapter.id) {
        return adapter;
      }
      return undefined;
    },
    getConfiguration: () => ({
      satpStages: {},
      global: overrides.globalDefaults ?? {
        timeoutMs: 250,
        retryAttempts: 3,
        retryDelayMs: 0,
      },
    }),
  };

  const fetchMock = jest.fn<typeof fetch>();
  fetchMock.mockResolvedValue(createFetchResponse(200, { status: "ok" }));

  const service = new AdapterHookService({
    adapterManager: manager as AdapterManager,
    logger: createLoggerStub(),
    monitorService: createMonitorStub(),
    fetchImpl: fetchMock,
  });

  const invocation: AdapterHookInvocation = {
    stage: overrides.stage ?? Stage.STAGE1,
    step: binding.step,
    sessionId: "session-abc",
    contextId: "ctx-xyz",
    gatewayId: "gateway-test",
    metadata: { test: true },
    payload: { sample: "payload" },
  };

  return { service, fetchMock, binding, adapter, invocation };
}

export function createFetchResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
): Response {
  const serialized =
    typeof body === "string" ? body : JSON.stringify(body ?? {});
  const headerEntries = headers;
  const headerLike = {
    forEach: (callback: (value: string, key: string) => void) => {
      Object.entries(headerEntries).forEach(([key, value]) =>
        callback(value, key),
      );
    },
  } as Headers;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => serialized,
    headers: headerLike,
  } as unknown as Response;
}

export function createLoggerStub(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  } as unknown as Logger;
}

export function createMonitorStub(): MonitorService {
  return {
    createLog: jest.fn(),
  } as unknown as MonitorService;
}
