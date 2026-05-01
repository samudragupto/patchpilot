/**
 * Phase Interface and Base Implementation
 * 
 * This module defines the core interface that all pipeline phases must implement,
 * along with a base abstract class providing common functionality.
 * 
 * @module pipeline/core/phase-interface
 */

import {
  PipelinePhase,
  PhaseStatus,
  PhaseResult,
  PhaseMetrics,
  PipelineContext,
  ValidationResult,
  ValidationError,
  ValidationType,
  PipelineError,
  ErrorSeverity,
  ResourceUsage,
} from '../types';

// ============================================================================
// Phase Configuration
// ============================================================================

/**
 * Configuration for a pipeline phase
 */
export interface PhaseConfig {
  /** Phase name for identification */
  readonly name: string;
  
  /** Phase version for compatibility tracking */
  readonly version: string;
  
  /** Maximum execution time in milliseconds */
  readonly timeout: number;
  
  /** Whether to enable caching for this phase */
  readonly cacheEnabled: boolean;
  
  /** Cache TTL in seconds */
  readonly cacheTTL?: number;
  
  /** Maximum retry attempts */
  readonly maxRetries: number;
  
  /** Retry delay in milliseconds */
  readonly retryDelay: number;
  
  /** Whether this phase can be skipped on error */
  readonly optional: boolean;
  
  /** Custom configuration */
  readonly custom?: Record<string, unknown>;
}

/**
 * Error handling strategy
 */
export enum ErrorHandlingStrategy {
  /** Retry the phase execution */
  RETRY = 'RETRY',
  
  /** Skip this phase and continue */
  SKIP = 'SKIP',
  
  /** Fail the entire pipeline */
  FAIL = 'FAIL',
  
  /** Use fallback logic */
  FALLBACK = 'FALLBACK',
  
  /** Rollback and retry */
  ROLLBACK = 'ROLLBACK',
}

// ============================================================================
// Phase Interface
// ============================================================================

/**
 * Core interface that all pipeline phases must implement.
 * 
 * @template TInput - The input type for this phase
 * @template TOutput - The output type for this phase
 * 
 * @example
 * ```typescript
 * class MyPhase implements IPhase<MyInput, MyOutput> {
 *   readonly name = 'my-phase';
 *   readonly phase = PipelinePhase.INPUT_ANALYSIS;
 *   
 *   async execute(context: PipelineContext): Promise<PhaseResult<MyOutput>> {
 *     // Implementation
 *   }
 *   
 *   async validate(input: MyInput): Promise<ValidationResult> {
 *     // Validation logic
 *   }
 * }
 * ```
 */
export interface IPhase<TInput, TOutput> {
  /**
   * Human-readable phase name
   */
  readonly name: string;
  
  /**
   * Phase identifier from PipelinePhase enum
   */
  readonly phase: PipelinePhase;
  
  /**
   * Phase configuration
   */
  readonly config: PhaseConfig;
  
  /**
   * Execute the phase logic
   * 
   * @param context - Current pipeline context
   * @returns Phase execution result
   */
  execute(context: PipelineContext): Promise<PhaseResult<TOutput>>;
  
  /**
   * Validate input before execution
   * 
   * @param input - Input to validate
   * @returns Validation result
   */
  validate(input: TInput): Promise<ValidationResult>;
  
  /**
   * Validate output after execution
   * 
   * @param output - Output to validate
   * @returns Validation result
   */
  validateOutput?(output: TOutput): Promise<ValidationResult>;
  
  /**
   * Handle errors that occur during execution
   * 
   * @param error - The error that occurred
   * @param context - Current pipeline context
   * @returns Error handling strategy to apply
   */
  handleError?(error: Error, context: PipelineContext): Promise<ErrorHandlingStrategy>;
  
  /**
   * Rollback changes made by this phase
   * Used when pipeline needs to recover from errors
   * 
   * @param context - Current pipeline context
   */
  rollback?(context: PipelineContext): Promise<void>;
  
  /**
   * Get current phase metrics
   * 
   * @returns Current metrics for this phase
   */
  getMetrics?(): PhaseMetrics;
  
  /**
   * Cleanup resources used by this phase
   */
  cleanup?(): Promise<void>;
}

// ============================================================================
// Base Phase Implementation
// ============================================================================

