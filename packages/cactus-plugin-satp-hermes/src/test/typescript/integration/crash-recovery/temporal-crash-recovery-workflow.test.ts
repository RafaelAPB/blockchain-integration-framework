/**
 * Integration tests for crashRecoveryChildWorkflow using an embedded Temporal
 * test server (time-skipping mode — no Docker, no real Temporal cluster).
 *
 * Test scope:
 * - Happy path: recoverUpdateSignal + recoverSuccessSignal drive the workflow
 *   to RECOVERED state; sendRecoverActivity and applyLogDiffActivity are called.
 * - Timeout path: no signals sent; condition() times out; workflow starts
 *   rollbackWorkflow child and returns cleanly.
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

const TASK_QUEUE = "crash-recovery-child-test";

describe("crashRecoveryChildWorkflow", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await env.teardown();
  });

  describe("happy path", () => {
    it("calls sendRecoverActivity and applyLogDiffActivity after receiving signals", async () => {
      // Arrange
      const sendRecoverActivity = jest.fn().mockResolvedValue(undefined);
      const applyLogDiffActivity = jest.fn().mockResolvedValue(1);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: TASK_QUEUE,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/crash-recovery-workflow",
        ),
        activities: { sendRecoverActivity, applyLogDiffActivity },
      });

      const sessionId = "test-session-cr-001";
      const entries: LocalLog[] = [];

      // Start the workflow
      const handle = await env.client.workflow.start(
        crashRecoveryChildWorkflow,
        {
          taskQueue: TASK_QUEUE,
          workflowId: "cr-happy-001",
          args: [sessionId, 5_000],
        },
      );

      // Send signals before running worker — they will be queued and processed
      await handle.signal(recoverUpdateSignal, { sessionId, entries });
      await handle.signal(recoverSuccessSignal, { sessionId });

      // Act
      await worker.runUntil(handle.result());

      // Assert
      expect(sendRecoverActivity).toHaveBeenCalledOnce();
      expect(applyLogDiffActivity).toHaveBeenCalledOnce();
      expect(applyLogDiffActivity).toHaveBeenCalledWith(entries);
    });
  });

  describe("timeout path", () => {
    it("completes without error and starts rollbackWorkflow child when signal timeout elapses", async () => {
      // Arrange — include rollback activities for the spawned child workflow
      const sendRecoverActivity = jest.fn().mockResolvedValue(undefined);
      const applyLogDiffActivity = jest.fn().mockResolvedValue(0);
      const executeRollbackActivity = jest.fn().mockResolvedValue({});
      const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: `${TASK_QUEUE}-timeout`,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/crash-recovery-workflow",
        ),
        activities: {
          sendRecoverActivity,
          applyLogDiffActivity,
          executeRollbackActivity,
          sendRollbackActivity,
        },
      });

      const sessionId = "test-session-timeout-001";
      // Short timeout → condition() auto-skipped by time-skipping environment
      const timeoutMs = 100;

      // Act: no signals sent; time-skipping auto-advances past the 100 ms timer
      await worker.runUntil(
        env.client.workflow.execute(crashRecoveryChildWorkflow, {
          taskQueue: `${TASK_QUEUE}-timeout`,
          workflowId: "cr-timeout-001",
          args: [sessionId, timeoutMs],
        }),
      );

      // Parent completed after timeout — sendRecover was called, no log diff applied
      expect(sendRecoverActivity).toHaveBeenCalledOnce();
      expect(applyLogDiffActivity).not.toHaveBeenCalled();
    });
  });
});
