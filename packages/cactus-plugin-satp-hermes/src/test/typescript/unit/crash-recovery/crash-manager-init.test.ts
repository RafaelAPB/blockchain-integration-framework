/**
 * Unit tests for CrashManager instantiation with ICrashRecoveryManagerOptions.
 *
 * Uses real objects throughout — no mocks. The full dependency graph:
 *
 *   MonitorService (singleton, enabled:false)
 *   JsObjectSigner  (Secp256k1 test key)
 *   KnexLocalLogRepository  (SQLite in-memory, migrated before each run)
 *   GatewayOrchestrator  (no counterparty gateways → no network I/O)
 *   SATPCrossChainManager  (wraps BridgeManager + OracleManager, no ledger deployed)
 *   CrashManager  (the system under test)
 */
import "jest-extended";
import knex from "knex";
import {
	JsObjectSigner,
	Secp256k1Keys,
	type LogLevelDesc,
} from "@hyperledger/cactus-common";
import {
	CrashManager,
	type ICrashRecoveryManagerOptions,
} from "../../../../main/typescript/services/gateway/crash-manager";
import { GatewayOrchestrator } from "../../../../main/typescript/services/gateway/gateway-orchestrator";
import { SATPCrossChainManager } from "../../../../main/typescript/cross-chain-mechanisms/satp-cc-manager";
import { KnexLocalLogRepository as LocalLogRepository } from "../../../../main/typescript/database/repository/knex-local-log-repository";
import { MonitorService } from "../../../../main/typescript/services/monitoring/monitor";
import { createMigrationSource } from "../../../../main/typescript/database/knex-migration-source";
import { knexLocalInstance } from "../../../../main/typescript/database/knexfile";
import {
	SupportedSigningAlgorithms,
	type GatewayIdentity,
} from "../../../../main/typescript/core/types";
import {
	SATP_CORE_VERSION,
	SATP_ARCHITECTURE_VERSION,
	SATP_CRASH_VERSION,
} from "../../../../main/typescript/core/constants";

// ---------------------------------------------------------------------------
// Shared setup (module-level — stable across all tests in this file)
// ---------------------------------------------------------------------------

const logLevel: LogLevelDesc = "WARN";

const monitorService = MonitorService.createOrGetMonitorService({
	logLevel,
	enabled: false,
});

function makeSigner(): JsObjectSigner {
	const keyPairs = Secp256k1Keys.generateKeyPairsBuffer();
	return new JsObjectSigner({
		privateKey: new Uint8Array(keyPairs.privateKey),
	});
}

function makeLocalGateway(pubKeyHex: string): GatewayIdentity {
	return {
		id: "test-gateway-001",
		version: [
			{
				Core: SATP_CORE_VERSION,
				Architecture: SATP_ARCHITECTURE_VERSION,
				Crash: SATP_CRASH_VERSION,
			},
		],
		identificationCredential: {
			signingAlgorithm: SupportedSigningAlgorithms.SECP256K1,
			pubKey: pubKeyHex,
		},
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CrashManager — constructor with ICrashRecoveryManagerOptions", () => {
	let signer: JsObjectSigner;
	let localRepository: LocalLogRepository;
	let orchestrator: GatewayOrchestrator;
	let ccManager: SATPCrossChainManager;

	beforeAll(async () => {
		// Run migrations once; repository reuses the same SQLite file per run.
		const migrationSource = await createMigrationSource();
		const knexInstance = knex({
			...knexLocalInstance.default,
			migrations: { migrationSource },
		});
		await knexInstance.migrate.latest();
		await knexInstance.destroy();

		const keyPairs = Secp256k1Keys.generateKeyPairsBuffer();
		const pubKeyHex = Buffer.from(keyPairs.publicKey).toString("hex");
		signer = new JsObjectSigner({
			privateKey: new Uint8Array(keyPairs.privateKey),
		});

		localRepository = new LocalLogRepository(knexLocalInstance.default);

		const localGateway = makeLocalGateway(pubKeyHex);

		orchestrator = new GatewayOrchestrator({
			logLevel,
			localGateway,
			signer,
			monitorService,
			// No counterparty gateways → no outbound connections attempted.
		});

		ccManager = new SATPCrossChainManager({
			orquestrator: orchestrator,
			logLevel,
			monitorService,
			// No ontologyOptions / dbLogger needed for init testing.
		});
	});

	function makeOpts(
		overrides: Partial<ICrashRecoveryManagerOptions> = {},
	): ICrashRecoveryManagerOptions {
		return {
			instanceId: "test-gateway-001",
			logLevel,
			localRepository,
			ccManager,
			orchestrator,
			signer,
			monitorService,
			...overrides,
		};
	}

	it("constructs successfully with all required options", () => {
		const manager = new CrashManager(makeOpts());
		expect(manager).toBeInstanceOf(CrashManager);
	});

	it("getInstanceId() returns the provided instanceId", () => {
		const manager = new CrashManager(makeOpts({ instanceId: "gw-unit-test" }));
		expect(manager.getInstanceId()).toBe("gw-unit-test");
	});

	it("sessions map is empty after construction", () => {
		const manager = new CrashManager(makeOpts());
		expect(manager.sessions).toBeInstanceOf(Map);
		expect(manager.sessions.size).toBe(0);
	});

	it("exposes the local repository passed in options", () => {
		const manager = new CrashManager(makeOpts());
		expect(manager.localRepository).toBe(localRepository);
	});

	it("remoteRepository is undefined when not provided", () => {
		const manager = new CrashManager(makeOpts());
		expect(manager.remoteRepository).toBeUndefined();
	});

	it("throws when options object is falsy (Checks.truthy guard)", () => {
		expect(
			() => new CrashManager(null as unknown as ICrashRecoveryManagerOptions),
		).toThrow();
	});

	it("constructs a second independent instance without error", () => {
		const signer2 = makeSigner();
		const manager1 = new CrashManager(makeOpts({ instanceId: "gw-a" }));
		const manager2 = new CrashManager(
			makeOpts({ instanceId: "gw-b", signer: signer2 }),
		);
		expect(manager1.getInstanceId()).toBe("gw-a");
		expect(manager2.getInstanceId()).toBe("gw-b");
	});
});
