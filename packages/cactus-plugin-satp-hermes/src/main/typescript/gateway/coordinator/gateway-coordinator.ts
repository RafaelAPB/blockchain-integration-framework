import 'reflect-metadata';
import {
  Secp256k1Keys,
  Logger,
  Checks,
  LoggerProvider,
  JsObjectSigner,
  IJsObjectSignerOptions,
  ILoggerOptions,
} from "@hyperledger/cactus-common";
import { v4 as uuidv4 } from "uuid";

import {
  ICactusPlugin,
  IPluginWebService,
  IWebServiceEndpoint,
  Configuration,
} from "@hyperledger/cactus-core-api";

import {
  MinLength,
  MaxLength,
  IsNotEmpty,
  ValidateNested,
  IsDefined,
  IsNotEmptyObject,
  IsObject,
  IsString,
  Contains,
} from "class-validator";
import { Type } from "class-transformer";

import fs from "fs";
import path from "path";
import swaggerUi = require("swagger-ui-express");
import {
  IPluginSatpGatewayConstructorOptions,
  PluginSatpGateway,
} from "../plugin-satp-gateway";
import { Server } from "node:http";
import {
  CurrentDrafts,
  DraftVersions,
  GatewayCoordinatorConfig,
  GatewayIdentity,
  SupportedGatewayImplementations,
} from "./types";
import { pass } from "jest-extended";
import { GatewayConnectionManager } from "./gateway-connection";
import { log } from "console";
export { GatewayCoordinatorConfig };

export class GatewayCoordinator {
  // todo more checks; example port from config is between 3000 and 9000
  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  private readonly logger: Logger;

  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  // todo add decorators that check all fields are defined
  private readonly config: GatewayCoordinatorConfig;

  @IsString()
  @Contains("Gateway")
  public readonly label = "GatewayCoordinator";

  private gatewayConnectionManager: GatewayConnectionManager;

  constructor(public readonly options: GatewayCoordinatorConfig) {
    const fnTag = `${this.label}#constructor()`;
    Checks.truthy(options, `${fnTag} arg options`);
    Checks.truthy(options.keys, `${fnTag} arg options.keys`);
    this.config = GatewayCoordinator.ProcessGatewayCoordinatorConfig(options);

    const level = options.logLevel || "INFO";
    const logOptions: ILoggerOptions = {
      level: level,
      label: this.label,
    };
    this.logger = LoggerProvider.getOrCreate(logOptions);
    this.logger.info("Initializing Gateway Coordinator");

    if (options.enableOpenAPI) {
      this.setupOpenAPI();
    }
    this.logger.info("Gateway Coordinator initialized");
    const seedGateways = this.getGatewaySeeds();
    this.logger.info(
      `Initializing gateway connection manager with ${seedGateways} seed gateways`,
    );
    this.gatewayConnectionManager = new GatewayConnectionManager(seedGateways, {
      logger: this.logger,
    });
  }

  async addGateways(IDs: string[]): Promise<void> {
    const fnTag = `${this.label}#connectToGateway()`;
    this.logger.debug(`Entering ${fnTag}`);
    this.logger.info("Connecting to gateway");
    const gatewaysToAdd: GatewayIdentity[] = [];
    const thisID = this.config.gid!.id;
    const otherIDs = IDs.filter((id) => id !== thisID);

    for (const id of otherIDs) {
      gatewaysToAdd.push(this.resolveGatewayID(id));
    }

    this.gatewayConnectionManager.addGateways(gatewaysToAdd);

    // todo connect to gateway
  }

