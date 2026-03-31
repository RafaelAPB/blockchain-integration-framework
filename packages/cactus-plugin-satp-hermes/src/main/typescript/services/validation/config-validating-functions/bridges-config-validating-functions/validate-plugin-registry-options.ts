import { LogLevelDesc } from "@hyperledger/cactus-common";

export interface KeychainBackendEntry {
  keychainEntry: string;
  keychainEntryValue: string;
}

export interface KeychainOptionsJSON {
  instanceId: string;
  keychainId: string;
  logLevel?: LogLevelDesc;
  backend?: KeychainBackendEntry[];
  contractName?: string;
  contractString?: string;
}

export interface PluginRegistryOptionsJSON {
  logLevel?: LogLevelDesc;
  plugins?: KeychainOptionsJSON[];
}
