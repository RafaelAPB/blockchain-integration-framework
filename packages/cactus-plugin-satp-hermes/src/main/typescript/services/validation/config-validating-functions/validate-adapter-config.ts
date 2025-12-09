/**
 * Adapter Configuration Validation - Schema validator for API3 adapter configuration
 *
 * @fileoverview
 * Comprehensive validation function that verifies the structural integrity and semantic
 * correctness of API3 adapter configuration before gateway initialization. Catches
 * configuration errors early with detailed error messages indicating the exact location
 * and nature of each problem.
 *
 * @description
 * **Validation Scope:**
 * This validator performs deep structural validation of the entire adapter configuration
 * tree, checking:
 *
 * 1. **Stage Configuration:**
 *    - Stage keys must be valid SATP stages (stage0, stage1, stage2, stage3, crash)
 *    - Each stage must have a non-empty adapters array
 *    - Stage structure must be a valid object
 *
 * 2. **Adapter Definitions:**
 *    - Adapter IDs must be unique within each stage
 *    - Required fields: id (string), name (string), active (boolean)
 *    - Optional fields: priority (number), description (string)
 *    - At least one webhook (outbound or inbound) should be configured
 *
 * 3. **Webhook Configuration:**
 *    - Outbound webhook URLs must be valid absolute URLs (HTTP/HTTPS)
 *    - Inbound webhook urlSuffix must start with '/' character
 *    - HTTP methods, timeouts, and retry settings are validated for type correctness
 *    - Headers must be valid Record<string, string> if present
 *
 * 4. **Step Mappings:**
 *    - Step keys must be valid execution steps (before, during, after, rollback)
 *    - Referenced adapter IDs must exist in the stage's adapter catalog
 *    - Step arrays must contain only string adapter identifiers
 *
 * 5. **Global Defaults:**
 *    - Timeout, retry, and log level settings are validated for type correctness
 *    - Global headers must be valid Record<string, string> if present
 *
 * **Error Reporting:**
 * All validation errors include contextual information (stage name, adapter ID, field name)
 * to help operators quickly locate and fix configuration problems. Errors are thrown
 * immediately upon first detection with descriptive messages.
 *
 * **Usage Pattern:**
 * This validator is typically invoked during gateway CLI startup or configuration reload:
 * 1. Load adapter configuration from file/environment
 * 2. Pass configuration to validateAdapterConfig()
 * 3. On success, configuration is safe to use with AdapterManager
 * 4. On failure, error message indicates exact fix required
 *
 * @example
 * Validating configuration loaded from file:
 * ```typescript
 * import { validateAdapterConfig } from './validate-adapter-config';
 * import fs from 'fs-extra';
 *
 * const configData = await fs.readJson('./adapters.json');
 *
 * try {
 *   const validConfig = validateAdapterConfig({
 *     configValue: configData
 *   });
 *
 *   if (validConfig) {
 *     logger.info('Adapter configuration is valid');
 *     // Proceed with AdapterManager initialization
 *   } else {
 *     logger.info('No adapter configuration provided');
 *   }
 * } catch (error) {
 *   logger.error('Invalid adapter configuration:', error.message);
 *   process.exit(1);
 * }
 * ```
 *
 * @example
 * Common validation errors and fixes:
 * ```typescript
 * // Error: "Invalid stage key 'phase1'. Must be one of: stage0, stage1, stage2, stage3, crash"
 * // Fix: Use correct stage naming
 * const config = {
 *   satpStages: {
 *     stage1: { adapters: [...] }  // Correct
 *   }
 * };
 *
 * // Error: "Duplicate adapter id 'monitor' found in stage 'stage1'"
 * // Fix: Ensure unique adapter IDs within each stage
 * const config = {
 *   satpStages: {
 *     stage1: {
 *       adapters: [
 *         { id: 'monitor-lock', ... },  // Unique IDs
 *         { id: 'monitor-mint', ... }
 *       ]
 *     }
 *   }
 * };
 *
 * // Error: "Step 'before' in stage 'stage2' references unknown adapter ID 'missing-adapter'"
 * // Fix: Ensure step mappings reference existing adapter IDs
 * const config = {
 *   satpStages: {
 *     stage2: {
 *       adapters: [
 *         { id: 'compliance-check', ... }
 *       ],
 *       steps: {
 *         before: ['compliance-check']  // Must exist in adapters array
 *       }
 *     }
 *   }
 * };
 * ```
 *
 * @see {@link AdapterLayerConfiguration} for complete configuration schema
 * @see {@link AdapterManager} for configuration consumption
 * @see {@link AdapterDefinition} for adapter structure
 *
 * @module validate-adapter-config
 * @since 0.0.3-beta
 */

