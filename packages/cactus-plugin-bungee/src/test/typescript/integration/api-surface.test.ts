import test, { Test } from "tape-promise/tape";

import { PluginFactoryBUNGEE } from "../../../main/typescript/public-api";

test("Library can be loaded", (t: Test) => {
  t.ok(PluginFactoryBUNGEE, "PluginFactoryLedgerConnector truthy OK");
  t.end();
});
