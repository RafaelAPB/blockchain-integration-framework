/**
 * @fileoverview
 * Central in-memory registry for SATP adapter configuration and execution plans.
 *
 * @description
 * The adapter manager translates the static API3 adapter configuration into
 * runtime-friendly structures that SATP handlers and webhook services can
 * consume. It indexes every adapter by stage, step, and identifier so that
 * higher-level orchestration (for example, {@link AdapterHookRunner}) can look
 * up the correct inbound/outbound hooks with minimal overhead.
 *
 * **Responsibilities:**
 * - Validate and cache adapter configuration provided by the gateway operator
 * - Expose lookup helpers scoped by stage, execution step, or adapter id
 * - Produce deterministic execution plans that preserve operator-defined order
 * - Surface configuration anomalies (duplicates, missing references) via logging
 * - Provide monitoring-friendly insights such as configured stage counts
 */

import { Checks, type LogLevelDesc } from "@hyperledger/cactus-common";
import type { SATPLogger as Logger } from "../core/satp-logger";
import { SATPLoggerProvider as LoggerProvider } from "../core/satp-logger-provider";
import { MonitorService } from "../services/monitoring/monitor";
import {
  Api3AdapterConfiguration,
  AdapterDefinition,
  AdapterExecutionBinding,
  AdapterExecutionPlan,
  SatpStageAdapterSet,
  SatpStageKey,
  StageExecutionStep,
} from "./api3-adapter-types";

/** Metadata cached per SATP stage to enable O(1) adapter lookups. */
interface StageCatalogEntry {
  definition: SatpStageAdapterSet;
  adaptersById: Map<string, AdapterDefinition>;
}

/**
 * Configuration contract for {@link AdapterManager} construction.
 *
 * @property config - Complete adapter configuration loaded from disk or env.
 * @property logLevel - Optional log verbosity overriding the monitor defaults.
 * @property monitorService - Shared monitoring instance for structured spans.
 */
export interface AdapterManagerOptions {
  config: Api3AdapterConfiguration;
  logLevel?: LogLevelDesc;
  monitorService: MonitorService;
}

