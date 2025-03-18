import {
  Checks,
  type IAsyncProvider,
  type Logger,
  LoggerProvider,
} from "@hyperledger/cactus-common";
import type {
  IEndpointAuthzOptions,
  IExpressRequestHandler,
  IWebServiceEndpoint,
} from "@hyperledger/cactus-core-api";
import type { Express, Request, Response } from "express";
import type { IRequestOptions } from "../../core/types";
import OAS from "../../../json/openapi-api1-bundled.json";
import {
  handleRestEndpointException,
  registerWebServiceEndpoint,
} from "@hyperledger/cactus-core";
import {
  HealthCheckConnectionRequest,
  HealthCheckConnectionRequestDltProtocolEnum,
  HealthCheckConnectionResponse,
} from "../../generated/gateway-client/typescript-axios";

export class HealthCheckConnectionEndpointV1 implements IWebServiceEndpoint {
  public static readonly CLASS_NAME = "HealthCheckConnectionEndpointV1";

  private readonly log: Logger;

  public get className(): string {
    return HealthCheckConnectionEndpointV1.CLASS_NAME;
  }

  constructor(public readonly options: IRequestOptions) {
    const fnTag = `${this.className}#constructor()`;
    Checks.truthy(options, `${fnTag} arg options`);
    Checks.truthy(options.dispatcher, `${fnTag} arg options.connector`);

    const level = this.options.logLevel || "INFO";
    const label = this.className;
    this.log = LoggerProvider.getOrCreate({ level, label });
  }

  public get oasPath(): (typeof OAS.paths)["/api/v1/@hyperledger/cactus-plugin-satp-hermes/healthcheck-connection"] {
    return OAS.paths[
      "/api/v1/@hyperledger/cactus-plugin-satp-hermes/healthcheck-connection"
    ];
  }

  public async registerExpress(
    expressApp: Express,
  ): Promise<IWebServiceEndpoint> {
    await registerWebServiceEndpoint(expressApp, this);
    return this;
  }

  public getPath(): string {
    return this.oasPath.get["x-hyperledger-cacti"].http.path;
  }

  public getVerbLowerCase(): string {
    return this.oasPath.get["x-hyperledger-cacti"].http.verbLowerCase;
  }

  public getOperationId(): string {
    return this.oasPath.get.operationId;
  }

  public getExpressRequestHandler(): IExpressRequestHandler {
    return this.handleRequest.bind(this);
  }

  getAuthorizationOptionsProvider(): IAsyncProvider<IEndpointAuthzOptions> {
    return {
      get: async () => ({
        isProtected: true,
        requiredRoles: [],
      }),
    };
  }

  public async handleRequest(req: Request, res: Response): Promise<void> {
    const fnTag = `${this.className}#handleRequest()`;
    const reqTag = `${this.getVerbLowerCase()} - ${this.getPath()}`;
    this.log.debug(reqTag);

    try {
      // Validate and parse query parameters
      const dltProtocol = req.query.dltProtocol;
      const contractAddress = req.query.contractAddress;
      const contractFunction = req.query.contractFunction;
      const methodArgs = req.query.methodArgs;

      // Type check and validation
      if (
        typeof dltProtocol !== 'string' || 
        typeof contractAddress !== 'string' || 
        typeof contractFunction !== 'string'
      ) {
        res.status(400).json({
          success: false,
          message: "Missing or invalid required parameters",
        } as HealthCheckConnectionResponse);
        return;
      }

      const request: HealthCheckConnectionRequest = {
        dltProtocol: dltProtocol as HealthCheckConnectionRequestDltProtocolEnum,
        contractAddress,
        contractFunction,
        methodArgs: typeof methodArgs === 'string' ? methodArgs : undefined,
      };

      const result = await this.options.dispatcher.healthCheckConnection(request);
      res.json(result);
    } catch (ex) {
      const errorMsg = `${reqTag} ${fnTag} Failed to check connection:`;
      handleRestEndpointException({ errorMsg, log: this.log, error: ex, res });
    }
  }
} 