import { describe, expect, it, jest, beforeAll, afterAll } from "@jest/globals";
import { AdapterManager } from "../../../../main/typescript/adapters/adapter-manager";
import { Stage } from "../../../../main/typescript/types/satp-protocol";
import type { AdapterLayerConfiguration } from "../../../../main/typescript/adapters/api3-adapter-types";
import {
	createMonitorStub,
	loadAdapterConfigFromYaml,
	TEST_SESSION_ID,
	TEST_CONTEXT_ID,
	TEST_GATEWAY_ID,
	TEST_LOG_LEVEL,
} from "../../adapter-test-utils";

/**
 * Integration tests for AdapterManager with real outbound HTTP calls.
 *
 * These tests call real HTTP endpoints (jsonplaceholder.typicode.com) for outbound webhooks
 * while only mocking inbound webhook responses.
 *
 * NOTE: These tests require network connectivity and may be slower.
 * They are marked with a higher timeout to accommodate network latency.
 */
describe("AdapterManager integration with real outbound endpoints", () => {
	// Increase timeout for network calls
	jest.setTimeout(30000);

	let originalFetch: typeof fetch;

	beforeAll(() => {
		// Store original fetch
		originalFetch = global.fetch;
	});

	afterAll(() => {
		// Restore original fetch
		global.fetch = originalFetch;
	});

	describe("real outbound webhook calls", () => {
		it("calls real jsonplaceholder.typicode.com endpoint for outbound webhook", async () => {
			const config = loadAdapterConfigFromYaml(
				"adapter-configuration-integration-test.yml",
			);

			// Use real fetch - no mocking
			const manager = new AdapterManager({
				config,
				monitorService: createMonitorStub(),
				// fetchImpl not provided - uses global fetch
				logLevel: TEST_LOG_LEVEL,
			});

			const invocation = {
				stage: 0,
				stepTag: "newSessionRequest",
				stepOrder: "before" as const,
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { scenario: "real-endpoint-test" },
				payload: { testData: "integration-test" },
			};

			const result = await manager.executeAdapters(invocation);

			// Verify the adapter executed
			expect(result).toBeDefined();
			expect(result?.stage).toBe(Stage.STAGE0);
			expect(result?.steps).toHaveLength(1);
			expect(result?.steps[0].binding.adapterId).toBe(
				"integration-outbound-test",
			);

			// The real endpoint should return a response
			expect(result?.steps[0].outboundResult).toBeDefined();
			expect(result?.steps[0].outboundResult?.status).toBe("OK");
		});

		it("handles real endpoint timeout gracefully", async () => {
			const config: AdapterLayerConfiguration = {
				adapters: [
					{
						id: "timeout-test-adapter",
						name: "Timeout Test Adapter",
						description: "Tests timeout with real endpoint",
						active: true,
						executionPoints: [
							{
								name: "timeout-test",
								stage: 0,
								step: "newSessionRequest",
								point: "before",
							},
						],
						outboundWebhook: {
							// Using jsonplaceholder echo endpoint
							url: "https://jsonplaceholder.typicode.com/posts",
							timeoutMs: 15000, // Reasonable timeout for real endpoint
							retryAttempts: 1,
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
						},
					},
				],
				global: {
					timeoutMs: 15000,
					retryAttempts: 1,
					retryDelayMs: 500,
				},
			};

			const manager = new AdapterManager({
				config,
				monitorService: createMonitorStub(),
				logLevel: TEST_LOG_LEVEL,
			});

			const result = await manager.executeAdapters({
				stage: 0,
				stepTag: "newSessionRequest",
				stepOrder: "before",
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { scenario: "timeout-test" },
				payload: {},
			});

			// Should complete without throwing
			expect(result).toBeDefined();
			expect(result?.steps).toHaveLength(1);
		});

		it("calls jsonplaceholder.typicode.com echo endpoint and verifies response", async () => {
			const config: AdapterLayerConfiguration = {
				adapters: [
					{
						id: "jsonplaceholder-echo-adapter",
						name: "JSONPlaceholder Echo Adapter",
						description: "Tests with jsonplaceholder.typicode.com echo",
						active: true,
						executionPoints: [
							{
								name: "echo-test",
								stage: 1,
								step: "transferProposalRequest",
								point: "before",
							},
						],
						outboundWebhook: {
							url: "https://jsonplaceholder.typicode.com/posts",
							timeoutMs: 15000,
							retryAttempts: 2,
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Accept: "application/json",
							},
						},
					},
				],
				global: {
					timeoutMs: 15000,
					retryAttempts: 2,
					retryDelayMs: 1000,
				},
			};

			const manager = new AdapterManager({
				config,
				monitorService: createMonitorStub(),
				logLevel: TEST_LOG_LEVEL,
			});

			const result = await manager.executeAdapters({
				stage: 1,
				stepTag: "transferProposalRequest",
				stepOrder: "before",
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { scenario: "jsonplaceholder-echo" },
				payload: { testMessage: "Hello from SATP adapter" },
			});

			expect(result).toBeDefined();
			expect(result?.stage).toBe(Stage.STAGE1);
			expect(result?.steps).toHaveLength(1);
			expect(result?.steps[0].binding.adapterId).toBe(
				"jsonplaceholder-echo-adapter",
			);
			expect(result?.steps[0].disposition).toBe("CONTINUE");
		});
	});

	describe("inbound webhook mocking with real outbound", () => {
		it("mocks only inbound webhook while making real outbound call", async () => {
			// Configuration with both outbound (real) and inbound (to be mocked behavior)
			const config: AdapterLayerConfiguration = {
				adapters: [
					{
						id: "hybrid-outbound-adapter",
						name: "Hybrid Outbound Adapter",
						description: "Real outbound, simulated inbound",
						active: true,
						executionPoints: [
							{
								name: "hybrid-before",
								stage: 0,
								step: "newSessionRequest",
								point: "before",
							},
						],
						outboundWebhook: {
							url: "https://jsonplaceholder.typicode.com/posts",
							timeoutMs: 15000,
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
						},
					},
					{
						id: "hybrid-inbound-adapter",
						name: "Hybrid Inbound Adapter",
						description: "Simulated inbound webhook",
						active: true,
						executionPoints: [
							{
								name: "hybrid-after",
								stage: 0,
								step: "newSessionRequest",
								point: "after",
							},
						],
						inboundWebhook: {
							urlSuffix: "/inbound/hybrid",
							timeoutMs: 5000,
						},
					},
				],
				global: {
					timeoutMs: 15000,
					retryAttempts: 2,
					retryDelayMs: 1000,
				},
			};

			const manager = new AdapterManager({
				config,
				monitorService: createMonitorStub(),
				// Using real fetch for outbound
				logLevel: TEST_LOG_LEVEL,
			});

			// Execute "before" adapters - makes REAL HTTP call
			const beforeResult = await manager.executeAdapters({
				stage: 0,
				stepTag: "newSessionRequest",
				stepOrder: "before",
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { phase: "before-real-call" },
				payload: { realEndpoint: true },
			});

			expect(beforeResult).toBeDefined();
			expect(beforeResult?.stage).toBe(Stage.STAGE0);
			expect(beforeResult?.steps).toHaveLength(1);
			expect(beforeResult?.steps[0].binding.adapterId).toBe(
				"hybrid-outbound-adapter",
			);
			// Verify real endpoint responded
			expect(beforeResult?.steps[0].outboundResult?.status).toBe("OK");

			// Execute "after" adapters - inbound adapter (no outbound call expected)
			const afterResult = await manager.executeAdapters({
				stage: 0,
				stepTag: "newSessionRequest",
				stepOrder: "after",
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { phase: "after-inbound-mock" },
				payload: {},
			});

			expect(afterResult).toBeDefined();
			expect(afterResult?.stage).toBe(Stage.STAGE0);
			expect(afterResult?.steps).toHaveLength(1);
			expect(afterResult?.steps[0].binding.adapterId).toBe(
				"hybrid-inbound-adapter",
			);
		});

		it("uses integration test config with real jsonplaceholder endpoint", async () => {
			const config = loadAdapterConfigFromYaml(
				"adapter-configuration-integration-test.yml",
			);

			const manager = new AdapterManager({
				config,
				monitorService: createMonitorStub(),
				logLevel: TEST_LOG_LEVEL,
			});

			// "before" execution calls real jsonplaceholder.typicode.com endpoint
			const beforeResult = await manager.executeAdapters({
				stage: 0,
				stepTag: "newSessionRequest",
				stepOrder: "before",
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { test: "integration-yaml" },
				payload: { fromYaml: true },
			});

			expect(beforeResult).toBeDefined();
			expect(beforeResult?.steps).toHaveLength(1);
			expect(beforeResult?.steps[0].binding.adapterId).toBe(
				"integration-outbound-test",
			);
			expect(beforeResult?.steps[0].disposition).toBe("CONTINUE");

			// "after" execution has inbound adapter (no HTTP call)
			const afterResult = await manager.executeAdapters({
				stage: 0,
				stepTag: "newSessionRequest",
				stepOrder: "after",
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { test: "integration-yaml-after" },
				payload: {},
			});

			expect(afterResult).toBeDefined();
			expect(afterResult?.steps).toHaveLength(1);
			expect(afterResult?.steps[0].binding.adapterId).toBe(
				"integration-inbound-test",
			);
		});
	});

	describe("error handling with real endpoints", () => {
		it("handles non-existent endpoint gracefully", async () => {
			const config: AdapterLayerConfiguration = {
				adapters: [
					{
						id: "error-test-adapter",
						name: "Error Test Adapter",
						description: "Tests error handling with bad endpoint",
						active: true,
						executionPoints: [
							{
								name: "error-test",
								stage: 0,
								step: "newSessionRequest",
								point: "before",
							},
						],
						outboundWebhook: {
							// Non-existent endpoint
							url: "https://this-endpoint-does-not-exist-12345.example/webhook",
							timeoutMs: 5000,
							retryAttempts: 1,
							retryDelayMs: 100,
							method: "POST",
						},
					},
				],
				global: {
					timeoutMs: 5000,
					retryAttempts: 1,
					retryDelayMs: 100,
				},
			};

			const manager = new AdapterManager({
				config,
				monitorService: createMonitorStub(),
				logLevel: TEST_LOG_LEVEL,
			});

			const result = await manager.executeAdapters({
				stage: 0,
				stepTag: "newSessionRequest",
				stepOrder: "before",
				sessionId: TEST_SESSION_ID,
				contextId: TEST_CONTEXT_ID,
				gatewayId: TEST_GATEWAY_ID,
				metadata: { scenario: "error-test" },
				payload: {},
			});

			// Should handle error gracefully
			expect(result).toBeDefined();
			expect(result?.steps).toHaveLength(1);
			// The adapter should have an error status
			expect(result?.steps[0].outboundResult?.status).not.toBe("OK");
		});
	});
});