/**
 * Lightweight registry that exposes rich TypeDoc similar to other SATP modules.
 *
 * @description
 * The manager builds an optimized catalog of adapter definitions organized by
 * stage and execution step. This allows webhook coordination layers to quickly
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
  private readonly config: Api3AdapterConfiguration;
  private readonly monitorService: MonitorService;
  private readonly stageIndex: Map<SatpStageKey, StageCatalogEntry>;

  /**
   * Creates a new adapter manager instance using the supplied configuration.
   *
   * @param options - {@link AdapterManagerOptions} with configuration + deps.
   */
  constructor(options: AdapterManagerOptions) {
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
    this.stageIndex = this.buildStageIndex(this.config.satpStages);
    this.log.debug(
      `${fnTag} Initialized with ${this.stageIndex.size} configured SATP stages`,
    );
  }

  /**
   * Returns the raw adapter configuration provided during construction.
   *
   * @returns Unmodified {@link Api3AdapterConfiguration} reference.
   */
  public getConfiguration(): Api3AdapterConfiguration {
    return this.config;
  }

  /**
   * Indicates whether the manager currently tracks at least one stage.
   *
   * @returns `true` when any SATP stage was configured with adapters.
   */
  public hasAdaptersConfigured(): boolean {
    return this.stageIndex.size > 0;
  }

  /**
   * Lists all stage identifiers that have adapter definitions.
   *
   * @returns Array of {@link SatpStageKey} entries in insertion order.
   */
  public listStages(): SatpStageKey[] {
    return Array.from(this.stageIndex.keys());
  }

  /**
   * Retrieves the full adapter set for the provided stage key.
   *
   * @param stage - Stage identifier (for example, `"stage1"`).
   * @returns {@link SatpStageAdapterSet} or `undefined` when missing.
   */
  public getStageDefinition(
    stage: SatpStageKey,
  ): SatpStageAdapterSet | undefined {
    return this.config.satpStages?.[stage];
  }

  /**
   * Returns the adapters for a given stage with optional inclusion of inactive
   * entries. When no stage configuration exists an empty list is returned.
   */
  public getAdaptersForStage(
    stage: SatpStageKey,
    opts: { includeInactive?: boolean } = {},
  ): AdapterDefinition[] {
    const entry = this.stageIndex.get(stage);
    if (!entry) {
      return [];
    }
    const includeInactive = opts.includeInactive ?? false;
    return entry.definition.adapters.filter((adapter) =>
      includeInactive ? true : adapter.active,
    );
  }

  /**
   * Retrieves adapters mapped to a specific execution step. When the step
   * mapping is missing the method falls back to the entire stage order.
   */
  public getAdaptersForStep(
    stage: SatpStageKey,
    step: StageExecutionStep,
    opts: { includeInactive?: boolean } = {},
  ): AdapterDefinition[] {
    const entry = this.stageIndex.get(stage);
    if (!entry) {
      return [];
    }
    const stepIds = entry.definition.steps?.[step];
    if (!stepIds || stepIds.length === 0) {
      return this.getAdaptersForStage(stage, opts);
    }
    const includeInactive = opts.includeInactive ?? false;
    const adapters: AdapterDefinition[] = [];
    for (const adapterId of stepIds) {
      const adapter = entry.adaptersById.get(adapterId);
      if (!adapter) {
        this.log.warn(
          `Adapter id="${adapterId}" missing from stage="${stage}" configuration`,
        );
        continue;
      }
      if (!includeInactive && !adapter.active) {
        continue;
      }
      adapters.push(adapter);
    }
    return adapters;
  }

  /**
   * Returns the adapter definition for the supplied stage/id combination.
   *
   * @param stage - Stage identifier.
   * @param adapterId - Natural adapter identifier configured by the operator.
   * @returns Matching {@link AdapterDefinition} or `undefined`.
   */
  public getAdapter(
    stage: SatpStageKey,
    adapterId: string,
  ): AdapterDefinition | undefined {
    return this.stageIndex.get(stage)?.adaptersById.get(adapterId);
  }

  /**
   * Produces a flattened execution plan that the adapter hook service can consume.
   *
   * @param opts - Optional filters limiting the scope of the plan.
   * @returns Ordered list of {@link AdapterExecutionBinding} entries.
   */
  public buildExecutionPlan(
    opts: {
      stage?: SatpStageKey;
      includeInactive?: boolean;
    } = {},
  ): AdapterExecutionBinding[] {
    const includeInactive = opts.includeInactive ?? false;
    const stages = opts.stage ? [opts.stage] : this.listStages();
    const bindings: AdapterExecutionBinding[] = [];

    for (const stageKey of stages) {
      const entry = this.stageIndex.get(stageKey);
      if (!entry) {
        continue;
      }
      const { definition, adaptersById } = entry;
      const stepMappings = definition.steps;
      if (stepMappings && Object.keys(stepMappings).length > 0) {
        for (const [step, adapterIds] of Object.entries(stepMappings) as Array<
          [StageExecutionStep, string[]]
        >) {
          adapterIds?.forEach((adapterId, idx) => {
            const adapter = adaptersById.get(adapterId);
            if (!adapter) {
              this.log.warn(
                `Adapter id="${adapterId}" missing from stage="${stageKey}" step="${step}" map`,
              );
              return;
            }
            if (!includeInactive && !adapter.active) {
              return;
            }
            bindings.push({
              adapterId,
              stage: stageKey,
              step,
              order: this.calculateBindingOrder(adapter, idx),
            });
          });
        }
      } else {
        definition.adapters.forEach((adapter, idx) => {
          if (!includeInactive && !adapter.active) {
            return;
          }
          bindings.push({
            adapterId: adapter.id,
            stage: stageKey,
            step: "during",
            order: this.calculateBindingOrder(adapter, idx),
          });
        });
      }
    }

    return bindings.sort((a, b) => a.order - b.order);
  }

  /**
   * Convenience wrapper returning an {@link AdapterExecutionPlan} snapshot.
   */
  public getExecutionPlanSnapshot(
    opts: {
      stage?: SatpStageKey;
      includeInactive?: boolean;
    } = {},
  ): AdapterExecutionPlan {
    return { bindings: this.buildExecutionPlan(opts) };
  }

  private buildStageIndex(
    stages?: Partial<Record<SatpStageKey, SatpStageAdapterSet>>,
  ): Map<SatpStageKey, StageCatalogEntry> {
    const index = new Map<SatpStageKey, StageCatalogEntry>();
    if (!stages) {
      return index;
    }
    for (const [stageKey, definition] of Object.entries(stages) as Array<
      [SatpStageKey, SatpStageAdapterSet]
    >) {
      if (!definition || !Array.isArray(definition.adapters)) {
        continue;
      }
      const adaptersById = new Map<string, AdapterDefinition>();
      for (const adapter of definition.adapters) {
        if (adaptersById.has(adapter.id)) {
          this.log.warn(
            `Duplicate adapter id="${adapter.id}" detected for stage="${stageKey}"; keeping first definition`,
          );
          continue;
        }
        adaptersById.set(adapter.id, adapter);
      }
      index.set(stageKey, { definition, adaptersById });
    }
    return index;
  }

  private calculateBindingOrder(
    adapter: AdapterDefinition,
    fallbackIndex: number,
  ): number {
    const base = typeof adapter.priority === "number" ? adapter.priority : 1000;
    return base * 1000 + fallbackIndex;
  }
}
