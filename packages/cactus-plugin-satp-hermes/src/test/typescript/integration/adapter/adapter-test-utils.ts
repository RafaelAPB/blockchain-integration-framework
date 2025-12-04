import { readFileSync } from "node:fs";
import path from "node:path";
import type { Api3AdapterConfiguration } from "../../../../main/typescript/adapters/api3-adapter-types";

/**
 * Loads an Api3AdapterConfiguration fixture stored under the local fixtures directory.
 */
export function loadAdapterConfigFixture(
  fixtureName: string,
): Api3AdapterConfiguration {
  const filePath = path.resolve(__dirname, "fixtures", fixtureName);
  const serialized = readFileSync(filePath, { encoding: "utf-8" });
  return JSON.parse(serialized) as Api3AdapterConfiguration;
}
