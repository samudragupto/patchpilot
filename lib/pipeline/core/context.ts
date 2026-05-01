/**
 * Pipeline Context Management
 * 
 * This module provides context management functionality for the pipeline system,
 * including context creation, updates, checkpointing, and recovery.
 * 
 * @module pipeline/core/context
 */

import { randomUUID } from 'crypto';
import {
  PipelineContext,
  PipelineInput,
  PipelineConfig,
  PipelineStatus,
  PipelinePhase,
  PhaseOutputs,
  PipelineMetadata,
  TraceContext,
  Checkpoint,
  PipelineError,
} from '../types';

// ============================================================================
// Context Manager Interface
// ============================================================================

/**
 * Interface for pipeline context management operations
 */
export interface IPipelineContextManager {
  /**
   * Create a new pipeline context from input
   */
  createContext(input: PipelineInput, config: PipelineConfig): PipelineContext;
  
  /**
   * Update context with partial changes (immutable)
   */
  updateContext(
    context: PipelineContext,
    updates: Partial<PipelineContext>
  ): PipelineContext;
  
  /**
   * Get phase-specific data from context
   */
  getPhaseData<T>(context: PipelineContext, phase: PipelinePhase): T | undefined;
  
  /**
   * Set phase-specific data in context
   */
  setPhaseData<T>(
    context: PipelineContext,
    phase: PipelinePhase,
    data: T
  ): PipelineContext;
  
  /**
   * Add a checkpoint for recovery
   */
  addCheckpoint(context: PipelineContext): PipelineContext;
  
  /**
   * Restore context from a checkpoint
   */
  restoreFromCheckpoint(checkpointId: string): Promise<PipelineContext>;
  
  /**
   * Add an error to the context
   */
  addError(context: PipelineContext, error: PipelineError): PipelineContext;
  
  /**
   * Add a warning to the context
   */
  addWarning(context: PipelineContext, warning: string): PipelineContext;
  
  /**
   * Update pipeline status
   */
  updateStatus(context: PipelineContext, status: PipelineStatus): PipelineContext;
  
  /**
   * Update current phase
   */
  updateCurrentPhase(
    context: PipelineContext,
    phase: PipelinePhase | null
  ): PipelineContext;
}

// ============================================================================
// Context Manager Implementation
// ============================================================================

/**
 * Pipeline context manager providing immutable context operations
 * and checkpoint/recovery functionality.
 * 
 * @example
 * ```typescript
 * const manager = new PipelineContextManager();
 * 
 * // Create initial context
 * const context = manager.createContext(input, config);
 * 
 * // Update with phase data
 * const updated = manager.setPhaseData(
 *   context,
 *   PipelinePhase.INPUT_ANALYSIS,
 *   analysisResult
 * );
 * 
 * // Create checkpoint
 * const withCheckpoint = manager.addCheckpoint(updated);
 * ```
 */
export class PipelineContextManager implements IPipelineContextManager {
  private checkpointStore: Map<string, Checkpoint> = new Map();
  
  /**
   * Create a new pipeline context from input
   * 
   * @param input - Pipeline input
   * @param config - Pipeline configuration
   * @returns New pipeline context
   */
  public createContext(input: PipelineInput, config: PipelineConfig): PipelineContext {
    const executionId = randomUUID();
    const traceId = randomUUID();
    const spanId = randomUUID();
    
    return {
      executionId,
      input,
      config,
      status: PipelineStatus.PENDING,
      currentPhase: null,
      phaseOutputs: {},
      metadata: this.createInitialMetadata(),
      trace: this.createTraceContext(traceId, spanId),
      errors: [],
      warnings: [],
      checkpoints: [],
    };
  }
  
  /**
   * Update context with partial changes (immutable)
   * 
   * @param context - Current context
   * @param updates - Partial updates to apply
   * @returns New context with updates applied
   */
  public updateContext(
    context: PipelineContext,
    updates: Partial<PipelineContext>
  ): PipelineContext {
    return {
      ...context,
      ...updates,
    };
  }
  
  /**
   * Get phase-specific data from context
   * 
   * @param context - Pipeline context
   * @param phase - Phase to get data for
   * @returns Phase data or undefined
   */
  public getPhaseData<T>(context: PipelineContext, phase: PipelinePhase): T | undefined {
    const phaseKey = this.getPhaseOutputKey(phase);
    return context.phaseOutputs[phaseKey] as T | undefined;
  }
  
  /**
   * Set phase-specific data in context (immutable)
   * 
   * @param context - Current context
   * @param phase - Phase to set data for
   * @param data - Phase data
   * @returns New context with phase data set
   */
  public setPhaseData<T>(
    context: PipelineContext,
    phase: PipelinePhase,
    data: T
  ): PipelineContext {
    const phaseKey = this.getPhaseOutputKey(phase);
    
    return {
      ...context,
      phaseOutputs: {
        ...context.phaseOutputs,
        [phaseKey]: data,
      },
    };
  }
  
