import "jest-extended";

import {
  Containers,
  FabricTestLedgerV1,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";

import http, { Server } from "http";
import fs from "fs-extra";
import { AddressInfo } from "net";

import {
  IListenOptions,
  LoggerProvider,
  LogLevelDesc,
  Servers,
} from "@hyperledger/cactus-common";
import { Configuration } from "@hyperledger/cactus-core-api";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import { PluginRegistry } from "@hyperledger/cactus-core";
import { DiscoveryOptions } from "fabric-network";

import {
  ChainCodeProgrammingLanguage,
  DefaultEventHandlerStrategy,
  FabricContractInvocationType,
  FileBase64,
  IPluginLedgerConnectorFabricOptions,
  PluginLedgerConnectorFabric,
  DefaultApi as FabricApi,
  FabricSigningCredential,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";

import express from "express";
import bodyParser from "body-parser";

import { v4 as uuidv4 } from "uuid";
import path from "path";

import {
  IPluginBUNGEEOptions,
  PluginBUNGEEBenchmark,
} from "../../../main/typescript/plugin-bungee-benchmark";

// import { Secp256k1Keys } from "@hyperledger/cactus-common";
// import { config } from "process";

const logLevel: LogLevelDesc = "TRACE";

const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "pluginBUNGEE",
});

let tItotalTime: number;
let tFtotalTime: number;
let tItransactionsTime: number;
let tFtransactionsTime: number;
const numberOfTransactions = 100;

let fabricLedger: FabricTestLedgerV1;
let fabricContractName: string;
let fabricChannelName: string;
let fabricPath: string;
let fabricConnector: PluginLedgerConnectorFabric;
let fabricServer: Server;
let fabricSigningCredential: FabricSigningCredential;
const FABRIC_ASSET_ID = uuidv4();
let configFabric: Configuration;
let apiClient: FabricApi;

let pluginBungeeOptions: IPluginBUNGEEOptions;
let pluginBungee: PluginBUNGEEBenchmark;
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
      imageName: "ghcr.io/hyperledger/cactus-fabric2-all-in-one",
      envVars: new Map([["FABRIC_VERSION", "2.2.0"]]),
      logLevel,
    });

    await fabricLedger.start();

    const connectionProfile = await fabricLedger.getConnectionProfileOrg1();
    expect(connectionProfile).not.toBeUndefined();

    const enrollAdminOut = await fabricLedger.enrollAdmin();
    const adminWallet = enrollAdminOut[1];
    const [userIdentity] = await fabricLedger.enrollUser(adminWallet);
    const sshConfig = await fabricLedger.getSshConfig();

    const keychainInstanceId = uuidv4();
    const keychainId = uuidv4();
    const keychainEntryKey = "user2";
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
      logLevel,
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
      hostname: "localhost",
      port: 3000,
      server: fabricServer,
    };
    const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
    const { address, port } = addressInfo;

    await fabricConnector.getOrCreateWebServices();
    await fabricConnector.registerWebServices(expressApp);

    const apiUrl = `http://${address}:${port}`;
    fabricPath = apiUrl;
    configFabric = new Configuration({ basePath: apiUrl });

    apiClient = new FabricApi(configFabric);

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

    const response = await apiClient.deployContractV1({
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

    const { packageIds, lifecycle, success } = response.data;
    expect(response.status).toBe(200);
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

    // FIXME - without this wait it randomly fails with an error claiming that
    // the endorsement was impossible to be obtained. The fabric-samples script
    // does the same thing, it just waits 10 seconds for good measure so there
    // might not be a way for us to avoid doing this, but if there is a way we
    // absolutely should not have timeouts like this, anywhere...
    await new Promise((resolve) => setTimeout(resolve, 10000));

    fabricSigningCredential = {
      keychainId,
      keychainRef: keychainEntryKey,
    };
    // CAR1 = 3 TX -> 2 tx
    // CAR2 = 3 TX -> 2 tx
    // CAR3 = 1 TX -> 1 tx
    // ==========
    // CAR1 -> 10 > Remove
    // CAR2 -> 20 <---Ti Keep
    // CAR1 -> 40  Keep
    // CAR1 -> 30  Keep
    // CAR3 -> 100 Keep
    // CAR2 -> 40 <---Tf Keep
    // CAR2 -> 60 > Remove

    // CAN BE USED FOR TESTING
    tItransactionsTime = performance.now();
    // await apiClient.runTransactionV1({
    //   contractName: fabricContractName,
    //   channelName: fabricChannelName,
    //   params: [],
    //   methodName: "InitLedgerV2",
    //   invocationType: FabricContractInvocationType.Send,
    //   signingCredential: fabricSigningCredential,
    // });
    // eslint-disable-next-line prefer-const
    let promisses = [];
    for (let asset = 0; asset < 10; asset++) {
      const assetName = "ASSET" + asset;
      for (let state = 0; state < 10; state++) {
        const promise = apiClient.runTransactionV1({
          contractName: fabricContractName,
          channelName: fabricChannelName,
          params: [assetName, state.toString()],
          methodName: "CreateAsset",
          invocationType: FabricContractInvocationType.Send,
          signingCredential: fabricSigningCredential,
        });
        promisses.push(promise);
      }
    }
    // await Promise.all(promisses);
    await Promise.all(promisses).then((values) => {
      expect(values).not.toBeUndefined();
      for (let i = 0; i < values.length; i++) {
        expect(values[i].status).toBeGreaterThan(199);
        expect(values[i].status).toBeLessThan(300);
      }
      console.log(values);
    });
    tFtransactionsTime = performance.now();
  }
  // BUNGEE options
  pluginBungeeOptions = {
    // bungeeKeys: Secp256k1Keys.generateKeyPairsBuffer(),
    instanceId: uuidv4(),
    participant: "Org1MSP",
    fabricApi: apiClient,
    fabricPath: fabricPath,
    fabricSigningCredential: fabricSigningCredential,
    fabricChannelName: fabricChannelName,
    fabricContractName: fabricContractName,
    fabricAssetID: FABRIC_ASSET_ID,
    fabricConfig: configFabric,
  };
});
test("simple test bungee", async () => {
  tItotalTime = performance.now();
  pluginBungee = new PluginBUNGEEBenchmark(pluginBungeeOptions);
  // pluginBungee.saveViews();
  const ledgerStates = await pluginBungee.generateLedgerStates();
  log.info(`pluginBungee.generateLedgerStates(): ${ledgerStates}`);

  const snapshot = pluginBungee.generateSnapshot();
  log.info(`pluginBungee.generateSnapshot(): ${snapshot}`);

  const views = pluginBungee.generateView(snapshot);
  log.info(`GRAND FINALE`);
  log.info(`pluginBungee.generateView(): ${views}`);

  tFtotalTime = performance.now();

  pluginBungee.generateBenchmarkReport(
    numberOfTransactions,
    tItotalTime,
    tFtotalTime,
    tItransactionsTime,
    tFtransactionsTime,
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
