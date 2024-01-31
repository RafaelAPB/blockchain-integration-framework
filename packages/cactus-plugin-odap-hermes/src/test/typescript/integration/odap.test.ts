import http, { Server } from "http";
import type { AddressInfo } from "net";
import { v4 as uuidv4 } from "uuid";
import "jest-extended";
import { PluginObjectStoreIpfs } from "@hyperledger/cactus-plugin-object-store-ipfs";
import bodyParser from "body-parser";
import express from "express";
import { DefaultApi as ObjectStoreIpfsApi } from "@hyperledger/cactus-plugin-object-store-ipfs";
import {
  IListenOptions,
  LogLevelDesc,
  Servers,
} from "@hyperledger/cactus-common";
import { v4 as uuidV4 } from "uuid";
import { Configuration } from "@hyperledger/cactus-core-api";
import { PluginOdapGateway } from "../../../main/typescript/gateway/plugin-odap-gateway";
import { GoIpfsTestContainer } from "@hyperledger/cactus-test-tooling";

import {
  AssetProfile,
  ClientV1Request,
} from "../../../main/typescript/public-api";
import { makeSessionDataChecks } from "../make-checks";

import { BesuOdapGateway } from "../../../main/typescript/gateway/besu-odap-gateway";
import { FabricOdapGateway } from "../../../main/typescript/gateway/fabric-odap-gateway";
import { ClientGatewayHelper } from "../../../main/typescript/gateway/client/client-helper";
import { ServerGatewayHelper } from "../../../main/typescript/gateway/server/server-helper";
import { knexRemoteConnection } from "../knex.config";

const MAX_RETRIES = 5;
const MAX_TIMEOUT = 5000;

let pluginSourceGateway: PluginOdapGateway;
let pluginRecipientGateway: PluginOdapGateway;

