import { readFileSync } from "node:fs";
import path from "node:path";
import type { AdapterLayerConfiguration } from "../../../../main/typescript/adapters/api3-adapter-types";

/**
 * Loads an AdapterLayerConfiguration fixture stored under the local fixtures directory.
 */
export function loadAdapterConfigFixture(
  fixtureName: string,
): AdapterLayerConfiguration {
  const filePath = path.resolve(__dirname, "fixtures", fixtureName);
  const serialized = readFileSync(filePath, { encoding: "utf-8" });
  return JSON.parse(serialized) as AdapterLayerConfiguration;
}
