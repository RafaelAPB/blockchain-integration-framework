import { readFileSync } from "node:fs";
import { Worker, NativeConnection } from "@temporalio/worker";
import { Client, Connection } from "@temporalio/client";
import { makeLogStorageActivities } from "./activities/log-storage-activities";
import { makeCrashRecoveryActivities } from "./activities/crash-recovery-activities";
import { makeProtocolActivities } from "./activities/protocol-activities";
import { makeMonitorActivities } from "./activities/monitor-activities";
import { makeBackupActivities } from "./activities/backup-activities";
import { OtelActivityInboundInterceptor } from "./interceptors/otel-activity-interceptor";
import type {
  ILocalLogRepository,
  IRemoteLogRepository,
} from "../database/repository/interfaces/repository";
import type { SATPSession } from "../core/satp-session";
import type { CrashRecoveryHandler } from "../core/crash-management/crash-handler";
import type { RollbackStrategyFactory } from "../core/crash-management/rollback/rollback-strategy-factory";
import type { Stage0SATPHandler } from "../core/stage-handlers/stage0-handler";
import type { Stage1SATPHandler } from "../core/stage-handlers/stage1-handler";
import type { Stage2SATPHandler } from "../core/stage-handlers/stage2-handler";
import type { Stage3SATPHandler } from "../core/stage-handlers/stage3-handler";
import type { MonitorService } from "../services/monitoring/monitor";

export interface ISatpWorkerDeps {
  localRepository: ILocalLogRepository;
  remoteRepository?: IRemoteLogRepository;
  sessions: Map<string, SATPSession>;
  crashHandler: CrashRecoveryHandler;
  rollbackStrategyFactory: RollbackStrategyFactory;
  stage0Handler: Stage0SATPHandler;
  stage1Handler: Stage1SATPHandler;
  stage2Handler: Stage2SATPHandler;
  stage3Handler: Stage3SATPHandler;
  monitorService: MonitorService;
  /**
   * When `true`, all authentication is disabled:
   *  - Temporal gRPC connections use plain-text even when TLS env vars are set.
   *  - Certificate-chain validation in `validateCertChainActivity` is skipped.
   *
   * Use **only** for local testing — never in production.
   */
  insecure?: boolean;
}

/**
 * Creates a Temporal Worker bound to the SATP crash-recovery task queue.
 *
 * Configuration is read from environment variables (with sensible defaults):
 *  - TEMPORAL_ADDRESS    — frontend gRPC address, default "localhost:7233"
 *  - TEMPORAL_NAMESPACE  — Temporal namespace, default "satp-recovery"
 *  - TEMPORAL_TASK_QUEUE — task queue name, default "satp-crash-recovery"
 */
export async function createSatpTemporalWorker(
  deps: ISatpWorkerDeps,
): Promise<Worker> {
  const address = process.env["TEMPORAL_ADDRESS"] ?? "localhost:7233";
  const namespace = process.env["TEMPORAL_NAMESPACE"] ?? "satp-recovery";
  const taskQueue = process.env["TEMPORAL_TASK_QUEUE"] ?? "satp-crash-recovery";

  // TLS is configured via env vars when deps.insecure is false/undefined.
  // Set TEMPORAL_TLS_CERT_PATH and TEMPORAL_TLS_KEY_PATH in production;
  // leave them unset (or pass insecure: true) for local testing.
  const tlsCertPath = process.env["TEMPORAL_TLS_CERT_PATH"];
  const tlsKeyPath = process.env["TEMPORAL_TLS_KEY_PATH"];
  const tlsClientCaCertPath = process.env["TEMPORAL_TLS_CA_CERT_PATH"];

  const tlsConfig =
    !deps.insecure && tlsCertPath && tlsKeyPath
      ? {
          clientCertPair: {
            crt: new Uint8Array(readFileSync(tlsCertPath)),
            key: new Uint8Array(readFileSync(tlsKeyPath)),
          },
          ...(tlsClientCaCertPath
            ? {
                serverRootCACertificate: new Uint8Array(
                  readFileSync(tlsClientCaCertPath),
                ),
              }
            : {}),
        }
      : undefined;

  const connection = await NativeConnection.connect({
    address,
    tls: tlsConfig,
  });

  // A separate Temporal Client is required by MonitorActivities to signal
  // running SatpTransferWorkflow instances for stale-session detection.
  const clientConnection = await Connection.connect({
    address,
    tls: tlsConfig,
  });
  const temporalClient = new Client({
    connection: clientConnection,
    namespace,
  });

  const activities = {
    ...makeLogStorageActivities(deps.localRepository, deps.remoteRepository),
    ...makeCrashRecoveryActivities(
      deps.sessions,
      deps.crashHandler,
      deps.rollbackStrategyFactory,
      deps.monitorService,
    ),
    ...makeProtocolActivities(
      deps.stage0Handler,
      deps.stage1Handler,
      deps.stage2Handler,
      deps.stage3Handler,
    ),
    ...makeMonitorActivities(deps.localRepository, temporalClient),
    ...makeBackupActivities({ insecure: deps.insecure }),
  };

  return Worker.create({
    connection,
    namespace,
    taskQueue,
    // Temporal discovers all workflow exports via this single entry point.
    workflowsPath: require.resolve("./workflows/satp-transfer-workflow"),
    activities,
    interceptors: {
      activityInbound: [() => new OtelActivityInboundInterceptor()],
    },
  });
}
