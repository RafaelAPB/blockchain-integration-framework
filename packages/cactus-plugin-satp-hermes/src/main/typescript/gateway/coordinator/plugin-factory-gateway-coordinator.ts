import {
  IPluginFactoryOptions,
  PluginFactory,
} from "@hyperledger/cactus-core-api";
import {
  GatewayCoordinator,
  GatewayCoordinatorConfig,
} from "./gateway-coordinator";
import { validateOrReject } from "class-validator";

export class PluginFactoryGatewayCoordinator extends PluginFactory<
  GatewayCoordinator,
  GatewayCoordinatorConfig,
  IPluginFactoryOptions
> {
  async create(
    pluginOptions: GatewayCoordinatorConfig,
  ): Promise<GatewayCoordinator> {
    const coordinator = new GatewayCoordinator(pluginOptions);

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
