import { describe, expect, it, jest } from "@jest/globals";
import { AdapterHookService } from "../../../../main/typescript/adapters/adapter-hook-service";
import { Stage } from "../../../../main/typescript/types/satp-protocol";
import {
  createAdapterHarness,
  createFetchResponse,
} from "./adapter-test-helpers";

describe("AdapterHookService - retry and error handling", () => {
  describe("retry logic", () => {
    it("retries on network failure up to configured attempts", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/retry",
            retryAttempts: 3,
            retryDelayMs: 0,
          },
        },
      });

      fetchMock.mockRejectedValue(new Error("Network timeout"));

      const result = await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result?.steps[0].disposition).toBe("FAIL");
      expect(result?.steps[0].outboundResult?.status).toBe("FAILED");
      expect(result?.steps[0].outboundResult?.retriesAttempted).toBe(2);
    });

    it("succeeds on first retry after initial failure", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/retry",
            retryAttempts: 3,
            retryDelayMs: 0,
          },
        },
      });

      fetchMock
        .mockRejectedValueOnce(new Error("Transient failure"))
        .mockResolvedValueOnce(createFetchResponse(200, { success: true }));

      const result = await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result?.steps[0].disposition).toBe("CONTINUE");
      expect(result?.steps[0].outboundResult?.status).toBe("OK");
      expect(result?.steps[0].outboundResult?.retriesAttempted).toBe(1);
    });

    it("retries on 5xx server errors", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/retry",
            retryAttempts: 2,
            retryDelayMs: 0,
          },
        },
      });

      fetchMock
        .mockResolvedValueOnce(
          createFetchResponse(503, { error: "Service unavailable" }),
        )
        .mockResolvedValueOnce(createFetchResponse(200, { success: true }));

      const result = await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result?.steps[0].disposition).toBe("CONTINUE");
    });

    it("does not retry on 4xx client errors", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/no-retry",
            retryAttempts: 3,
            retryDelayMs: 0,
          },
        },
      });

      fetchMock.mockResolvedValue(
        createFetchResponse(400, { error: "Bad request" }),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result?.steps[0].disposition).toBe("FAIL");
      expect(result?.steps[0].outboundResult?.retriesAttempted).toBe(0);
    });

    it("respects retry delay between attempts", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/delay",
            retryAttempts: 2,
            retryDelayMs: 50,
          },
        },
      });

      fetchMock.mockRejectedValue(new Error("Network error"));

      const startTime = Date.now();
      await service.triggerOutboundHooks(invocation);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("uses global retry settings when adapter config is missing", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/global-retry",
          },
        },
        globalDefaults: {
          retryAttempts: 2,
          retryDelayMs: 0,
        },
      });

      fetchMock.mockRejectedValue(new Error("Fail"));

      await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("timeout handling", () => {
    it("respects adapter-specific timeout", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/timeout",
            timeoutMs: 100,
            retryAttempts: 1,
          },
        },
      });

      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(createFetchResponse(200, {})), 200);
          }),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].disposition).toBe("FAIL");
      expect(result?.steps[0].outboundResult?.status).toBe("FAILED");
    });

    it("uses global timeout when adapter config is missing", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/timeout",
          },
        },
        globalDefaults: {
          timeoutMs: 100,
        },
      });

      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(createFetchResponse(200, {})), 200);
          }),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].disposition).toBe("FAIL");
    });
  });

  describe("response parsing", () => {
    it("parses JSON response body", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      const responseData = { result: "success", id: 123 };
      fetchMock.mockResolvedValue(createFetchResponse(200, responseData));

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].outboundResult?.responseBody).toEqual(
        responseData,
      );
    });

    it("handles non-JSON response body gracefully", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      const textResponse = "Plain text response";
      fetchMock.mockResolvedValue(
        createFetchResponse(200, textResponse, { "content-type": "text/plain" }),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].outboundResult?.responseBody).toBe(textResponse);
      expect(result?.steps[0].disposition).toBe("CONTINUE");
    });

    it("handles empty response body", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      fetchMock.mockResolvedValue(createFetchResponse(204, ""));

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].outboundResult?.responseBody).toBeUndefined();
      expect(result?.steps[0].disposition).toBe("CONTINUE");
    });

    it("captures response headers", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      fetchMock.mockResolvedValue(
        createFetchResponse(
          200,
          {},
          {
            "content-type": "application/json",
            "x-request-id": "req-123",
            "x-rate-limit": "100",
          },
        ),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].outboundResult?.responseHeaders).toEqual({
        "content-type": "application/json",
        "x-request-id": "req-123",
        "x-rate-limit": "100",
      });
    });
  });

  describe("error scenarios", () => {
    it("handles DNS resolution failures", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      fetchMock.mockRejectedValue(
        new Error("getaddrinfo ENOTFOUND adapter.invalid"),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].disposition).toBe("FAIL");
      expect(result?.steps[0].message).toContain("getaddrinfo ENOTFOUND");
    });

    it("handles connection refused errors", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].disposition).toBe("FAIL");
      expect(result?.steps[0].outboundResult?.errorMessage).toContain(
        "ECONNREFUSED",
      );
    });

    it("handles SSL/TLS certificate errors", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      fetchMock.mockRejectedValue(
        new Error("self signed certificate in certificate chain"),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].disposition).toBe("FAIL");
      expect(result?.steps[0].outboundResult?.errorMessage).toContain(
        "certificate",
      );
    });

    it("tracks latency even on failures", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/latency",
            retryAttempts: 1,
          },
        },
      });

      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Timeout")), 50);
          }),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].metrics?.latencyMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe("HTTP method handling", () => {
    it("sends POST request by default", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("sends GET request when configured", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/get",
            method: "GET",
          },
        },
      });

      await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "GET",
          body: undefined,
        }),
      );
    });

    it("sends PUT request with payload", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/put",
            method: "PUT",
          },
        },
      });

      await service.triggerOutboundHooks(invocation);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "PUT",
          body: expect.any(String),
        }),
      );
    });
  });

  describe("adapter skip scenarios", () => {
    it("skips adapter with no outbound webhook", async () => {
      const { service, invocation, fetchMock } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: undefined,
          inboundWebhook: {
            urlSuffix: "/inbound-only",
          },
        },
      });

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].disposition).toBe("SKIP");
      expect(result?.steps[0].message).toContain(
        "no outbound webhook configuration",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("skips inactive adapter", async () => {
      const { service, invocation, fetchMock } = createAdapterHarness({
        adapterOverrides: {
          active: false,
        },
      });

      const result = await service.triggerOutboundHooks(invocation);

      expect(result).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("metrics collection", () => {
    it("records latency for successful requests", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness();

      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve(createFetchResponse(200, { success: true })),
              50,
            );
          }),
      );

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].metrics?.latencyMs).toBeGreaterThanOrEqual(50);
      expect(result?.steps[0].metrics?.retriesAttempted).toBe(0);
    });

    it("records retry count in metrics", async () => {
      const { service, fetchMock, invocation } = createAdapterHarness({
        adapterOverrides: {
          outboundWebhook: {
            url: "https://adapter.test/metrics",
            retryAttempts: 3,
            retryDelayMs: 0,
          },
        },
      });

      fetchMock
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockRejectedValueOnce(new Error("Fail 2"))
        .mockResolvedValueOnce(createFetchResponse(200, {}));

      const result = await service.triggerOutboundHooks(invocation);

      expect(result?.steps[0].metrics?.retriesAttempted).toBe(2);
    });
  });
});
