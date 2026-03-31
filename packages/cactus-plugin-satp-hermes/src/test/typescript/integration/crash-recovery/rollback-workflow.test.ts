/**
 * Integration tests for rollbackWorkflow using an embedded Temporal test
 * server (time-skipping mode — no Docker, no real Temporal cluster).
 *
 * Test scope:
 * - Happy path: executeRollbackActivity and sendRollbackActivity are called in
 *   order; rollbackAckSignal is received; workflow completes (ROLLED_BACK).
 * - Timeout path: rollbackAckSignal not sent; condition() times out; workflow
 *   fails with ApplicationFailure type "RollbackAckTimeout".
 */
import "jest-extended";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  rollbackWorkflow,
  rollbackAckSignal,
} from "../../../../main/typescript/temporal/workflows/rollback-workflow";

const TASK_QUEUE = "rollback-workflow-test";

describe("rollbackWorkflow", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await env.teardown();
  });

  describe("happy path", () => {
    it("calls executeRollbackActivity then sendRollbackActivity in order and completes", async () => {
      // Arrange
      const callOrder: string[] = [];
      const rollbackState = { stage: "STAGE_1", success: true };

      const executeRollbackActivity = jest.fn().mockImplementation(async () => {
        callOrder.push("executeRollbackActivity");
        return rollbackState;
      });
      const sendRollbackActivity = jest.fn().mockImplementation(async () => {
        callOrder.push("sendRollbackActivity");
      });

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: TASK_QUEUE,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/rollback-workflow",
        ),
        activities: { executeRollbackActivity, sendRollbackActivity },
      });

      const sessionId = "test-session-rb-001";

      // Start workflow
      const handle = await env.client.workflow.start(rollbackWorkflow, {
        taskQueue: TASK_QUEUE,
        workflowId: "rb-happy-001",
        args: [sessionId, 5_000],
      });

      // Signal rollback ack — queued before worker processes the workflow;
      // processed after activities complete, satisfying condition()
      await handle.signal(rollbackAckSignal, { sessionId });

      // Act
      await worker.runUntil(handle.result());

      // Assert
      expect(executeRollbackActivity).toHaveBeenCalledOnce();
      expect(executeRollbackActivity).toHaveBeenCalledWith(sessionId);
      expect(sendRollbackActivity).toHaveBeenCalledOnce();
      expect(sendRollbackActivity).toHaveBeenCalledWith(
        sessionId,
        rollbackState,
      );
      expect(callOrder).toStrictEqual([
        "executeRollbackActivity",
        "sendRollbackActivity",
      ]);
    });
  });

  describe("timeout path", () => {
    it("fails with RollbackAckTimeout when rollbackAckSignal is not received", async () => {
      // Arrange
      const executeRollbackActivity = jest
        .fn()
        .mockResolvedValue({ stage: "STAGE_1", success: true });
      const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: `${TASK_QUEUE}-timeout`,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/rollback-workflow",
        ),
        activities: { executeRollbackActivity, sendRollbackActivity },
      });

      const sessionId = "test-session-rb-timeout-001";
      // Very short timeout — time-skipping environment auto-advances past it
      const timeoutMs = 100;

      // Act & Assert: no signal sent; workflow must throw
      await expect(
        worker.runUntil(
          env.client.workflow.execute(rollbackWorkflow, {
            taskQueue: `${TASK_QUEUE}-timeout`,
            workflowId: "rb-timeout-001",
            args: [sessionId, timeoutMs],
          }),
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ type: "RollbackAckTimeout" }),
      });

      expect(executeRollbackActivity).toHaveBeenCalledOnce();
      expect(sendRollbackActivity).toHaveBeenCalledOnce();
    });
  });
});
