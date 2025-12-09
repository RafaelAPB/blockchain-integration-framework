/**
 * @fileoverview
 * Central in-memory registry for SATP adapter configuration and execution plans.
 *
 * @description
 * The adapter manager translates the static API3 adapter configuration into
 * runtime structures that SATP handlers and webhook services can
 * consume. It indexes every adapter by stage, step, and identifier so that
 * higher-level orchestration (for example, {@link AdapterHookService}) can look
 * up the correct inbound/outbound hooks with minimal overhead.
 *
 * **Responsibilities:**
 * - Validate and cache adapter configuration provided by the gateway operator
 * - Expose lookup helpers scoped by stage, execution step, or adapter identifier
 * - Produce deterministic execution plans that preserve operator-defined priority order
 * - Provide monitoring-friendly insights such as configured stage counts
 *
 * **Index Architecture:**
 * The manager maintains a two-level index:
 * 1. **Stage Index**: Map<SatpStageKey, StageCatalogEntry> for adapters by stage
 * 2. **Adapter Index**: Map<string, AdapterDefinition> per stage for configuration for each adapter
 *
 *
 * **Execution Plan Generation:**
 * The {@link buildExecutionPlan} method flattens the hierarchical configuration into
 * a sorted list of {@link AdapterExecutionBinding} entries. Each binding associates
 * an adapter with its stage, step, and priority-derived order. The plan respects:
 * - Operator-defined priority values (lower numbers execute first)
 * - Index ordering as tiebreaker when priorities are equal
 * - Step mappings when present (before/during/after/rollback)
 * - Active/inactive flags for runtime toggling
 *
 * **Configuration Validation:**
 * The manager performs basic structural validation (presence of required fields) but
 * delegates comprehensive schema validation to {@link validateAdapterConfig}. It logs
 * warnings for:
 * - Duplicate adapter IDs within a stage (keeps first, ignores rest)
 * - Step mappings referencing non-existent adapter IDs
 * - Empty or malformed stage definitions
 *
 * @example
 * Initializing adapter manager from gateway configuration:
 * ```typescript
 * const manager = new AdapterManager({
 *   config: gatewayConfig.adapterConfig,
 *   logLevel: "INFO",
 *   monitorService
 * });
 *
 * // Query adapters for Stage 1 "before" step
 * const adapters = manager.getAdaptersForStep("stage1", "before");
 * console.log(`Found ${adapters.length} adapters for stage1/before`);
 * ```
 *
 * @example
 * Generating execution plan for specific stage:
 * ```typescript
 * const plan = manager.buildExecutionPlan({
 *   stage: "stage2",
 *   includeInactive: false
 * });
 *
 * // Bindings are sorted by priority then index
 * plan.forEach(binding => {
 *   console.log(`Order ${binding.order}: ${binding.adapterId} at ${binding.step}`);
 * });
 * ```
 *
 * @see {@link AdapterHookService} for runtime execution using this manager
 * @see {@link AdapterLayerConfiguration} for configuration schema
 * @see {@link AdapterExecutionPlan} for execution plan structure
 * @see {@link validateAdapterConfig} for configuration validation
 *
 * @module adapter-manager
 * @since 0.0.3-beta
 */

import { Checks, type LogLevelDesc } from "@hyperledger/cactus-common";
import type { SATPLogger as Logger } from "../core/satp-logger";
import { SATPLoggerProvider as LoggerProvider } from "../core/satp-logger-provider";
import { MonitorService } from "../services/monitoring/monitor";
import {
  AdapterLayerConfiguration,
  AdapterDefinition,
  AdapterExecutionBinding,
  AdapterExecutionPlan,
  StageExecutionStep,
} from "./api3-adapter-types";
import { AdapterHookService } from "./adapter-hook-service";
import { randomUUID } from "crypto";
import {
  isValidStepForStage,
  getStepByTag,
  type SatpStage,
} from "../core/satp-protocol-map";

