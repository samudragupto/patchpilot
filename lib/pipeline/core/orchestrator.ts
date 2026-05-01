/**
 * Pipeline Orchestrator
 * 
 * Central coordinator that manages the execution of all pipeline phases with
 * validation gates, error handling, state management, and observability.
 * 
 * @module pipeline/core/orchestrator
 */

import {
  PipelineInput,
  PipelineOutput,
  PipelineContext,
  PipelinePhase,
  PipelineStatus,
  PhaseResult,
  PhaseStatus,
  PipelineMetrics,
  ExecutionTimeline,
  TimelineEvent,
  QualityMetrics,
  PipelineError,
  ErrorSeverity,
  PRPackage,
} from '../types';
import { IPhase } from './phase-interface';
import { PipelineConfig, DEFAULT_PIPELINE_CONFIG, loadConfig } from './config';
import { PipelineContextManager } from './context';
import { PhaseRegistry } from './phase-registry';
import { ExecutionManager, ExecutionState } from './execution-manager';
import { ValidationGate } from './validation-gate';
import { ObservabilityManager, createObservability } from '../observability';
import { ResilienceManager, createResilience } from '../resilience';

// Import all phase implementations
import { InputAnalysisPhase } from '../phases/input-analysis';
import { AIReasoningPhase } from '../phases/ai-reasoning';
import { GraphTraversalPhase } from '../phases/graph-traversal';
import { FixGenerationPhase } from '../phases/fix-generation';
import { ValidationPhase } from '../phases/validation';
import { PRAssemblyPhase } from '../phases/pr-assembly';

// ============================================================================
// Orchestrator Types
// ============================================================================

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Pipeline configuration */
  readonly pipelineConfig?: Partial<PipelineConfig>;
  
  /** Whether to enable automatic checkpointing */
  readonly enableCheckpointing?: boolean;
  
  /** Whether to enable streaming updates */
  readonly enableStreaming?: boolean;
  
  /** Maximum concurrent executions */
  readonly maxConcurrentExecutions?: number;
}

/**
 * Progress update callback
 */
export type ProgressCallback = (update: ProgressUpdate) => void;

/**
 * Progress update information
 */
export interface ProgressUpdate {
  /** Execution ID */
  readonly executionId: string;
  
  /** Current phase */
  readonly phase: PipelinePhase | null;
  
  /** Phase status */
  readonly status: PhaseStatus;
  
  /** Progress percentage (0-100) */
  readonly progress: number;
  
  /** Current message */
  readonly message: string;
  
  /** Timestamp */
  readonly timestamp: number;
}

/**
 * Default orchestrator configuration
 */
const DEFAULT_ORCHESTRATOR_CONFIG: Required<OrchestratorConfig> = {
  pipelineConfig: DEFAULT_PIPELINE_CONFIG,
  enableCheckpointing: true,
  enableStreaming: true,
  maxConcurrentExecutions: 10,
};

// ============================================================================
// Pipeline Orchestrator Implementation
// ============================================================================

/**
 * Pipeline orchestrator that manages the complete execution lifecycle.
 * 
 * Responsibilities:
 * - Phase lifecycle management (initialize → validate → execute → finalize)
 * - Validation gates between phases
 * - Automatic checkpointing for recovery
 * - Error recovery and rollback
 * - Cancellation support
 * - Progress tracking and streaming updates
 * - Observability integration
 * - Resilience integration
 * 
 * @example
 * ```typescript
 * const orchestrator = new PipelineOrchestrator({
 *   enableCheckpointing: true,
 *   enableStreaming: true
 * });
 * 
 * // Register phases
 * orchestrator.registerPhase(inputAnalysisPhase);
 * orchestrator.registerPhase(aiReasoningPhase);
 * // ... register other phases
 * 
 * // Execute pipeline
 * const output = await orchestrator.execute(input, (update) => {
 *   console.log(`Progress: ${update.progress}% - ${update.message}`);
 * });
 * ```
 */
