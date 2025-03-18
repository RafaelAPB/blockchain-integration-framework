import { v4 as uuidv4 } from "uuid";
import {
  LogLevelDesc,
  LoggerProvider,
  JsObjectSigner,
  Secp256k1Keys,
} from "@hyperledger/cactus-common";
import { BLODispatcher } from "../../main/typescript/api1/dispatcher";
import { SATPManager } from "../../main/typescript/services/gateway/satp-manager";
import { GatewayOrchestrator } from "../../main/typescript/services/gateway/gateway-orchestrator";
import { SATPCrossChainManager } from "../../main/typescript/cross-chain-mechanisms/satp-cc-manager";
import { KnexLocalLogRepository } from "../../main/typescript/database/repository/knex-local-log-repository";
import { knexLocalInstance } from "../../main/typescript/database/knexfile";
import { LedgerType } from "@hyperledger/cactus-core-api";
import { Address } from "../../main/typescript/core/types";

export interface ITestGatewayOptions {
  logLevel?: LogLevelDesc;
  instanceId?: string;
}

export class TestGateway {
  public static createMockGatewayIdentity() {
    const keyPair = Secp256k1Keys.generateKeyPairsBuffer();
    const id = uuidv4();

    return {
      id,
      name: `test-gateway-${id}`,
      pubKey: keyPair.publicKey.toString(),
      version: [{
        Core: "0.0.0",
        Architecture: "0.0.0",
        Crash: "0.0.0"
      }],
      connectedDLTs: [{
        id: "test-network",
        ledgerType: "test"
      },
      {
        id: "fabric-network",
        ledgerType: "fabric"
      }],
      proofID: "test-proof",
      gatewayServerPort: 3000,
      gatewayClientPort: 3001,
      gatewayOpenAPIPort: 3002,
      address: "http://localhost",
    };
  }

  public static async createTestBLODispatcher(options: ITestGatewayOptions = {}) {
    const logLevel = options.logLevel || "INFO";
    const instanceId = options.instanceId || uuidv4();
    const logger = LoggerProvider.getOrCreate({ level: logLevel, label: "test-dispatcher" });

    const keyPair = Secp256k1Keys.generateKeyPairsBuffer();
    const signer = new JsObjectSigner({
      privateKey: keyPair.privateKey.toString("hex"),
      logLevel,
    });

    const gatewayIdentity = TestGateway.createMockGatewayIdentity();
    const address: Address = `http://127.0.0.1:${gatewayIdentity.gatewayServerPort}`;
    const orchestrator = new GatewayOrchestrator({
      logLevel,
      localGateway: {
        ...gatewayIdentity,
        address: address,
        connectedDLTs: gatewayIdentity.connectedDLTs.map(dlt => ({
          id: dlt.id,
          ledgerType: dlt.ledgerType as LedgerType
        }))
      },
      counterPartyGateways: [],
      signer,
      enableCrashRecovery: false,
    });

    const bridgesManager = new SATPCrossChainManager({
      logLevel,
      connectedDLTs: gatewayIdentity.connectedDLTs.map(dlt => ({
        id: dlt.id,
        ledgerType: dlt.ledgerType as LedgerType
      })),
      networks: [],
    });

    const localRepository = new KnexLocalLogRepository(knexLocalInstance.default);

    const satpManager = new SATPManager({
      logLevel,
      instanceId,
      signer,
      pubKey: keyPair.publicKey.toString(),
      connectedDLTs: gatewayIdentity.connectedDLTs.map(dlt => ({
        id: dlt.id,
        ledgerType: dlt.ledgerType as LedgerType
      })),
      bridgeManager: bridgesManager,
      orchestrator,
      defaultRepository: true,
      localRepository,
    });

    const dispatcher = new BLODispatcher({
      logger,
      logLevel,
      instanceId,
      orchestrator,
      signer,
      bridgesManager,
      pubKey: keyPair.publicKey.toString(),
      defaultRepository: true,
      localRepository,
    });

    return {
      dispatcher,
      satpManager,
      orchestrator,
      bridgesManager,
      signer,
      localRepository,
    };
  }

  public static async cleanup(localRepository?: any) {
    if (localRepository) {
      await localRepository.destroy();
    }
  }
}