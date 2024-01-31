import { RecoverSuccessV1Message } from "../../generated/openapi/typescript-axios";
import { LoggerProvider } from "@hyperledger/cactus-common";
import { PluginSatpGateway } from "../plugin-satp-gateway";

const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "recover-success-helper",
});

export async function sendRecoverSuccessMessage(
  sessionID: string,
  satp: PluginSatpGateway,
  remote: boolean,
): Promise<void | RecoverSuccessV1Message> {
  const fnTag = `${satp.className}#sendRecoverSuccessMessage()`;

  const sessionData = satp.sessions.get(sessionID);

  if (
    sessionData == undefined ||
    sessionData.maxTimeout == undefined ||
    sessionData.maxRetries == undefined ||
    sessionData.sourceBasePath == undefined ||
    sessionData.recipientBasePath == undefined
  ) {
    throw new Error(`${fnTag}, session data is not correctly initialized`);
  }

  const recoverSuccessMessage: RecoverSuccessV1Message = {
    sessionID: sessionID,
    success: true,
    signature: "",
  };

  const signature = PluginSatpGateway.bufArray2HexStr(
    satp.sign(JSON.stringify(recoverSuccessMessage)),
  );

  recoverSuccessMessage.signature = signature;

  log.info(`${fnTag}, sending RecoverSuccess message...`);

  if (!remote) {
    return recoverSuccessMessage;
  }

  await satp.makeRequest(
    sessionID,
    PluginSatpGateway.getSatpAPI(
      satp.isClientGateway(sessionID)
        ? sessionData.recipientBasePath
        : sessionData.sourceBasePath,
    ).recoverV1Success(recoverSuccessMessage),
    "RecoverSuccess",
  );
}

export async function checkValidRecoverSuccessMessage(
  response: RecoverSuccessV1Message,
  satp: PluginSatpGateway,
): Promise<void> {
  const fnTag = `${satp.className}#checkValidRecoverSuccessMessage`;

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

  if (!response.success) {
    throw new Error(`${fnTag}, RecoverSuccess message is invalid`);
  }

  if (!satp.verifySignature(response, pubKey)) {
    throw new Error(
      `${fnTag}, RecoverUpdateAckMessage message signature verification failed`,
    );
  }

  // storeSessionData(response, satp);

  log.info(`RecoverSuccessMessage passed all checks.`);
}
