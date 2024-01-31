import http, { Server } from "http";
import type { AddressInfo } from "net";
import { v4 as uuidv4 } from "uuid";
import "jest-extended";
import bodyParser from "body-parser";
import express, { Express } from "express";
import {
  IListenOptions,
  LogLevelDesc,
  Secp256k1Keys,
  Servers,
} from "@hyperledger/cactus-common";
import { Configuration } from "@hyperledger/cactus-core-api";

import {
  AssetProfile,
  ClientV1Request,
} from "../../../main/typescript/public-api";
import { makeSessionDataChecks } from "../make-checks";
import {
  IFabricOdapGatewayConstructorOptions,
  FabricOdapGateway,
} from "../../../main/typescript/gateway/fabric-odap-gateway";
import {
  IBesuOdapGatewayConstructorOptions,
  BesuOdapGateway,
} from "../../../main/typescript/gateway/besu-odap-gateway";
import { ClientGatewayHelper } from "../../../main/typescript/gateway/client/client-helper";
import { ServerGatewayHelper } from "../../../main/typescript/gateway/server/server-helper";

import { knexClientConnection, knexRemoteConnection } from "../knex.config";

const MAX_RETRIES = 5;
const MAX_TIMEOUT = 5000;

const FABRIC_ASSET_ID = uuidv4();
const BESU_ASSET_ID = uuidv4();

const logLevel: LogLevelDesc = "INFO";

let odapClientGatewayPluginOptions: IFabricOdapGatewayConstructorOptions;
let odapServerGatewayPluginOptions: IBesuOdapGatewayConstructorOptions;
let pluginSourceGateway: FabricOdapGateway;
let pluginRecipientGateway: BesuOdapGateway;

let sourceGatewayServer: Server;
let recipientGatewayserver: Server;

let odapServerGatewayApiHost: string;
let odapClientGatewayApiHost: string;

let odapClientRequest: ClientV1Request;

let serverExpressApp: Express;
let serverListenOptions: IListenOptions;

let clientExpressApp: Express;
let clientListenOptions: IListenOptions;

beforeAll(async () => {
  {
    // Server Gateway configuration
    odapServerGatewayPluginOptions = {
      name: "cactus-plugin#odapGateway",
      dltIDs: ["DLT1"],
      instanceId: uuidv4(),
      keyPair: Secp256k1Keys.generateKeyPairsBuffer(),
      clientHelper: new ClientGatewayHelper(),
      serverHelper: new ServerGatewayHelper(),
      knexRemoteConfig: knexRemoteConnection,
    };

    serverExpressApp = express();
    serverExpressApp.use(bodyParser.json({ limit: "250mb" }));
    recipientGatewayserver = http.createServer(serverExpressApp);
    serverListenOptions = {
      hostname: "127.0.0.1",
      port: 3000,
      server: recipientGatewayserver,
    };

    const addressInfo = (await Servers.listen(
      serverListenOptions,
    )) as AddressInfo;

    const { address, port } = addressInfo;
    odapServerGatewayApiHost = `http://${address}:${port}`;

    pluginRecipientGateway = new BesuOdapGateway(
      odapServerGatewayPluginOptions,
    );

    expect(pluginRecipientGateway.localRepository?.database).not.toBeUndefined();

  await pluginRecipientGateway.localRepository?.reset();

    await pluginRecipientGateway.registerWebServices(serverExpressApp);
  }
  {
    // Client Gateway configuration
    odapClientGatewayPluginOptions = {
      name: "cactus-plugin#odapGateway",
      dltIDs: ["DLT2"],
      instanceId: uuidv4(),
      keyPair: Secp256k1Keys.generateKeyPairsBuffer(),
      clientHelper: new ClientGatewayHelper(),
      serverHelper: new ServerGatewayHelper(),
      knexRemoteConfig: knexRemoteConnection,
      knexLocalConfig: knexClientConnection,
    };

    clientExpressApp = express();
    clientExpressApp.use(bodyParser.json({ limit: "250mb" }));
    sourceGatewayServer = http.createServer(clientExpressApp);
    clientListenOptions = {
      hostname: "127.0.0.1",
      port: 2000,
      server: sourceGatewayServer,
    };

    const addressInfo = (await Servers.listen(
      clientListenOptions,
    )) as AddressInfo;

    const { address, port } = addressInfo;
    odapClientGatewayApiHost = `http://${address}:${port}`;

    pluginSourceGateway = new FabricOdapGateway(odapClientGatewayPluginOptions);

    if (pluginSourceGateway.localRepository?.database == undefined) {
      throw new Error("Database is not correctly initialized");
    }

    await pluginSourceGateway.localRepository?.reset();

    await pluginSourceGateway.registerWebServices(clientExpressApp);

    const expiryDate = new Date(2060, 11, 24).toString();
    const assetProfile: AssetProfile = { expirationDate: expiryDate };

    odapClientRequest = {
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
  }
});

test("server gateway crashes after transfer initiation flow", async () => {
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

  // now we simulate the crash of the server gateway
  pluginRecipientGateway.localRepository?.destroy()
  pluginRecipientGateway.remoteRepository?.destroy()
  await Servers.shutdown(recipientGatewayserver);

  serverExpressApp = express();
  serverExpressApp.use(bodyParser.json({ limit: "250mb" }));
  recipientGatewayserver = http.createServer(serverExpressApp);
  const listenOptions: IListenOptions = {
    hostname: "127.0.0.1",
    port: 3000,
    server: recipientGatewayserver,
  };

  await Servers.listen(listenOptions);

  pluginRecipientGateway = new BesuOdapGateway(odapServerGatewayPluginOptions);
  await pluginRecipientGateway.registerWebServices(serverExpressApp);

  // server gateway self-healed and is back online
  await pluginRecipientGateway.recoverOpenSessions(true);

  await makeSessionDataChecks(
    pluginSourceGateway,
    pluginRecipientGateway,
    sessionID,
  );
});

afterAll(async () => {
  pluginSourceGateway.localRepository?.destroy()
  pluginRecipientGateway.localRepository?.destroy()
  pluginSourceGateway.remoteRepository?.destroy()
  pluginRecipientGateway.remoteRepository?.destroy()

  await Servers.shutdown(sourceGatewayServer);
  await Servers.shutdown(recipientGatewayserver);
});