export class PipelineOrchestrator {
  private readonly config: Required<OrchestratorConfig>;
  private readonly contextManager: PipelineContextManager;
  private readonly phaseRegistry: PhaseRegistry;
  private readonly executionManager: ExecutionManager;
  private readonly validationGate: ValidationGate;
  private readonly observability: ObservabilityManager;
  private readonly resilience: ResilienceManager;
  private readonly progressCallbacks: Map<string, ProgressCallback>;
  private readonly activeExecutions: Set<string>;

  constructor(config: OrchestratorConfig = {}) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    
    // Initialize core components
    this.contextManager = new PipelineContextManager();
    this.phaseRegistry = PhaseRegistry.getInstance();
    this.executionManager = new ExecutionManager({
      maxHistorySize: 1000,
      maxExecutionAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    
    // Initialize validation gate
    const pipelineConfig = this.config.pipelineConfig as PipelineConfig;
    this.validationGate = new ValidationGate({
      strict: pipelineConfig.validation?.strict ?? true,
      minConfidence: 0.7,
      minTestCoverage: 0.8,
      allowWarnings: true,
    });
    
    // Initialize observability
    this.observability = createObservability(pipelineConfig.observability || {
      metrics: true,
      logging: true,
      tracing: true,
      logLevel: 'INFO',
    });
    
    // Initialize resilience
    this.resilience = createResilience({
      retry: pipelineConfig.retry,
      timeout: { timeoutMs: pipelineConfig.timeout?.pipeline || 1800000 },
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
      },
      features: {
        retry: true,
        circuitBreaker: true,
        timeout: true,
        fallback: true,
      },
    });
    
    this.progressCallbacks = new Map();
    this.activeExecutions = new Set();
  }

  /**
   * Register a phase with the orchestrator
   * 
   * @param phase - Phase to register
   */
  registerPhase(phase: IPhase<any, any>): void {
    this.phaseRegistry.registerPhase(phase);
  }

  /**
   * Execute the complete pipeline
   * 
   * @param input - Pipeline input
   * @param progressCallback - Optional progress callback
   * @returns Pipeline output
   */
  async execute(
    input: PipelineInput,
    progressCallback?: ProgressCallback
  ): Promise<PipelineOutput> {
    // Ensure phases are registered before validation
    if (this.phaseRegistry.getAllPhases().length === 0) {
      this.registerDefaultPhases();
    }

    // Validate registry
    const registryValidation = this.phaseRegistry.validateRegistry();
    if (!registryValidation.isValid) {
      throw new Error(
        `Phase registry validation failed: ${registryValidation.errors.map(e => e.message).join(', ')}`
      );
    }

    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new Error(
        `Maximum concurrent executions (${this.config.maxConcurrentExecutions}) reached`
      );
    }

    // Merge configuration
    const config: PipelineConfig = {
      ...this.config.pipelineConfig,
      ...input.config,
    } as PipelineConfig;

    // Create initial context
    let context = this.contextManager.createContext(input, config);
    
    // Start execution tracking
    const executionId = this.executionManager.startExecution(input, context);
    this.activeExecutions.add(executionId);
    
    // Register progress callback
    if (progressCallback) {
      this.progressCallbacks.set(executionId, progressCallback);
    }

