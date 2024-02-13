import "jest-extended";
import {
  Containers,
  FabricTestLedgerV1,
  pruneDockerAllIfGithubAction,
  BesuTestLedger,
} from "@hyperledger/cactus-test-tooling";
import { LogLevelDesc, LoggerProvider } from "@hyperledger/cactus-common";
// import coordinator factory, coordinator and coordinator options
import { GatewayCoordinator, GatewayCoordinatorConfig } from "../../../main/typescript/gateway/coordinator/gateway-coordinator";
import { PluginFactoryGatewayCoordinator } from "../../../main/typescript/gateway/coordinator/plugin-factory-gateway-coordinator";
import {
  IPluginFactoryOptions, PluginImportType,
} from "@hyperledger/cactus-core-api";
import { SupportedGatewayImplementations } from './../../../main/typescript/gateway/coordinator/types';

const logLevel: LogLevelDesc = "INFO";
const log = LoggerProvider.getOrCreate({
  level: "INFO",
  label: "satp-gateway-coordinator-init-test",
});
const factoryOptions: IPluginFactoryOptions = {
  pluginImportType: PluginImportType.Local,
}
const factory = new PluginFactoryGatewayCoordinator(factoryOptions);

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

describe("GatewayCoordinator initialization", () => {

  it("initiates with default config", async () => {
    const options: GatewayCoordinatorConfig = {};
    const defaultGatewayCoordinator = await factory.create(options);

    expect(defaultGatewayCoordinator).toBeInstanceOf(GatewayCoordinator);

    const identity = defaultGatewayCoordinator.getIdentity();
    expect(identity).toBeDefined();
    expect(identity.id).toBeDefined();
    expect(identity.name).toBeDefined();
    expect(identity.version).toEqual([
      {
        Core: "1.0",
        Architecture: "1.0",
        Crash: "1.0",
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
