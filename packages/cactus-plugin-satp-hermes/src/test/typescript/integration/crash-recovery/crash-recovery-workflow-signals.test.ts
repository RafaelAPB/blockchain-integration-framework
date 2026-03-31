/**
 * Integration tests for signal injection in crashRecoveryChildWorkflow.
 *
 * Verifies that signals delivered mid-workflow are handled correctly:
 * - recoverUpdateSignal payload is forwarded verbatim to applyLogDiffActivity.
 * - recoverSuccessSignal after the update causes the workflow to complete.
 */
import "jest-extended";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  crashRecoveryChildWorkflow,
  recoverUpdateSignal,
  recoverSuccessSignal,
} from "../../../../main/typescript/temporal/workflows/crash-recovery-workflow";
import type { LocalLog } from "../../../../main/typescript/core/types";

const TASK_QUEUE = "crash-recovery-signals-test";

describe("crashRecoveryChildWorkflow — signal injection", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await env.teardown();
  });

  it("forwards recoverUpdateSignal entries to applyLogDiffActivity", async () => {
    // Arrange
    const sendRecoverActivity = jest.fn().mockResolvedValue(undefined);
    const applyLogDiffActivity = jest.fn().mockResolvedValue(2);

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/crash-recovery-workflow",
      ),
      activities: { sendRecoverActivity, applyLogDiffActivity },
    });

    const sessionId = "test-session-sig-001";
    const entries: LocalLog[] = [
      {
        sessionId,
        type: "exec",
        key: "log-key-001",
        operation: "EXEC",
        timestamp: new Date().toISOString(),
        data: "{}",
        sequenceNumber: 1,
      },
      {
        sessionId,
        type: "done",
        key: "log-key-002",
        operation: "DONE",
        timestamp: new Date().toISOString(),
        data: "{}",
        sequenceNumber: 2,
      },
    ];

    // Start workflow
    const handle = await env.client.workflow.start(crashRecoveryChildWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: "cr-signals-update-001",
      args: [sessionId, 5_000],
    });

    // Inject recoverUpdateSignal with concrete entries
    await handle.signal(recoverUpdateSignal, { sessionId, entries });

    // Inject recoverSuccessSignal to complete the workflow
    await handle.signal(recoverSuccessSignal, { sessionId });

    // Act
    await worker.runUntil(handle.result());

    // Assert: applyLogDiffActivity received the exact entries from the signal
    expect(applyLogDiffActivity).toHaveBeenCalledOnce();
    expect(applyLogDiffActivity).toHaveBeenCalledWith(entries);
  });

  it("completes cleanly after recoverSuccessSignal follows recoverUpdateSignal", async () => {
    // Arrange
    const sendRecoverActivity = jest.fn().mockResolvedValue(undefined);
    const applyLogDiffActivity = jest.fn().mockResolvedValue(0);

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: `${TASK_QUEUE}-2`,
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/crash-recovery-workflow",
      ),
      activities: { sendRecoverActivity, applyLogDiffActivity },
    });

    const sessionId = "test-session-sig-002";
    const entries: LocalLog[] = [];

    const handle = await env.client.workflow.start(crashRecoveryChildWorkflow, {
      taskQueue: `${TASK_QUEUE}-2`,
      workflowId: "cr-signals-success-002",
      args: [sessionId, 5_000],
    });

    await handle.signal(recoverUpdateSignal, { sessionId, entries });
    await handle.signal(recoverSuccessSignal, { sessionId });

    // Act: must resolve without error
    await expect(worker.runUntil(handle.result())).resolves.not.toThrow();

    expect(sendRecoverActivity).toHaveBeenCalledOnce();
    expect(applyLogDiffActivity).toHaveBeenCalledOnce();
  });
});
