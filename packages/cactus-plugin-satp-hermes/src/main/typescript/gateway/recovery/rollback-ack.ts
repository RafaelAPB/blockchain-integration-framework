import { RollbackAckV1Message } from "../../generated/openapi/typescript-axios";
import { LoggerProvider } from "@hyperledger/cactus-common";
import { PluginSatpGateway } from "../plugin-satp-gateway";
// import { SHA256 } from "crypto-js";

const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "rollback-ack-helper",
});

export async function sendRollbackAckMessage(
  sessionID: string,
  satp: PluginSatpGateway,
  remote: boolean,
): Promise<void | RollbackAckV1Message> {
  const fnTag = `${satp.className}#sendRollbackAckMessage()`;

  const sessionData = satp.sessions.get(sessionID);

  if (
    sessionData == undefined ||
    sessionData.maxTimeout == undefined ||
    sessionData.maxRetries == undefined ||
    sessionData.rollbackProofs == undefined ||
    sessionData.sourceBasePath == undefined ||
    sessionData.recipientBasePath == undefined ||
    sessionData.rollbackActionsPerformed == undefined
  ) {
    throw new Error(`${fnTag}, session data is not correctly initialized`);
  }

  const rollbackAckMessage: RollbackAckV1Message = {
    sessionID: sessionID,
    success: true,
    signature: "",
  };

  const signature = PluginSatpGateway.bufArray2HexStr(
    satp.sign(JSON.stringify(rollbackAckMessage)),
  );

  rollbackAckMessage.signature = signature;

  log.info(`${fnTag}, sending Rollback Ack message...`);

  if (!remote) {
    return rollbackAckMessage;
  }

  await satp.makeRequest(
    sessionID,
    PluginSatpGateway.getSatpAPI(
      satp.isClientGateway(sessionID)
        ? sessionData.recipientBasePath
        : sessionData.sourceBasePath,
    ).rollbackAckV1Message(rollbackAckMessage),
    "RollbackAck",
  );
}

export async function checkValidRollbackAckMessage(
  response: RollbackAckV1Message,
  satp: PluginSatpGateway,
): Promise<void> {
  const fnTag = `${satp.className}#checkValidRollbackAckMessage`;

  const sessionID = response.sessionID;
  const sessionData = satp.sessions.get(sessionID);
  if (sessionData == undefined) {
    throw new Error(`${fnTag}, session data is undefined`);
  }

  const pubKey = satp.isClientGateway(response.sessionID)
    ? sessionData.recipientGatewayPubkey
    : sessionData.sourceGatewayPubkey;

  if (pubKey == undefined) {
    throw new Error(`${fnTag}, session data is undefined`);
  }

  // if (response.messageType != SatpMessageType.CommitFinalResponse) {
  //   throw new Error(`${fnTag}, wrong message type for CommitFinalResponse`);
  // }

  if (!satp.verifySignature(response, pubKey)) {
    throw new Error(
      `${fnTag}, RollbackAckMessage message signature verification failed`,
    );
  }

  log.info(`RollbackAckMessage passed all checks.`);
}
