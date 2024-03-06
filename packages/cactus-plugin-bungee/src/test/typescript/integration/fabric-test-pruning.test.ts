import {
  IListenOptions,
  LogLevelDesc,
  LoggerProvider,
  Secp256k1Keys,
  Servers,
} from "@hyperledger/cactus-common";
import "jest-extended";

import { PluginRegistry } from "@hyperledger/cactus-core";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import { DiscoveryOptions } from "fabric-network";
import bodyParser from "body-parser";
import path from "path";

import http, { Server } from "http";

import fs from "fs-extra";

import {
  Configuration,
  DefaultEventHandlerStrategy,
  FabricSigningCredential,
  IPluginLedgerConnectorFabricOptions,
  PluginLedgerConnectorFabric,
  DefaultApi as FabricApi,
  FileBase64,
  ChainCodeProgrammingLanguage,
  FabricContractInvocationType,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";
import {
  Containers,
  DEFAULT_FABRIC_2_AIO_FABRIC_VERSION,
  DEFAULT_FABRIC_2_AIO_IMAGE_NAME,
  DEFAULT_FABRIC_2_AIO_IMAGE_VERSION,
  FabricTestLedgerV1,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";
import express from "express";
import { AddressInfo } from "net";

import { v4 as uuidv4 } from "uuid";
import {
  FabricNetworkDetails,
  StrategyFabric,
} from "../../../main/typescript/strategy/strategy-fabric";
import {
  IPluginBUNGEEOptions,
  PluginBUNGEE,
} from "../../../main/typescript/plugin-bungee";

let fabricServer: Server;

let fabricSigningCredential: FabricSigningCredential;
const logLevel: LogLevelDesc = "INFO";

let fabricLedger: FabricTestLedgerV1;
let fabricContractName: string;
let fabricChannelName: string;
let fabricPath: string;

let configFabric: Configuration;
let apiClient: FabricApi;

let fabricConnector: PluginLedgerConnectorFabric;
let pluginBungeeFabricOptions: IPluginBUNGEEOptions;
let pluginBungee: PluginBUNGEE;
const FABRIC_ASSET_ID = uuidv4();

let networkDetails: FabricNetworkDetails;

const log = LoggerProvider.getOrCreate({
  level: logLevel,
  label: "BUNGEE dummy testing",
});

beforeAll(async () => {
  pruneDockerAllIfGithubAction({ logLevel })
    .then(() => {
      log.info("Pruning throw OK");
    })
    .catch(async () => {
      await Containers.logDiagnostics({ logLevel });
      fail("Pruning didn't throw OK");
    });

  {
    // Fabric ledger connection
    const channelId = "mychannel";
    fabricChannelName = channelId;

    fabricLedger = new FabricTestLedgerV1({
      emitContainerLogs: true,
      publishAllPorts: true,
      imageName: DEFAULT_FABRIC_2_AIO_IMAGE_NAME,
      imageVersion: DEFAULT_FABRIC_2_AIO_IMAGE_VERSION,
      envVars: new Map([
        ["FABRIC_VERSION", DEFAULT_FABRIC_2_AIO_FABRIC_VERSION],
      ]),
      logLevel,
    });

    await fabricLedger.start();
    log.info("Fabric Ledger started");

    const connectionProfile = await fabricLedger.getConnectionProfileOrg1();
    expect(connectionProfile).not.toBeUndefined();

    const enrollAdminOut = await fabricLedger.enrollAdmin();
    const adminWallet = enrollAdminOut[1];
    const [userIdentity] = await fabricLedger.enrollUser(adminWallet);
    const sshConfig = await fabricLedger.getSshConfig();

    log.info("enrolled admin");

    const keychainInstanceId = uuidv4();
    const keychainId = uuidv4();
    const keychainEntryKey = "user1";
    const keychainEntryValue = JSON.stringify(userIdentity);

    const keychainPlugin = new PluginKeychainMemory({
      instanceId: keychainInstanceId,
      keychainId,
      logLevel,
      backend: new Map([
        [keychainEntryKey, keychainEntryValue],
        ["some-other-entry-key", "some-other-entry-value"],
      ]),
    });

    const pluginRegistry = new PluginRegistry({ plugins: [keychainPlugin] });

    const discoveryOptions: DiscoveryOptions = {
      enabled: true,
      asLocalhost: true,
    };

    // This is the directory structure of the Fabirc 2.x CLI container (fabric-tools image)
    // const orgCfgDir = "/fabric-samples/test-network/organizations/";
    const orgCfgDir =
      "/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/";

    // these below mirror how the fabric-samples sets up the configuration
    const org1Env = {
      CORE_LOGGING_LEVEL: "debug",
      FABRIC_LOGGING_SPEC: "debug",
      CORE_PEER_LOCALMSPID: "Org1MSP",

      ORDERER_CA: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,

      FABRIC_CFG_PATH: "/etc/hyperledger/fabric",
      CORE_PEER_TLS_ENABLED: "true",
      CORE_PEER_TLS_ROOTCERT_FILE: `${orgCfgDir}peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt`,
      CORE_PEER_MSPCONFIGPATH: `${orgCfgDir}peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp`,
      CORE_PEER_ADDRESS: "peer0.org1.example.com:7051",
      ORDERER_TLS_ROOTCERT_FILE: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,
    };

    // these below mirror how the fabric-samples sets up the configuration
    const org2Env = {
      CORE_LOGGING_LEVEL: "debug",
      FABRIC_LOGGING_SPEC: "debug",
      CORE_PEER_LOCALMSPID: "Org2MSP",

      FABRIC_CFG_PATH: "/etc/hyperledger/fabric",
      CORE_PEER_TLS_ENABLED: "true",
      ORDERER_CA: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,

      CORE_PEER_ADDRESS: "peer0.org2.example.com:9051",
      CORE_PEER_MSPCONFIGPATH: `${orgCfgDir}peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp`,
      CORE_PEER_TLS_ROOTCERT_FILE: `${orgCfgDir}peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt`,
      ORDERER_TLS_ROOTCERT_FILE: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,
    };

    const pluginOptions: IPluginLedgerConnectorFabricOptions = {
      instanceId: uuidv4(),
      dockerBinary: "/usr/local/bin/docker",
      peerBinary: "/fabric-samples/bin/peer",
      goBinary: "/usr/local/go/bin/go",
      pluginRegistry,
      cliContainerEnv: org1Env,
      sshConfig,
      logLevel: "INFO",
      connectionProfile,
      discoveryOptions,
      eventHandlerOptions: {
        strategy: DefaultEventHandlerStrategy.NetworkScopeAllfortx,
        commitTimeout: 300,
      },
    };

    fabricConnector = new PluginLedgerConnectorFabric(pluginOptions);

    const expressApp = express();
    expressApp.use(bodyParser.json({ limit: "250mb" }));
    fabricServer = http.createServer(expressApp);
    const listenOptions: IListenOptions = {
      hostname: "127.0.0.1",
      port: 3000,
      server: fabricServer,
    };
    const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
    const { address, port } = addressInfo;

    await fabricConnector.getOrCreateWebServices();
    await fabricConnector.registerWebServices(expressApp);

    log.info("Fabric Ledger connector check");

    const apiUrl = `http://${address}:${port}`;
    /*fabricPath = apiUrl;
      const config = new Configuration({ basePath: apiUrl });
  
      const apiClient = new FabricApi(config);
      */

    fabricPath = apiUrl;
    configFabric = new Configuration({ basePath: apiUrl });

    apiClient = new FabricApi(configFabric);

    // deploy contracts ...
    fabricContractName = "basic-asset-transfer-2";
    const contractRelPath =
      "../fabric-contracts/simple-asset/chaincode-typescript";
    const contractDir = path.join(__dirname, contractRelPath);

    // ├── package.json
    // ├── src
    // │   ├── assetTransfer.ts
    // │   ├── asset.ts
    // │   └── index.ts
    // ├── tsconfig.json
    // --------
    const sourceFiles: FileBase64[] = [];
    {
      const filename = "./tsconfig.json";
      const relativePath = "./";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./package.json";
      const relativePath = "./";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./index.ts";
      const relativePath = "./src/";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./asset.ts";
      const relativePath = "./src/";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }
    {
      const filename = "./assetTransfer.ts";
      const relativePath = "./src/";
      const filePath = path.join(contractDir, relativePath, filename);
      const buffer = await fs.readFile(filePath);
      sourceFiles.push({
        body: buffer.toString("base64"),
        filepath: relativePath,
        filename,
      });
    }

    const res = await apiClient.deployContractV1({
      channelId,
      ccVersion: "1.0.0",
      sourceFiles,
      ccName: fabricContractName,
      targetOrganizations: [org1Env, org2Env],
      caFile: `${orgCfgDir}ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem`,
      ccLabel: "basic-asset-transfer-2",
      ccLang: ChainCodeProgrammingLanguage.Typescript,
      ccSequence: 1,
      orderer: "orderer.example.com:7050",
      ordererTLSHostnameOverride: "orderer.example.com",
      connTimeout: 60,
    });

    const { packageIds, lifecycle, success } = res.data;
    expect(res.status).toBe(200);
    expect(success).toBe(true);
    expect(lifecycle).not.toBeUndefined();

    const {
      approveForMyOrgList,
      installList,
      queryInstalledList,
      commit,
      packaging,
      queryCommitted,
    } = lifecycle;

    expect(packageIds).toBeTruthy();
    expect(packageIds).toBeArray();

    expect(approveForMyOrgList).toBeTruthy();
    expect(approveForMyOrgList).toBeArray();

    expect(installList).toBeTruthy();
    expect(installList).toBeArray();
    expect(queryInstalledList).toBeTruthy();
    expect(queryInstalledList).toBeArray();

    expect(commit).toBeTruthy();
    expect(packaging).toBeTruthy();
    expect(queryCommitted).toBeTruthy();
    log.info("Contract deployed");

    fabricSigningCredential = {
      keychainId,
      keychainRef: keychainEntryKey,
    };
    const createResponse = await apiClient.runTransactionV1({
      contractName: fabricContractName,
      channelName: fabricChannelName,
      params: [FABRIC_ASSET_ID, "19"],
      methodName: "CreateAsset",
      invocationType: FabricContractInvocationType.Send,
      signingCredential: fabricSigningCredential,
    });

    expect(createResponse).not.toBeUndefined();
    expect(createResponse.status).toBeGreaterThan(199);
    expect(createResponse.status).toBeLessThan(300);

    log.info(
      `BassicAssetTransfer.Create(): ${JSON.stringify(createResponse.data)}`,
    );

    pluginBungeeFabricOptions = {
      keyPair: Secp256k1Keys.generateKeyPairsBuffer(),
      instanceId: uuidv4(),
    };

    networkDetails = {
      connectorApiPath: fabricPath,
      signingCredential: fabricSigningCredential,
      channelName: fabricChannelName,
      contractName: fabricContractName,
      participant: "Org1MSP",
    };

    pluginBungee = new PluginBUNGEE(pluginBungeeFabricOptions);
  }
});

test("test creation of views for specific timeframes", async () => {
  const strategy = "FABRIC";
  pluginBungee.addStrategy(strategy, new StrategyFabric("INFO"));

  const snapshot = await pluginBungee.generateSnapshot(
    [],
    strategy,
    networkDetails,
  );
  const view = pluginBungee.generateView(
    snapshot,
    "0",
    "9999999999999",
    undefined,
  );
  //expect to return a view
  expect(view.view).toBeTruthy();
  expect(view.signature).toBeTruthy();

  //expect the view to have capture the new asset FABRIC_ASSET_ID, and attributes to match
  expect(snapshot.getStateBins().length).toEqual(1);
  expect(snapshot.getStateBins()[0].getId()).toEqual(FABRIC_ASSET_ID);
  expect(snapshot.getStateBins()[0].getTransactions().length).toEqual(1);
  //fabric transaction proofs include endorsements
  expect(
    snapshot.getStateBins()[0].getTransactions()[0].getProof().getEndorsements()
      ?.length,
  ).toEqual(2);

  //changing FABRIC_ASSET_ID value
  const modifyResponse = await apiClient.runTransactionV1({
    contractName: fabricContractName,
    channelName: fabricChannelName,
    params: [FABRIC_ASSET_ID, "18"],
    methodName: "UpdateAsset",
    invocationType: FabricContractInvocationType.Send,
    signingCredential: fabricSigningCredential,
  });
  expect(modifyResponse).not.toBeUndefined();
  expect(modifyResponse.status).toBeGreaterThan(199);
  expect(modifyResponse.status).toBeLessThan(300);

  const snapshot1 = await pluginBungee.generateSnapshot(
    [],
    strategy,
    networkDetails,
  );

  //tI is the time of the first transaction +1
  const tI = (
    parseInt(snapshot.getStateBins()[0].getTransactions()[0].getTimeStamp()) + 1
  ).toString();

  expect(snapshot1.getStateBins().length).toEqual(1);
  expect(snapshot1.getStateBins()[0].getId()).toEqual(FABRIC_ASSET_ID);
  expect(snapshot1.getStateBins()[0].getTransactions().length).toEqual(2);
  expect(snapshot1.getStateBins()[0].getValue()).not.toEqual(
    snapshot.getStateBins()[0].getValue(),
  );
  const view1 = pluginBungee.generateView(
    snapshot1,
    tI,
    "9999999999999",
    undefined,
  );

  //expect to return a view
  expect(view1.view).toBeTruthy();
  expect(view1.signature).toBeTruthy();

  expect(snapshot1.getStateBins().length).toEqual(1);
  expect(snapshot1.getStateBins()[0].getId()).toEqual(FABRIC_ASSET_ID);
  //expect the view to not include first transaction (made before tI)
  expect(snapshot1.getStateBins()[0].getTransactions().length).toEqual(1);
  //expect old and new snapshot state values to differ
  expect(snapshot1.getStateBins()[0].getValue()).not.toEqual(
    snapshot.getStateBins()[0].getValue(),
  );
});

afterAll(async () => {
  await fabricLedger.stop();
  await fabricLedger.destroy();
  await Servers.shutdown(fabricServer);

  await pruneDockerAllIfGithubAction({ logLevel })
    .then(() => {
      log.info("Pruning throw OK");
    })
    .catch(async () => {
      await Containers.logDiagnostics({ logLevel });
      fail("Pruning didn't throw OK");
    });
});
