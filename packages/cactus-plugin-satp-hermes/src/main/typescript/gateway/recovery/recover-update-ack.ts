import { RecoverUpdateAckV1Message } from "../../generated/openapi/typescript-axios";
import { LoggerProvider } from "@hyperledger/cactus-common";
import { PluginSatpGateway } from "../plugin-satp-gateway";
// import { SHA256 } from "crypto-js";

const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "recover-update-ack-helper",
});

export async function sendRecoverUpdateAckMessage(
  sessionID: string,
  satp: PluginSatpGateway,
  remote: boolean,
): Promise<void | RecoverUpdateAckV1Message> {
  const fnTag = `${satp.className}#sendRecoverUpdateAckMessage()`;

  const sessionData = satp.sessions.get(sessionID);

  if (
    sessionData == undefined ||
    sessionData.maxTimeout == undefined ||
    sessionData.maxRetries == undefined ||
    sessionData.sourceBasePath == undefined ||
    sessionData.recipientBasePath == undefined ||
    sessionData.lastSequenceNumber == undefined
  ) {
    throw new Error(`${fnTag}, session data is not correctly initialized`);
  }

  const recoverUpdateMessage: RecoverUpdateAckV1Message = {
    sessionID: sessionID,
    success: true,
    changedEntriesHash: [],
    signature: "",
  };

  const signature = PluginSatpGateway.bufArray2HexStr(
    satp.sign(JSON.stringify(recoverUpdateMessage)),
  );

  recoverUpdateMessage.signature = signature;

  log.info(`${fnTag}, sending RecoverUpdateAck message...`);

  if (!remote) {
    return recoverUpdateMessage;
  }

  await satp.makeRequest(
    sessionID,
    PluginSatpGateway.getSatpAPI(
      satp.isClientGateway(sessionID)
        ? sessionData.recipientBasePath
        : sessionData.sourceBasePath,
    ).recoverUpdateAckV1Message(recoverUpdateMessage),
    "RecoverUpdateAck",
  );
}

export async function checkValidRecoverUpdateAckMessage(
  response: RecoverUpdateAckV1Message,
  satp: PluginSatpGateway,
): Promise<void> {
  const fnTag = `${satp.className}#checkValidRecoverUpdateAckMessage`;

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

  // check if this is a valid recover update ack message
  // check valid recovered logs

  if (!satp.verifySignature(response, pubKey)) {
    throw new Error(
      `${fnTag}, RecoverUpdateAckMessage message signature verification failed`,
    );
  }

  // storeSessionData(response, satp);

  log.info(`RecoverUpdateAckMessage passed all checks.`);
}
