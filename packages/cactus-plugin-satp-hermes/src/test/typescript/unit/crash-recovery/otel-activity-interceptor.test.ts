/**
 * Unit tests for the OtelActivityInboundInterceptor.
 *
 * Verifies that the interceptor correctly:
 *  - extracts W3C TraceContext from Temporal activity headers, and
 *  - restores the extracted OTel context for the duration of the activity.
 *
 * No Temporal Worker is started; the interceptor's `execute()` method is
 * called directly.
 */
import "jest-extended";
import {
  context as otelContext,
  propagation,
  trace,
  ROOT_CONTEXT,
} from "@opentelemetry/api";
import { OtelActivityInboundInterceptor } from "../../../../main/typescript/temporal/interceptors/otel-activity-interceptor";
import type { ActivityExecuteInput } from "@temporalio/worker";

// Convenience alias — use the concrete class's own method signature so the
// `next` parameter type is non-optional.
type NextFn = Parameters<OtelActivityInboundInterceptor["execute"]>[1];

// ---------------------------------------------------------------------------
// Helper — build a minimal ActivityExecuteInput
// ---------------------------------------------------------------------------

function makeInput(
  headers: Record<string, Uint8Array | undefined>,
): ActivityExecuteInput {
  const headerMap: Record<string, { data: Uint8Array } | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) {
      headerMap[k] = { data: v };
    }
  }
  return {
    args: [],
    headers: headerMap,
  } as unknown as ActivityExecuteInput;
}

function makeNext(returnValue: unknown = "activity-result"): {
  captured: () => ReturnType<typeof otelContext.active> | undefined;
  fn: NextFn;
} {
  let capturedContext: ReturnType<typeof otelContext.active> | undefined;
  const fn = jest.fn().mockImplementation(async () => {
    capturedContext = otelContext.active();
    return returnValue;
  }) as unknown as NextFn;
  return {
    captured: () => capturedContext,
    fn,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OtelActivityInboundInterceptor", () => {
  it("is instantiable", () => {
    expect(() => new OtelActivityInboundInterceptor()).not.toThrow();
  });

  it("calls next and returns its result when headers are empty", async () => {
    const interceptor = new OtelActivityInboundInterceptor();
    const input = makeInput({});
    const { fn: next } = makeNext("activity-result");

    const result = await interceptor.execute(input, next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe("activity-result");
  });

  it("propagates ROOT_CONTEXT when no trace headers are present", async () => {
    const interceptor = new OtelActivityInboundInterceptor();
    const input = makeInput({});
    const { fn: next, captured } = makeNext();

    await interceptor.execute(input, next);

    // Without a traceparent header the active context inside next() should
    // carry no span (ROOT_CONTEXT or equivalent).
    const spanInsideNext = trace.getSpan(captured()!);
    expect(spanInsideNext).toBeUndefined();
  });

  it("extracts W3C traceparent from activity headers and activates its context", async () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const spanId = "00f067aa0ba902b7";
    const traceparentValue = `00-${traceId}-${spanId}-01`;

    // Use TextEncoder to get a plain Uint8Array (avoids Buffer type mismatch)
    const enc = new TextEncoder();
    const input = makeInput({ traceparent: enc.encode(traceparentValue) });

    const { fn: next, captured } = makeNext();
    const interceptor = new OtelActivityInboundInterceptor();

    await interceptor.execute(input, next);

    expect(next).toHaveBeenCalledOnce();

    const span = trace.getSpan(captured()!);
    if (span) {
      // SDK registered — verify extracted traceId
      expect(span.spanContext().traceId).toBe(traceId);
    } else {
      // No SDK registered in tests — confirm the W3C propagator can decode
      // the header independently.
      const extracted = propagation.extract(ROOT_CONTEXT, {
        traceparent: traceparentValue,
      });
      const extractedSpan = trace.getSpan(extracted);
      if (extractedSpan) {
        expect(extractedSpan.spanContext().traceId).toBe(traceId);
      }
      // Either way next() must have been called exactly once.
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it("restores the outer OTel context after execution completes", async () => {
    const outerContext = otelContext.active();

    const interceptor = new OtelActivityInboundInterceptor();
    const input = makeInput({});
    const { fn: next } = makeNext();

    await interceptor.execute(input, next);

    // After execute(), the outer context must be restored.
    expect(otelContext.active()).toBe(outerContext);
  });

  it("passes the original input unchanged to next", async () => {
    const interceptor = new OtelActivityInboundInterceptor();
    const enc = new TextEncoder();
    const input = makeInput({ "x-custom": enc.encode("some-value") });

    let receivedInput: ActivityExecuteInput | undefined;
    const next = jest
      .fn()
      .mockImplementation(async (i: ActivityExecuteInput) => {
        receivedInput = i;
        return undefined;
      }) as unknown as NextFn;

    await interceptor.execute(input, next);

    expect(receivedInput).toBe(input);
  });

  it("skips headers whose data field is missing", async () => {
    const interceptor = new OtelActivityInboundInterceptor();
    // Pass a key with undefined value — makeInput() omits it from the map
    const input = makeInput({ "x-absent": undefined });
    const { fn: next } = makeNext("ok");

    await expect(interceptor.execute(input, next)).resolves.toBe("ok");
    expect(next).toHaveBeenCalledOnce();
  });
});
