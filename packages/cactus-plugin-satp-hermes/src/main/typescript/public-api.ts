export {
  SATPGateway,
  SATPGatewayConfig,
  ISATPSecurityOptions,
} from "./plugin-satp-hermes-gateway";

export { PluginFactorySATPGateway } from "./factory/plugin-factory-gateway-orchestrator";

// Generated gateway client API (OpenAPI typescript-axios)
// Re-exports request/response models, enums, and API class definitions
// consumed by handlers, endpoints, integration tests, and downstream packages.
export * from "./generated/gateway-client/typescript-axios";

// Selected protobuf-generated symbols required by callers of public-api.
export { ClaimFormat } from "./generated/proto/cacti/satp/v13/common/message_pb";

// Bridge / leaf / cross-chain network configuration types.
export {
  INetworkOptions,
  IBesuNetworkConfig,
  IEthereumNetworkConfig,
  IEthereumLeafOptions,
  IBesuLeafOptions,
  TransactionResponse,
} from "./cross-chain-mechanisms/bridge/bridge-types";

// Default port and identity types reused by tests and consumers.
export {
  DEFAULT_PORT_GATEWAY_CLIENT,
  DEFAULT_PORT_GATEWAY_SERVER,
  DEFAULT_PORT_GATEWAY_OAPI,
} from "./core/constants";
export { GatewayIdentity } from "./core/types";

// Validation helpers / DTOs for bridge configuration consumed by examples and tests.
export {
  TargetOrganization,
  FabricConfigJSON,
} from "./services/validation/config-validating-functions/bridges-config-validating-functions/validate-fabric-config";
