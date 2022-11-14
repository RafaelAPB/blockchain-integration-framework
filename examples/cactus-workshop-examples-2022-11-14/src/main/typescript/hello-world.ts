// WARNING: This code IS NOT production-ready nor secure! Namely, cross-site scripting is possible if user input is not sanitized.
import { ApiServer, ConfigService } from "@hyperledger/cactus-cmd-api-server";
import { Logger, LoggerProvider } from "@hyperledger/cactus-common";
import {
  PluginImportAction,
  PluginImportType,
} from "@hyperledger/cactus-core-api";
import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";

const log: Logger = LoggerProvider.getOrCreate({
  label: "cacti-node-test-app",
  level: "info",
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const PORT = 8000;

const main = async () => {
  // Handling GET / Request
  app.get("/", (req: Request, res: Response) => {
    log.info("Cacti: Hello World");
    res.send("Welcome to the Hello World server!");
  });

  // Server port setup
  app.listen(PORT, () => {
    log.info(`Application running on port ${PORT}`);
    console.log(
      "The application is listening " + "on port http://localhost:" + PORT,
    );
  });

  //Configuring APIServer
  const configService = new ConfigService();
  const apiServerOptions: any = await configService.newExampleConfig();
  apiServerOptions.configFile = "";
  apiServerOptions.authorizationProtocol = "NONE";
  apiServerOptions.apiPort = 3001;
  apiServerOptions.cockpitPort = 3100;
  apiServerOptions.grpcPort = 5000;
  apiServerOptions.apiTlsEnabled = true; //Disable TLS (or provide TLS certs for secure HTTP if you are deploying to production)
  apiServerOptions.plugins = [
    //Hyperledger cacti add plugin keychain-aws-sm
    {
      packageName: "@hyperledger/cactus-plugin-keychain-memory",
      type: PluginImportType.Remote,
      action: PluginImportAction.Install,
      options: {
        instanceId: "keychain",
        keychainId: "1",
      },
    },
  ];
  const config = await configService.newExampleConfigConvict(apiServerOptions);

  //Creating Cacti APIServer
  const apiServer = new ApiServer({
    config: config.getProperties(),
  });

  //Starting the Cacti APIServer
  apiServer.start();
};

const client = async () => {
  //Creating keychain memory client
  const apiClient = new PluginKeychainMemory({
    instanceId: "keychain",
    keychainId: "1",
    logLevel: "info",
  });

  //Setting a key value pair
  app.post("/set-kcm", async (req: Request, res: Response) => {
    const key = req.body.key;
    const value = req.body.value;
    try {
      // TODO Security: Sanitize user input
      await apiClient.set(key, value);
      log.info("Key value pair set; Key: " + key + " Value: " + value);
      res.status(201).end();
    } catch (err: any) {
      res.status(404).send("error setting key");
    }
  });

  //Getting a key value pair
  app.get("/get-kcm/:key", async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      // TODO Security: Sanitize user input
      const response = await apiClient.get(key);
      log.info("Got key-value pair: (" + key + ", " + response + ")");
      res.end(response);
    } catch (err: any) {
      res.status(404).send("error getting key");
    }
  });

  //Deleting a key value pair
  app.post("/delete-kcm/:key", async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      // TODO Security: Sanitize user input
      await apiClient.delete(key);
      log.info("Deleted key: " + key);
      res.status(200).end();
    } catch (err: unknown) {
      res.status(404).send("error deleting key");
    }
  });

  //Checking if a specific key exists
  app.get("/has-key/:key", async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const response = await apiClient.has(key);
      log.info("Key exists? " + response);
      res.status(200).send(response);
    } catch (err: unknown) {
      res.status(404).send("error checking existence of key");
    }
  });
};

export async function launchApp(): Promise<void> {
  try {
    await main();
    await client();
    log.info(`Cacti Keychain example ran OK `);
  } catch (ex) {
    log.error(`Cacti Keychain example crashed: `, ex);
    process.exit(1);
  }
}

if (require.main === module) {
  launchApp();
}
