/**
 * @fileoverview
 * Central manager for SATP adapter configuration, execution plan lookup, and webhook execution.
 *
 * @description
 * The adapter manager is the single entry point for all adapter-related operations.
 * It translates the static API3 adapter configuration into runtime structures,
 * determines when adapters should execute, and delegates webhook execution to
 * the AdapterHookService.
 *
 * **Responsibilities:**
 * - Validate and cache adapter configuration provided by the gateway operator
 * - Build an execution plan mapping (stage, step, order) → adapters
 * - Provide lookup for adapters at a specific execution point (stage, stepTag, stepOrder)
 * - Filter by active/inactive status
 * - Determine if adapters should execute at a given execution point
 * - Initialize and hold reference to AdapterHookService
 * - Execute adapters via the hook service
 *
 * **Usage Pattern:**
 * The SATP handler calls manager.executeAdapters(input) which internally checks
 * if adapters should run, gets bindings, and delegates to the hook service.
 *
 * @example
 * Using the adapter manager:
 * ```typescript
 * const manager = new AdapterManager({
 *   config: gatewayConfig.adapterConfig,
 *   logLevel: "INFO",
 *   monitorService
 * });
 *
 * // Execute adapters at a specific point
 * await manager.executeAdapters({
 *   stage: 1,
 *   stepTag: "lockAssertionRequest",
 *   stepOrder: "before",
 *   sessionId: "session-123",
 *   gatewayId: "gateway-1"
 * });
 * ```
 *
 * @see {@link AdapterHookService} for low-level webhook execution
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
  isValidStepForStage,
  getStepByTag,
  validateStepTagForStage,
  type SatpStage,
} from "../core/satp-protocol-map";
import {
  AdapterHookService,
  AdapterExecutionTimeoutError,
  type AdapterWebhookExecutionInput,
} from "./adapter-hook-service";
import type { AdapterHookResult } from "./adapter-types";

// Re-export for consumers
export { AdapterExecutionTimeoutError } from "./adapter-hook-service";

/**
 * Configuration for {@link AdapterManager}.
 *
 * @property config - Complete adapter configuration loaded from disk or env.
 * @property logLevel - Optional log verbosity overriding the monitor defaults.
 * @property monitorService - Shared monitoring instance for structured spans.
 * @property fetchImpl - Optional fetch implementation for webhook calls.
 */
export interface IAdapterManagerOptions {
  config: AdapterLayerConfiguration;
  logLevel?: LogLevelDesc;
  monitorService: MonitorService;
  fetchImpl?: typeof fetch;
}

/**
 * Input for executing adapters at a specific execution point.
 */
export interface AdapterExecutionInput {
  stage: number;
  stepTag: string;
  stepOrder: StageExecutionStep;
  sessionId: string;
  contextId?: string;
  gatewayId: string;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

/**
 * Central manager for SATP adapter configuration and execution.
 *
 * @description
 * The manager builds an indexed catalog of adapter definitions organized by
 * stage, step, and execution order. It determines when adapters should execute
 * and delegates webhook execution to the AdapterHookService.
 *
 * The constructor performs basic validation (presence of mandatory options) and
 * logs key statistics so operators can confirm that the configuration loaded as
 * expected.
 */
export class AdapterManager {
  public static readonly CLASS_NAME = "AdapterManager";

  private readonly log: Logger;
  private readonly monitorService: MonitorService;
  private readonly config: AdapterLayerConfiguration;
  private readonly adaptersById: Map<string, AdapterDefinition>;
  private readonly executionPlan: AdapterExecutionPlan;
  private readonly hookService: AdapterHookService;

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

    // Initialize the hook service for webhook execution
    this.hookService = new AdapterHookService({
      logger: this.log,
      globalConfig: this.config.global,
      fetchImpl: options.fetchImpl,
    });

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

  /**
   * Executes all adapters configured for the given execution point.
   * This is the main entry point for adapter execution.
   *
   * @param input - Execution input with stage, step, and context data.
   * @returns Aggregated result from all adapter executions, or undefined if no adapters executed.
   */
  public async executeAdapters(
    input: AdapterExecutionInput,
  ): Promise<AdapterHookResult | undefined> {
    if (!this.hasAdaptersConfigured()) {
      return undefined;
    }

    // Validate execution point against protocol map
    if (!isValidStepForStage(input.stage, input.stepTag)) {
      this.log.error(
        `AdapterManager#executeAdapters() Step "${input.stepTag}" is not valid for stage ${input.stage}`,
      );
      throw new Error(
        `Step "${input.stepTag}" is not a valid SATP protocol step for stage ${input.stage}`,
      );
    }

    // Log execution point with protocol metadata for observability
    const stepInfo = getStepByTag(input.stage as SatpStage, input.stepTag);
    if (stepInfo) {
      this.log.debug(
        `AdapterManager#executeAdapters() Executing adapters for stage ${input.stage}, step "${input.stepTag}" (${stepInfo.description}), order ${input.stepOrder}`,
      );
    }

    // Get bindings for this execution point
    const bindings = this.getBindingsForExecutionPoint(
      input.stage,
      input.stepTag,
      input.stepOrder,
    );

    if (bindings.length === 0) {
      return undefined;
    }

    // Delegate to hook service for actual webhook execution
    return this.hookService.executeWebhooks({
      bindings,
      sessionId: input.sessionId,
      contextId: input.contextId,
      gatewayId: input.gatewayId,
      metadata: input.metadata,
      payload: input.payload,
    });
  }

