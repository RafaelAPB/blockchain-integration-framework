import http, { Server } from "http";
import type { AddressInfo } from "net";
import { v4 as uuidv4 } from "uuid";
import "jest-extended";
import bodyParser from "body-parser";
import express from "express";
import { DefaultApi as OdapApi } from "../../../main/typescript/public-api";

import {
  IListenOptions,
  Servers,
} from "@hyperledger/cactus-common";

import { Configuration } from "@hyperledger/cactus-core-api";

import {
  PluginOdapGateway,
  IPluginOdapGatewayConstructorOptions,
} from "../../../main/typescript/gateway/plugin-odap-gateway";
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

const FABRIC_ASSET_ID = uuidv4();
const BESU_ASSET_ID = uuidv4();

let sourceGatewayServer: Server;
let recipientGatewayserver: Server;

let pluginSourceGateway: PluginOdapGateway;
let pluginRecipientGateway: PluginOdapGateway;

test("runs ODAP between two gateways via openApi", async () => {
  const odapClientGatewayPluginOptions: IPluginOdapGatewayConstructorOptions = {
    name: "cactus-plugin#odapGateway",
    dltIDs: ["DLT2"],
    instanceId: uuidv4(),
    clientHelper: new ClientGatewayHelper(),
    serverHelper: new ServerGatewayHelper(),
    knexRemoteConfig: knexRemoteConnection
  };

  const odapServerGatewayPluginOptions: IPluginOdapGatewayConstructorOptions = {
    name: "cactus-plugin#odapGateway",
    dltIDs: ["DLT1"],
    instanceId: uuidv4(),
    clientHelper: new ClientGatewayHelper(),
    serverHelper: new ServerGatewayHelper(),
    knexRemoteConfig: knexRemoteConnection
  };

  pluginSourceGateway = new FabricOdapGateway(odapClientGatewayPluginOptions);
  pluginRecipientGateway = new BesuOdapGateway(odapServerGatewayPluginOptions);

  expect(pluginSourceGateway.localRepository?.database).not.toBeUndefined();
  expect(pluginRecipientGateway.localRepository?.database).not.toBeUndefined();

  await pluginSourceGateway.localRepository?.reset();
  await pluginRecipientGateway.localRepository?.reset();

  let odapServerGatewayApiHost: string;

  {
    // Server Gateway configuration
    const expressApp = express();
    expressApp.use(bodyParser.json({ limit: "250mb" }));
    recipientGatewayserver = http.createServer(expressApp);
    const listenOptions: IListenOptions = {
      hostname: "127.0.0.1",
      port: 3000,
      server: recipientGatewayserver,
    };

    const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;

    const { address, port } = addressInfo;
    odapServerGatewayApiHost = `http://${address}:${port}`;

    await pluginRecipientGateway.getOrCreateWebServices();
    await pluginRecipientGateway.registerWebServices(expressApp);
  }
  {
    // Client Gateway configuration
    const expressApp = express();
    expressApp.use(bodyParser.json({ limit: "250mb" }));
    sourceGatewayServer = http.createServer(expressApp);
    const listenOptions: IListenOptions = {
      hostname: "127.0.0.1",
      port: 2000,
      server: sourceGatewayServer,
    };

    const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;

    const { address, port } = addressInfo;
    const odapClientGatewayApiHost = `http://${address}:${port}`;

    await pluginSourceGateway.getOrCreateWebServices();
    await pluginSourceGateway.registerWebServices(expressApp);

    const odapApiConfig = new Configuration({
      basePath: odapClientGatewayApiHost,
    });
    const apiClient = new OdapApi(odapApiConfig);

    const expiryDate = new Date(2060, 11, 24).toString();
    const assetProfile: AssetProfile = { expirationDate: expiryDate };

    const odapClientRequest: ClientV1Request = {
      clientGatewayConfiguration: {
        apiHost: odapClientGatewayApiHost,
      },
      serverGatewayConfiguration: {
        apiHost: odapServerGatewayApiHost,
      },
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
      sourceLedgerAssetID: FABRIC_ASSET_ID,
      recipientLedgerAssetID: BESU_ASSET_ID,
    };
    const res = await apiClient.clientRequestV1(odapClientRequest);
    expect(res.status).toBe(200);
  }

  expect(pluginSourceGateway.sessions.size).toBe(1);
  expect(pluginRecipientGateway.sessions.size).toBe(1);

  const [sessionID] = pluginSourceGateway.sessions.keys();

  await makeSessionDataChecks(
    pluginSourceGateway,
    pluginRecipientGateway,
    sessionID,
  );
});

afterAll(async () => {
  await Servers.shutdown(sourceGatewayServer);
  await Servers.shutdown(recipientGatewayserver);
  pluginSourceGateway.localRepository?.destroy()
  pluginRecipientGateway.localRepository?.destroy()
  pluginSourceGateway.remoteRepository?.destroy()
  pluginRecipientGateway.remoteRepository?.destroy()
});