    try {
      // Update status to running
      context = this.contextManager.updateStatus(context, PipelineStatus.RUNNING);
      this.executionManager.updateExecution(executionId, { status: PipelineStatus.RUNNING, context });

      // Execute all phases in order
      const phaseOrder = this.phaseRegistry.getPhaseOrder();
      
      for (const phaseType of phaseOrder) {
        // Check if execution was cancelled
        const executionState = this.executionManager.getExecution(executionId);
        if (executionState?.status === PipelineStatus.CANCELLED) {
          throw new Error('Execution was cancelled');
        }

        // Execute phase
        context = await this.executePhase(phaseType, context);
        
        // Update execution state
        this.executionManager.updateExecution(executionId, { context, currentPhase: phaseType });
        
        // Create checkpoint if enabled
        if (this.config.enableCheckpointing) {
          context = this.contextManager.addCheckpoint(context);
        }
      }

      // Complete execution status to update context metadata
      context = this.contextManager.updateStatus(context, PipelineStatus.COMPLETED);

      // Build final output with updated context
      const output = this.buildOutput(context);
      
      this.executionManager.completeExecution(executionId, output);
      
      return output;
      
    } catch (error) {
      // Handle execution failure
      const pipelineError = error instanceof Error ? error : new Error(String(error));
      
      context = this.contextManager.updateStatus(context, PipelineStatus.FAILED);
      this.executionManager.failExecution(executionId, pipelineError);
      
      this.observability.recordError(
        context.currentPhase || PipelinePhase.INPUT_ANALYSIS,
        pipelineError
      );
      
      throw pipelineError;
      
    } finally {
      // Cleanup
      this.activeExecutions.delete(executionId);
      this.progressCallbacks.delete(executionId);
    }
  }

  /**
   * Execute a single phase with full lifecycle management
   * 
   * @param phaseType - Phase to execute
   * @param context - Current pipeline context
   * @returns Updated context with phase results
   */
  async executePhase<T>(
    phaseType: PipelinePhase,
    context: PipelineContext
  ): Promise<PipelineContext> {
    const phase = this.phaseRegistry.getPhase(phaseType);
    
    if (!phase) {
      throw new Error(`Phase ${phaseType} is not registered`);
    }

    // Update current phase
    context = this.contextManager.updateCurrentPhase(context, phaseType);
    
    // Emit progress update
    this.emitProgress(context.executionId, phaseType, PhaseStatus.RUNNING, 'Starting phase');

    // Start observability tracking
    const span = this.observability.startPhase(phaseType, context);

    try {
      // Execute phase with resilience
      const resilienceResult = await this.resilience.executeResilientWithResult(
        () => phase.execute(context),
        {
          operationName: `phase-${phaseType}`,
          timeoutMs: this.getPhaseTimeout(phaseType),
          useCircuitBreaker: true,
        }
      );

      // Check if phase succeeded
      if (!resilienceResult.success || !resilienceResult.value) {
        throw resilienceResult.error || new Error(`Phase ${phaseType} failed`);
      }

      const phaseResult = resilienceResult.value;

      // End observability tracking
      this.observability.endPhase(phaseType, phaseResult, span.spanId);

      // Update context with phase output before validation so validation gates can inspect it
      context = this.contextManager.setPhaseData(context, phaseType, phaseResult.data);
      context = this.contextManager.updatePhaseTiming(context, phaseType, phaseResult.duration);

      // Validate phase transition to next phase
      const nextPhase = this.phaseRegistry.getNextPhase(phaseType);
      if (nextPhase) {
        const validationResult = await this.validatePhaseTransition(context, nextPhase);
        if (!validationResult) {
          throw new Error(`Validation failed for transition ${phaseType} -> ${nextPhase}`);
        }
      }

      // Emit progress update
      const progress = this.calculateProgress(context);
      this.emitProgress(context.executionId, phaseType, PhaseStatus.COMPLETED, 'Phase completed', progress);

      return context;
      
    } catch (error) {
      // Handle phase error
      const phaseError = error instanceof Error ? error : new Error(String(error));
      
      await this.handlePhaseError(phaseType, phaseError, context);
      
      throw phaseError;
    }
  }

  /**
   * Validate phase transition
   * 
   * @param context - Current context
   * @param nextPhase - Next phase to transition to
   * @returns True if validation passed
   */
  async validatePhaseTransition(
    context: PipelineContext,
    nextPhase: PipelinePhase
  ): Promise<boolean> {
    const result = await this.validationGate.validate(context, nextPhase);
    
    if (!result.isValid) {
      this.observability.getLogger().warn(
        `Validation failed for transition to ${nextPhase}`,
        { errors: result.errors, warnings: result.warnings }
      );
    }
    
    return result.isValid;
  }

  /**
   * Handle phase error with recovery strategies
   * 
   * @param phase - Phase where error occurred
   * @param error - Error that occurred
   * @param context - Current context
   */
  async handlePhaseError(
    phase: PipelinePhase,
    error: Error,
    context: PipelineContext
  ): Promise<void> {
    const pipelineError: PipelineError = {
      phase,
      error,
      severity: ErrorSeverity.HIGH,
      timestamp: Date.now(),
      recoverable: false,
    };

    // Add error to context
    this.contextManager.addError(context, pipelineError);

    // Log error
    this.observability.getLogger().error(
      `Phase ${phase} failed`,
      error,
      { phase, executionId: context.executionId }
    );

    // Emit progress update
    this.emitProgress(context.executionId, phase, PhaseStatus.FAILED, `Phase failed: ${error.message}`);
  }

  /**
   * Cancel an active execution
   * 
   * @param executionId - Execution ID to cancel
   */
  async cancel(executionId: string): Promise<void> {
    const execution = this.executionManager.getExecution(executionId);
    
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== PipelineStatus.RUNNING && execution.status !== PipelineStatus.PENDING) {
      throw new Error(`Execution ${executionId} is not active (status: ${execution.status})`);
    }

    // Cancel execution
    this.executionManager.cancelExecution(executionId);
    this.activeExecutions.delete(executionId);
    
    this.observability.getLogger().info(`Execution ${executionId} cancelled`);
  }

  /**
   * Get execution status
   * 
   * @param executionId - Execution ID
   * @returns Pipeline status
   */
  getStatus(executionId: string): PipelineStatus {
    const execution = this.executionManager.getExecution(executionId);
    
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    return execution.status;
  }

  /**
   * Resume execution from a checkpoint
   * 
   * @param checkpointId - Checkpoint ID to resume from
   * @returns Pipeline output
   */
  async resume(checkpointId: string): Promise<PipelineOutput> {
    // Restore context from checkpoint
    const context = await this.contextManager.restoreFromCheckpoint(checkpointId);
    
    // Create new execution from restored context
    const input = context.input;
    
    // Continue execution from current phase
    return this.execute(input);
  }

  /**
   * Get execution state
   * 
   * @param executionId - Execution ID
   * @returns Execution state
   */
  getExecutionState(executionId: string): ExecutionState | undefined {
    return this.executionManager.getExecution(executionId);
  }

  /**
   * List active executions
   * 
   * @returns Array of active execution states
   */
  listActiveExecutions(): ExecutionState[] {
    return this.executionManager.listActiveExecutions();
  }

  /**
   * Get orchestrator metrics
   * 
   * @returns Comprehensive metrics
   */
  getMetrics(): {
    pipeline: PipelineMetrics;
    executions: ReturnType<ExecutionManager['getStatistics']>;
    resilience: ReturnType<ResilienceManager['getMetrics']>;
  } {
    return {
      pipeline: this.observability.getMetrics(),
      executions: this.executionManager.getStatistics(),
      resilience: this.resilience.getMetrics(),
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Build final pipeline output
   */
  private buildOutput(context: PipelineContext): PipelineOutput {
    const prAssembly = context.phaseOutputs.prAssembly;
    
    if (!prAssembly) {
      throw new Error('PR assembly phase did not produce output');
    }

    const metrics = this.observability.getMetrics();
    const timeline = this.buildTimeline(context);
    const quality = this.calculateQuality(context);

    return {
      prPackage: prAssembly.prPackage,
      metrics,
      timeline,
      quality,
    };
  }

  /**
   * Build execution timeline
   */
  private buildTimeline(context: PipelineContext): ExecutionTimeline {
    const events: TimelineEvent[] = [];
    const phaseOrder = this.phaseRegistry.getPhaseOrder();

    for (const phase of phaseOrder) {
      const timing = context.metadata.phaseTimings[phase];
      if (timing !== undefined) {
        events.push({
          timestamp: context.metadata.startTime + timing,
          phase,
          event: 'START',
          message: `Phase ${phase} started`,
        });
        
        events.push({
          timestamp: context.metadata.startTime + timing,
          phase,
          event: 'END',
          message: `Phase ${phase} completed`,
        });
      }
    }

    return {
      events,
      totalDuration: context.metadata.duration || 0,
      criticalPath: phaseOrder,
    };
  }

  /**
   * Calculate quality metrics
   */
  private calculateQuality(context: PipelineContext): QualityMetrics {
    const validation = context.phaseOutputs.validation;
    const aiReasoning = context.phaseOutputs.aiReasoning;

    const testCoverage = validation?.testResults
      ? validation.testResults.filter(t => t.status === 'PASSED').length / validation.testResults.length
      : 0;

    const confidence = aiReasoning?.confidence || 0;
    const securityScore = validation?.securityScan?.score || 0;
    const codeQuality = validation?.lintResults
      ? validation.lintResults.reduce((sum, r) => sum + r.score, 0) / validation.lintResults.length
      : 0;

    const overallScore = (testCoverage + confidence + securityScore + codeQuality) / 4;

    return {
      overallScore,
      confidence,
      testCoverage,
      codeQuality,
      securityScore,
    };
  }

  /**
   * Calculate execution progress
   */
  private calculateProgress(context: PipelineContext): number {
    const phaseOrder = this.phaseRegistry.getPhaseOrder();
    const completedPhases = phaseOrder.filter(
      phase => this.contextManager.getPhaseData(context, phase) !== undefined
    ).length;

    return Math.round((completedPhases / phaseOrder.length) * 100);
  }

  /**
   * Emit progress update
   */
  private emitProgress(
    executionId: string,
    phase: PipelinePhase | null,
    status: PhaseStatus,
    message: string,
    progress?: number
  ): void {
    const callback = this.progressCallbacks.get(executionId);
    
    if (callback && this.config.enableStreaming) {
      const execution = this.executionManager.getExecution(executionId);
      const calculatedProgress = progress ?? (execution ? this.calculateProgress(execution.context) : 0);
      
      callback({
        executionId,
        phase,
        status,
        progress: calculatedProgress,
        message,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get phase timeout from configuration
   */
  private getPhaseTimeout(phase: PipelinePhase): number {
    const config = this.config.pipelineConfig as PipelineConfig;
    return config.timeout?.phase[phase] || 300000; // Default 5 minutes
  }
  /**
   * Register default phases if none are registered
   */
  private registerDefaultPhases(): void {
    if (!this.phaseRegistry.hasPhase(PipelinePhase.INPUT_ANALYSIS)) this.phaseRegistry.registerPhase(new InputAnalysisPhase());
    if (!this.phaseRegistry.hasPhase(PipelinePhase.AI_REASONING)) this.phaseRegistry.registerPhase(new AIReasoningPhase());
    if (!this.phaseRegistry.hasPhase(PipelinePhase.GRAPH_TRAVERSAL)) this.phaseRegistry.registerPhase(new GraphTraversalPhase());
    if (!this.phaseRegistry.hasPhase(PipelinePhase.FIX_GENERATION)) this.phaseRegistry.registerPhase(new FixGenerationPhase());
    if (!this.phaseRegistry.hasPhase(PipelinePhase.VALIDATION)) this.phaseRegistry.registerPhase(new ValidationPhase());
    if (!this.phaseRegistry.hasPhase(PipelinePhase.PR_ASSEMBLY)) this.phaseRegistry.registerPhase(new PRAssemblyPhase());
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a pipeline orchestrator instance
 * 
 * @param config - Orchestrator configuration
 * @returns New orchestrator instance
 */
export function createOrchestrator(config?: OrchestratorConfig): PipelineOrchestrator {
  return new PipelineOrchestrator(config);
}

/**
 * Create and configure a complete orchestrator with all phases
 * 
 * @param phases - Array of phases to register
 * @param config - Orchestrator configuration
 * @returns Configured orchestrator
 */
export function createConfiguredOrchestrator(
  phases: IPhase<any, any>[],
  config?: OrchestratorConfig
): PipelineOrchestrator {
  const orchestrator = new PipelineOrchestrator(config);
  
  for (const phase of phases) {
    orchestrator.registerPhase(phase);
  }
  
  return orchestrator;
}

// Made with Bob