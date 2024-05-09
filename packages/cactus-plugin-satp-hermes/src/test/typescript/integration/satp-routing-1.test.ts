/* eslint-disable prefer-const */
import "jest-extended";
import {
  Containers,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";
import {
  LogLevelDesc,
  LoggerProvider,
  Servers,
} from "@hyperledger/cactus-common";
import { ApiClient } from "@hyperledger/cactus-api-client";

// import coordinator factory, coordinator and coordinator options
import { BesuSatpGateway } from "../../../main/typescript/gateway/besu-satp-gateway";
import { FabricSatpGateway } from "../../../main/typescript/gateway/fabric-satp-gateway";
import { ClientGatewayHelper } from "../../../main/typescript/gateway/client/client-helper";
import { ServerGatewayHelper } from "../../../main/typescript/gateway/server/server-helper";
import { Ledger, LedgerType } from "@hyperledger/cactus-core-api";
import {
  generateKeyPair,
  exportSPKI,
  exportPKCS8,
  GenerateKeyPairResult,
} from "jose";
import { v4 as uuidV4 } from "uuid";
import {
  ApiServer,
  AuthorizationProtocol,
  ConfigService,
} from "@hyperledger/cactus-cmd-api-server";
import {
  IPluginConsortiumManualOptions,
  PluginConsortiumManual,
  Configuration,
} from "@hyperledger/cactus-plugin-consortium-manual";
import {
  CactusNode,
  Consortium,
  ConsortiumDatabase,
  ConsortiumMember,
} from "@hyperledger/cactus-core-api";
import { DefaultApi as SatpApi } from "../../../main/typescript/public-api";

import { AddressInfo } from "net";
import { PluginRegistry } from "@hyperledger/cactus-core";

import { knexRemoteConnection } from "../knex.config";

const logLevel: LogLevelDesc = "INFO";
const logger = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "create consortium",
});

const consortiumId = uuidV4();
const consortiumName = "Example Corp. & Friends Crypto Consortium";

let keyPair1: GenerateKeyPairResult;
let pubKeyPem1: string;
let member1: ConsortiumMember;
let node1: CactusNode;
const memberId1 = uuidV4();
let apiServer1: ApiServer;
let addressInfo1: AddressInfo;
let node1Host: string;
let httpServer1: any;

let keyPair2: GenerateKeyPairResult;
let pubKeyPem2: string;
let member2: ConsortiumMember;
let node2: CactusNode;
const memberId2 = uuidV4();
let apiServer2: ApiServer;
let addressInfo2: AddressInfo;
let node2Host: string;
let httpServer2: any;

const ledger1: Ledger = {
  id: "DLT1",
  ledgerType: LedgerType.Quorum2X,
};
const ledger2: Ledger = {
  id: "DLT2",
  ledgerType: LedgerType.Quorum2X,
};

beforeAll(async () => {
  pruneDockerAllIfGithubAction({ logLevel })
    .then(() => {
      logger.info("Pruning throw OK");
    })
    .catch(async () => {
      await Containers.logDiagnostics({ logLevel });
      fail("Pruning didn't throw OK");
    });
});