test("successful run ODAP instance", async () => {
  const sourceGatewayConstructor = {
    name: "plugin-odap-gateway#sourceGateway",
    dltIDs: ["DLT2"],
    instanceId: uuidV4(),
    clientHelper: new ClientGatewayHelper(),
    serverHelper: new ServerGatewayHelper(),
    knexRemoteConfig: knexRemoteConnection,
  };
  const recipientGatewayConstructor = {
    name: "plugin-odap-gateway#recipientGateway",
    dltIDs: ["DLT1"],
    instanceId: uuidV4(),
    clientHelper: new ClientGatewayHelper(),
    serverHelper: new ServerGatewayHelper(),
    knexRemoteConfig: knexRemoteConnection,
  };

  pluginSourceGateway = new FabricOdapGateway(sourceGatewayConstructor);
  pluginRecipientGateway = new BesuOdapGateway(recipientGatewayConstructor);

  expect(pluginSourceGateway.localRepository?.database).not.toBeUndefined();
  expect(pluginRecipientGateway.localRepository?.database).not.toBeUndefined();

  await pluginSourceGateway.localRepository?.reset();
  await pluginRecipientGateway.localRepository?.reset();

  const dummyPath = { apiHost: "dummyPath" };

  const expiryDate = new Date(2060, 11, 24).toString();
  const assetProfile: AssetProfile = { expirationDate: expiryDate };

  const odapClientRequest: ClientV1Request = {
    clientGatewayConfiguration: dummyPath,
    serverGatewayConfiguration: dummyPath,
    version: "0.0.0",
    loggingProfile: "dummyLoggingProfile",
    accessControlProfile: "dummyAccessControlProfile",
    applicationProfile: "dummyApplicationProfile",
    payloadProfile: {
      assetProfile: assetProfile,
      capabilities: "",
    },
    assetProfile: assetProfile,
    assetControlProfile: "dummyAssetControlProfile",
    beneficiaryPubkey: "dummyPubKey",
    clientDltSystem: "DLT1",
    originatorPubkey: "dummyPubKey",
    recipientGatewayDltSystem: "DLT2",
    recipientGatewayPubkey: pluginRecipientGateway.pubKey,
    serverDltSystem: "DLT2",
    sourceGatewayDltSystem: "DLT1",
    clientIdentityPubkey: "",
    serverIdentityPubkey: "",
    maxRetries: MAX_RETRIES,
    maxTimeout: MAX_TIMEOUT,
    sourceLedgerAssetID: uuidV4(),
    recipientLedgerAssetID: uuidV4(),
  };

  const sessionID = pluginSourceGateway.configureOdapSession(odapClientRequest);

  const transferInitializationRequest =
    await pluginSourceGateway.clientHelper.sendTransferInitializationRequest(
      sessionID,
      pluginSourceGateway,
      false,
    );

  if (transferInitializationRequest == void 0) {
    expect(false);
    return;
  }

  await pluginRecipientGateway.serverHelper.checkValidInitializationRequest(
    transferInitializationRequest,
    pluginRecipientGateway,
  );

  const transferInitializationResponse =
    await pluginRecipientGateway.serverHelper.sendTransferInitializationResponse(
      transferInitializationRequest.sessionID,
      pluginRecipientGateway,
      false,
    );

  if (transferInitializationResponse == void 0) {
    expect(false);
    return;
  }

  await pluginSourceGateway.clientHelper.checkValidInitializationResponse(
    transferInitializationResponse,
    pluginSourceGateway,
  );

  const transferCommenceRequest =
    await pluginSourceGateway.clientHelper.sendTransferCommenceRequest(
      sessionID,
      pluginSourceGateway,
      false,
    );

  if (transferCommenceRequest == void 0) {
    expect(false);
    return;
  }

  await pluginRecipientGateway.serverHelper.checkValidtransferCommenceRequest(
    transferCommenceRequest,
    pluginRecipientGateway,
  );

  const transferCommenceResponse =
    await pluginRecipientGateway.serverHelper.sendTransferCommenceResponse(
      transferCommenceRequest.sessionID,
      pluginRecipientGateway,
      false,
    );

  if (transferCommenceResponse == void 0) {
    expect(false);
    return;
  }

  await pluginSourceGateway.clientHelper.checkValidTransferCommenceResponse(
    transferCommenceResponse,
    pluginSourceGateway,
  );

  await pluginSourceGateway.lockAsset(sessionID);

  const lockEvidenceRequest =
    await pluginSourceGateway.clientHelper.sendLockEvidenceRequest(
      sessionID,
      pluginSourceGateway,
      false,
    );

  if (lockEvidenceRequest == void 0) {
    expect(false);
    return;
  }

  await pluginRecipientGateway.serverHelper.checkValidLockEvidenceRequest(
    lockEvidenceRequest,
    pluginRecipientGateway,
  );

  const lockEvidenceResponse =
    await pluginRecipientGateway.serverHelper.sendLockEvidenceResponse(
      lockEvidenceRequest.sessionID,
      pluginRecipientGateway,
      false,
    );

  if (lockEvidenceResponse == void 0) {
    expect(false);
    return;
  }

  await pluginSourceGateway.clientHelper.checkValidLockEvidenceResponse(
    lockEvidenceResponse,
    pluginSourceGateway,
  );

  const commitPreparationRequest =
    await pluginSourceGateway.clientHelper.sendCommitPreparationRequest(
      sessionID,
      pluginSourceGateway,
      false,
    );

  if (commitPreparationRequest == void 0) {
    expect(false);
    return;
  }

  await pluginRecipientGateway.serverHelper.checkValidCommitPreparationRequest(
    commitPreparationRequest,
    pluginRecipientGateway,
  );

  const commitPreparationResponse =
    await pluginRecipientGateway.serverHelper.sendCommitPreparationResponse(
      lockEvidenceRequest.sessionID,
      pluginRecipientGateway,
      false,
    );

  if (commitPreparationResponse == void 0) {
    expect(false);
    return;
  }

  await pluginSourceGateway.clientHelper.checkValidCommitPreparationResponse(
    commitPreparationResponse,
    pluginSourceGateway,
  );

  await pluginSourceGateway.deleteAsset(sessionID);

  const commitFinalRequest =
    await pluginSourceGateway.clientHelper.sendCommitFinalRequest(
      sessionID,
      pluginSourceGateway,
      false,
    );

  if (commitFinalRequest == void 0) {
    expect(false);
    return;
  }

  await pluginRecipientGateway.serverHelper.checkValidCommitFinalRequest(
    commitFinalRequest,
    pluginRecipientGateway,
  );

  await pluginRecipientGateway.createAsset(sessionID);

  const commitFinalResponse =
    await pluginRecipientGateway.serverHelper.sendCommitFinalResponse(
      lockEvidenceRequest.sessionID,
      pluginRecipientGateway,
      false,
    );

  if (commitFinalResponse == void 0) {
    expect(false);
    return;
  }

  await pluginSourceGateway.clientHelper.checkValidCommitFinalResponse(
    commitFinalResponse,
    pluginSourceGateway,
  );

  const transferCompleteRequest =
    await pluginSourceGateway.clientHelper.sendTransferCompleteRequest(
      sessionID,
      pluginSourceGateway,
      false,
    );

  if (transferCompleteRequest == void 0) {
    expect(false);
    return;
  }

  await pluginRecipientGateway.serverHelper.checkValidTransferCompleteRequest(
    transferCompleteRequest,
    pluginRecipientGateway,
  );

  expect(pluginSourceGateway.sessions.size).toBe(1);
  expect(pluginRecipientGateway.sessions.size).toBe(1);

  const [sessionId] = pluginSourceGateway.sessions.keys();

  await makeSessionDataChecks(
    pluginSourceGateway,
    pluginRecipientGateway,
    sessionId,
  );
});

afterAll(async () => {
  pluginSourceGateway.localRepository?.destroy()
  pluginRecipientGateway.localRepository?.destroy()
  pluginSourceGateway.remoteRepository?.destroy()
  pluginRecipientGateway.remoteRepository?.destroy()
});