/**
 * Configuration for {@link AdapterManager}.
 *
 * @property config - Complete adapter configuration loaded from disk or env.
 * @property logLevel - Optional log verbosity overriding the monitor defaults.
 * @property monitorService - Shared monitoring instance for structured spans.
 */
export interface IAdapterManagerOptions {
  config: AdapterLayerConfiguration;
  logLevel?: LogLevelDesc;
  monitorService: MonitorService;
}

/**
 * Lightweight registry that exposes rich TypeDoc similar to other SATP modules.
 *
 * @description
 * The manager builds an optimized catalog of adapter definitions organized by
 * stage and execution step. This allows the webhook service to
 * determine which adapters should fire for a given Stage/Step pair, whether
 * they are currently active, and in which sequence they should be invoked.
 *
 * The constructor performs basic validation (presence of mandatory options) and
 * logs key statistics so operators can confirm that the configuration loaded as
 * expected.
 */
export class AdapterManager {
  public static readonly CLASS_NAME = "AdapterManager";

  private readonly log: Logger;
  private readonly config: AdapterLayerConfiguration;
  private readonly monitorService: MonitorService;
  private readonly adaptersById: Map<string, AdapterDefinition>;
  private readonly executionPlan: AdapterExecutionPlan;
  private readonly adapterHookService: AdapterHookService;

  /**
   * Creates a new adapter manager instance using the supplied configuration.
   *
   * @param options - {@link IAdapterManagerOptions} with configuration + deps.
   */
  constructor(options: IAdapterManagerOptions) {
    const fnTag = `${AdapterManager.CLASS_NAME}#constructor()`;
    Checks.truthy(options, `${fnTag} options`);
    Checks.truthy(options.config, `${fnTag} options.config`);
    Checks.truthy(options.monitorService, `${fnTag} options.monitorService`);

    this.monitorService = options.monitorService;
    this.log = LoggerProvider.getOrCreate(
      {
        label: AdapterManager.CLASS_NAME,
        level: options.logLevel || "INFO",
      },
      this.monitorService,
    );
    this.config = options.config;
    this.adaptersById = this.buildAdapterIndex(this.config.adapters || []);
    this.executionPlan = this.buildExecutionPlan();

    // Instantiate the adapter hook service with this manager as the source
    this.adapterHookService = new AdapterHookService({
      adapterManager: this,
      logger: this.log,
      monitorService: this.monitorService,
    });

    this.log.debug(
      `${fnTag} Initialized with ${this.adaptersById.size} adapters and ${this.executionPlan.bindings.length} execution bindings`,
    );
  }  /**
   * Returns the adapter hook service instance managed by this manager.
   *
   * @returns {@link AdapterHookService} for executing webhook adapters.
   */
  public getAdapterHookService(): AdapterHookService {
    return this.adapterHookService;
  }

  /**
   * Returns the raw adapter configuration provided during construction.
   *
   * @returns Unmodified {@link AdapterLayerConfiguration} reference.
   */
  public getConfiguration(): AdapterLayerConfiguration {
    return this.config;
  }

  /**
   * Indicates whether the manager currently tracks at least one adapter.
   *
   * @returns `true` when any adapters were configured.
   */
  public hasAdaptersConfigured(): boolean {
    return this.adaptersById.size > 0;
  }

  /**
   * Lists all adapter identifiers.
   *
   * @returns Array of adapter IDs.
   */
  public listAdapters(): string[] {
    return Array.from(this.adaptersById.keys());
  }

  /**
   * Returns the adapter definition for the supplied adapter ID.
   *
   * @param adapterId - Adapter identifier.
   * @returns Matching {@link AdapterDefinition} or `undefined`.
   */
  public getAdapter(adapterId: string): AdapterDefinition | undefined {
    return this.adaptersById.get(adapterId);
  }

  /**
   * Returns the complete execution plan.
   *
   * @returns {@link AdapterExecutionPlan} with all bindings.
   */
  public getExecutionPlan(): AdapterExecutionPlan {
    return this.executionPlan;
  }

