import "jest-extended";

import { TemporalTestServer } from "../../../../../main/typescript/public-api";
import { LogLevelDesc } from "@hyperledger/cactus-common";

const logLevel: LogLevelDesc = "INFO";

describe("TemporalTestServer", () => {
  it("CLASS_NAME is set correctly", () => {
    expect(TemporalTestServer.CLASS_NAME).toBe("TemporalTestServer");
  });

  it("constructor does not throw with default options", () => {
    expect(() => new TemporalTestServer()).not.toThrow();
  });

  it("constructor does not throw with explicit options", () => {
    expect(() => new TemporalTestServer({ logLevel })).not.toThrow();
  });

  it("getWorkflowClient() throws before start()", () => {
    const server = new TemporalTestServer({ logLevel });
    expect(() => server.getWorkflowClient()).toThrow();
  });

  it("getNativeConnection() throws before start()", () => {
    const server = new TemporalTestServer({ logLevel });
    expect(() => server.getNativeConnection()).toThrow();
  });

  it("sleep() throws before start()", async () => {
    const server = new TemporalTestServer({ logLevel });
    await expect(server.sleep(1000)).rejects.toThrow();
  });

  describe("lifecycle", () => {
    const server = new TemporalTestServer({ logLevel });

    beforeAll(async () => {
      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("getWorkflowClient() returns a client after start()", () => {
      const client = server.getWorkflowClient();
      expect(client).toBeTruthy();
    });

    it("getNativeConnection() returns a connection after start()", () => {
      const conn = server.getNativeConnection();
      expect(conn).toBeTruthy();
    });

    it("sleep() advances the fake clock without wall-clock waiting", async () => {
      const before = Date.now();
      await server.sleep(60_000);
      const elapsed = Date.now() - before;
      // Should complete near-instantly in time-skipping mode
      expect(elapsed).toBeLessThan(5_000);
    });
  });

  describe("start/stop cycle", () => {
    it("stop() clears state so getWorkflowClient() throws afterwards", async () => {
      const server2 = new TemporalTestServer({ logLevel });
      await server2.start();
      expect(() => server2.getWorkflowClient()).not.toThrow();
      await server2.stop();
      expect(() => server2.getWorkflowClient()).toThrow();
    });

    it("double start() tears down the old env before creating a new one", async () => {
      const server3 = new TemporalTestServer({ logLevel });
      await server3.start();
      const firstClient = server3.getWorkflowClient();
      await server3.start(); // second start — should not leak
      const secondClient = server3.getWorkflowClient();
      expect(secondClient).toBeTruthy();
      expect(secondClient).not.toBe(firstClient);
      await server3.stop();
    });
  });
});
