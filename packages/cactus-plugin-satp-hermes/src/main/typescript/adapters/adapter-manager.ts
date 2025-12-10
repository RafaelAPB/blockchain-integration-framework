/**
 * @fileoverview
 * Central in-memory registry for SATP adapter configuration and execution plan lookup.
 *
 * @description
 * The adapter manager translates the static API3 adapter configuration into
 * runtime structures that the {@link AdapterHookService} can query to determine
 * which adapters should execute at a given protocol execution point.
 *
 * **Responsibilities:**
 * - Validate and cache adapter configuration provided by the gateway operator
 * - Build an execution plan mapping (stage, step, order) → adapters
 * - Provide lookup for adapters at a specific execution point (stage, stepTag, stepOrder)
 * - Filter by active/inactive status
 *
 * **Usage Pattern:**
 * The SATP handler calls {@link AdapterHookService.executeAdapters}(stage, step, order).
 * The service internally queries this manager via {@link getBindingsForExecutionPoint}
 * to retrieve the list of adapters to run, then executes them.
 *
 * @example
 * Checking if adapters should run at a given execution point:
 * ```typescript
 * const manager = new AdapterManager({
 *   config: gatewayConfig.adapterConfig,
 *   logLevel: "INFO",
 *   monitorService
 * });
 *
 * if (manager.shouldExecuteAdapters(1, "lockAssertionRequest", "before")) {
 *   // AdapterHookService will handle execution
 * }
 * ```
 *
 * @see {@link AdapterHookService} for runtime execution using this manager
 * @see {@link AdapterLayerConfiguration} for configuration schema
 * @see {@link AdapterExecutionBinding} for binding structure
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
import {
  isValidStage,
  validateStepTagForStage,
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
 * Registry for adapter configuration lookup by execution point.
 *
 * @description
 * The manager builds an indexed catalog of adapter definitions organized by
 * stage, step, and execution order. The {@link AdapterHookService} queries this
 * manager to determine which adapters should fire for a given execution point.
 *
 * The constructor performs basic validation (presence of mandatory options) and
 * logs key statistics so operators can confirm that the configuration loaded as
 * expected.
 */
export class AdapterManager {
  public static readonly CLASS_NAME = "AdapterManager";

  private readonly log: Logger;
  private readonly config: AdapterLayerConfiguration;
  private readonly adaptersById: Map<string, AdapterDefinition>;
  private readonly executionPlan: AdapterExecutionPlan;

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

    this.log = LoggerProvider.getOrCreate(
      {
        label: AdapterManager.CLASS_NAME,
        level: options.logLevel || "INFO",
      },
      options.monitorService,
    );
    this.config = options.config;
    this.adaptersById = this.buildAdapterIndex(this.config.adapters || []);
    this.executionPlan = this.buildExecutionPlan();

    this.log.debug(
      `${fnTag} Initialized with ${this.adaptersById.size} adapters and ${this.executionPlan.bindings.length} execution bindings`,
    );
  }

  /**
   * Returns the raw adapter configuration provided during construction.
   * Used by {@link AdapterHookService} to access global settings.
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
   * Returns bindings for a specific execution point.
   *
   * All bindings are pre-validated during construction, so this method
   * performs a simple lookup without re-validating stage/stepTag combinations.
   *
   * @param stage - Stage number (0-3).
   * @param stepTag - Stage-specific step identifier.
   * @param stepOrder - Execution order (before/during/after/rollback).
   * @param includeInactive - Whether to include inactive adapters.
   * @returns Array of {@link AdapterExecutionBinding} entries (empty if none configured).
   */
  public getBindingsForExecutionPoint(
    stage: number,
    stepTag: string,
    stepOrder: StageExecutionStep,
    includeInactive = false,
  ): AdapterExecutionBinding[] {
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
    const errors: string[] = [];

    for (const adapter of this.adaptersById.values()) {
      for (const executionPoint of adapter.executionPoints) {
        // Validate stage
        if (!isValidStage(executionPoint.stage)) {
          errors.push(
            `Adapter id="${adapter.id}", execution point "${executionPoint.name || "unnamed"}": ` +
            `invalid stage ${executionPoint.stage}. Valid stages are 0, 1, 2, 3.`,
          );
          continue;
        }

        // Validate stepTag for stage
        const validation = validateStepTagForStage(executionPoint.stage, executionPoint.step);
        if (!validation.valid) {
          errors.push(
            `Adapter id="${adapter.id}", execution point "${executionPoint.name || "unnamed"}": ` +
            `${validation.errorMessage}`,
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

    // Fail fast if any execution points are invalid
    if (errors.length > 0) {
      const errorMessage =
        `${AdapterManager.CLASS_NAME}#buildExecutionPlan() Invalid adapter configuration detected:\n` +
        errors.map((e) => `  - ${e}`).join("\n");
      this.log.error(errorMessage);
      throw new Error(errorMessage);
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