  /**
   * Convenience method to execute adapters for "before" step order.
   */
  public async executeAdaptersBefore(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "before" });
  }

  /**
   * Convenience method to execute adapters for "during" step order.
   */
  public async executeAdaptersDuring(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "during" });
  }

  /**
   * Convenience method to execute adapters for "after" step order.
   */
  public async executeAdaptersAfter(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "after" });
  }

  /**
   * Convenience method to execute adapters for "rollback" step order.
   */
  public async executeAdaptersRollback(
    input: Omit<AdapterExecutionInput, "stepOrder">,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeAdapters({ ...input, stepOrder: "rollback" });
  }

  // ============================================================================
  // SESSION-AWARE EXECUTION METHODS
  // Used by stage handlers to execute adapters with session context and deadlines
  // ============================================================================

  /**
   * Execute adapters for a session with optional deadline enforcement.
   * Delegates to AdapterHookService for execution logic.
   */
  public async executeForSession(
    stage: number,
    stepTag: string,
    stepOrder: StageExecutionStep,
    sessionId: string,
    gatewayId: string,
    contextId?: string,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<AdapterHookResult | undefined> {
    if (!this.hasAdaptersConfigured()) {
      return undefined;
    }

    const bindings = this.getBindingsForExecutionPoint(stage, stepTag, stepOrder);
    if (bindings.length === 0) {
      return undefined;
    }

    const deadlineMs = this.resolveInboundDeadlineMs(stage, stepTag, stepOrder);

    // Delegate execution to the hook service
    return this.hookService.executeWithDeadline({
      bindings,
      sessionId,
      contextId,
      gatewayId,
      stage,
      stepTag,
      stepOrder,
      deadlineMs,
      metadata,
      payload,
    });
  }

  /**
   * Convenience method to execute adapters at "before" execution point for a session.
   */
  public async executeBeforeForSession(
    stage: number,
    stepTag: string,
    sessionId: string,
    gatewayId: string,
    contextId?: string,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeForSession(
      stage,
      stepTag,
      "before",
      sessionId,
      gatewayId,
      contextId,
      metadata,
      payload,
    );
  }

  /**
   * Convenience method to execute adapters at "after" execution point for a session.
   */
  public async executeAfterForSession(
    stage: number,
    stepTag: string,
    sessionId: string,
    gatewayId: string,
    contextId?: string,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeForSession(
      stage,
      stepTag,
      "after",
      sessionId,
      gatewayId,
      contextId,
      metadata,
      payload,
    );
  }

  /**
   * Convenience method to execute adapters at "during" execution point for a session.
   */
  public async executeDuringForSession(
    stage: number,
    stepTag: string,
    sessionId: string,
    gatewayId: string,
    contextId?: string,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeForSession(
      stage,
      stepTag,
      "during",
      sessionId,
      gatewayId,
      contextId,
      metadata,
      payload,
    );
  }

  /**
   * Convenience method to execute adapters at "rollback" execution point for a session.
   */
  public async executeRollbackForSession(
    stage: number,
    stepTag: string,
    sessionId: string,
    gatewayId: string,
    contextId?: string,
    metadata?: Record<string, unknown>,
    payload?: Record<string, unknown>,
  ): Promise<AdapterHookResult | undefined> {
    return this.executeForSession(
      stage,
      stepTag,
      "rollback",
      sessionId,
      gatewayId,
      contextId,
      metadata,
      payload,
    );
  }

  /** Derives the smallest inbound timeout defined across adapters for an execution point. */
  private resolveInboundDeadlineMs(
    stage: number,
    stepTag: string,
    stepOrder: StageExecutionStep,
  ): number | undefined {
    const bindings = this.getBindingsForExecutionPoint(stage, stepTag, stepOrder);
    if (bindings.length === 0) {
      return undefined;
    }
    const globalTimeout = this.config.global?.timeoutMs;
    let effectiveDeadline: number | undefined;
    for (const binding of bindings) {
      const inbound = binding.adapter.inboundWebhook;
      if (!inbound) {
        continue;
      }
      const candidate =
        inbound.inboundDeadlineMs ?? inbound.timeoutMs ?? globalTimeout;
      if (!candidate || candidate <= 0) {
        continue;
      }
      effectiveDeadline =
        typeof effectiveDeadline === "number"
          ? Math.min(effectiveDeadline, candidate)
          : candidate;
    }
    return effectiveDeadline;
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
