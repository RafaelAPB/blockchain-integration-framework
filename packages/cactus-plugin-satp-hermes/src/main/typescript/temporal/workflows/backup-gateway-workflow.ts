import {
  ApplicationFailure,
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

export interface BackupTakeoverPayload {
  sessionId: string;
  backupGatewayId: string;
  certChainPem: string;
}

export interface BackupGatewayActivities {
  validateCertChainActivity(certChainPem: string): Promise<boolean>;
}

export const backupTakeoverSignal =
  defineSignal<[BackupTakeoverPayload]>("backupTakeover");
export const backupSessionStateQuery = defineQuery<string>("sessionState");

const { validateCertChainActivity } = proxyActivities<BackupGatewayActivities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 2 },
});

/**
 * Backup gateway promotion workflow.
 *
 * Listens for a backupTakeoverSignal from the primary gateway's crash handler.
 * Validates the backup's X.509 certificate chain before accepting the takeover.
 *
 * Signals:
 *  - backupTakeoverSignal — emitted by T19 signal bridge when backup promotion
 *    is requested
 *
 * Queries:
 *  - sessionState — current promotion state
 *
 * @param sessionId  SATP session identifier.
 * @param timeoutMs  Maximum wait for the backupTakeover signal (default 60 s).
 */
export async function backupGatewayWorkflow(
  sessionId: string,
  timeoutMs = 60_000,
): Promise<void> {
  let state = "AWAITING_TAKEOVER";
  let takeoverPayload: BackupTakeoverPayload | undefined;

  setHandler(backupTakeoverSignal, (payload) => {
    takeoverPayload = payload;
  });
  setHandler(backupSessionStateQuery, () => state);

  // Wait for the takeover signal
  const signalReceived = await condition(
    () => takeoverPayload !== undefined,
    timeoutMs,
  );
  if (!signalReceived) {
    state = "TIMED_OUT";
    throw ApplicationFailure.create({
      message: `Backup takeover signal not received within ${timeoutMs}ms for session ${sessionId}`,
      type: "BackupTakeoverTimeout",
      nonRetryable: true,
    });
  }

  // Validate backup gateway certificate chain (takeoverPayload is set — condition() returned true)
  state = "VALIDATING_CERT";
  const payload = takeoverPayload as BackupTakeoverPayload;
  const certValid = await validateCertChainActivity(payload.certChainPem);
  if (!certValid) {
    state = "INVALID_CERT";
    throw ApplicationFailure.create({
      message: `Invalid certificate chain from backup gateway ${payload.backupGatewayId}`,
      type: "InvalidCertChain",
      nonRetryable: true,
    });
  }

  state = "BACKUP_ACTIVE";
}
