/**
 * Execution Manager
 * 
 * Manages pipeline execution state, tracking active executions, history,
 * and providing execution lifecycle management.
 * 
 * @module pipeline/core/execution-manager
 */

import { randomUUID } from 'crypto';
import {
  PipelineInput,
  PipelineOutput,
  PipelineStatus,
  PipelinePhase,
  PipelineContext,
  PipelineError,
} from '../types';

// ============================================================================
// Execution State Types
// ============================================================================

/**
 * Execution state tracking
 */
export interface ExecutionState {
  /** Unique execution identifier */
  readonly executionId: string;
  
  /** Current execution status */
  readonly status: PipelineStatus;
  
  /** Current phase being executed */
  readonly currentPhase: PipelinePhase | null;
  
  /** Pipeline context */
  readonly context: PipelineContext;
  
  /** Execution start time */
  readonly startTime: number;
  
  /** Execution end time (if completed/failed) */
  readonly endTime?: number;
  
  /** Execution duration in milliseconds */
  readonly duration?: number;
  
  /** Error if execution failed */
  readonly error?: Error;
  
  /** Final output if completed */
  readonly output?: PipelineOutput;
  
  /** Execution metadata */
  readonly metadata: ExecutionMetadata;
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
  /** Tenant/user identifier */
  readonly tenantId?: string;
  
  /** Correlation ID for request tracking */
  readonly correlationId?: string;
  
  /** Tags for categorization */
  readonly tags: string[];
  
  /** Custom metadata */
  readonly custom: Record<string, unknown>;
}

/**
 * Execution statistics
 */
export interface ExecutionStatistics {
  /** Total executions */
  readonly total: number;
  
  /** Active executions */
  readonly active: number;
  
  /** Completed executions */
  readonly completed: number;
  
  /** Failed executions */
  readonly failed: number;
  
  /** Cancelled executions */
  readonly cancelled: number;
  
  /** Average execution duration */
  readonly avgDuration: number;
  
  /** Success rate (0-1) */
  readonly successRate: number;
}

/**
 * Execution query options
 */
export interface ExecutionQueryOptions {
  /** Filter by status */
  readonly status?: PipelineStatus;
  
  /** Filter by tenant ID */
  readonly tenantId?: string;
  
  /** Filter by tags */
  readonly tags?: string[];
  
  /** Limit number of results */
  readonly limit?: number;
  
  /** Sort order */
  readonly sortBy?: 'startTime' | 'endTime' | 'duration';
  
  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Execution Manager Implementation
// ============================================================================

/**
 * Execution manager for tracking and managing pipeline executions.
 * 
 * Provides centralized execution state management with support for:
 * - Execution lifecycle tracking
 * - Concurrent execution management
 * - Execution history and cleanup
 * - Query and filtering capabilities
 * - Statistics and metrics
 * 
 * @example
 * ```typescript
 * const manager = new ExecutionManager();
 * 
 * // Start new execution
 * const executionId = manager.startExecution(input);
 * 
 * // Update execution state
 * manager.updateExecution(executionId, {
 *   currentPhase: PipelinePhase.AI_REASONING,
 *   status: PipelineStatus.RUNNING
 * });
 * 
 * // Complete execution
 * manager.completeExecution(executionId, output);
 * 
 * // Get execution state
 * const state = manager.getExecution(executionId);
 * ```
 */
export class ExecutionManager {
  private readonly executions: Map<string, ExecutionState>;
  private readonly maxHistorySize: number;
  private readonly maxExecutionAge: number; // milliseconds