  // gets an ID, queries a repository, returns an address, port, and proof of identity
  resolveGatewayID(ID: string): GatewayIdentity {
    const fnTag = `${this.label}#resolveGatewayID()`;
    this.logger.debug(`Entering ${fnTag}`);
    this.logger.info(`Resolving gateway with ID: ${ID}`);

    const mockGatewayIdentity: GatewayIdentity[] = [
      {
        id: "1",
        name: "Gateway1",
        version: [
          {
            Core: "1.0",
            Architecture: "1.0",
            Crash: "1.0",
          },
        ],
        supportedChains: [
          SupportedGatewayImplementations.FABRIC,
          SupportedGatewayImplementations.BESU,
        ],
        proofID: "mockProofID1",
        port: 3011,
        address: "http://localhost",
      },
      {
        id: "2",
        name: "Gateway2",
        version: [
          {
            Core: "1.0",
            Architecture: "1.0",
            Crash: "1.0",
          },
        ],
        supportedChains: [
          SupportedGatewayImplementations.FABRIC,
          SupportedGatewayImplementations.BESU,
        ],
        proofID: "mockProofID1",
        port: 3012,
        address: "http://localhost",
      },
    ];
    return mockGatewayIdentity.filter((gateway) => gateway.id === ID)[0];
  }

  // todo load docs for gateway coordinator and expose them in a http server
  setupOpenAPI(): void {
    const fnTag = `${this.label}#setupOpenAPI()`;
    this.logger.debug(`Entering ${fnTag}`);

    this.logger.error("OpenAPI setup not implemented");
    return;
    const specPath = path.join(__dirname, "../../", "/json", "openapi.json");
    this.logger.debug(`Loading OpenAPI specification from ${specPath}`);

    const OpenAPISpec = JSON.parse(fs.readFileSync(specPath).toString());
    this.logger.info(
      `OpenAPI docs and documentation set up at 📖: \n ${this.config.gid?.address}:${this.config.gid?.port}/api-docs`,
    );

    // todo bind to grpc gateway
    //      this._app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(OpenAPISpec));
  }

  getGatewaySeeds(): GatewayIdentity[] {
    const fnTag = `${this.label}#getGatewaySeeds()`;
    this.logger.debug(`Entering ${fnTag}`);

    const mockGatewayIdentity: GatewayIdentity[] = [
      {
        id: "1",
        name: "Gateway1",
        version: [
          {
            Core: "1.0",
            Architecture: "1.0",
            Crash: "1.0",
          },
        ],
        supportedChains: [
          SupportedGatewayImplementations.FABRIC,
          SupportedGatewayImplementations.BESU,
        ],
        proofID: "mockProofID1",
        port: 3011,
        address: "http://localhost",
      },
      {
        id: "2",
        name: "Gateway2",
        version: [
          {
            Core: "1.0",
            Architecture: "1.0",
            Crash: "1.0",
          },
        ],
        supportedChains: [
          SupportedGatewayImplementations.FABRIC,
          SupportedGatewayImplementations.BESU,
        ],
        proofID: "mockProofID1",
        port: 3012,
        address: "http://localhost",
      },
    ];
    return mockGatewayIdentity;
  }

  static ProcessGatewayCoordinatorConfig(
    pluginOptions: GatewayCoordinatorConfig,
  ): GatewayCoordinatorConfig {
    if (!pluginOptions.keys) {
      pluginOptions.keys = Secp256k1Keys.generateKeyPairsBuffer();
    }
    if (!pluginOptions.gid) {
      const id = uuidv4();
      pluginOptions.gid = {
        id: id,
        name: id,
        version: [
          {
            Core: "1.0",
            Architecture: "1.0",
            Crash: "1.0",
          },
        ],
        supportedChains: [
          SupportedGatewayImplementations.FABRIC,
          SupportedGatewayImplementations.BESU,
        ],
        proofID: "mockProofID1",
        port: 3000,
        address: "http://localhost",
      };
    }

    if (!pluginOptions.logLevel) {
      pluginOptions.logLevel = "DEBUG";
    }

    if (!pluginOptions.environment) {
      pluginOptions.environment = "development";
    }

    if (!pluginOptions.enableOpenAPI) {
      pluginOptions.enableOpenAPI = true;
    }

    if (!pluginOptions.validationOptions) {
      // do nothing
    }

    return pluginOptions;
  }

  // generate getter for identity
  getIdentity(): GatewayIdentity {
    return this.config.gid!;
  }
}
