import {
  IPluginFactoryOptions,
  PluginFactory,
} from "@hyperledger/cactus-core-api";
import {
  GatewayOrchestrator,
  GatewayOrchestratorConfig,
} from "../gol/gateway-orchestrator";
import { validateOrReject } from "class-validator";

export class PluginFactoryGatewayOrchestrator extends PluginFactory<
  GatewayOrchestrator,
  GatewayOrchestratorConfig,
  IPluginFactoryOptions
> {
  async create(
    pluginOptions: GatewayOrchestratorConfig,
  ): Promise<GatewayOrchestrator> {
    const coordinator = new GatewayOrchestrator(pluginOptions);

    try {
      const validationOptions = pluginOptions.validationOptions;
      await validateOrReject(coordinator, validationOptions);
      return coordinator;
    } catch (errors) {
      throw new Error(
        `Caught promise rejection (validation failed). Errors: ${errors}`,
      );
    }
  }
}
