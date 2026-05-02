/**
 * Structured Logging System
 * 
 * Provides comprehensive structured logging for pipeline execution with:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Context enrichment (executionId, phase, traceId)
 * - JSON-formatted output
 * - Configurable output destinations
 * - Phase lifecycle logging
 * - Performance-optimized
 * 
 * @module pipeline/observability/logger
 */

import {
  PipelinePhase,
  PipelineContext,
  PhaseResult,
} from '../types';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Structured log entry
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  
  /** Log level */
  readonly level: LogLevel;
  
  /** Log message */
  readonly message: string;
  
  /** Execution context */
  readonly context: LogContext;
  
  /** Additional metadata */
  readonly metadata?: Record<string, any>;
  
  /** Error details (for ERROR level) */
  readonly error?: ErrorDetails;
}

/**
 * Log context information
 */
interface LogContext {
  /** Pipeline execution ID */
  readonly executionId?: string;
  
  /** Current phase */
  readonly phase?: PipelinePhase;
  
  /** Distributed trace ID */
  readonly traceId?: string;
  
  /** Span ID */
  readonly spanId?: string;
  
  /** Tenant/user ID */
  readonly tenantId?: string;
}

/**
 * Error details for structured logging
 */
interface ErrorDetails {
  /** Error name/type */
  readonly name: string;
  
  /** Error message */
  readonly message: string;
  
  /** Stack trace */
  readonly stack?: string;
  
  /** Error code */
  readonly code?: string;
  
  /** Additional error context */
  readonly context?: Record<string, any>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  readonly level: LogLevel;
  
  /** Enable pretty printing (vs compact JSON) */
  readonly prettyPrint: boolean;
  
  /** Include timestamps */
  readonly includeTimestamp: boolean;
  
  /** Include stack traces for errors */
  readonly includeStackTrace: boolean;
  
  /** Output destination */
  readonly output: LogOutput;
  
  /** Custom context to include in all logs */
  readonly globalContext?: Record<string, any>;
}

/**
 * Log output destination
 */
export type LogOutput = 'console' | 'file' | 'external' | ((entry: LogEntry) => void);

// ============================================================================
// PipelineLogger Class
// ============================================================================

/**
 * Structured logger for pipeline execution
 * 
 * @example
 * ```typescript
 * const logger = new PipelineLogger({
 *   level: LogLevel.INFO,
 *   prettyPrint: true,
 *   output: 'console'
 * });
 * 
 * logger.info('Pipeline started', { repoUrl: 'https://github.com/...' });
 * logger.phaseStart(PipelinePhase.INPUT_ANALYSIS, context);
 * logger.error('Phase failed', error, { phase: PipelinePhase.INPUT_ANALYSIS });
 * ```
 */
