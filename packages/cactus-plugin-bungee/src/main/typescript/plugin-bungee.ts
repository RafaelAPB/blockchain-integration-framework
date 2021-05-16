/* eslint-disable prefer-const */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-empty-function */
import { Server } from "http";

import { Server as SecureServer } from "https";

import { v4 as uuidv4 } from "uuid";

import { PluginRegistry } from "@hyperledger/cactus-core";

import {
  Configuration,
  ICactusPluginOptions,
} from "@hyperledger/cactus-core-api";

import {
  IJsObjectSignerOptions,
  JsObjectSigner,
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";

import { ICactusApiServerOptions } from "@hyperledger/cactus-cmd-api-server";

import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";

import {
  DefaultApi as FabricApi,
  RunTransactionRequest as FabricRunTransactionRequest,
  FabricSigningCredential,
  FabricContractInvocationType,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";
import { Utils } from "./utils";
import { Transaction } from "./viewCreation/transaction";
import { Proof } from "./viewCreation/proof";
import { State } from "./viewCreation/state";
import { View } from "./viewCreation/view";
import { Snapshot } from "./viewCreation/snapshot";
import path from "path";

export interface IPluginBUNGEEOptions extends ICactusPluginOptions{
  instanceId: string;
  participant: string;

  fabricPath?: string;
  fabricSigningCredential?: FabricSigningCredential;
  fabricChannelName?: string;
  fabricContractName?: string;
  fabricAssetID?: string;
  fabricAssetSize?: string;
  fabricConfig?: Configuration;
  fabricApi?: FabricApi;

  logLevel?: LogLevelDesc;
  keychainId?: string;
  keychain?: PluginKeychainMemory;
  apiServerOptions?: ICactusApiServerOptions;
  httpApi?: Server | SecureServer;
  disableSignalHandlers?: true;
}

export class PluginBUNGEE {
  private bungeeSigner: JsObjectSigner;
  private privKeyBungee: string;
  private pubKeyBungee: string;
  private tI: string;
  private tF: string;

  private participant;

  private ledgerAssetsKey: string[];
  private ledgerStates: Map<string, State>; //Key, state
  private states: State[];
  
  public fabricApi?: FabricApi;
  public fabricSigningCredential?: FabricSigningCredential;
  public fabricChannelName?: string;
  public fabricContractName?: string;
  public fabricAssetID?: string;
  public fabricAssetSize?: string;
  
  private readonly instanceId: string;
  private readonly className: string;
  private level: LogLevelDesc;
  private logger: Logger;
  public pluginRegistry: PluginRegistry;

  constructor(public readonly options: IPluginBUNGEEOptions) {
    this.className = "pluginBUNGEE";
    this.level = options.logLevel || "INFO";
    const label = this.getClassName();
    const level = this.level;
    this.logger = LoggerProvider.getOrCreate({ label, level });
    
    const keysRelPath ="../keys/";
    const pubKeyPath = path.join(__dirname, keysRelPath, "./bungee_pub.pem");
    const privKeyPath = path.join(__dirname, keysRelPath, "./bungee_priv.pem");
    this.pubKeyBungee = Utils.readKeyFromFile(pubKeyPath);
    this.privKeyBungee = Utils.readKeyFromFile(privKeyPath);
      
    const bungeeSignerOptions: IJsObjectSignerOptions = {
      privateKey: this.privKeyBungee,
      logLevel: "debug",
    };
    this.bungeeSigner = new JsObjectSigner(bungeeSignerOptions);

    this.instanceId = uuidv4();
    this.participant = options.participant;
        
    this.ledgerAssetsKey = [];
    this.ledgerStates = new Map<string, State>();
    this.states = [];
    this.tI = "";
    this.tF = "";

    this.pluginRegistry = new PluginRegistry();
    this.fabricApi = options.fabricApi;

    if (options.fabricPath != undefined) this.defineFabricConnection(options);
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public getPackageName(): string {
    return `@hyperledger/cactus-plugin-bungee`;
  }

  public getClassName(): string {
    return this.className;
  }

  public async onPluginInit(): Promise<unknown> {
    return;
  }

  private defineFabricConnection(options: IPluginBUNGEEOptions): void {
    
    this.logger.info(`OPTIONS:: ${options}`);
    const fnTag = `${this.className}#defineFabricConnection()`;

    const config = new Configuration({ basePath: options.fabricPath });
    const apiClient = new FabricApi(config);
    this.fabricApi = apiClient;
    const notEnoughFabricParams: boolean =
      options.fabricSigningCredential == undefined ||
      options.fabricChannelName == undefined ||
      options.fabricContractName == undefined ||
      options.fabricAssetID == undefined;
    if (notEnoughFabricParams) {
      throw new Error(
        `${fnTag}, fabric params missing should have: signing credentials, contract name, channel name, asset ID`,
      );
    }
    this.fabricSigningCredential = options.fabricSigningCredential;
    this.fabricChannelName = options.fabricChannelName;
    this.fabricContractName = options.fabricContractName;
    this.fabricAssetID = options.fabricAssetID;
    this.fabricAssetSize = options.fabricAssetSize
      ? options.fabricAssetSize
      : "1";
  }

  
  /**
   * 
   * @abstract Create ledger state. Get all keys, iterate every key and get the respective transactions. For each transaction get the receipt
   * */
  public async generateLedgerStates(): Promise<string> {
    this.logger.info(`Generating ledger snapshot`);
    
    const assetsKey = await this.getAllAssetsKey();
    this.ledgerAssetsKey = assetsKey.split(",");
    
    //For each key in ledgerAssetsKey
    for(const assetKey of this.ledgerAssetsKey){
      let assetValues: string[] = [];
      let txWithTimeS: Transaction[] = [];

      this.logger.info(assetKey);
      const txs = await this.getAllTxByKey(assetKey);

      //For each tx get receipt
      for(const tx of txs){
        const endorsements: Proof[] = [];
        const receipt = JSON.parse(await this.fabricGetTxReceiptByTxIDV1(tx.getId()));

        // Checks if tx was made by participant
        if(receipt.transactionCreator.mspid != this.participant){
          continue;
        }
        
        assetValues.push(JSON.parse(receipt.rwsetWriteData).Value.toString());

        //Save endorsements of tx
        for (const endorsement of  receipt.transactionEndorsement) {
          const signature64 = Buffer.from(endorsement.signature).toString('base64');
          endorsements.push(new Proof(endorsement.mspid, endorsement.endorserID, signature64));
        }
        tx.defineTxProofs(endorsements);
        txWithTimeS.push(tx);
      }
      
      const state = new State(assetKey, assetValues, txWithTimeS);
      this.ledgerStates.set(assetKey, state);
      this.states.push(state);
    }
    
    this.ledgerStates.forEach((state: State, keyId: string) => {
      console.log(keyId, state);
      const assetState = this.ledgerStates.get(keyId);
      if(assetState != undefined) {
        this.logger.info(assetState);
        this.logger.info(JSON.parse(assetState.getStateJson()));
        
      }
    }); 

    // TESTS ONLY -> next receive ti tf
    const car2 = this.ledgerStates.get("CAR2");

    if (car2 != undefined) {
      this.tI = car2.getTimeForTxN(2);
      this.tF = car2.getTimeForTxN(1);
    }

    return "";   
  }


  /**
   * 
   * @abstract Returns Snapshot
   * */
  public generateSnapshot(): Snapshot {
    const snapShotId = uuidv4();
    const snapshot = new Snapshot(snapShotId, this.participant, this.states);
    return snapshot;
  }


  /**
   * 
   * @abstract Returns view. Generate final view with signature
   * 
   * @param snapshot - Ledger Snapshot
   * */
  public generateView(snapshot: Snapshot): string {
    const crypto = require('crypto');

    this.logger.warn(this.pubKeyBungee);
    this.logger.warn(this.privKeyBungee);
    const view = new View(this.tI, this.tF, snapshot);
    
    const signer = crypto.createSign('SHA256');
    signer.write(JSON.stringify(view));
    signer.end();

    this.logger.warn(view.getViewStr());

    const signature = signer.sign(this.privKeyBungee, 'base64');

    this.saveToFile(__dirname + "/../../view/signed.json", JSON.stringify(view));

    const signedView = {View: view, Signature: signature};

    this.saveToFile(__dirname + "/../../view/viewFile.json", JSON.stringify(signedView, null, 2));

    return JSON.stringify(signedView);
  }


  /**
   * 
   * @abstract Returns transaction receipt.
   * 
   * @param transactionId - Transaction id to return the receipt
   * */
  async fabricGetTxReceiptByTxIDV1(transactionId: string): Promise<string> {
    const receiptLockRes = await this.fabricApi?.getTransactionReceiptByTxIDV1(
      {
        signingCredential: this.fabricSigningCredential,
        channelName: this.fabricChannelName,
        contractName: "qscc",
        invocationType: FabricContractInvocationType.Call,
        methodName: "GetBlockByTxID",
        params: [this.fabricChannelName, transactionId],
      } as FabricRunTransactionRequest,
    );

    return JSON.stringify(receiptLockRes?.data);
  }


  /**
   * 
   * @abstract Returns all assets key found in the world state.
   * */
  async getAllAssetsKey(): Promise<string> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "GetAllAssetsKey",
      invocationType: FabricContractInvocationType.Call,
      params: [],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      return response.data.functionOutput;
    }

    return "response undefined";
  }


  /**
   * 
   * @abstract Returns an array of all transactions for a specific key.
   *
   * @param key - Key used to get correspondent transactions
   * */
  async getAllTxByKey(key: string): Promise<Transaction[]> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "GetAllTxByKey",
      invocationType: FabricContractInvocationType.Call,
      params: [key],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      
      return Utils.txsStringToTxs(response.data.functionOutput);
    }

    return [];
  }


  /**
   * 
   * @abstract Returns all the transactions for a specific key in string format.
   *
   * @param key - Key (id) used to get correspondent transactions
   * */
  async getAllTxByKeyString(key: string): Promise<string> {

    const response = await this.fabricApi?.runTransactionV1({
      signingCredential: this.fabricSigningCredential,
      channelName: this.fabricChannelName,
      contractName: this.fabricContractName,
      methodName: "GetAllTxByKey",
      invocationType: FabricContractInvocationType.Call,
      params: [key],
    } as FabricRunTransactionRequest);

    if (response != undefined){
      
      return response.data.functionOutput;
    }

    return "";
  }
  

  /**
   * 
   * @abstract Save view in json file.
   *
   * @param fileName - File name or path + file name
   * @param data - View in a string format to write inside the json file
   * */
  public saveToFile(fileName: string, data: string): void {
    const fs = require("fs");
    
    fs.writeFileSync(fileName, data, function (err: boolean) {
      if (err) {
        return console.log("error");
      }
    });
  }
}

