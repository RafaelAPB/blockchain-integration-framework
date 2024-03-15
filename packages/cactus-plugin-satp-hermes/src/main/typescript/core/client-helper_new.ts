import { Logger, LoggerProvider } from "@hyperledger/cactus-common";
import { SHA256 } from "crypto-js";

import { PluginSATPGateway } from "../plugin-satp-gateway";
import { TransferProposalRejectMessage, TransferProposalRequest } from "../generated/proto/cacti/satp/v02/stage_1_pb";
import { ActionResponse, MessageType, Payload, SATPMessage, TransferClaims } from "../generated/proto/cacti/satp/v02/common/common_messages_pb";
import { sendTransferProposalRequest } from "./stage-services/stage1";

export class ClientGatewayHelper {
  public static readonly CLASS_NAME = "ClientGatewayHelper";
  private _log: Logger;

  constructor() {
    const level = "INFO";
    const label = ClientGatewayHelper.CLASS_NAME;
    this._log = LoggerProvider.getOrCreate({ level, label });
  }

  public get className(): string {
    return ClientGatewayHelper.CLASS_NAME;
  }

  public get log(): Logger {
    return this._log;
  }

  async transferProposalRequest(
    sessionID: string,
    gateway: PluginSATPGateway,
    remote: boolean,
  ): Promise<void | TransferProposalReceiptMessage | TransferProposalRejectMessage> {
    const fnTag = `${this.className}#transferProposalRequest()`;

    const sessionData = gateway.sessions.get(sessionID);

    if (
      sessionData == undefined ||
      sessionData.sessionId == undefined ||
      sessionData.version == undefined ||
      sessionData.maxRetries == undefined ||
      sessionData.maxTimeout == undefined ||
      sessionData.payloadProfile == undefined ||
      sessionData.loggingProfile == undefined ||
      sessionData.sourceBasePath == undefined ||
      sessionData.recipientBasePath == undefined ||
      sessionData.accessControlProfile == undefined ||
      sessionData.applicationProfile == undefined ||
      sessionData.lastSequenceNumber == undefined ||
      sessionData.sourceLedgerAssetId == undefined ||
      sessionData.senderGatewayNetworkId == undefined ||
      sessionData.recipientGatewayPubkey == undefined ||
      sessionData.recipientLedgerAssetId == undefined ||
      sessionData.recipientGatewayNetworkId == undefined ||
      sessionData.allowedSourceBackupGateways == undefined ||
      sessionData.verifiedOriginatorEntityId == undefined ||
      sessionData.verifiedBeneficiaryEntityId == undefined
    ) {
      throw new Error(`${fnTag}, session data is not correctly initialized`);
    }

    if (!gateway.supportedDltIDs.includes(sessionData.senderGatewayNetworkId)) {
      throw new Error(
        `${fnTag}, recipient gateway dlt system is not supported by this gateway`,
      );
    }
    
    const commonBody = new SATPMessage();
    commonBody.version = sessionData.version;
    commonBody.messageType = MessageType.INIT_PROPOSAL;
    commonBody.sessionId = sessionData.sessionId;
    commonBody.transferContextId = sessionData.transferContextId;
    commonBody.sequenceNumber = sessionData.lastSequenceNumber + BigInt(1);
    commonBody.resourceUrl = "";
    commonBody.developerUrn = "";
    commonBody.actionResponse = new ActionResponse();
    commonBody.credentialProfile = sessionData.credentialProfile;
    commonBody.credentialBlock = sessionData.credentialBlock;
    commonBody.payloadProfile = sessionData.payloadProfile;
    commonBody.applicationProfile = sessionData.applicationProfile;
    commonBody.payload = new Payload();
    commonBody.payloadHash = "";
    commonBody.messageSignature = "";
    commonBody.clientIdentityPubkey = sessionData.clientIdentityPubkey;
    commonBody.serverIdentityPubkey = sessionData.serverIdentityPubkey;
    commonBody.hashPreviousMessage = "";
    
    const transferInitClaims = new TransferClaims();
    transferInitClaims.digitalAssetId = sessionData.sourceLedgerAssetId;
    transferInitClaims.assetProfileId = sessionData.assetProfileId;
    transferInitClaims.verifiedOriginatorEntityId = sessionData.verifiedOriginatorEntityId;
    transferInitClaims.verifiedBeneficiaryEntityId = sessionData.verifiedBeneficiaryEntityId;
    transferInitClaims.originatorPubkey = sessionData.originatorPubkey;
    transferInitClaims.beneficiaryPubkey = sessionData.beneficiaryPubkey;
    transferInitClaims.senderGatewayNetworkId = sessionData.senderGatewayNetworkId;
    transferInitClaims.recipientGatewayNetworkId = sessionData.recipientGatewayNetworkId;
    transferInitClaims.clientIdentityPubkey = sessionData.clientIdentityPubkey;
    transferInitClaims.serverIdentityPubkey = sessionData.serverIdentityPubkey;
    transferInitClaims.senderGatewayOwnerId = sessionData.senderGatewayOwnerId;
    transferInitClaims.receiverGatewayOwnerId = sessionData.receiverGatewayOwnerId;
    

    const transferProposalRequestMessage = new TransferProposalRequest();
    transferProposalRequestMessage.satpMessage = commonBody;
    transferProposalRequestMessage.transferInitClaims = transferInitClaims;
    transferProposalRequestMessage.transferInitClaimsFormat = sessionData.transferInitClaimsFormat;
    transferProposalRequestMessage.networkCapabilities = sessionData.networkCapabilities;
    transferProposalRequestMessage.multipleClaimsAllowed = sessionData.multipleClaimsAllowed;
    transferProposalRequestMessage.multipleCancelsAllowed = sessionData.multipleCancelsAllowed;

    const messageSignature = PluginSATPGateway.bufArray2HexStr(
      gateway.sign(JSON.stringify(transferProposalRequestMessage)),
    );

    transferProposalRequestMessage.clientSignature = messageSignature;
    
    //sessionData.clientSignatureInitializationRequestMessage = messageSignature;

    gateway.sessions.set(sessionID, sessionData);
    
    await gateway.storeLog({ //todo
      sessionID: sessionID,
      type: "init",
      operation: "validate",
      data: JSON.stringify(sessionData),
    });

    this.log.info(`${fnTag}, sending TransferProposalRequest...`);

    if (!remote) {
      return transferProposalRequestMessage;
    }
    //const router = new ConnectRouter();
    //await sendTransferProposalRequest.;
  }

}