export class PipelineLogger {
  private readonly config: LoggerConfig;
  private context: LogContext;
  private readonly logBuffer: LogEntry[];
  private readonly levelPriority: Map<LogLevel, number>;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: config?.level || LogLevel.INFO,
      prettyPrint: config?.prettyPrint ?? false,
      includeTimestamp: config?.includeTimestamp ?? true,
      includeStackTrace: config?.includeStackTrace ?? true,
      output: config?.output || 'console',
      globalContext: config?.globalContext,
    };

    this.context = {};
    this.logBuffer = [];
    
    // Set up level priorities for filtering
    this.levelPriority = new Map([
      [LogLevel.DEBUG, 0],
      [LogLevel.INFO, 1],
      [LogLevel.WARN, 2],
      [LogLevel.ERROR, 3],
    ]);
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Set the current logging context
   * 
   * @param context - Context to set
   */
  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Update context from pipeline context
   * 
   * @param pipelineContext - Pipeline context
   */
  updateFromPipelineContext(pipelineContext: PipelineContext): void {
    this.setContext({
      executionId: pipelineContext.executionId,
      phase: pipelineContext.currentPhase || undefined,
      traceId: pipelineContext.trace.traceId,
      spanId: pipelineContext.trace.spanId,
      tenantId: pipelineContext.input.tenantId,
    });
  }

  /**
   * Clear the current context
   */
  clearContext(): void {
    this.context = {};
  }

  // ==========================================================================
  // Core Logging Methods
  // ==========================================================================

  /**
   * Log a debug message
   * 
   * @param message - Log message
   * @param metadata - Additional metadata
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log an info message
   * 
   * @param message - Log message
   * @param metadata - Additional metadata
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log a warning message
   * 
   * @param message - Log message
   * @param metadata - Additional metadata
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log an error message
   * 
   * @param message - Log message
   * @param error - Error object (optional)
   * @param metadata - Additional metadata
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorDetails = error ? this.extractErrorDetails(error) : undefined;
    this.log(LogLevel.ERROR, message, metadata, errorDetails);
  }

  // ==========================================================================
  // Phase Lifecycle Logging
  // ==========================================================================

  /**
   * Log the start of a pipeline phase
   * 
   * @param phase - The phase starting
   * @param context - Pipeline context
   */
  phaseStart(phase: PipelinePhase, context: PipelineContext): void {
    this.setContext({
      executionId: context.executionId,
      phase,
      traceId: context.trace.traceId,
      spanId: context.trace.spanId,
    });

    this.info(`Phase ${phase} started`, {
      phase,
      executionId: context.executionId,
      previousPhase: context.currentPhase,
    });
  }

  /**
   * Log the end of a pipeline phase
   * 
   * @param phase - The phase ending
   * @param result - Phase execution result
   */
  phaseEnd(phase: PipelinePhase, result: PhaseResult<any>): void {
    const level = result.success ? LogLevel.INFO : LogLevel.ERROR;
    const message = result.success 
      ? `Phase ${phase} completed successfully`
      : `Phase ${phase} failed`;

    this.log(level, message, {
      phase,
      status: result.status,
      duration: result.duration,
      retryCount: result.metrics.retryCount,
      cacheHit: result.metrics.cacheHit,
      warnings: result.warnings,
    }, result.error ? this.extractErrorDetails(result.error.error) : undefined);
  }

  /**
   * Log a phase checkpoint
   * 
   * @param phase - Current phase
   * @param checkpointId - Checkpoint identifier
   * @param metadata - Additional metadata
   */
  phaseCheckpoint(phase: PipelinePhase, checkpointId: string, metadata?: Record<string, any>): void {
    this.debug(`Phase ${phase} checkpoint created`, {
      phase,
      checkpointId,
      ...metadata,
    });
  }

  // ==========================================================================
  // Specialized Logging
  // ==========================================================================

  /**
   * Log an AI model call
   * 
   * @param model - Model identifier
   * @param tokens - Tokens used
   * @param duration - Call duration in ms
   * @param metadata - Additional metadata
   */
  aiCall(model: string, tokens: number, duration: number, metadata?: Record<string, any>): void {
    this.debug('AI model call', {
      model,
      tokens,
      duration,
      ...metadata,
    });
  }

  /**
   * Log a cache operation
   * 
   * @param operation - Cache operation (hit/miss)
   * @param cacheType - Type of cache
   * @param key - Cache key
   */
  cacheOperation(operation: 'hit' | 'miss', cacheType: string, key: string): void {
    this.debug(`Cache ${operation}`, {
      cacheType,
      key,
      operation,
    });
  }

  /**
   * Log a validation result
   * 
   * @param valid - Whether validation passed
   * @param errors - Validation errors
   * @param warnings - Validation warnings
   */
  validation(valid: boolean, errors: any[], warnings: any[]): void {
    const level = valid ? LogLevel.INFO : LogLevel.WARN;
    this.log(level, `Validation ${valid ? 'passed' : 'failed'}`, {
      valid,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors: errors.slice(0, 5), // Limit to first 5
      warnings: warnings.slice(0, 5),
    });
  }

  // ==========================================================================
  // Log Management
  // ==========================================================================

  /**
   * Get all buffered log entries
   * 
   * @returns Array of log entries
   */
  getLogBuffer(): readonly LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * Clear the log buffer
   */
  clearLogBuffer(): void {
    this.logBuffer.length = 0;
  }

  /**
   * Export logs as JSON string
   * 
   * @param pretty - Whether to pretty-print
   * @returns JSON string of all logs
   */
  exportLogs(pretty: boolean = false): string {
    return JSON.stringify(this.logBuffer, null, pretty ? 2 : 0);
  }

  /**
   * Filter logs by level
   * 
   * @param level - Minimum log level
   * @returns Filtered log entries
   */
  filterByLevel(level: LogLevel): LogEntry[] {
    const minPriority = this.levelPriority.get(level) || 0;
    return this.logBuffer.filter(entry => {
      const entryPriority = this.levelPriority.get(entry.level) || 0;
      return entryPriority >= minPriority;
    });
  }

  /**
   * Filter logs by phase
   * 
   * @param phase - Pipeline phase
   * @returns Filtered log entries
   */
  filterByPhase(phase: PipelinePhase): LogEntry[] {
    return this.logBuffer.filter(entry => entry.context.phase === phase);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: ErrorDetails
  ): void {
    // Check if this log level should be output
    const configPriority = this.levelPriority.get(this.config.level) || 0;
    const logPriority = this.levelPriority.get(level) || 0;
    
    if (logPriority < configPriority) {
      return; // Skip logs below configured level
    }

    // Create log entry
    const entry: LogEntry = {
      timestamp: this.config.includeTimestamp ? new Date().toISOString() : '',
      level,
      message,
      context: {
        ...this.context,
        ...this.config.globalContext,
      },
      metadata,
      error,
    };

    // Add to buffer
    this.logBuffer.push(entry);

    // Output the log
    this.output(entry);
  }

  private output(entry: LogEntry): void {
    const output = this.config.output;

    if (typeof output === 'function') {
      // Custom output function
      output(entry);
    } else if (output === 'console') {
      // Console output
      this.outputToConsole(entry);
    } else if (output === 'file') {
      // File output would be implemented here
      // For now, fall back to console
      this.outputToConsole(entry);
    } else if (output === 'external') {
      // External service output would be implemented here
      // For now, just buffer
    }
  }

  private outputToConsole(entry: LogEntry): void {
    const formatted = this.config.prettyPrint
      ? this.formatPretty(entry)
      : this.formatCompact(entry);

    // Use appropriate console method based on level
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  private formatPretty(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp and level
    if (entry.timestamp) {
      parts.push(`[${entry.timestamp}]`);
    }
    parts.push(`[${entry.level}]`);

    // Context
    if (entry.context.phase) {
      parts.push(`[${entry.context.phase}]`);
    }
    if (entry.context.executionId) {
      parts.push(`[${entry.context.executionId.substring(0, 8)}]`);
    }

    // Message
    parts.push(entry.message);

    let output = parts.join(' ');

    // Metadata
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += '\n  ' + JSON.stringify(entry.metadata, null, 2).split('\n').join('\n  ');
    }

    // Error
    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (this.config.includeStackTrace && entry.error.stack) {
        output += '\n  ' + entry.error.stack.split('\n').join('\n  ');
      }
    }

    return output;
  }

  private formatCompact(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private extractErrorDetails(error: Error): ErrorDetails {
    return {
      name: error.name,
      message: error.message,
      stack: this.config.includeStackTrace ? error.stack : undefined,
      code: (error as any).code,
      context: (error as any).context,
    };
  }
}

// ============================================================================
// Singleton Instance (Optional)
// ============================================================================

/**
 * Default logger instance for convenience
 */
let defaultLogger: PipelineLogger | null = null;

/**
 * Get or create the default logger instance
 * 
 * @param config - Optional configuration for first initialization
 * @returns Default logger instance
 */
export function getDefaultLogger(config?: Partial<LoggerConfig>): PipelineLogger {
  if (!defaultLogger) {
    defaultLogger = new PipelineLogger(config);
  }
  return defaultLogger;
}

/**
 * Reset the default logger instance
 */
export function resetDefaultLogger(): void {
  defaultLogger = null;
}

// Made with Bob
