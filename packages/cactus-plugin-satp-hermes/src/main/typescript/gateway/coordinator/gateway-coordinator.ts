import {
  Secp256k1Keys,
  Logger,
  Checks,
  LoggerProvider,
  JsObjectSigner,
  IJsObjectSignerOptions,
} from "@hyperledger/cactus-common";

import {
  ICactusPlugin,
  IPluginWebService,
  IWebServiceEndpoint,
  Configuration,
} from "@hyperledger/cactus-core-api";

import express = require("express");
import { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import session from "express-session";
declare module "express-session" {
  interface SessionData {
    dendrethRoots: string[];
  }
}
import fs from "fs";
import path from "path";
import swaggerUi = require("swagger-ui-express");

interface GatewayCoordinatorConfig {
  logLevel?: string;
  keys: Secp256k1Keys;
  environment: "development" | "production";
}

export class GatewayCoordinator {
    private readonly log: Logger;
    private readonly config: GatewayCoordinatorConfig;

    constructor(public readonly options: GatewayCoordinatorConfig) {
        const fnTag = "GatewayCoordinator#constructor()";
        Checks.truthy(options, `${fnTag} arg options`);
        Checks.truthy(options.keys, `${fnTag} arg options.keys`);
        this.config = options;
        const level = this.config.logLevel || "INFO";
        const label = "gateway-coordinator";
        this.log = LoggerProvider.getOrCreate({ level, label });
    }





}
