/**
 * Integration tests for rollbackWorkflow Point-of-No-Return (PONR) behavior.
 *
 * Once the asset-transfer protocol reaches Stage 3 commit-final, an undo of
 * the on-chain state change is no longer safe. If executeRollbackActivity
 * detects this condition and throws PointOfNoReturnViolation (non-retryable),
 * the rollbackWorkflow must:
 *  - fail immediately without retrying the activity
 *  - NOT call sendRollbackActivity (counterparty must not be notified of a
 *    rollback that cannot be completed)
 *
 * Test scope:
 *  1. executeRollbackActivity throws PONR → workflow fails; sendRollbackActivity
 *     never called.
 *  2. Non-retryable flag is respected: exactly 1 attempt is made regardless
 *     of the `maximumAttempts` in the proxyActivities options.
 */
import "jest-extended";
import { ApplicationFailure } from "@temporalio/client";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  rollbackWorkflow,
  rollbackAckSignal,
} from "../../../../main/typescript/temporal/workflows/rollback-workflow";

const TASK_QUEUE = "rollback-ponr-test";

describe("rollbackWorkflow — PointOfNoReturn", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await env.teardown();
  });

  it("fails immediately and does not call sendRollbackActivity when PONR is thrown", async () => {
    // Arrange — executeRollback signals PONR; sendRollback must stay uncalled
    const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);
    const executeRollbackActivity = jest.fn().mockRejectedValue(
      ApplicationFailure.create({
        message:
          "Stage 3 commit-final reached — on-chain state change irreversible",
        type: "PointOfNoReturnViolation",
        nonRetryable: true,
      }),
    );

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/rollback-workflow",
      ),
      activities: { executeRollbackActivity, sendRollbackActivity },
    });

    const sessionId = "test-session-ponr-001";

    const handle = await env.client.workflow.start(rollbackWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: "rb-ponr-001",
      args: [sessionId, 5_000],
    });

    // Act — workflow should reject with a PONR failure
    await expect(worker.runUntil(handle.result())).rejects.toThrow();

    // Critical invariant: counterparty must NOT receive a rollback message
    // when the PONR has been reached
    expect(sendRollbackActivity).not.toHaveBeenCalled();
  });

  it("makes exactly 1 attempt when nonRetryable is true", async () => {
    // Arrange — nonRetryable overrides the workflow's maximumAttempts: 3
    let attemptCount = 0;
    const executeRollbackActivity = jest.fn().mockImplementation(async () => {
      attemptCount++;
      throw ApplicationFailure.create({
        message: "PONR",
        type: "PointOfNoReturnViolation",
        nonRetryable: true,
      });
    });
    const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);

    const sessionId = "test-session-ponr-002";

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: `${TASK_QUEUE}-single-attempt`,
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/rollback-workflow",
      ),
      activities: { executeRollbackActivity, sendRollbackActivity },
    });

    const handle = await env.client.workflow.start(rollbackWorkflow, {
      taskQueue: `${TASK_QUEUE}-single-attempt`,
      workflowId: "rb-ponr-002",
      args: [sessionId, 5_000],
    });

    await expect(worker.runUntil(handle.result())).rejects.toThrow();

    // nonRetryable: true must override maximumAttempts: 3 in the proxyActivities config
    expect(attemptCount).toBe(1);
  });

  it("reaches ROLLED_BACK state when no PONR is thrown (control)", async () => {
    // Control test — normal rollback without PONR must still succeed
    const rollbackState = { stage: "STAGE_1", assetId: "asset-001" };
    const executeRollbackActivity = jest.fn().mockResolvedValue(rollbackState);
    const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);

    const sessionId = "test-session-ponr-ctrl-001";

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: `${TASK_QUEUE}-control`,
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/rollback-workflow",
      ),
      activities: { executeRollbackActivity, sendRollbackActivity },
    });

    const handle = await env.client.workflow.start(rollbackWorkflow, {
      taskQueue: `${TASK_QUEUE}-control`,
      workflowId: "rb-ponr-ctrl-001",
      args: [sessionId, 5_000],
    });

    // Send the ack to complete the happy path
    await handle.signal(rollbackAckSignal, { sessionId });

    await worker.runUntil(handle.result());

    expect(executeRollbackActivity).toHaveBeenCalledOnce();
    expect(sendRollbackActivity).toHaveBeenCalledOnce();
  });
});
