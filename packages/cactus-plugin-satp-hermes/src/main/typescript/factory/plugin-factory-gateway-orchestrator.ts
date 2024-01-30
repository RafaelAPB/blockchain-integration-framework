import {
  IPluginFactoryOptions,
  PluginFactory,
} from "@hyperledger/cactus-core-api";
<<<<<<< HEAD
import { SATPGateway, SATPGatewayConfig } from "../gateway-refactor";
=======
import {
  SATPGateway,
  SATPGatewayConfig,
} from "../gateway-refactor";
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)
import { validateOrReject } from "class-validator";

export class PluginFactorySATPGateway extends PluginFactory<
  SATPGateway,
  SATPGatewayConfig,
  IPluginFactoryOptions
> {
<<<<<<< HEAD
  async create(pluginOptions: SATPGatewayConfig): Promise<SATPGateway> {
=======
  async create(
    pluginOptions: SATPGatewayConfig,
  ): Promise<SATPGateway> {
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)
    const coordinator = new SATPGateway(pluginOptions);

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
