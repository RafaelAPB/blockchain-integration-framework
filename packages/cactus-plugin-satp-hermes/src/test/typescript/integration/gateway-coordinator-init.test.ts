import "jest-extended";
import {
  Containers,
  FabricTestLedgerV1,
  pruneDockerAllIfGithubAction,
  BesuTestLedger,
} from "@hyperledger/cactus-test-tooling";
import { LogLevelDesc, LoggerProvider } from "@hyperledger/cactus-common";
// import coordinator factory, coordinator and coordinator options
import { GatewayOrchestrator, GatewayOrchestratorConfig } from "../../../main/typescript/gol/gateway-orchestrator";
import { PluginFactoryGatewayOrchestrator } from "../../../main/typescript/factory/plugin-factory-gateway-orchestrator";
import {
  IPluginFactoryOptions, PluginImportType,
} from "@hyperledger/cactus-core-api";
import { SupportedGatewayImplementations } from './../../../main/typescript/core/types';

const logLevel: LogLevelDesc = "INFO";
const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "satp-gateway-orchestrator-init-test",
});
const factoryOptions: IPluginFactoryOptions = {
  pluginImportType: PluginImportType.Local,
}
const factory = new PluginFactoryGatewayOrchestrator(factoryOptions);

beforeAll(async () => {
  pruneDockerAllIfGithubAction({ logLevel })
    .then(() => {
      log.info("Pruning throw OK");
    })
    .catch(async () => {
      await Containers.logDiagnostics({ logLevel });
      fail("Pruning didn't throw OK");
    });
});

describe("GatewayOrchestrator initialization", () => {

  it("initiates with default config", async () => {
    const options: GatewayOrchestratorConfig = {};
    const gateway = await factory.create(options);

    expect(gateway).toBeInstanceOf(GatewayOrchestrator);

    const identity = gateway.getIdentity();
    expect(identity).toBeDefined();
    expect(identity.id).toBeDefined();
    expect(identity.name).toBeDefined();
    expect(identity.version).toEqual([
      {
        Core: "v02",
        Architecture: "v02",
        Crash: "v02",
      },
    ]);
    expect(identity.supportedChains).toEqual([
      SupportedGatewayImplementations.FABRIC,
      SupportedGatewayImplementations.BESU,
    ]);
    expect(identity.proofID).toBe("mockProofID1");
    expect(identity.port).toBe(3000);
    expect(identity.address).toBe("http://localhost");
  });

  test("initiates custom config Gateway Coordinator", async () => {
    const options: GatewayOrchestratorConfig = {
      logLevel: "INFO",
      gid: {
        id: "mockID",
        name: "CustomGateway",
        version: [
          {
            Core: "v02",
            Architecture: "v02",
            Crash: "v02",
          },
        ],
        supportedChains: [
          SupportedGatewayImplementations.FABRIC,
          SupportedGatewayImplementations.BESU,
        ],
        proofID: "mockProofID10",
        port: 3001,
        address: "https://localhost",
      },
    };
    const gateway = await factory.create(options);

    expect(gateway).toBeInstanceOf(GatewayOrchestrator);

    const identity = gateway.getIdentity();
    expect(identity).toBeDefined();
    expect(identity.id).toBeDefined();
    expect(identity.name).toBeDefined();
    expect(identity.version).toEqual([
      {
        Core: "v02",
        Architecture: "v02",
        Crash: "v02",
      },
    ]);
    expect(identity.supportedChains).toEqual([
      SupportedGatewayImplementations.FABRIC,
      SupportedGatewayImplementations.BESU,
    ]);
    expect(identity.proofID).toBe("mockProofID10");
    expect(identity.port).toBe(3001);
    expect(identity.address).toBe("https://localhost");
  });

  test("Gateway Server launches", async () => {
    const options: GatewayOrchestratorConfig = {
      logLevel: "INFO",
      gid: {
        id: "mockID",
        name: "CustomGateway",
        version: [
          {
            Core: "v02",
            Architecture: "v02",
            Crash: "v02",
          },
        ],
        supportedChains: [
          SupportedGatewayImplementations.FABRIC,
          SupportedGatewayImplementations.BESU,
        ],
        proofID: "mockProofID10",
        port: 3010,
        address: "https://localhost",
      },
    };
    const gateway = await factory.create(options);
    expect(gateway).toBeInstanceOf(GatewayOrchestrator);

    const identity = gateway.getIdentity();
    expect(identity.port).toBe(3010);
    expect(identity.address).toBe("https://localhost");

  });

});


afterAll(async () => {
  // shutdown channels

  await pruneDockerAllIfGithubAction({ logLevel })
    .then(() => {
      log.info("Pruning throw OK");
    })
    .catch(async () => {
      await Containers.logDiagnostics({ logLevel });
      fail("Pruning didn't throw OK");
    });
});
