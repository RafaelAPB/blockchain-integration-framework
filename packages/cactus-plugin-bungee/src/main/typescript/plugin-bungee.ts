/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuidv4 } from "uuid";

import {
  ICactusPluginOptions,
  ICactusPlugin,
  PluginAspect,
} from "@hyperledger/cactus-core-api";

import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
  Secp256k1Keys,
  ISignerKeyPair,
} from "@hyperledger/cactus-common";

import { Identity, MergeParameters, Snapshot, State } from "./bvi-framework";
import { PluginLedgerConnectorFabric } from "@hyperledger/cactus-plugin-ledger-connector-fabric";

import storage from "node-persist";

export interface IPluginBUNGEEOptions extends ICactusPluginOptions {
  logLevel: LogLevelDesc;
  //TODO ledger connector should be IPluginLedgerConnector<generic>
  // so we can expect a bungee plugin tied to a specific ledger

  //should be PluginLedgerConnectorFabric || ...
  ledgerConnector: any;
  participantSet: any[];
  mergingParameters: MergeParameters;
  keys: ISignerKeyPair;
}

// TODO implement web service?
export class PluginBUNGEE implements ICactusPlugin {
  private static readonly CLASS_NAME = "PluginBUNGEE";
  private readonly logger: Logger;
  private level: LogLevelDesc = "INFO";
  private ledgerConnector: any;
  private participantSet: Identity[];
  private mergingParameters: MergeParameters;
  private keys: ISignerKeyPair;
  //https://knexjs.org/
  private storage: any;
  private instanceId: string;
  private snapshots: Snapshot[] = [];
  private configuration: any[];

  public getClassName(): string {
    return PluginBUNGEE.CLASS_NAME;
  }

  constructor(public readonly options: IPluginBUNGEEOptions) {
    //TODO sanitize input
    this.instanceId = uuidv4();
    this.level = options.logLevel;
    const label = this.getClassName();
    const level = this.level;
    this.logger = LoggerProvider.getOrCreate({ label, level });
    this.ledgerConnector = options.ledgerConnector;
    this.participantSet = options.participantSet;
    this.mergingParameters = options.mergingParameters;
    this.keys = Secp256k1Keys.generateKeyPairsBuffer();
    this.configuration = [
      this.instanceId,
      this.level,
      this.participantSet,
      this.mergingParameters,
      this.keys,
    ];
    this.logger.debug("Initialized BUNGEE");
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public getPackageName(): string {
    return `@hyperledger/cactus-plugin-bungee`;
  }

  public getAspect(): PluginAspect {
    return PluginAspect.LEDGER_CONNECTOR;
  }

  public getLedgerConnector(): ICactusPlugin {
    this.logger.info("Ledger connector has been retrieved");
    return this.ledgerConnector;
  }

  async initStorage(id: string): Promise<storage.InitOptions> {
    this.logger.debug("Initializing BUNGEE Storage");
    return storage.init({
      dir: "../storage/" + id,

      stringify: JSON.stringify,

      parse: JSON.parse,

      encoding: "utf8",

      logging: false, // can also be custom logging function

      ttl: undefined, // ttl* [NEW], can be true for 24h default or a number in MILLISECONDS or a valid Javascript Date object

      expiredInterval: 2 * 60 * 1000, // every 2 minutes the process will clean-up the expired cache

      // in some cases, you (or some other service) might add non-valid storage files to your
      // storage dir, i.e. Google Drive, make this true if you'd like to ignore these files and not throw an error
      forgiveParseErrors: false,
    });
  }

  exportConfiguration(): void {
    this.storage.set("configuration", this.configuration);
  }

  constructSnapshot(
    connector: PluginLedgerConnectorFabric,
    participant: Identity,
  ): void {
    //TODO use connector to gather states from transactions; for each participant
    const states: State[] = [];
    const snapshot = new Snapshot(states, participant);
    this.snapshots.push(snapshot);
  }

  async persistSnapshot(snapshot: Snapshot): Promise<void> {
    const id = snapshot.getId();
    await this.storage.setItem(id, snapshot);
  }

  /*

  createView(
    snapshot,
    participant,
    startTimestamp,
    endTimestamp,
  ): BlockchainView {}

  persistView(view: BlockchainView): void {}

  mergeViews(views: BlockchainView[]): BlockchainView {}

  processIntegratedView(integratedView: BlockchainView): BlockchainView {}

  //ICactusPlugin specific stuff

*/
}