  /**
   * Add a checkpoint for recovery (immutable)
   * 
   * @param context - Current context
   * @returns New context with checkpoint added
   */
  public addCheckpoint(context: PipelineContext): PipelineContext {
    const checkpoint = this.createCheckpoint(context);
    
    // Store checkpoint for recovery
    this.checkpointStore.set(checkpoint.id, checkpoint);
    
    return {
      ...context,
      checkpoints: [...context.checkpoints, checkpoint],
    };
  }
  
  /**
   * Restore context from a checkpoint
   * 
   * @param checkpointId - Checkpoint ID to restore from
   * @returns Restored context
   * @throws Error if checkpoint not found
   */
  public async restoreFromCheckpoint(checkpointId: string): Promise<PipelineContext> {
    const checkpoint = this.checkpointStore.get(checkpointId);
    
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    
    // Verify checkpoint integrity
    const hash = this.computeCheckpointHash(checkpoint.context);
    if (hash !== checkpoint.hash) {
      throw new Error(`Checkpoint ${checkpointId} integrity check failed`);
    }
    
    return checkpoint.context;
  }
  
  /**
   * Add an error to the context (immutable)
   * 
   * @param context - Current context
   * @param error - Error to add
   * @returns New context with error added
   */
  public addError(context: PipelineContext, error: PipelineError): PipelineContext {
    return {
      ...context,
      errors: [...context.errors, error],
    };
  }
  
  /**
   * Add a warning to the context (immutable)
   * 
   * @param context - Current context
   * @param warning - Warning message to add
   * @returns New context with warning added
   */
  public addWarning(context: PipelineContext, warning: string): PipelineContext {
    return {
      ...context,
      warnings: [...context.warnings, warning],
    };
  }
  
  /**
   * Update pipeline status (immutable)
   * 
   * @param context - Current context
   * @param status - New status
   * @returns New context with status updated
   */
  public updateStatus(context: PipelineContext, status: PipelineStatus): PipelineContext {
    // Update end time if completing or failing
    if (status === PipelineStatus.COMPLETED || status === PipelineStatus.FAILED) {
      const now = Date.now();
      return {
        ...context,
        status,
        metadata: {
          ...context.metadata,
          endTime: now,
          duration: Math.max(1, now - context.metadata.startTime),
        },
      };
    }
    
    return this.updateContext(context, { status });
  }
  
  /**
   * Update current phase (immutable)
   * 
   * @param context - Current context
   * @param phase - New current phase
   * @returns New context with current phase updated
   */
  public updateCurrentPhase(
    context: PipelineContext,
    phase: PipelinePhase | null
  ): PipelineContext {
    return {
      ...context,
      currentPhase: phase,
    };
  }
  
  /**
   * Update phase timing in metadata (immutable)
   * 
   * @param context - Current context
   * @param phase - Phase to update timing for
   * @param duration - Phase duration in milliseconds
   * @returns New context with timing updated
   */
  public updatePhaseTiming(
    context: PipelineContext,
    phase: PipelinePhase,
    duration: number
  ): PipelineContext {
    return {
      ...context,
      metadata: {
        ...context.metadata,
        phaseTimings: {
          ...context.metadata.phaseTimings,
          [phase]: duration,
        },
      },
    };
  }
  
  /**
   * Increment retry count (immutable)
   * 
   * @param context - Current context
   * @returns New context with retry count incremented
   */
  public incrementRetryCount(context: PipelineContext): PipelineContext {
    return {
      ...context,
      metadata: {
        ...context.metadata,
        retryCount: context.metadata.retryCount + 1,
      },
    };
  }
  
  /**
   * Clear all checkpoints for a given execution
   * 
   * @param executionId - Execution ID to clear checkpoints for
   */
  public clearCheckpoints(executionId: string): void {
    const idsToDelete: string[] = [];
    
    this.checkpointStore.forEach((checkpoint, id) => {
      if (checkpoint.executionId === executionId) {
        idsToDelete.push(id);
      }
    });
    
    idsToDelete.forEach(id => this.checkpointStore.delete(id));
  }
  
  /**
   * Get all checkpoints for an execution
   * 
   * @param executionId - Execution ID
   * @returns Array of checkpoints
   */
  public getCheckpoints(executionId: string): Checkpoint[] {
    const checkpoints: Checkpoint[] = [];
    
    this.checkpointStore.forEach((checkpoint) => {
      if (checkpoint.executionId === executionId) {
        checkpoints.push(checkpoint);
      }
    });
    
    return checkpoints.sort((a, b) => a.timestamp - b.timestamp);
  }
  
