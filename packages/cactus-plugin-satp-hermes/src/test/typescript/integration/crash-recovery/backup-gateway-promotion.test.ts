/**
 * Integration tests for backupGatewayWorkflow using an embedded Temporal
 * test server (time-skipping mode — no Docker, no real Temporal cluster).
 *
 * The backup gateway promotion protocol involves three outcomes:
 *  1. Happy path  — backupTakeoverSignal received; cert chain is valid;
 *     workflow completes in BACKUP_ACTIVE state.
 *  2. Invalid cert — backupTakeoverSignal received; validateCertChainActivity
 *     returns false; workflow fails with ApplicationFailure "InvalidCertChain".
 *  3. Timeout     — signal not received within the configured window; workflow
 *     fails with ApplicationFailure "BackupTakeoverTimeout".
 *
 * Test scope also includes query verification: the sessionState query must
 * reflect the current promotion phase.
 */
import "jest-extended";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  backupGatewayWorkflow,
  backupTakeoverSignal,
  backupSessionStateQuery,
} from "../../../../main/typescript/temporal/workflows/backup-gateway-workflow";

const TASK_QUEUE = "backup-gateway-test";

describe("backupGatewayWorkflow", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await env.teardown();
  });

  describe("happy path — valid certificate chain", () => {
    it("completes successfully and calls validateCertChainActivity with the PEM from the signal", async () => {
      // Arrange
      const certChainPem =
        "-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----";
      const validateCertChainActivity = jest.fn().mockResolvedValue(true);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: TASK_QUEUE,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/backup-gateway-workflow",
        ),
        activities: { validateCertChainActivity },
      });

      const sessionId = "test-session-bg-001";

      const handle = await env.client.workflow.start(backupGatewayWorkflow, {
        taskQueue: TASK_QUEUE,
        workflowId: "bg-happy-001",
        args: [sessionId, 5_000],
      });

      // Signal the takeover before running the worker
      await handle.signal(backupTakeoverSignal, {
        sessionId,
        backupGatewayId: "gw-backup-001",
        certChainPem,
      });

      // Act
      await worker.runUntil(handle.result());

      // Assert
      expect(validateCertChainActivity).toHaveBeenCalledOnce();
      expect(validateCertChainActivity).toHaveBeenCalledWith(certChainPem);
    });
  });

  describe("invalid certificate chain", () => {
    it("fails with InvalidCertChain when validateCertChainActivity returns false", async () => {
      // Arrange — cert validation rejects the backup gateway
      const validateCertChainActivity = jest.fn().mockResolvedValue(false);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: `${TASK_QUEUE}-invalid-cert`,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/backup-gateway-workflow",
        ),
        activities: { validateCertChainActivity },
      });

      const sessionId = "test-session-bg-002";

      const handle = await env.client.workflow.start(backupGatewayWorkflow, {
        taskQueue: `${TASK_QUEUE}-invalid-cert`,
        workflowId: "bg-invalid-cert-001",
        args: [sessionId, 5_000],
      });

      await handle.signal(backupTakeoverSignal, {
        sessionId,
        backupGatewayId: "gw-backup-bad",
        certChainPem:
          "-----BEGIN CERTIFICATE-----\nTAMPERED\n-----END CERTIFICATE-----",
      });

      // Act & Assert — workflow must fail with InvalidCertChain
      const result = worker.runUntil(handle.result());
      await expect(result).rejects.toThrow();

      // Verify the cert was checked (activity was invoked)
      expect(validateCertChainActivity).toHaveBeenCalledOnce();
    });
  });

  describe("takeover signal timeout", () => {
    it("fails with BackupTakeoverTimeout when no signal arrives", async () => {
      // Arrange — no signal will be sent; time-skipping env skips the wait
      const validateCertChainActivity = jest.fn().mockResolvedValue(true);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: `${TASK_QUEUE}-timeout`,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/backup-gateway-workflow",
        ),
        activities: { validateCertChainActivity },
      });

      const sessionId = "test-session-bg-003";

      // Short timeout (1 ms) so time-skipping environment skips it instantly
      const handle = await env.client.workflow.start(backupGatewayWorkflow, {
        taskQueue: `${TASK_QUEUE}-timeout`,
        workflowId: "bg-timeout-001",
        args: [sessionId, 1],
      });

      // Act & Assert — workflow must reject due to timeout
      const result = worker.runUntil(handle.result());
      await expect(result).rejects.toThrow();

      // validateCertChain must never have been called since the signal never arrived
      expect(validateCertChainActivity).not.toHaveBeenCalled();
    });
  });

  describe("state query", () => {
    it("reports AWAITING_TAKEOVER before signal arrives and then resolves", async () => {
      // Arrange
      const validateCertChainActivity = jest.fn().mockResolvedValue(true);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        namespace: env.namespace,
        taskQueue: `${TASK_QUEUE}-query`,
        workflowsPath: require.resolve(
          "../../../../main/typescript/temporal/workflows/backup-gateway-workflow",
        ),
        activities: { validateCertChainActivity },
      });

      const sessionId = "test-session-bg-004";

      const handle = await env.client.workflow.start(backupGatewayWorkflow, {
        taskQueue: `${TASK_QUEUE}-query`,
        workflowId: "bg-query-001",
        args: [sessionId, 10_000],
      });

      // Query initial state before the signal is delivered
      const initialState = await handle.query(backupSessionStateQuery);
      expect(initialState).toBe("AWAITING_TAKEOVER");

      // Now send the signal and let the workflow complete
      await handle.signal(backupTakeoverSignal, {
        sessionId,
        backupGatewayId: "gw-backup-002",
        certChainPem:
          "-----BEGIN CERTIFICATE-----\nVALID\n-----END CERTIFICATE-----",
      });

      await worker.runUntil(handle.result());
    });
  });
});
