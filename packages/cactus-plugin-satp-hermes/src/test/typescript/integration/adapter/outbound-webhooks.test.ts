import { describe, expect, it } from "@jest/globals";
import {
  createAdapterHarness,
  createFetchResponse,
} from "./adapter-test-helpers";

describe("AdapterHookService outbound webhooks", () => {
  it("invokes fetch with the adapter configuration", async () => {
    const harness = createAdapterHarness({
      adapterOverrides: {
        outboundWebhook: {
          url: "https://adapter.example/outbound",
          headers: { "x-custom": "abc" },
          method: "POST",
        },
      },
    });
    harness.fetchMock.mockResolvedValueOnce(
      createFetchResponse(202, { acknowledged: true }),
    );

    const result = await harness.service.triggerOutboundHooks(
      harness.invocation,
    );

    expect(result?.steps[0].disposition).toBe("CONTINUE");
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = harness.fetchMock.mock.calls[0];
    expect(url).toBe("https://adapter.example/outbound");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-custom": "abc",
    });
    const payload = JSON.parse((init?.body as string) ?? "{}");
    expect(payload.sessionId).toBe(harness.invocation.sessionId);
    expect(result?.steps[0].outboundResult?.responseBody).toEqual({
      acknowledged: true,
    });
  });

  it("retries and reports failure when the webhook never succeeds", async () => {
    const harness = createAdapterHarness({
      adapterOverrides: {
        outboundWebhook: {
          retryAttempts: 2,
          retryDelayMs: 0,
          url: "https://adapter.example/retry",
        },
      },
    });
    harness.fetchMock.mockRejectedValue(new Error("network down"));

    const result = await harness.service.triggerOutboundHooks(
      harness.invocation,
    );
    const step = result?.steps[0];

    expect(step?.disposition).toBe("FAIL");
    expect(step?.outboundResult?.status).toBe("FAILED");
    expect(step?.outboundResult?.retriesAttempted).toBe(1);
    expect(harness.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("omits the request body for GET webhooks", async () => {
    const harness = createAdapterHarness({
      adapterOverrides: {
        outboundWebhook: {
          method: "GET",
          url: "https://adapter.example/get",
        },
      },
    });
    harness.fetchMock.mockResolvedValue(createFetchResponse(200, {}));

    await harness.service.triggerOutboundHooks(harness.invocation);

    const [, init] = harness.fetchMock.mock.calls[0];
    expect(init?.body).toBeUndefined();
  });
});
