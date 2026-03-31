import { TestWorkflowEnvironment } from "@temporalio/testing";

import {
  Logger,
  Checks,
  LogLevelDesc,
  LoggerProvider,
} from "@hyperledger/cactus-common";

type WorkflowClient = TestWorkflowEnvironment["client"];
type NativeConnection = TestWorkflowEnvironment["nativeConnection"];

export interface ITemporalTestServerOptions {
  /** Log level for test output — defaults to "INFO" */
  readonly logLevel?: LogLevelDesc;
}

/**
 * Thin wrapper over `@temporalio/testing`'s `TestWorkflowEnvironment` that
 * follows the same start/stop pattern as other test servers in
 * cactus-test-tooling (e.g. `VaultTestServer`, `WsTestServer`).
 *
 * The embedded Temporal test server:
 * - runs in-process — no Docker dependency
 * - supports `sleep()` for fake-time advancement (time-skipping mode)
 * - allows signal injection and workflow queries without external connectivity
 *
 * Requires `@temporalio/testing` to be installed as a peer/devDependency in
 * the consuming package.
 *
 * @example
 * ```typescript
 * const server = new TemporalTestServer({ logLevel: "DEBUG" });
 * await server.start();
 * const client = server.getWorkflowClient();
 * // ... run tests ...
 * await server.stop();
 * ```
 */
export class TemporalTestServer {
  public static readonly CLASS_NAME = "TemporalTestServer";

  private readonly log: Logger;
  private env: TestWorkflowEnvironment | undefined;

  public get className(): string {
    return TemporalTestServer.CLASS_NAME;
  }

  constructor(public readonly options: ITemporalTestServerOptions = {}) {
    const level = this.options.logLevel || "INFO";
    const label = this.className;
    this.log = LoggerProvider.getOrCreate({ level, label });

    this.log.info(`Created ${this.className} OK.`);
  }

  /**
   * Starts the embedded Temporal test server in time-skipping mode.
   * If already running, tears down the existing environment first so
   * double-calling `start()` does not leak resources.
   * Call inside Jest `beforeAll`.
   */
  public async start(): Promise<void> {
    const fnTag = `${this.className}#start()`;
    this.log.info(`${fnTag} Starting embedded Temporal test server...`);
    if (this.env) {
      this.log.warn(`${fnTag} Already running — tearing down before restart.`);
      await this.env.teardown();
      this.env = undefined;
    }
    this.env = await TestWorkflowEnvironment.createTimeSkipping();
    this.log.info(`${fnTag} Temporal test server started OK.`);
  }

  /**
   * Returns a pre-configured `WorkflowClient` bound to the embedded server.
   * Use this to start, signal, query, and await workflows in tests.
   */
  public getWorkflowClient(): WorkflowClient {
    const fnTag = `${this.className}#getWorkflowClient()`;
    Checks.truthy(this.env, `${fnTag} env - call start() first`);
    return (this.env as TestWorkflowEnvironment).client;
  }

  /**
   * Returns the `NativeConnection` of the embedded server.
   * Pass this to `Worker.create({ connection })` in test setup so the worker
   * connects to the embedded server rather than a real Temporal cluster.
   */
  public getNativeConnection(): NativeConnection {
    const fnTag = `${this.className}#getNativeConnection()`;
    Checks.truthy(this.env, `${fnTag} env - call start() first`);
    return (this.env as TestWorkflowEnvironment).nativeConnection;
  }

  /**
   * Advances the fake clock by `ms` milliseconds.
   * Triggers `workflow.sleep()` timers without wall-clock waiting, enabling
   * fast timeout and deadline tests.
   */
  public async sleep(ms: number): Promise<void> {
    const fnTag = `${this.className}#sleep()`;
    Checks.truthy(this.env, `${fnTag} env - call start() first`);
    await (this.env as TestWorkflowEnvironment).sleep(ms);
  }

  /**
   * Tears down the embedded server. Call inside Jest `afterAll`.
   */
  public async stop(): Promise<void> {
    const fnTag = `${this.className}#stop()`;
    this.log.info(`${fnTag} Stopping embedded Temporal test server...`);
    await this.env?.teardown();
    this.env = undefined;
    this.log.info(`${fnTag} Temporal test server stopped OK.`);
  }
}
