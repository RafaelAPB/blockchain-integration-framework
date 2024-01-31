import { SHA256 } from "crypto-js";
import {
  PluginSatpGateway,
  TransferInitializationV1Request,
} from "@hyperledger/cactus-plugin-satp-hermes";
import { ClientGatewayHelper } from "@hyperledger/cactus-plugin-satp-hermes";
import { SatpMessageType } from "@hyperledger/cactus-plugin-satp-hermes";
import { FabricSatpGateway } from "./fabric-satp-gateway";
import { BesuSatpGateway } from "./besu-satp-gateway";

export class ClientHelper extends ClientGatewayHelper {
  async sendTransferInitializationRequest(
    sessionID: string,
    satp: PluginSatpGateway,
    remote: boolean,
  ): Promise<void | TransferInitializationV1Request> {
    const fnTag = `${this.className}#sendTransferInitializationRequest()`;

    const sessionData = satp.sessions.get(sessionID);

    if (
      sessionData == undefined ||
      sessionData.id == undefined ||
      sessionData.step == undefined ||
      sessionData.version == undefined ||
      sessionData.maxRetries == undefined ||
      sessionData.maxTimeout == undefined ||
      sessionData.assetProfile == undefined ||
      sessionData.payloadProfile == undefined ||
      sessionData.loggingProfile == undefined ||
      sessionData.sourceBasePath == undefined ||
      sessionData.recipientBasePath == undefined ||
      sessionData.accessControlProfile == undefined ||
      sessionData.applicationProfile == undefined ||
      sessionData.lastSequenceNumber == undefined ||
      sessionData.sourceLedgerAssetID == undefined ||
      sessionData.sourceGatewayDltSystem == undefined ||
      sessionData.recipientGatewayPubkey == undefined ||
      sessionData.recipientLedgerAssetID == undefined ||
      sessionData.recipientGatewayDltSystem == undefined ||
      sessionData.allowedSourceBackupGateways == undefined ||
      sessionData.assetProfile.keyInformationLink == undefined
    ) {
      throw new Error(`${fnTag}, session data is not correctly initialized`);
    }

    if (!satp.supportedDltIDs.includes(sessionData.recipientGatewayDltSystem)) {
      throw new Error(
        `${fnTag}, recipient gateway dlt system is not supported by this gateway`,
      );
    }

    const initializationRequestMessage: TransferInitializationV1Request = {
      messageType: SatpMessageType.InitializationRequest,
      sessionID: sessionData.id,
      version: sessionData.version,
      // developer urn
      // credential profile
      payloadProfile: sessionData.payloadProfile,
      applicationProfile: sessionData.applicationProfile,
      loggingProfile: sessionData.loggingProfile,
      accessControlProfile: sessionData.accessControlProfile,
      signature: "",
      sourceGatewayPubkey: satp.pubKey,
      sourceGatewayDltSystem: sessionData.sourceGatewayDltSystem,
      recipientGatewayPubkey: sessionData.recipientGatewayPubkey,
      recipientGatewayDltSystem: sessionData.recipientGatewayDltSystem,
      sequenceNumber: sessionData.lastSequenceNumber,
      sourceBasePath: sessionData.sourceBasePath,
      recipientBasePath: sessionData.recipientBasePath,
      // escrow type
      // expiry time (related to the escrow)
      // multiple claims allowed
      // multiple cancels allowed
      // permissions
      maxRetries: sessionData.maxRetries,
      maxTimeout: sessionData.maxTimeout,
      backupGatewaysAllowed: sessionData.allowedSourceBackupGateways,
      recipientLedgerAssetID: sessionData.recipientLedgerAssetID,
      sourceLedgerAssetID: sessionData.sourceLedgerAssetID,
    };

    const messageSignature = PluginSatpGateway.bufArray2HexStr(
      satp.sign(JSON.stringify(initializationRequestMessage)),
    );

    initializationRequestMessage.signature = messageSignature;

    sessionData.initializationRequestMessageHash = SHA256(
      JSON.stringify(initializationRequestMessage),
    ).toString();

    sessionData.clientSignatureInitializationRequestMessage = messageSignature;

    satp.sessions.set(sessionID, sessionData);

    await satp.storeSatpLog({
      sessionID: sessionID,
      type: "init",
      operation: "validate",
      data: JSON.stringify(sessionData),
    });

    if (satp instanceof FabricSatpGateway) {
      await satp
        .isValidBridgeOutCBDC(
          sessionData.sourceLedgerAssetID,
          sessionData.assetProfile.keyInformationLink[0].toString(), // Amount
          sessionData.assetProfile.keyInformationLink[1].toString(), // FabricID
          sessionData.assetProfile.keyInformationLink[2].toString(), // ETH Address
        )
        .catch((err) => {
          throw new Error(`${err.response.data.error}`);
        });
    } else if (satp instanceof BesuSatpGateway) {
      await satp
        .isValidBridgeBackCBDC(
          sessionData.sourceLedgerAssetID,
          sessionData.assetProfile.keyInformationLink[0].toString(), // Amount
          sessionData.assetProfile.keyInformationLink[2].toString(), // Amount
        )
        .catch((err) => {
          throw new Error(`${err}`);
        });
    }

    this.log.info(`${fnTag}, sending TransferInitializationRequest...`);

    if (!remote) {
      return initializationRequestMessage;
    }

    await satp.makeRequest(
      sessionID,
      PluginSatpGateway.getsatpAPI(
        sessionData.recipientBasePath,
      ).phase1TransferInitiationRequestV1(initializationRequestMessage),
      "TransferInitializationRequest",
    );
  }
}
