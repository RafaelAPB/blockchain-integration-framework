/**
 * Integration tests for satpTransferWorkflow Saga compensation behavior.
 *
 * The "Saga" pattern means every failed forward step triggers a compensating
 * rollback. This suite injects a Stage 2 (lockAssertion) failure and verifies:
 *
 *  1. Stages 0–1 activities are called normally before the failure.
 *  2. runWithRecovery starts a crashRecoveryChildWorkflow on first failure.
 *  3. The failed activity is retried once; on second failure, rollbackWorkflow
 *     is started and the main workflow aborts.
 *  4. Stage 3 activities (commitPreparation, commitFinalAssertion,
 *     transferComplete) are NEVER called — the transfer is rolled back before
 *     reaching them.
 *  5. The transferLog query reflects the expected compensation checkpoints.
 *
 * Note on child workflows: startChild() in satpTransferWorkflow is
 * fire-and-forget (no .result() call). The crash-recovery and rollback child
 * workflows run independently after the main workflow aborts. This test mocks
 * their activities as no-ops so they don't pollute test output.
 */
import "jest-extended";
import { ApplicationFailure } from "@temporalio/client";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  satpTransferWorkflow,
  transferLogQuery,
  transferSessionStateQuery,
} from "../../../../main/typescript/temporal/workflows/satp-transfer-workflow";

const TASK_QUEUE = "saga-compensation-test";

