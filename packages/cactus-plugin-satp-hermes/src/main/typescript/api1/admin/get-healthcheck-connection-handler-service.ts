import { GetStatusError } from "../../core/errors/satp-errors";
import { LoggerProvider, LogLevelDesc } from "@hyperledger/cactus-common";
import { SATPManager } from "../../services/gateway/satp-manager";
import { LedgerType } from "@hyperledger/cactus-core-api";
import {
    HealthCheckConnectionRequest,
  HealthCheckConnectionResponse,
} from "../../generated/gateway-client/typescript-axios";

const SATP_VERIFY_ASSET = "satp-hermes:verifyAssetExistence";

export async function executeGetHealthCheckConnection(
  logLevel: LogLevelDesc,
  req: HealthCheckConnectionRequest,
  manager: SATPManager,
): Promise<HealthCheckConnectionResponse> {
  const fnTag = `executeGetHealthCheckConnection()`;
  const log = LoggerProvider.getOrCreate({
    label: fnTag,
    level: logLevel,
  });

  try {
    // Parse method arguments if provided
    const args = req.methodArgs ? req.methodArgs.split(",").map(arg => arg.trim()) : [];
    
    // Map protocol to ledger type
    let ledgerType: LedgerType;
    switch (req.dltProtocol.toLowerCase()) {
      case "fabric":
        ledgerType = LedgerType.Fabric2;
        break;
      case "besu":
        ledgerType = LedgerType.Besu2X;
        break;
      case "ethereum":
        ledgerType = LedgerType.Ethereum;
        break;
      default:
        throw new Error(`Unsupported DLT protocol: ${req.dltProtocol}`);
    }

    // Get connected DLTs and find matching network
    const networks = manager.getConnectedDLTs();
    const network = networks.find(n => n.ledgerType === ledgerType);

    if (!network) {
      return {
        success: false,
        message: `No connected network found for protocol ${req.dltProtocol}`,
      };
    }

    // Execute the health check through the manager
    const response = await manager.executeHealthCheck({
      networkId: network.id,
      contractAddress: req.contractAddress,
      isSatpVerify: req.contractFunction === SATP_VERIFY_ASSET,
      functionName: req.contractFunction,
      params: args,
    });

    return {
      success: true,
      message: `Successfully executed health check on ${req.dltProtocol} network`,
      data: response as { [key: string]: any },
    };

  } catch (error) {
    log.error(`${fnTag} failed to check connection:`, error);
    return {
      success: false,
      message: `Failed to check connection: ${error.message}`,
    };
  }
}

