//export * from "./generated/openapi/typescript-axios/index";

export { PluginBUNGEE, IPluginBUNGEEOptions } from "./plugin-bungee";
export { PluginFactoryBUNGEE } from "./plugin-factory-bungee";

import { IPluginFactoryOptions } from "@hyperledger/cactus-core-api";
import { PluginFactoryBUNGEE } from ".";

export async function createPluginFactory(
  pluginFactoryOptions: IPluginFactoryOptions,
): Promise<PluginFactoryBUNGEE> {
  return new PluginFactoryBUNGEE(pluginFactoryOptions);
}