test("create consortium and test api-server routing", async () => {
  const sourceGatewayConstructor = {
    name: "plugin-satp-gateway#sourceGateway",
    dltIDs: ["DLT2"],
    instanceId: uuidV4(),
    clientHelper: new ClientGatewayHelper(),
    serverHelper: new ServerGatewayHelper(),
    knexRemoteConfig: knexRemoteConnection,
  };
  const recipientGatewayConstructor = {
    name: "plugin-satp-gateway#recipientGateway",
    dltIDs: ["DLT1"],
    instanceId: uuidV4(),
    clientHelper: new ClientGatewayHelper(),
    serverHelper: new ServerGatewayHelper(),
    knexRemoteConfig: knexRemoteConnection,
  };

  const gateway1 = new FabricSatpGateway(sourceGatewayConstructor);
  const gateway2 = new BesuSatpGateway(recipientGatewayConstructor);

  httpServer1 = await Servers.startOnPreferredPort(3010);
  addressInfo1 = httpServer1.address() as AddressInfo;
  node1Host = `http://${addressInfo1.address}:${addressInfo1.port}`;

  httpServer2 = await Servers.startOnPreferredPort(3020);
  addressInfo2 = httpServer2.address() as AddressInfo;
  node2Host = `http://${addressInfo2.address}:${addressInfo2.port}`;

  keyPair1 = await generateKeyPair("ES256K");
  pubKeyPem1 = await exportSPKI(keyPair1.publicKey);

  keyPair2 = await generateKeyPair("ES256K");
  pubKeyPem2 = await exportSPKI(keyPair2.publicKey);

  node1 = {
    nodeApiHost: node1Host,
    publicKeyPem: pubKeyPem1,
    consortiumId,
    id: uuidV4(),
    ledgerIds: [ledger1.id],
    memberId: memberId1,
    pluginInstanceIds: [],
    capabilities: ["org.hyperledger.cactus.capability.SATPHermes"],
  };

  member1 = {
    id: memberId1,
    name: "Example Corp 1",
    nodeIds: [node1.id],
  };

  node2 = {
    nodeApiHost: node2Host,
    publicKeyPem: pubKeyPem2,
    consortiumId,
    id: uuidV4(),
    ledgerIds: [ledger2.id],
    memberId: memberId2,
    pluginInstanceIds: [],
    capabilities: ["org.hyperledger.cactus.capability.SATPHermes"],
  };

  member2 = {
    id: memberId2,
    name: "Example Corp 2",
    nodeIds: [node2.id],
  };

  const consortium: Consortium = {
    id: consortiumId,
    mainApiHost: node1Host,
    name: consortiumName,
    memberIds: [member1.id, member2.id],
  };

  const consortiumDatabase: ConsortiumDatabase = {
    cactusNode: [node1, node2],
    consortium: [consortium],
    consortiumMember: [member1, member2],
    ledger: [ledger1, ledger2],
    pluginInstance: [],
  };

  {
    const pluginRegistry = new PluginRegistry({ plugins: [] });

    const keyPairPem = await exportPKCS8(keyPair1.privateKey);
    const options: IPluginConsortiumManualOptions = {
      instanceId: uuidV4(),
      pluginRegistry,
      keyPairPem: keyPairPem,
      consortiumDatabase,
      logLevel,
    };
    const pluginConsortiumManual = new PluginConsortiumManual(options);

    const configService = new ConfigService();
    const apiServerOptions = await configService.newExampleConfig();
    apiServerOptions.authorizationProtocol = AuthorizationProtocol.NONE;
    apiServerOptions.configFile = "";
    apiServerOptions.apiCorsDomainCsv = "*";
    apiServerOptions.apiPort = addressInfo1.port;
    apiServerOptions.cockpitPort = 0;
    apiServerOptions.grpcPort = 0;
    apiServerOptions.crpcPort = 0;
    apiServerOptions.logLevel = logLevel || "INFO";
    apiServerOptions.apiTlsEnabled = false;
    const config =
      await configService.newExampleConfigConvict(apiServerOptions);

    pluginRegistry.add(pluginConsortiumManual);
    pluginRegistry.add(gateway1);

    apiServer1 = new ApiServer({
      httpServerApi: httpServer1,
      config: config.getProperties(),
      pluginRegistry,
    });

    await apiServer1.start();
    logger.info("initiated api-server 1");
  }

  {
    const pluginRegistry = new PluginRegistry({ plugins: [] });

    const keyPairPem = await exportPKCS8(keyPair2.privateKey);
    const options: IPluginConsortiumManualOptions = {
      instanceId: uuidV4(),
      pluginRegistry,
      keyPairPem: keyPairPem,
      consortiumDatabase,
      logLevel,
    };
    const pluginConsortiumManual = new PluginConsortiumManual(options);

    const configService = new ConfigService();
    const apiServerOptions = await configService.newExampleConfig();
    apiServerOptions.authorizationProtocol = AuthorizationProtocol.NONE;
    apiServerOptions.configFile = "";
    apiServerOptions.apiCorsDomainCsv = "*";
    apiServerOptions.apiPort = addressInfo2.port;
    apiServerOptions.logLevel = logLevel || "INFO";
    apiServerOptions.cockpitPort = 0;
    apiServerOptions.grpcPort = 0;
    apiServerOptions.crpcPort = 0; //default is 6000 , have to change so it does not break
    apiServerOptions.apiTlsEnabled = false;
    const config =
      await configService.newExampleConfigConvict(apiServerOptions);

    pluginRegistry.add(pluginConsortiumManual);
    pluginRegistry.add(gateway2);

    apiServer2 = new ApiServer({
      httpServerApi: httpServer2,
      config: config.getProperties(),
      pluginRegistry,
    });

    await apiServer2.start();
    logger.info("initiated api-server 2");
  }

  const config = new Configuration({ basePath: consortium.mainApiHost });
  const mainApiClient = new ApiClient(config);

  const apiClient1 = await mainApiClient.ofLedger(ledger1.id, SatpApi, {});

  const apiClient2 = await mainApiClient.ofLedger(
    ledger2.id,
    SatpApi,
    {},
    undefined,
    ["org.hyperledger.cactus.capability.SATPHermes"],
  );
  expect(JSON.stringify(apiClient1)).not.toEqual(JSON.stringify(apiClient2));
});

afterAll(async () => {
  await apiServer2.shutdown();
  await apiServer1.shutdown();
});