  constructor(options: {
    maxHistorySize?: number;
    maxExecutionAge?: number;
  } = {}) {
    this.executions = new Map();
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.maxExecutionAge = options.maxExecutionAge || 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Start a new execution
   * 
   * @param input - Pipeline input
   * @param context - Optional initial context
   * @returns Execution ID
   */
  startExecution(input: PipelineInput, context?: PipelineContext): string {
    const executionId = randomUUID();
    const startTime = Date.now();

    const state: ExecutionState = {
      executionId,
      status: PipelineStatus.PENDING,
      currentPhase: null,
      context: context || this.createInitialContext(executionId, input),
      startTime,
      metadata: {
        tenantId: input.tenantId,
        correlationId: input.correlationId || randomUUID(),
        tags: [],
        custom: {},
      },
    };

    this.executions.set(executionId, state);
    
    // Cleanup old executions if needed
    this.cleanupIfNeeded();

    return executionId;
  }

  /**
   * Update execution state
   * 
   * @param executionId - Execution ID
   * @param updates - Partial state updates
   */
  updateExecution(
    executionId: string,
    updates: Partial<Omit<ExecutionState, 'executionId' | 'startTime' | 'metadata'>>
  ): void {
    const state = this.executions.get(executionId);
    
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const updatedState: ExecutionState = {
      ...state,
      ...updates,
      executionId: state.executionId,
      startTime: state.startTime,
      metadata: state.metadata,
    };

    this.executions.set(executionId, updatedState);
  }

  /**
   * Get execution state
   * 
   * @param executionId - Execution ID
   * @returns Execution state or undefined
   */
  getExecution(executionId: string): ExecutionState | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Complete execution successfully
   * 
   * @param executionId - Execution ID
   * @param output - Pipeline output
   */
  completeExecution(executionId: string, output: PipelineOutput): void {
    const state = this.executions.get(executionId);
    
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const endTime = Date.now();
    const duration = endTime - state.startTime;

    this.executions.set(executionId, {
      ...state,
      status: PipelineStatus.COMPLETED,
      endTime,
      duration,
      output,
    });
  }

  /**
   * Fail execution with error
   * 
   * @param executionId - Execution ID
   * @param error - Error that caused failure
   */
  failExecution(executionId: string, error: Error): void {
    const state = this.executions.get(executionId);
    
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const endTime = Date.now();
    const duration = endTime - state.startTime;

    this.executions.set(executionId, {
      ...state,
      status: PipelineStatus.FAILED,
      endTime,
      duration,
      error,
    });
  }

  /**
   * Cancel execution
   * 
   * @param executionId - Execution ID
   */
  cancelExecution(executionId: string): void {
    const state = this.executions.get(executionId);
    
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const endTime = Date.now();
    const duration = endTime - state.startTime;

    this.executions.set(executionId, {
      ...state,
      status: PipelineStatus.CANCELLED,
      endTime,
      duration,
    });
  }

  /**
   * List active executions
   * 
   * @returns Array of active execution states
   */
  listActiveExecutions(): ExecutionState[] {
    return Array.from(this.executions.values()).filter(
      state => state.status === PipelineStatus.RUNNING || state.status === PipelineStatus.PENDING
    );
  }

  /**
   * List all executions with optional filtering
   * 
   * @param options - Query options
   * @returns Array of execution states
   */
  listExecutions(options: ExecutionQueryOptions = {}): ExecutionState[] {
    let executions = Array.from(this.executions.values());

    // Apply filters
    if (options.status) {
      executions = executions.filter(e => e.status === options.status);
    }

    if (options.tenantId) {
      executions = executions.filter(e => e.metadata.tenantId === options.tenantId);
    }

    if (options.tags && options.tags.length > 0) {
      executions = executions.filter(e =>
        options.tags!.some(tag => e.metadata.tags.includes(tag))
      );
    }

    // Apply sorting
    if (options.sortBy) {
      const sortOrder = options.sortOrder || 'desc';
      executions.sort((a, b) => {
        let aValue: number;
        let bValue: number;

        switch (options.sortBy) {
          case 'startTime':
            aValue = a.startTime;
            bValue = b.startTime;
            break;
          case 'endTime':
            aValue = a.endTime || 0;
            bValue = b.endTime || 0;
            break;
          case 'duration':
            aValue = a.duration || 0;
            bValue = b.duration || 0;
            break;
          default:
            return 0;
        }

        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      });
    }

    // Apply limit
    if (options.limit) {
      executions = executions.slice(0, options.limit);
    }

    return executions;
  }

  /**
   * Get execution statistics
   * 
   * @returns Execution statistics
   */
  getStatistics(): ExecutionStatistics {
    const executions = Array.from(this.executions.values());
    const total = executions.length;
    
    const active = executions.filter(
      e => e.status === PipelineStatus.RUNNING || e.status === PipelineStatus.PENDING
    ).length;
    
    const completed = executions.filter(e => e.status === PipelineStatus.COMPLETED).length;
    const failed = executions.filter(e => e.status === PipelineStatus.FAILED).length;
    const cancelled = executions.filter(e => e.status === PipelineStatus.CANCELLED).length;

    const completedExecutions = executions.filter(e => e.duration !== undefined);
    const avgDuration = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / completedExecutions.length
      : 0;

    const successRate = total > 0 ? completed / total : 0;

    return {
      total,
      active,
      completed,
      failed,
      cancelled,
      avgDuration,
      successRate,
    };
  }

  /**
   * Delete execution from history
   * 
   * @param executionId - Execution ID to delete
   * @returns True if deleted, false if not found
   */
  deleteExecution(executionId: string): boolean {
    return this.executions.delete(executionId);
  }

  /**
   * Clean up old executions
   * 
   * @param maxAge - Maximum age in milliseconds (optional, uses default if not provided)
   * @returns Number of executions cleaned up
   */
  cleanupOldExecutions(maxAge?: number): number {
    const cutoffTime = Date.now() - (maxAge || this.maxExecutionAge);
    let cleanedCount = 0;

    const entries = Array.from(this.executions.entries());
    for (const [id, state] of entries) {
      // Only cleanup completed/failed/cancelled executions
      if (
        state.status !== PipelineStatus.RUNNING &&
        state.status !== PipelineStatus.PENDING &&
        state.startTime < cutoffTime
      ) {
        this.executions.delete(id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Clear all executions
   */
  clearAll(): void {
    this.executions.clear();
  }

  /**
   * Get execution count
   * 
   * @returns Total number of tracked executions
   */
  getExecutionCount(): number {
    return this.executions.size;
  }

  /**
   * Check if execution exists
   * 
   * @param executionId - Execution ID
   * @returns True if execution exists
   */
  hasExecution(executionId: string): boolean {
    return this.executions.has(executionId);
  }

  /**
   * Add tag to execution
   * 
   * @param executionId - Execution ID
   * @param tag - Tag to add
   */
  addTag(executionId: string, tag: string): void {
    const state = this.executions.get(executionId);
    
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (!state.metadata.tags.includes(tag)) {
      this.executions.set(executionId, {
        ...state,
        metadata: {
          ...state.metadata,
          tags: [...state.metadata.tags, tag],
        },
      });
    }
  }

  /**
   * Remove tag from execution
   * 
   * @param executionId - Execution ID
   * @param tag - Tag to remove
   */
  removeTag(executionId: string, tag: string): void {
    const state = this.executions.get(executionId);
    
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    this.executions.set(executionId, {
      ...state,
      metadata: {
        ...state.metadata,
        tags: state.metadata.tags.filter(t => t !== tag),
      },
    });
  }

  /**
   * Set custom metadata
   * 
   * @param executionId - Execution ID
   * @param key - Metadata key
   * @param value - Metadata value
   */
  setMetadata(executionId: string, key: string, value: unknown): void {
    const state = this.executions.get(executionId);
    
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }

    this.executions.set(executionId, {
      ...state,
      metadata: {
        ...state.metadata,
        custom: {
          ...state.metadata.custom,
          [key]: value,
        },
      },
    });
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Create initial context for execution
   */
  private createInitialContext(executionId: string, input: PipelineInput): PipelineContext {
    return {
      executionId,
      input,
      config: input.config || {} as any,
      status: PipelineStatus.PENDING,
      currentPhase: null,
      phaseOutputs: {},
      metadata: {
        startTime: Date.now(),
        phaseTimings: {} as any,
        retryCount: 0,
        version: '1.0.0',
      },
      trace: {
        traceId: randomUUID(),
        spanId: randomUUID(),
      },
      errors: [],
      warnings: [],
      checkpoints: [],
    };
  }

  /**
   * Cleanup if history size exceeds limit
   */
  private cleanupIfNeeded(): void {
    if (this.executions.size > this.maxHistorySize) {
      // Remove oldest completed/failed/cancelled executions
      const sortedExecutions = Array.from(this.executions.entries())
        .filter(([_, state]) => 
          state.status !== PipelineStatus.RUNNING &&
          state.status !== PipelineStatus.PENDING
        )
        .sort(([_, a], [__, b]) => a.startTime - b.startTime);

      const toRemove = sortedExecutions.slice(0, Math.floor(this.maxHistorySize * 0.2));
      toRemove.forEach(([id]) => this.executions.delete(id));
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an execution manager instance
 * 
 * @param options - Configuration options
 * @returns New execution manager
 */
export function createExecutionManager(options?: {
  maxHistorySize?: number;
  maxExecutionAge?: number;
}): ExecutionManager {
  return new ExecutionManager(options);
}

/**
 * Format execution duration for display
 * 
 * @param duration - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(duration: number): string {
  if (duration < 1000) {
    return `${duration}ms`;
  }
  
  const seconds = Math.floor(duration / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Get execution summary
 * 
 * @param state - Execution state
 * @returns Summary object
 */
export function getExecutionSummary(state: ExecutionState): Record<string, unknown> {
  return {
    executionId: state.executionId,
    status: state.status,
    currentPhase: state.currentPhase,
    duration: state.duration ? formatDuration(state.duration) : 'In progress',
    startTime: new Date(state.startTime).toISOString(),
    endTime: state.endTime ? new Date(state.endTime).toISOString() : undefined,
    hasError: !!state.error,
    errorMessage: state.error?.message,
  };
}

// Made with Bob