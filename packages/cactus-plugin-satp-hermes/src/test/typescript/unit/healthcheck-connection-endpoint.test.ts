import test, { Test } from "tape";
import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { AddressInfo } from "net";
import { 
  IListenOptions,
  Servers,
  LoggerProvider,
} from "@hyperledger/cactus-common";
import {
  HealthCheckConnectionResponse,
} from "../../../main/typescript/generated/gateway-client/typescript-axios";
import { HealthCheckConnectionEndpointV1 } from "../../../main/typescript/api1/admin/healthcheck-connection-endpoint";
import { TestGateway } from "../test-gateway";

const logLevel = "INFO";
const testCase = "Tests healthcheck connection endpoint";

test(testCase, async (t: Test) => {
  const { dispatcher, localRepository } = await TestGateway.createTestBLODispatcher({
    logLevel,
  });

  // Setup express server
  const expressApp = express();
  expressApp.use(bodyParser.json({ limit: "250mb" }));
  const server = http.createServer(expressApp);
  const listenOptions: IListenOptions = {
    hostname: "localhost",
    port: 0,
    server,
  };
  const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
  const { address, port } = addressInfo;
  const apiHost = `http://${address}:${port}`;

  const endpoint = new HealthCheckConnectionEndpointV1({
    logLevel,
    dispatcher,
  });

  await endpoint.registerExpress(expressApp);

  // Test endpoint is reachable
  t.test("Healthcheck endpoint is reachable", async (t2: Test) => {
    const response = await fetch(`${apiHost}${endpoint.getPath()}?` + 
      `dltProtocol=fabric&` +
      `contractAddress=test-contract&` +
      `contractFunction=satp-hermes:verifyAssetExistence&` +
      `methodArgs=test-asset`
    );
    const body = await response.json() as HealthCheckConnectionResponse;
    t2.equal(response.status, 200, "Response status code is 200 OK");
    t2.ok(body.success, "Health check reports success");
    t2.end();
  });

  // Cleanup
  await TestGateway.cleanup(localRepository);
  await server.close();
  t.end();
}); 