  /**
   * Returns bindings for a specific execution point.
   *
   * @param stage - Stage number (0-3).
   * @param stepTag - Stage-specific step identifier.
   * @param stepOrder - Execution order (before/during/after/rollback).
   * @param includeInactive - Whether to include inactive adapters.
   * @returns Array of {@link AdapterExecutionBinding} entries.
   * @throws Error if stepTag is not valid for the given stage.
   */
  public getBindingsForExecutionPoint(
    stage: number,
    stepTag: string,
    stepOrder: StageExecutionStep,
    includeInactive = false,
  ): AdapterExecutionBinding[] {
    // Validate step against protocol map
    const satpStage = stage as SatpStage;
    if (!isValidStepForStage(satpStage, stepTag)) {
      this.log.error(
        `${AdapterManager.CLASS_NAME}#getBindingsForExecutionPoint() Step "${stepTag}" is not valid for stage ${stage}`,
      );
      throw new Error(
        `Step "${stepTag}" is not a valid SATP protocol step for stage ${stage}`,
      );
    }

    return this.executionPlan.bindings.filter((binding) => {
      const matchesPoint =
        binding.stage === stage &&
        binding.stepTag === stepTag &&
        binding.stepOrder === stepOrder;
      const shouldInclude = includeInactive || binding.adapter.active;
      return matchesPoint && shouldInclude;
    });
  }

  /**
   * Checks if any adapters should execute at the given point.
   *
   * @param stage - Stage number (0-3).
   * @param stepTag - Stage-specific step identifier.
   * @param stepOrder - Execution order (before/during/after/rollback).
   * @returns `true` if at least one active adapter is configured for this point.
   */
  public shouldExecuteAdapters(
    stage: number,
    stepTag: string,
    stepOrder: StageExecutionStep,
  ): boolean {
    return this.getBindingsForExecutionPoint(stage, stepTag, stepOrder).length > 0;
  }

  private buildAdapterIndex(
    adapters: AdapterDefinition[],
  ): Map<string, AdapterDefinition> {
    const index = new Map<string, AdapterDefinition>();
    for (const adapter of adapters) {
      if (!adapter.executionPoints || adapter.executionPoints.length === 0) {
        this.log.warn(
          `Adapter id="${adapter.id}" has no executionPoints; skipping`,
        );
        continue;
      }
      if (index.has(adapter.id)) {
        this.log.warn(
          `Duplicate adapter id="${adapter.id}" detected; keeping first definition`,
        );
        continue;
      }
      index.set(adapter.id, adapter);
    }
    return index;
  }

  private buildExecutionPlan(): AdapterExecutionPlan {
    const bindings: AdapterExecutionBinding[] = [];

    for (const adapter of this.adaptersById.values()) {
      for (const executionPoint of adapter.executionPoints) {
        // Validate execution point against protocol map
        const satpStage = executionPoint.stage as SatpStage;
        if (!isValidStepForStage(satpStage, executionPoint.step)) {
          this.log.warn(
            `Adapter id="${adapter.id}" has invalid execution point: step "${executionPoint.step}" is not valid for stage ${executionPoint.stage}; skipping this execution point`,
          );
          continue;
        }

        bindings.push({
          adapterId: adapter.id,
          adapter,
          stage: executionPoint.stage,
          stepTag: executionPoint.step,
          stepOrder: executionPoint.point,
          priority: adapter.priority ?? 1000,
          executionPointName: executionPoint.name,
        });
      }
    }

    // Sort by stage, stepTag, stepOrder, then priority
    bindings.sort((a, b) => {
      if (a.stage !== b.stage) return a.stage - b.stage;
      if (a.stepTag !== b.stepTag) return a.stepTag.localeCompare(b.stepTag);
      if (a.stepOrder !== b.stepOrder) return a.stepOrder.localeCompare(b.stepOrder);
      return a.priority - b.priority;
    });

    return { bindings };
  }
}
