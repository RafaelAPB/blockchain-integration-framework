import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
} from "@temporalio/worker";
import type { Next } from "@temporalio/worker";
import {
  context as otelContext,
  propagation,
  ROOT_CONTEXT,
} from "@opentelemetry/api";

/**
 * Temporal activity inbound interceptor that extracts an OTel W3C trace
 * context from Temporal activity headers and restores it as the active
 * OpenTelemetry context for the duration of the activity execution.
 *
 * This connects the trace started in the ConnectRPC request handler (gateway
 * process) to the activities running inside the Temporal Worker so that all
 * spans appear within the same trace tree.
 */
export class OtelActivityInboundInterceptor
  implements ActivityInboundCallsInterceptor
{
  public async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    const carrier: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.headers)) {
      if (v?.data != null) {
        carrier[k] = Buffer.from(v.data).toString();
      }
    }
    const ctx = propagation.extract(ROOT_CONTEXT, carrier);
    return otelContext.with(ctx, () => next(input));
  }
}
