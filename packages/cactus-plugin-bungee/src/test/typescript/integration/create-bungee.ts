//import { SUPPLY_CHAIN_GO_SOURCE } from "../fixtures/supply-chain-contract/supply-chain-private-data";
/*
import test, { Test } from "tape-promise/tape";
import { v4 as uuidv4 } from "uuid";

import { LogLevelDesc, Secp256k1Keys } from "@hyperledger/cactus-common";

import {
  PluginLedgerConnectorFabric,
  DefaultEventHandlerStrategy,
  IPluginLedgerConnectorFabricOptions,
  FabricContractInvocationType,
  FabricSigningCredential,
  RunTransactionRequest,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";

import { PluginRegistry } from "@hyperledger/cactus-core";
import { DiscoveryOptions } from "fabric-network";
import {
  FabricTestLedgerV1,
  IKeyPair,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";

import { PluginBUNGEE } from "../../../main/typescript";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";

const logLevel: LogLevelDesc = "TRACE";
const ledger = new FabricTestLedgerV1({
  publishAllPorts: true,
  logLevel,
  imageName: "hyperledger/cactus-fabric2-all-in-one",
  imageVersion: "2021-03-08-hotfix-test-network",
  envVars: new Map([
    ["FABRIC_VERSION", "2.2.0"],
    ["CA_VERSION", "1.4.9"],
  ]),
});

///////////////////////// Setting up Fabric Connector

const keys: IKeyPair = Secp256k1Keys.generateKeyPairsBuffer();

test("Initialize BUNGEE with Hyperledger Fabric", async (t: Test) => {
  //////////////////////// Setup Test Ledger

  await ledger.start();

  const tearDownLedger = async () => {
    await ledger.stop();
    await ledger.destroy();
  };
  test.onFinish(tearDownLedger);

  //////////////////////// Setup Test Ledger

  const connectionProfile = await ledger.getConnectionProfileOrg1();
  const sshConfig = await ledger.getSshConfig();

  const enrollAdminOut = await ledger.enrollAdmin();
  const adminWallet = enrollAdminOut[1];
  const [userIdentity] = await ledger.enrollUser(adminWallet);
  console.log(userIdentity);

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pluginRegistry = new PluginRegistry({ plugins: [keychainPlugin] });

  ///////////////////////// Setting up Fabric Connector

  const discoveryOptions: DiscoveryOptions = {
    enabled: true,
    asLocalhost: true,
  };
  const pluginOptions: IPluginLedgerConnectorFabricOptions = {
    instanceId: uuidv4(),
    pluginRegistry,
    sshConfig,
    cliContainerEnv: {},
    logLevel,
    connectionProfile,
    discoveryOptions,
    eventHandlerOptions: {
      strategy: DefaultEventHandlerStrategy.NETWORKSCOPEALLFORTX,
    },
  };
  const fabricConnector = new PluginLedgerConnectorFabric(pluginOptions);

  //// BUNGEE OPTS

  const participants = ["1", "2"];
  const mergeParameters = {
    action: "all",
  };
  const BUNGEEoptions = {
    instanceId: uuidv4(),
    logLevel: logLevel,
    ledgerConnector: fabricConnector,
    participantSet: participants,
    mergingParameters: mergeParameters,
    keys: keys,
  };

  ////
  //const bungeeFactory = new PluginFactoryBUNGEE();
  //const bungee = bungeeFactory.create(BUNGEEoptions);
  const bungee = new PluginBUNGEE(BUNGEEoptions);
  t.equal(bungee.getClassName(), "PluginBUNGEE");
  t.ok(bungee);

  // Instantiated with Fabric
  if (
    bungee.getLedgerConnector().getPackageName() ===
    "@hyperledger/cactus-plugin-ledger-connector-fabric"
  ) {
    const assetId = "asset277";
    const assetOwner = uuidv4();

    const channelName = "mychannel";
    const chainCodeId = "marbles";
    const fabricSigningCredential: FabricSigningCredential = {
      keychainId,
      keychainRef: keychainEntryKey,
    };

    const req: RunTransactionRequest = {
      fabricSigningCredential,
      channelName,
      invocationType: FabricContractInvocationType.SEND,
      chainCodeId,
      //functionName: "CreateAsset",
      functionName: "InitMarble",
      //functionArgs: [assetId, "yellow", "11", assetOwner, "199"],
      functionArgs: [assetId, "yellow", "11", assetOwner, "199"],
    };

    const connector = bungee.getLedgerConnector() as PluginLedgerConnectorFabric;
    connector.transact(req);
    console.log("done");
  }
});

test("CLEANUP", async (t: Test) => {
  const pruning = pruneDockerAllIfGithubAction({ logLevel });
  await t.doesNotReject(pruning, "Pruning didnt throw OK");
  t.end();
});
*/