/**
 * Abstract base class providing common functionality for all phases.
 * Implements standard patterns for validation, error handling, and metrics.
 * 
 * @template TInput - The input type for this phase
 * @template TOutput - The output type for this phase
 * 
 * @example
 * ```typescript
 * class MyPhase extends BasePhase<MyInput, MyOutput> {
 *   constructor() {
 *     super(PipelinePhase.INPUT_ANALYSIS, {
 *       name: 'my-phase',
 *       version: '1.0.0',
 *       timeout: 30000,
 *       // ... other config
 *     });
 *   }
 *   
 *   protected async executePhase(
 *     input: MyInput,
 *     context: PipelineContext
 *   ): Promise<MyOutput> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export abstract class BasePhase<TInput, TOutput> implements IPhase<TInput, TOutput> {
  public readonly name: string;
  public readonly phase: PipelinePhase;
  public readonly config: PhaseConfig;
  
  protected startTime: number = 0;
  protected endTime: number = 0;
  protected retryCount: number = 0;
  protected cacheHit: boolean = false;
  
  /**
   * Create a new phase instance
   * 
   * @param phase - Phase identifier
   * @param config - Phase configuration
   */
  constructor(phase: PipelinePhase, config: PhaseConfig) {
    this.phase = phase;
    this.name = config.name;
    this.config = config;
  }
  
  /**
   * Execute the phase with built-in error handling, validation, and metrics
   * 
   * @param context - Current pipeline context
   * @returns Phase execution result
   */
  public async execute(context: PipelineContext): Promise<PhaseResult<TOutput>> {
    this.startTime = Date.now();
    
    try {
      // Extract input for this phase
      const input = this.extractInput(context);
      
      // Validate input
      const validationResult = await this.validate(input);
      if (!validationResult.isValid) {
        return this.createFailureResult(
          new Error(`Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`),
          PhaseStatus.FAILED
        );
      }
      
      // Execute phase logic with timeout
      const output = await this.executeWithTimeout(input, context);
      
      // Validate output if validator exists
      let outputWarnings: string[] | undefined;
      if (typeof this.validateOutput === 'function') {
        const outputValidation = await this.validateOutput(output);
        if (!outputValidation.isValid) {
          return this.createFailureResult(
            new Error(`Output validation failed: ${outputValidation.errors.map((e: ValidationError) => e.message).join(', ')}`),
            PhaseStatus.FAILED
          );
        }
        // Convert ValidationWarning[] to string[]
        outputWarnings = outputValidation.warnings?.map(w => w.message);
      }
      
      this.endTime = Date.now();
      
      // Extract warnings from context metadata if present
      const contextWarnings = (context.metadata as any)?.warnings as string[] | undefined;
      const allWarnings = [...(contextWarnings || []), ...(outputWarnings || [])];
      
      return this.createSuccessResult(output, allWarnings.length > 0 ? allWarnings : undefined);
      
    } catch (error) {
      this.endTime = Date.now();
      
      // Handle error using strategy
      const strategy = await this.handleError(
        error instanceof Error ? error : new Error(String(error)),
        context
      );
      
      if (strategy === ErrorHandlingStrategy.RETRY && this.retryCount < this.config.maxRetries) {
        this.retryCount++;
        await this.delay(this.config.retryDelay * this.retryCount);
        return this.execute(context);
      }
      
      if (strategy === ErrorHandlingStrategy.SKIP) {
        return this.createSkippedResult();
      }
      
      return this.createFailureResult(
        error instanceof Error ? error : new Error(String(error)),
        PhaseStatus.FAILED
      );
    }
  }
  
  /**
   * Validate input (must be implemented by subclasses)
   *
   * @param input - Input to validate
   * @returns Validation result
   */
  public abstract validate(input: TInput): Promise<ValidationResult>;
  
  /**
   * Validate output (optional, can be overridden by subclasses)
   *
   * @param output - Output to validate
   * @returns Validation result
   */
  public async validateOutput?(output: TOutput): Promise<ValidationResult>;
  
  /**
   * Execute the core phase logic (must be implemented by subclasses)
   * 
   * @param input - Phase input
   * @param context - Pipeline context
   * @returns Phase output
   */
  protected abstract executePhase(input: TInput, context: PipelineContext): Promise<TOutput>;
  
  /**
   * Extract input for this phase from the pipeline context
   * 
   * @param context - Pipeline context
   * @returns Phase input
   */
  protected abstract extractInput(context: PipelineContext): TInput;
  
  /**
   * Handle errors with default strategy
   * Can be overridden by subclasses for custom error handling
   * 
   * @param error - The error that occurred
   * @param context - Pipeline context
   * @returns Error handling strategy
   */
  public async handleError(error: Error, context: PipelineContext): Promise<ErrorHandlingStrategy> {
    // Default strategy: retry on transient errors, fail on others
    if (this.isTransientError(error)) {
      return ErrorHandlingStrategy.RETRY;
    }
    
    if (this.config.optional) {
      return ErrorHandlingStrategy.SKIP;
    }
    
    return ErrorHandlingStrategy.FAIL;
  }
  
  /**
   * Get current phase metrics
   *
   * @returns Phase metrics
   */
  public getMetrics(): PhaseMetrics {
    const duration = this.endTime > 0 && this.startTime > 0
      ? Math.max(1, this.endTime - this.startTime)
      : 0;
    
    return {
      phase: this.phase,
      startTime: this.startTime,
      endTime: this.endTime,
      duration,
      retryCount: this.retryCount,
      cacheHit: this.cacheHit,
      resourceUsage: this.getResourceUsage(),
    };
  }
  
  /**
   * Cleanup resources (default implementation does nothing)
   */
  public async cleanup(): Promise<void> {
    // Override in subclasses if cleanup is needed
  }
  
  // ============================================================================
  // Protected Helper Methods
  // ============================================================================
  
  /**
   * Execute phase with timeout protection
   */
  protected async executeWithTimeout(input: TInput, context: PipelineContext): Promise<TOutput> {
    return Promise.race([
      this.executePhase(input, context),
      this.createTimeoutPromise(),
    ]);
  }
  
  /**
   * Create a timeout promise that rejects after configured timeout
   */
  protected createTimeoutPromise(): Promise<TOutput> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Phase ${this.name} timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });
  }
  
  /**
   * Create a successful phase result
   */
  protected createSuccessResult(data: TOutput, warnings?: string[]): PhaseResult<TOutput> {
    return {
      success: true,
      data,
      metrics: this.getMetrics(),
      duration: Math.max(1, this.endTime - this.startTime),
      status: PhaseStatus.COMPLETED,
      warnings,
    };
  }
  
  /**
   * Create a failed phase result
   */
  protected createFailureResult(error: Error, status: PhaseStatus): PhaseResult<TOutput> {
    const pipelineError: PipelineError = {
      phase: this.phase,
      error,
      severity: ErrorSeverity.HIGH,
      timestamp: Date.now(),
      recoverable: this.isTransientError(error),
    };
    
    return {
      success: false,
      error: pipelineError,
      metrics: this.getMetrics(),
      duration: Math.max(1, this.endTime - this.startTime),
      status,
    };
  }
  
  /**
   * Create a skipped phase result
   */
  protected createSkippedResult(): PhaseResult<TOutput> {
    return {
      success: true,
      metrics: this.getMetrics(),
      duration: Math.max(1, this.endTime - this.startTime),
      status: PhaseStatus.SKIPPED,
    };
  }
  
  /**
   * Create a validation result
   */
  protected createValidationResult(
    isValid: boolean,
    errors: ValidationError[] = [],
    warnings: string[] = []
  ): ValidationResult {
    return {
      isValid,
      errors,
      warnings: warnings.map(w => ({ field: '', message: w })),
    };
  }
  
  /**
   * Create a validation error
   */
  protected createValidationError(
    field: string,
    type: ValidationType,
    message: string,
    value?: unknown
  ): ValidationError {
    return {
      field,
      type,
      message,
      value,
    };
  }
  
  /**
   * Check if an error is transient (retryable)
   */
  protected isTransientError(error: Error): boolean {
    const transientPatterns = [
      /timeout/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i,
      /rate limit/i,
      /429/,
      /503/,
    ];
    
    return transientPatterns.some(pattern => pattern.test(error.message));
  }
  
  /**
   * Get resource usage for this phase
   */
  protected getResourceUsage(): ResourceUsage {
    // Default implementation - override in subclasses for accurate tracking
    return {
      cpuTime: 0,
      memoryUsed: 0,
      apiCalls: 0,
    };
  }
  
  /**
   * Delay execution for specified milliseconds
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Validate required field
   */
  protected validateRequired(field: string, value: unknown): ValidationError | null {
    if (value === undefined || value === null || value === '') {
      return this.createValidationError(
        field,
        ValidationType.REQUIRED_FIELD,
        `${field} is required`
      );
    }
    return null;
  }
  
  /**
   * Validate string format
   */
  protected validateFormat(field: string, value: string, pattern: RegExp): ValidationError | null {
    if (!pattern.test(value)) {
      return this.createValidationError(
        field,
        ValidationType.INVALID_FORMAT,
        `${field} has invalid format`,
        value
      );
    }
    return null;
  }
  
  /**
   * Validate numeric range
   */
  protected validateRange(
    field: string,
    value: number,
    min: number,
    max: number
  ): ValidationError | null {
    if (value < min || value > max) {
      return this.createValidationError(
        field,
        ValidationType.OUT_OF_RANGE,
        `${field} must be between ${min} and ${max}`,
        value
      );
    }
    return null;
  }
}

// ============================================================================
// Phase Factory
// ============================================================================

/**
 * Factory for creating phase instances
 */
export interface IPhaseFactory {
  /**
   * Create a phase instance
   * 
   * @param phase - Phase identifier
   * @param config - Phase configuration
   * @returns Phase instance
   */
  createPhase<TInput, TOutput>(
    phase: PipelinePhase,
    config?: Partial<PhaseConfig>
  ): IPhase<TInput, TOutput>;
}

/**
 * Default phase configuration values
 */
export const DEFAULT_PHASE_CONFIG: PhaseConfig = {
  name: 'unnamed-phase',
  version: '1.0.0',
  timeout: 300000, // 5 minutes
  cacheEnabled: true,
  cacheTTL: 3600, // 1 hour
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  optional: false,
};

/**
 * Create a phase configuration with defaults
 * 
 * @param config - Partial configuration
 * @returns Complete configuration with defaults
 */
export function createPhaseConfig(config: Partial<PhaseConfig>): PhaseConfig {
  return {
    ...DEFAULT_PHASE_CONFIG,
    ...config,
  };
}

// Made with Bob
