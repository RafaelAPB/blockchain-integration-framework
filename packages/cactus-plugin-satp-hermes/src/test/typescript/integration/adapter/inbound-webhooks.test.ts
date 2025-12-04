import { describe, expect, it } from "@jest/globals";
import { createAdapterHarness } from "./adapter-test-helpers";

describe("AdapterHookService inbound webhooks", () => {
  it("reports a skip when no inbound webhook is configured", async () => {
    const { service, invocation } = createAdapterHarness();

    const result = await service.awaitInboundHooks(invocation);
    const step = result?.steps[0];

    expect(step?.disposition).toBe("SKIP");
    expect(step?.message).toContain("no inbound webhook configuration");
  });

  it("still skips inbound hooks because external callbacks are required", async () => {
    const { service, invocation } = createAdapterHarness({
      adapterOverrides: {
        inboundWebhook: {
          urlSuffix: "/stage1/decision",
        },
      },
    });

    const result = await service.awaitInboundHooks(invocation);
    const step = result?.steps[0];

    expect(step?.disposition).toBe("SKIP");
    expect(step?.message).toContain(
      "Inbound adapter hooks require external controller callbacks",
    );
  });
});
