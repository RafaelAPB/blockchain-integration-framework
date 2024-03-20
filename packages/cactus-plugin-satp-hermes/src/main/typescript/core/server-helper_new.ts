import { Logger, LoggerProvider } from "@hyperledger/cactus-common";
import { SHA256 } from "crypto-js";
import { SatpMessageType, PluginSATPGateway } from "../plugin-satp-gateway";
import { TransferProposalReceiptMessage, TransferProposalRequest } from "../generated/proto/cacti/satp/v02/stage_1_pb";
import { SessionData } from "../generated/proto/cacti/satp/v02/common/session_pb";
import { MessageType } from "../generated/proto/cacti/satp/v02/common/common_messages_pb";

export class ServerGatewayHelper {
  public static readonly CLASS_NAME: string = "ServerGatewayHelper";
  private _log: Logger;

  constructor() {
    const level = "INFO";
    const label = ServerGatewayHelper.CLASS_NAME;
    this._log = LoggerProvider.getOrCreate({ level, label });
  }

  public static get className(): string {
    return ServerGatewayHelper.CLASS_NAME;
  }

  public get log(): Logger {
    return this._log;
  }

 async TransferProposalResponse(
    request: TransferProposalRequest,
    gateway: PluginSATPGateway,
  ): Promise<void | TransferProposalReceiptMessage> {
    const fnTag = `${gateway.className}#checkValidInitializationRequest()`;
    
    const recvTimestamp: string = Date.now().toString();

    if(request.common == undefined){
      throw new Error(
        `${fnTag}, message has no satp common body`,
      );
    }

    //todo verify if all variables are present

    const sessionID = request.common.sessionId;
    const sessionData = new SessionData();

    await gateway.storeLog({ //todo maybe change this to a verifier to be used in every satp message
      sessionID: sessionID,
      type: "exec",
      operation: "validate",
      data: JSON.stringify(sessionData),
    });

    if (request.common.messageType != MessageType.INIT_PROPOSAL) {
      throw new Error(
        `${fnTag}, wrong message type for TransferProposalRequest`,
      );
    }

    if (request.common.version != "v02") { //todo change to be in a variable
      throw new Error(
        `${fnTag}, unsupported version`,
      );
    }

    if (!gateway.verifySignature(request.common, request.common.clientIdentityPubkey)) { //todo change this func
      throw new Error(
        `${fnTag}, TransferProposalRequest message signature verification failed`,
      );
    }

    if(request.transferInitClaims == undefined){
      throw new Error(
        `${fnTag}, TransferProposalRequest message does not contain transfer initialization claims`,
      );
    }

    if(request.networkCapabilities == undefined){
      throw new Error(
        `${fnTag}, TransferProposalRequest message does not contain network capabilities and parameters`,
      );
    }

    if (!gateway.supportedDltIDs.includes(request.transferInitClaims.senderGatewayNetworkId)) {
      throw new Error(
        `${fnTag}, source gateway dlt system is not supported by this gateway`,
      );
    }

    if(request.common.payloadProfile == undefined ||
      request.common.payloadProfile.assetProfile == undefined) {
        throw new Error(
          `${fnTag}, Payload Profile is not present or is missing properties`,
        );
      }

    if (request.common.payloadProfile.assetProfile.issuer !== "CB1") { //todo change this to a variable
      throw new Error(`${fnTag}, asset issuer not recognized`);
    }

    if (request.common.payloadProfile.assetProfile.assetCode != "CBDC1") {
      throw new Error(`${fnTag}, asset code not recognized`);
    }

    if (request.common.payloadProfile.assetProfile.keyInformationLink?.length != 3) {
      throw new Error(`${fnTag}, CBDC parameters not specified`);
    }

    const expiryDate: string = request.common.payloadProfile.assetProfile.expirationDate;
    const isDataExpired: boolean = new Date() >= new Date(expiryDate);
    if (isDataExpired) {
      throw new Error(`${fnTag}, asset has expired`);
    }



    sessionData.version = request.common.version;

    // sessionData.maxRetries = request.transferInitClaims.maxRetries;
    // sessionData.maxTimeout = request.transferInitClaims.maxTimeout;

   // sessionData.resourceUrl = request.common.resourceUrl;
    sessionData.lastSequenceNumber = request.common.sequenceNumber;
    sessionData.loggingProfile = request.networkCapabilities.loggingProfile;
    sessionData.accessControlProfile = request.networkCapabilities.accessControlProfile;
    sessionData.payloadProfile = request.common.payloadProfile;
    sessionData.applicationProfile = request.networkCapabilities.applicationProfile;
  //  sessionData.assetProfile = request.common.payloadProfile.assetProfile;
  //  sessionData.sourceGatewayPubkey = request.common.clientIdentityPubkey;
  //  sessionData.sourceGatewayNetworkId = request.transferInitClaims.senderGatewayNetworkId;
    sessionData.recipientGatewayPubkey = request.transferInitClaims.serverIdentityPubkey;
    sessionData.recipientGatewayNetworkId = request.transferInitClaims.recipientGatewayNetworkId;
    

  //  sessionData.lastMessageReceivedTimestamp = new Date().toString();
  //  sessionData.sourceLedgerAssetID = request.transferInitClaims.verifiedOriginatorEntityId;
  //  sessionData.recipientLedgerAssetID = request.transferInitClaims.verifiedBeneficiaryEntityId;

    // sessionData.initializationRequestMessageHash = SHA256(
    //   JSON.stringify(request),
    // ).toString();

    // sessionData.clientSignatureTransferProposalRequestMessage = request.common.signature;

    // sessionData.TransferProposalRequestMessageProcessedTimeStamp = Date.now().toString();

    // gateway.sessions.set(request.common.sessionId, sessionData);

    await gateway.storeLog({
      sessionID: sessionID,
      type: "ack",
      operation: "validate",
      data: JSON.stringify(sessionData),
    });

    this.log.info(`TransferProposalRequest passed all checks.`);

    //todo if rejection 
    const transferProposalReceiptMessage = new TransferProposalReceiptMessage();
    transferProposalReceiptMessage.common = request.common;

    this.log.info(`${fnTag}, sending TransferProposalResponse...`);
  }
}
