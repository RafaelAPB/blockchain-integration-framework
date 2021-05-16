/*
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";
import { Asset } from "./asset";

@Info({
  title: "AssetTransfer",
  description: "Smart contract for trading assets",
})
export class AssetTransferContract extends Contract {
  @Transaction()
  public async InitLedger(ctx: Context): Promise<void> {
    const assets: Asset[] = [
      {
        ID: "asset87",
        Color: "blue",
        Size: 5,
        Owner: "Tom",
        AppraisedValue: 300,
        CreationTs: Date(),
      },
      {
        ID: "asset2",
        Color: "red",
        Size: 5,
        Owner: "Brad",
        AppraisedValue: 400,
        CreationTs: Date(),
      },
      {
        ID: "asset3",
        Color: "green",
        Size: 10,
        Owner: "Jin Soo",
        AppraisedValue: 500,
        CreationTs: Date(),
      },
      {
        ID: "asset4",
        Color: "yellow",
        Size: 10,
        Owner: "Max",
        AppraisedValue: 600,
        CreationTs: Date(),
      },
      {
        ID: "asset5",
        Color: "black",
        Size: 15,
        Owner: "Adriana",
        AppraisedValue: 700,
        CreationTs: Date(),
      },
      {
        ID: "asset6",
        Color: "white",
        Size: 15,
        Owner: "Michel",
        AppraisedValue: 800,
        CreationTs: Date(),
      },
    ];

    // for (const asset of assets) {
    //   asset.docType = "asset";
    //   await ctx.stub.putState(asset.ID, Buffer.from(JSON.stringify(asset)));
    //   console.info(`Asset ${asset.ID} initialized`);
    // }
    for (let i = 0; i < 6; i++) {
      const asset = assets[i];
      asset.docType = "asset";
      await ctx.stub.putState(asset.ID, Buffer.from(JSON.stringify(asset)));
      console.info(`Asset ${asset.ID} initialized`);
    }
  }

  // CreateAsset issues a new asset to the world state with given details.
  @Transaction()
  public async CreateAsset(
    ctx: Context,
    id: string,
    color: string,
    size: number,
    owner: string,
    appraisedValue: number,
    creationTs: Date,
  ): Promise<void> {
    const asset = {
      ID: id,
      Color: color,
      Size: size,
      Owner: owner,
      AppraisedValue: appraisedValue,
      CreationTs: creationTs,
    };
    await ctx.stub.putState(id, Buffer.from(JSON.stringify(asset)));
  }

  // ReadAsset returns the asset stored in the world state with given id.
  @Transaction(false)
  public async ReadAsset(ctx: Context, id: string): Promise<string> {
    const assetJSON = await ctx.stub.getState(id); // get the asset from chaincode state
    if (!assetJSON || assetJSON.length === 0) {
      throw new Error(`The asset ${id} does not exist`);
    }
    return assetJSON.toString();
  }

  // GetAllAssets returns all assets found in the world state.
  @Transaction(false)
  @Returns("string")
  public async GetAllAssets(ctx: Context): Promise<string> {
    const allResults = [];
    // range query with empty string for startKey and endKey does an open-ended query of all assets in the chaincode namespace.
    const iterator = await ctx.stub.getStateByRange("", "");
    let result = await iterator.next();
    while (!result.done) {
      const strValue = Buffer.from(result.value.value.toString()).toString(
        "utf8",
      );
      let record;
      try {
        record = JSON.parse(strValue);
      } catch (err) {
        console.log(err);
        record = strValue;
      }
      allResults.push({ Key: result.value.key, Record: record });
      result = await iterator.next();
    }
    return JSON.stringify(allResults);
  }
}