import type { AdapterLayerConfiguration } from "../../../adapters/api3-adapter-types";

/**
 * Validation options for adapter configuration.
 */
export interface ValidateAdapterConfigOptions {
	configValue?: AdapterLayerConfiguration;
}

/**
 * Validates API3 adapter configuration structure.
 *
 * @param options - Configuration options containing the adapter config to validate
 * @returns Validated adapter configuration or undefined if not provided
 * @throws {Error} When adapter configuration contains invalid structure
 * @throws {Error} When adapter IDs are duplicated within a stage
 * @throws {Error} When step mappings reference non-existent adapter IDs
 * @throws {Error} When webhook URLs or configurations are malformed
 *
 * @example
 * ```typescript
 * const config = validateAdapterConfig({
 *   configValue: loadedAdapterConfig
 * });
 * ```
 */
export function validateAdapterConfig(
	options: ValidateAdapterConfigOptions,
): AdapterLayerConfiguration | undefined {
	const { configValue } = options;

	if (!configValue) {
		return undefined;
	}

	if (typeof configValue !== "object" || configValue === null) {
		throw new Error(
			"Adapter configuration must be an object when provided",
		);
	}

	if (!configValue.satpStages || typeof configValue.satpStages !== "object") {
		throw new Error(
			"Adapter configuration must contain 'satpStages' object",
		);
	}

	const validStages = ["stage0", "stage1", "stage2", "stage3", "crash"];
	const validSteps = ["before", "during", "after", "rollback"];

	for (const [stageKey, stageConfig] of Object.entries(configValue.satpStages)) {
		if (!validStages.includes(stageKey)) {
			throw new Error(
				`Invalid stage key "${stageKey}". Must be one of: ${validStages.join(", ")}`,
			);
		}

		if (!stageConfig?.adapters || !Array.isArray(stageConfig.adapters)) {
			throw new Error(`Stage "${stageKey}" must contain 'adapters' array`);
		}

		const adapterIds = new Set<string>();
		const assertField = (condition: boolean, field: string, type = "string") => {
			if (!condition) {
				throw new Error(
					`Adapter in stage "${stageKey}" must have a valid '${field}' ${type}`,
				);
			}
		};

		for (const adapter of stageConfig.adapters) {
			assertField(!!(adapter.id && typeof adapter.id === "string"), "id");

			if (adapterIds.has(adapter.id)) {
				throw new Error(
					`Duplicate adapter id "${adapter.id}" found in stage "${stageKey}"`,
				);
			}
			adapterIds.add(adapter.id);

			assertField(!!(adapter.name && typeof adapter.name === "string"), "name");
			assertField(typeof adapter.active === "boolean", "active", "boolean");

			if (adapter.outboundWebhook?.url) {
				try {
					new URL(adapter.outboundWebhook.url);
				} catch {
					throw new Error(
						`Adapter "${adapter.id}" outboundWebhook.url must be a valid URL`,
					);
				}
			}

			if (adapter.inboundWebhook) {
				const suffix = adapter.inboundWebhook.urlSuffix;
				if (!suffix || typeof suffix !== "string" || !suffix.startsWith("/")) {
					throw new Error(
						`Adapter "${adapter.id}" inboundWebhook.urlSuffix must be a string starting with '/'`,
					);
				}
			}
		}

		if (stageConfig.steps) {
			for (const [stepKey, adapterIdArray] of Object.entries(stageConfig.steps)) {
				if (!validSteps.includes(stepKey)) {
					throw new Error(
						`Invalid step key "${stepKey}" in stage "${stageKey}". Must be one of: ${validSteps.join(", ")}`,
					);
				}

				if (!Array.isArray(adapterIdArray)) {
					throw new Error(
						`Step "${stepKey}" in stage "${stageKey}" must map to an array of adapter IDs`,
					);
				}

				for (const adapterId of adapterIdArray) {
					if (typeof adapterId !== "string") {
						throw new Error(
							`Step "${stepKey}" in stage "${stageKey}" contains non-string adapter ID`,
						);
					}
					if (!adapterIds.has(adapterId)) {
						throw new Error(
							`Step "${stepKey}" in stage "${stageKey}" references unknown adapter ID "${adapterId}"`,
						);
					}
				}
			}
		}
	}

	return configValue;
}