describe("satpTransferWorkflow — Saga compensation on Stage 2 failure", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await env.teardown();
  });

  it("aborts and never calls Stage 3 activities when lockAssertion fails", async () => {
    // Arrange — Stage 0-1 activities succeed; Stage 2 lockAssertion always fails
    const stage0And1Response = { mockToken: "ok" };

    const sendNewSessionRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendPreSatpTransferRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendTransferProposalRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendTransferCommenceRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);

    // Stage 2 — always fails (non-retryable so Temporal doesn't retry internally)
    const sendLockAssertionRequest = jest.fn().mockRejectedValue(
      ApplicationFailure.create({
        message: "Lock assertion rejected by counterparty",
        type: "LockAssertionFailed",
        nonRetryable: true,
      }),
    );

    // Stage 3 — must NEVER be called
    const sendCommitPreparationRequest = jest.fn().mockResolvedValue({});
    const sendCommitFinalAssertionRequest = jest.fn().mockResolvedValue({});
    const sendTransferCompleteRequest = jest.fn().mockResolvedValue(undefined);

    // Child workflow activities — no-ops so children complete quickly or time out
    const sendRecoverActivity = jest.fn().mockResolvedValue(undefined);
    const applyLogDiffActivity = jest.fn().mockResolvedValue(0);
    const executeRollbackActivity = jest
      .fn()
      .mockResolvedValue({ stage: "STAGE_2", assetId: "asset-001" });
    const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);

    // validating backup cert is a no-op for this test (backup GW not involved)
    const validateCertChainActivity = jest.fn().mockResolvedValue(true);

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: TASK_QUEUE,
      // satp-transfer-workflow imports crash-recovery-workflow + rollback-workflow;
      // the bundler includes all three automatically.
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/satp-transfer-workflow",
      ),
      activities: {
        // Protocol activities (Stage 0-3)
        sendNewSessionRequest,
        sendPreSatpTransferRequest,
        sendTransferProposalRequest,
        sendTransferCommenceRequest,
        sendLockAssertionRequest,
        sendCommitPreparationRequest,
        sendCommitFinalAssertionRequest,
        sendTransferCompleteRequest,
        // Crash-recovery child activities
        sendRecoverActivity,
        applyLogDiffActivity,
        // Rollback child activities
        executeRollbackActivity,
        sendRollbackActivity,
        // Backup gateway child activities
        validateCertChainActivity,
      },
    });

    const sessionId = "test-session-saga-001";

    const handle = await env.client.workflow.start(satpTransferWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: "saga-comp-001",
      args: [sessionId],
    });

    // Act — the main workflow must fail because lockAssertion cannot succeed
    await expect(worker.runUntil(handle.result())).rejects.toThrow();

    // Assert 1 — Stages 0-1 ran successfully (4 protocol activities each called once)
    expect(sendNewSessionRequest).toHaveBeenCalledOnce();
    expect(sendPreSatpTransferRequest).toHaveBeenCalledOnce();
    expect(sendTransferProposalRequest).toHaveBeenCalledOnce();
    expect(sendTransferCommenceRequest).toHaveBeenCalledOnce();

    // Assert 2 — lockAssertion was attempted twice:
    // once in the original call, once in the runWithRecovery retry after recovery start
    expect(sendLockAssertionRequest).toHaveBeenCalledTimes(2);

    // Assert 3 — Stage 3 activities are NEVER invoked
    expect(sendCommitPreparationRequest).not.toHaveBeenCalled();
    expect(sendCommitFinalAssertionRequest).not.toHaveBeenCalled();
    expect(sendTransferCompleteRequest).not.toHaveBeenCalled();
  });

  it("logs expected compensation checkpoints in transferLog", async () => {
    // Arrange — identical mock setup; here we verify the workflow log order
    const stage0And1Response = { mockToken: "ok" };

    const sendNewSessionRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendPreSatpTransferRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendTransferProposalRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendTransferCommenceRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendLockAssertionRequest = jest.fn().mockRejectedValue(
      ApplicationFailure.create({
        message: "Lock assertion rejected",
        type: "LockAssertionFailed",
        nonRetryable: true,
      }),
    );
    const sendCommitPreparationRequest = jest.fn().mockResolvedValue({});
    const sendCommitFinalAssertionRequest = jest.fn().mockResolvedValue({});
    const sendTransferCompleteRequest = jest.fn().mockResolvedValue(undefined);
    const sendRecoverActivity = jest.fn().mockResolvedValue(undefined);
    const applyLogDiffActivity = jest.fn().mockResolvedValue(0);
    const executeRollbackActivity = jest.fn().mockResolvedValue({});
    const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);
    const validateCertChainActivity = jest.fn().mockResolvedValue(true);

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: `${TASK_QUEUE}-log`,
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/satp-transfer-workflow",
      ),
      activities: {
        sendNewSessionRequest,
        sendPreSatpTransferRequest,
        sendTransferProposalRequest,
        sendTransferCommenceRequest,
        sendLockAssertionRequest,
        sendCommitPreparationRequest,
        sendCommitFinalAssertionRequest,
        sendTransferCompleteRequest,
        sendRecoverActivity,
        applyLogDiffActivity,
        executeRollbackActivity,
        sendRollbackActivity,
        validateCertChainActivity,
      },
    });

    const sessionId = "test-session-saga-002";

    const handle = await env.client.workflow.start(satpTransferWorkflow, {
      taskQueue: `${TASK_QUEUE}-log`,
      workflowId: "saga-comp-002",
      args: [sessionId],
    });

    // Run until it fails AND query the log — both must happen while the
    // worker is still polling, otherwise handle.query() would hang waiting
    // for a worker to respond after worker.runUntil() has shut it down.
    let log: string[] = [];
    await worker.runUntil(async () => {
      await expect(handle.result()).rejects.toThrow();
      log = await handle.query(transferLogQuery);
    });

    // Stage 0-1 forward steps must appear
    expect(log).toContain("STAGE0_NEW_SESSION");
    expect(log).toContain("STAGE0_PRE_SATP");
    expect(log).toContain("STAGE1_TRANSFER_PROPOSAL");
    expect(log).toContain("STAGE1_TRANSFER_COMMENCE");
    expect(log).toContain("STAGE2_LOCK_ASSERTION");

    // Compensation checkpoints must appear after Stage 2 entry
    expect(log).toContain("FAILED:lockAssertion");
    expect(log).toContain("RECOVERY_STARTED");
    expect(log).toContain("ROLLBACK_STARTED");

    // Final abort state
    expect(log).toContain("ABORTED");

    // Stage 3 checkpoints must NOT appear in the log
    expect(log).not.toContain("STAGE3_COMMIT_PREPARATION");
    expect(log).not.toContain("STAGE3_COMMIT_FINAL_ASSERTION");
    expect(log).not.toContain("STAGE3_TRANSFER_COMPLETE");
    expect(log).not.toContain("COMPLETED");

    // Compensation must occur AFTER the failure, not before
    const failedIdx = log.indexOf("FAILED:lockAssertion");
    const recoveryIdx = log.indexOf("RECOVERY_STARTED");
    const rollbackIdx = log.indexOf("ROLLBACK_STARTED");
    const abortedIdx = log.indexOf("ABORTED");

    expect(failedIdx).toBeLessThan(recoveryIdx);
    expect(recoveryIdx).toBeLessThan(rollbackIdx);
    expect(rollbackIdx).toBeLessThan(abortedIdx);
  });

  it("reports ABORTED state via transferSessionState query after Stage 2 failure", async () => {
    const stage0And1Response = { mockToken: "ok" };

    const sendNewSessionRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendPreSatpTransferRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendTransferProposalRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendTransferCommenceRequest = jest
      .fn()
      .mockResolvedValue(stage0And1Response);
    const sendLockAssertionRequest = jest.fn().mockRejectedValue(
      ApplicationFailure.create({
        message: "Lock assertion rejected",
        type: "LockAssertionFailed",
        nonRetryable: true,
      }),
    );
    const sendCommitPreparationRequest = jest.fn().mockResolvedValue({});
    const sendCommitFinalAssertionRequest = jest.fn().mockResolvedValue({});
    const sendTransferCompleteRequest = jest.fn().mockResolvedValue(undefined);
    const sendRecoverActivity = jest.fn().mockResolvedValue(undefined);
    const applyLogDiffActivity = jest.fn().mockResolvedValue(0);
    const executeRollbackActivity = jest.fn().mockResolvedValue({});
    const sendRollbackActivity = jest.fn().mockResolvedValue(undefined);
    const validateCertChainActivity = jest.fn().mockResolvedValue(true);

    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace,
      taskQueue: `${TASK_QUEUE}-state`,
      workflowsPath: require.resolve(
        "../../../../main/typescript/temporal/workflows/satp-transfer-workflow",
      ),
      activities: {
        sendNewSessionRequest,
        sendPreSatpTransferRequest,
        sendTransferProposalRequest,
        sendTransferCommenceRequest,
        sendLockAssertionRequest,
        sendCommitPreparationRequest,
        sendCommitFinalAssertionRequest,
        sendTransferCompleteRequest,
        sendRecoverActivity,
        applyLogDiffActivity,
        executeRollbackActivity,
        sendRollbackActivity,
        validateCertChainActivity,
      },
    });

    const sessionId = "test-session-saga-003";

    const handle = await env.client.workflow.start(satpTransferWorkflow, {
      taskQueue: `${TASK_QUEUE}-state`,
      workflowId: "saga-comp-003",
      args: [sessionId],
    });

    // Query the session state inside runUntil so the worker is still up to
    // serve the query after the workflow reaches its terminal ABORTED state.
    let finalState: string | undefined;
    await worker.runUntil(async () => {
      await expect(handle.result()).rejects.toThrow();
      finalState = await handle.query(transferSessionStateQuery);
    });
    expect(finalState).toBe("ABORTED");
  });
});
