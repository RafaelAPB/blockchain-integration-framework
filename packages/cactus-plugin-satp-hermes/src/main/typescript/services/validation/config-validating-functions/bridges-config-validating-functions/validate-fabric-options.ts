import {
  ConnectionProfile,
  DefaultEventHandlerStrategy,
  FabricSigningCredentialType,
  GatewayDiscoveryOptions,
  GatewayEventHandlerOptions,
  IPluginLedgerConnectorFabricOptions,
  IVaultConfig,
  IWebSocketConfig,
  SignPayloadCallback,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";
import { isFabricSigningCredentialType } from "./validate-fabric-config";
import { Logger } from "@hyperledger/cactus-common";

export interface FabricOptionsJSON {
  instanceId: string;
  connectionProfile: ConnectionProfile;
  discoveryOptions?: GatewayDiscoveryOptions;
  eventHandlerOptions?: GatewayEventHandlerOptions;
  supportedIdentity?: FabricSigningCredentialType[];
  vaultConfig?: IVaultConfig;
  webSocketConfig?: IWebSocketConfig;
  signCallback?: SignPayloadCallback;
  dockerNetworkName?: string;
}

// Type guard for GatewayDiscoveryOptions
function isGatewayDiscoveryOptions(
  obj: unknown,
): obj is GatewayDiscoveryOptions {
  const objRecord = obj as Record<string, unknown>;
  return (
    typeof obj === "object" &&
    obj !== null &&
    (!("asLocalhost" in obj) || typeof objRecord.asLocalhost === "boolean") &&
    (!("enabled" in obj) || typeof objRecord.enabled === "boolean")
  );
}

// Type guard for DefaultEventHandlerStrategy
function isDefaultEventHandlerStrategy(
  obj: unknown,
  log: Logger,
): obj is DefaultEventHandlerStrategy {
  const valid =
    obj !== null &&
    typeof obj === "string" &&
    (obj === DefaultEventHandlerStrategy.MspidScopeAllfortx ||
      obj === DefaultEventHandlerStrategy.MspidScopeAnyfortx ||
      obj === DefaultEventHandlerStrategy.NetworkScopeAllfortx ||
      obj === DefaultEventHandlerStrategy.NetworkScopeAnyfortx);
  if (!valid) {
    log.error("Invalid DefaultEventHandlerStrategy:", obj);
  }
  return valid;
}

// Type guard for GatewayEventHandlerOptions
function isGatewayEventHandlerOptions(
  obj: unknown,
  log: Logger,
): obj is GatewayEventHandlerOptions {
  const objRecord = obj as Record<string, unknown>;
  if (typeof obj !== "object" || obj === null) {
    log.error("GatewayEventHandlerOptions is not an object:", obj);
    return false;
  }
  if (
    !("strategy" in obj) ||
    !isDefaultEventHandlerStrategy(objRecord.strategy, log)
  ) {
    log.error(
      "GatewayEventHandlerOptions missing or invalid 'strategy':",
      objRecord.strategy,
    );
    return false;
  }
  if ("commitTimeout" in obj && typeof objRecord.commitTimeout !== "number") {
    log.error(
      "GatewayEventHandlerOptions invalid 'commitTimeout':",
      objRecord.commitTimeout,
    );
    return false;
  }
  if ("endorseTimeout" in obj && typeof objRecord.endorseTimeout !== "number") {
    log.error(
      "GatewayEventHandlerOptions invalid 'endorseTimeout':",
      objRecord.endorseTimeout,
    );
    return false;
  }
  return true;
}

// Type guard for IVaultConfig
function isIVaultConfig(obj: unknown, log: Logger): obj is IVaultConfig {
  const objRecord = obj as Record<string, unknown>;
  if (typeof obj !== "object" || obj === null) {
    log.error("IVaultConfig is not an object:", obj);
    return false;
  }
  if ("endpoint" in obj && typeof objRecord.endpoint !== "string") {
    log.error("IVaultConfig invalid 'endpoint':", objRecord.endpoint);
    return false;
  }
  if (
    "transitEngineMountPath" in obj &&
    typeof objRecord.transitEngineMountPath !== "string"
  ) {
    log.error(
      "IVaultConfig invalid 'transitEngineMountPath':",
      objRecord.transitEngineMountPath,
    );
    return false;
  }
  return true;
}

// Type guard for IWebSocketConfig
function isIWebSocketConfig(
  obj: unknown,
  log: Logger,
): obj is IWebSocketConfig {
  const objRecord = obj as Record<string, unknown>;
  if (typeof obj !== "object" || obj === null) {
    log.error("IWebSocketConfig is not an object:", obj);
    return false;
  }
  if ("endpoint" in obj && typeof objRecord.endpoint !== "string") {
    log.error("IWebSocketConfig invalid 'endpoint':", objRecord.endpoint);
    return false;
  }
  if ("pathPrefix" in obj && typeof objRecord.pathPrefix !== "string") {
    log.error("IWebSocketConfig invalid 'pathPrefix':", objRecord.pathPrefix);
    return false;
  }
  if ("strictSSL" in obj && typeof objRecord.strictSSL !== "boolean") {
    log.error("IWebSocketConfig invalid 'strictSSL':", objRecord.strictSSL);
    return false;
  }
  return true;
}

// Type guard for SignPayloadCallback
function isSignPayloadCallback(
  obj: unknown,
  log: Logger,
): obj is SignPayloadCallback {
  const valid =
    typeof obj === "function" &&
    obj.length === 2 &&
    // Check if the function returns a promise
    (obj as (...args: unknown[]) => unknown)(Buffer.alloc(0), {}) instanceof
      Promise;
  if (!valid) {
    log.error("Invalid SignPayloadCallback:", obj);
  }
  return valid;
}

// Type guard for FabricOptionsJSON
export function isFabricOptionsJSON(
  obj: unknown,
  log: Logger,
): obj is FabricOptionsJSON {
  if (typeof obj !== "object" || obj === null) {
    log.error("FabricOptionsJSON is not an object:", obj);
    return false;
  }
  const objRecord = obj as Record<string, unknown>;
  if (
    "dockerNetworkName" in obj &&
    typeof objRecord.dockerNetworkName !== "string"
  ) {
    log.error(
      "FabricOptionsJSON invalid 'dockerNetworkName':",
      objRecord.dockerNetworkName,
    );
    return false;
  }
  if (
    "discoveryOptions" in obj &&
    !isGatewayDiscoveryOptions(objRecord.discoveryOptions)
  ) {
    log.error(
      "FabricOptionsJSON invalid 'discoveryOptions':",
      objRecord.discoveryOptions,
    );
    return false;
  }
  if (
    "eventHandlerOptions" in obj &&
    !isGatewayEventHandlerOptions(objRecord.eventHandlerOptions, log)
  ) {
    log.error(
      "FabricOptionsJSON invalid 'eventHandlerOptions':",
      objRecord.eventHandlerOptions,
    );
    return false;
  }
  if (
    "supportedIdentity" in obj &&
    !isFabricSigningCredentialType(objRecord.supportedIdentity, log)
  ) {
    log.error(
      "FabricOptionsJSON invalid 'supportedIdentity':",
      objRecord.supportedIdentity,
    );
    return false;
  }
  if ("vaultConfig" in obj && !isIVaultConfig(objRecord.vaultConfig, log)) {
    log.error(
      "FabricOptionsJSON invalid 'vaultConfig':",
      objRecord.vaultConfig,
    );
    return false;
  }
  if (
    "webSocketConfig" in obj &&
    !isIWebSocketConfig(objRecord.webSocketConfig, log)
  ) {
    log.error(
      "FabricOptionsJSON invalid 'webSocketConfig':",
      objRecord.webSocketConfig,
    );
    return false;
  }
  if (
    "signCallback" in obj &&
    !isSignPayloadCallback(objRecord.signCallback, log)
  ) {
    log.error(
      "FabricOptionsJSON invalid 'signCallback':",
      objRecord.signCallback,
    );
    return false;
  }
  return true;
}

// Function to create IPluginLedgerConnectorFabricOptions from FabricOptionsJSON
export function createFabricOptions(
  options: Partial<FabricOptionsJSON>,
): Partial<IPluginLedgerConnectorFabricOptions> {
  if (!options) {
    throw new TypeError(
      "Invalid options in FabricConfig: " + JSON.stringify(options),
    );
  }

  const fabricOptions: Partial<IPluginLedgerConnectorFabricOptions> = {
    instanceId: options.instanceId,
    connectionProfile: options.connectionProfile,
    discoveryOptions: options.discoveryOptions,
    eventHandlerOptions: options.eventHandlerOptions,
    supportedIdentity: options.supportedIdentity,
    vaultConfig: options.vaultConfig,
    webSocketConfig: options.webSocketConfig,
    signCallback: options.signCallback,
    dockerNetworkName: options.dockerNetworkName,
  };

  return fabricOptions;
}