  /**
   * Get the latest checkpoint for an execution
   * 
   * @param executionId - Execution ID
   * @returns Latest checkpoint or undefined
   */
  public getLatestCheckpoint(executionId: string): Checkpoint | undefined {
    const checkpoints = this.getCheckpoints(executionId);
    return checkpoints[checkpoints.length - 1];
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Create initial metadata
   */
  private createInitialMetadata(): PipelineMetadata {
    return {
      startTime: Date.now(),
      phaseTimings: {} as Record<PipelinePhase, number>,
      retryCount: 0,
      version: '1.0.0',
    };
  }
  
  /**
   * Create trace context
   */
  private createTraceContext(traceId: string, spanId: string): TraceContext {
    return {
      traceId,
      spanId,
    };
  }
  
  /**
   * Get phase output key from phase enum
   */
  private getPhaseOutputKey(phase: PipelinePhase): keyof PhaseOutputs {
    const keyMap: Record<PipelinePhase, keyof PhaseOutputs> = {
      [PipelinePhase.INPUT_ANALYSIS]: 'inputAnalysis',
      [PipelinePhase.AI_REASONING]: 'aiReasoning',
      [PipelinePhase.GRAPH_TRAVERSAL]: 'graphTraversal',
      [PipelinePhase.FIX_GENERATION]: 'fixGeneration',
      [PipelinePhase.VALIDATION]: 'validation',
      [PipelinePhase.PR_ASSEMBLY]: 'prAssembly',
    };
    
    return keyMap[phase];
  }
  
  /**
   * Create a checkpoint from current context
   */
  private createCheckpoint(context: PipelineContext): Checkpoint {
    const id = randomUUID();
    const timestamp = Date.now();
    const hash = this.computeCheckpointHash(context);
    
    return {
      id,
      executionId: context.executionId,
      phase: context.currentPhase || PipelinePhase.INPUT_ANALYSIS,
      timestamp,
      context: this.cloneContext(context),
      hash,
    };
  }
  
  /**
   * Compute hash for checkpoint integrity verification
   */
  private computeCheckpointHash(context: PipelineContext): string {
    // Simple hash implementation - in production, use a proper hashing library
    const data = JSON.stringify({
      executionId: context.executionId,
      status: context.status,
      currentPhase: context.currentPhase,
      phaseOutputs: context.phaseOutputs,
    });
    
    // Simple string hash (replace with crypto hash in production)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  }
  
  /**
   * Deep clone context for checkpoint
   */
  private cloneContext(context: PipelineContext): PipelineContext {
    return JSON.parse(JSON.stringify(context));
  }
}

// ============================================================================
// Context Utilities
// ============================================================================

/**
 * Create a child trace context for nested operations
 * 
 * @param parent - Parent trace context
 * @returns Child trace context
 */
export function createChildTraceContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: randomUUID(),
    parentSpanId: parent.spanId,
    baggage: parent.baggage,
  };
}

/**
 * Check if context has errors
 * 
 * @param context - Pipeline context
 * @returns True if context has errors
 */
export function hasErrors(context: PipelineContext): boolean {
  return context.errors.length > 0;
}

/**
 * Check if context has warnings
 * 
 * @param context - Pipeline context
 * @returns True if context has warnings
 */
export function hasWarnings(context: PipelineContext): boolean {
  return context.warnings.length > 0;
}

/**
 * Get critical errors from context
 * 
 * @param context - Pipeline context
 * @returns Array of critical errors
 */
export function getCriticalErrors(context: PipelineContext): PipelineError[] {
  return context.errors.filter(e => e.severity === 'CRITICAL');
}

/**
 * Check if phase has completed
 * 
 * @param context - Pipeline context
 * @param phase - Phase to check
 * @returns True if phase has output data
 */
export function isPhaseCompleted(context: PipelineContext, phase: PipelinePhase): boolean {
  const manager = new PipelineContextManager();
  return manager.getPhaseData(context, phase) !== undefined;
}

/**
 * Get completed phases
 * 
 * @param context - Pipeline context
 * @returns Array of completed phases
 */
export function getCompletedPhases(context: PipelineContext): PipelinePhase[] {
  const phases: PipelinePhase[] = [];
  const manager = new PipelineContextManager();
  
  for (const phase of Object.values(PipelinePhase)) {
    if (manager.getPhaseData(context, phase) !== undefined) {
      phases.push(phase);
    }
  }
  
  return phases;
}

/**
 * Calculate pipeline progress percentage
 * 
 * @param context - Pipeline context
 * @returns Progress percentage (0-100)
 */
export function calculateProgress(context: PipelineContext): number {
  const totalPhases = Object.keys(PipelinePhase).length;
  const completedPhases = getCompletedPhases(context).length;
  
  return Math.round((completedPhases / totalPhases) * 100);
}

/**
 * Export context for serialization
 * 
 * @param context - Pipeline context
 * @returns Serializable context object
 */
export function exportContext(context: PipelineContext): Record<string, unknown> {
  return {
    executionId: context.executionId,
    status: context.status,
    currentPhase: context.currentPhase,
    progress: calculateProgress(context),
    startTime: context.metadata.startTime,
    duration: context.metadata.duration,
    errors: context.errors.length,
    warnings: context.warnings.length,
    checkpoints: context.checkpoints.length,
  };
}

// Made with Bob
