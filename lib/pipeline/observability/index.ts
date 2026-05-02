/**
 * Unified Observability Interface
 * 
 * Provides a single entry point for all observability features:
 * - Metrics collection
 * - Structured logging
 * - Distributed tracing
 * 
 * This module combines MetricsCollector, PipelineLogger, and PipelineTracer
 * into a cohesive observability system with automatic correlation between
 * metrics, logs, and traces.
 * 
 * @module pipeline/observability
 */

import {
  PipelinePhase,
  PipelineContext,
  PhaseResult,
  PipelineMetrics,
  ObservabilityConfig,
} from '../types';

import { MetricsCollector } from './metrics';
import { PipelineLogger, LogLevel, LoggerConfig } from './logger';
import { PipelineTracer, Span, SpanKind, Trace } from './tracer';

// Re-export types and classes for convenience
export { MetricsCollector } from './metrics';
export { PipelineLogger, LogLevel } from './logger';
export { PipelineTracer, SpanKind, SpanStatus } from './tracer';
export type { Span, Trace } from './tracer';

// ============================================================================
// Observability Manager
// ============================================================================

/**
 * Unified observability manager that coordinates metrics, logging, and tracing
 * 
 * @example
 * ```typescript
 * const observability = createObservability({
 *   metrics: true,
 *   logging: true,
 *   tracing: true,
 *   logLevel: 'INFO'
 * });
 * 
 * // Start phase with automatic instrumentation
 * const span = observability.startPhase(
 *   PipelinePhase.INPUT_ANALYSIS,
 *   context
 * );
 * 
 * // ... phase execution ...
 * 
 * // End phase with automatic metrics and logging
 * observability.endPhase(
 *   PipelinePhase.INPUT_ANALYSIS,
 *   result,
 *   span.spanId
 * );
 * 
 * // Get comprehensive metrics
 * const metrics = observability.getMetrics();
 * ```
 */
export class ObservabilityManager {
  private readonly metrics: MetricsCollector;
  private readonly logger: PipelineLogger;
  private readonly tracer: PipelineTracer;
  private readonly config: Required<ObservabilityConfig>;
  private rootSpan?: Span;

  constructor(config: ObservabilityConfig) {
    this.config = {
      metrics: config.metrics ?? true,
      tracing: config.tracing ?? true,
      logging: config.logging ?? true,
      logLevel: config.logLevel || 'INFO',
    };

    // Initialize components
    this.metrics = new MetricsCollector();
    
    const loggerConfig: Partial<LoggerConfig> = {
      level: this.mapLogLevel(this.config.logLevel),
      prettyPrint: process.env.NODE_ENV !== 'production',
      includeTimestamp: true,
      includeStackTrace: true,
      output: 'console',
    };
    this.logger = new PipelineLogger(loggerConfig);
    
    this.tracer = new PipelineTracer();
  }

  // ==========================================================================
  // Unified Phase Instrumentation
  // ==========================================================================

  /**
   * Start a pipeline phase with full instrumentation
   * 
   * @param phase - Phase starting
   * @param context - Pipeline context
   * @returns Span for the phase
   */
  startPhase(phase: PipelinePhase, context: PipelineContext): Span {
    // Update logger context
    if (this.config.logging) {
      this.logger.updateFromPipelineContext(context);
      this.logger.phaseStart(phase, context);
    }

    // Record metrics
    if (this.config.metrics) {
      this.metrics.recordPhaseStart(phase);
    }

    // Start trace span
    let span: Span;
    if (this.config.tracing) {
      const parentSpanId = this.rootSpan?.spanId;
      span = this.tracer.startSpan(
        `phase-${phase.toLowerCase()}`,
        parentSpanId,
        SpanKind.INTERNAL,
        {
          'phase.name': phase,
          'execution.id': context.executionId,
          'trace.id': context.trace.traceId,
        }
      );

      // Store root span if this is the first phase
      if (!this.rootSpan) {
        this.rootSpan = span;
      }
    } else {
      // Create a dummy span if tracing is disabled
      span = {
        spanId: 'dummy',
        traceId: context.trace.traceId,
        name: phase,
        kind: SpanKind.INTERNAL,
        startTime: Date.now(),
        status: 0 as any,
        attributes: {},
        events: [],
        links: [],
      };
    }

    return span;
  }

  /**
   * End a pipeline phase with full instrumentation
   * 
   * @param phase - Phase ending
   * @param result - Phase result
   * @param spanId - Span ID from startPhase
   */
  endPhase(phase: PipelinePhase, result: PhaseResult<any>, spanId: string): void {
    const duration = result.duration;
    const success = result.success;

    // Record metrics
    if (this.config.metrics) {
      this.metrics.recordPhaseEnd(phase, success, duration);
      
      if (result.metrics.cacheHit) {
        this.metrics.recordPhaseCacheHit(phase);
      }
      
      if (result.metrics.retryCount > 0) {
        for (let i = 0; i < result.metrics.retryCount; i++) {
          this.metrics.recordPhaseRetry(phase);
        }
      }
      
      if (result.metrics.resourceUsage) {
        this.metrics.recordPhaseResourceUsage(phase, result.metrics.resourceUsage);
      }
      
      if (result.error) {
        this.metrics.recordError(phase, result.error.error);
      }
    }

    // Log phase completion
    if (this.config.logging) {
      this.logger.phaseEnd(phase, result);
    }

    // End trace span
    if (this.config.tracing) {
      this.tracer.addSpanAttributes(spanId, {
        'phase.status': result.status,
        'phase.duration': duration,
        'phase.success': success,
        'phase.retry_count': result.metrics.retryCount,
        'phase.cache_hit': result.metrics.cacheHit,
      });

      if (result.error) {
        this.tracer.addSpanEvent(spanId, 'error', {
          'error.type': result.error.error.name,
          'error.message': result.error.error.message,
        });
      }

      this.tracer.endSpan(spanId, success, result.error?.error.message);
    }
  }

  /**
   * Record a phase checkpoint
   * 
   * @param phase - Current phase
   * @param checkpointId - Checkpoint identifier
   * @param spanId - Current span ID
   */
  recordCheckpoint(phase: PipelinePhase, checkpointId: string, spanId: string): void {
    if (this.config.logging) {
      this.logger.phaseCheckpoint(phase, checkpointId);
    }

    if (this.config.tracing) {
      this.tracer.addSpanEvent(spanId, 'checkpoint', {
        'checkpoint.id': checkpointId,
        'checkpoint.phase': phase,
      });
    }
  }

  // ==========================================================================
  // AI Call Instrumentation
  // ==========================================================================

  /**
   * Record an AI model call
   * 
   * @param model - Model identifier
   * @param tokens - Tokens used
   * @param cost - Cost in USD
   * @param duration - Call duration in ms
   * @param spanId - Current span ID (optional)
   */
  recordAICall(
    model: string,
    tokens: number,
    cost: number,
    duration: number,
    spanId?: string
  ): void {
    if (this.config.metrics) {
      this.metrics.recordAICall(model, tokens, cost, duration);
    }

    if (this.config.logging) {
      this.logger.aiCall(model, tokens, duration, { cost });
    }

    if (this.config.tracing && spanId) {
      this.tracer.addSpanEvent(spanId, 'ai-call', {
        'ai.model': model,
        'ai.tokens': tokens,
        'ai.cost': cost,
        'ai.duration': duration,
      });
    }
  }

  // ==========================================================================
  // Cache Instrumentation
  // ==========================================================================

  /**
   * Record a cache hit
   * 
   * @param cacheType - Type of cache
   * @param key - Cache key (optional)
   * @param spanId - Current span ID (optional)
   */
  recordCacheHit(cacheType: string, key?: string, spanId?: string): void {
    if (this.config.metrics) {
      this.metrics.recordCacheHit(cacheType);
    }

    if (this.config.logging) {
      this.logger.cacheOperation('hit', cacheType, key || 'unknown');
    }

    if (this.config.tracing && spanId) {
      this.tracer.addSpanEvent(spanId, 'cache-hit', {
        'cache.type': cacheType,
        'cache.key': key,
      });
    }
  }

  /**
   * Record a cache miss
   * 
   * @param cacheType - Type of cache
   * @param key - Cache key (optional)
   * @param spanId - Current span ID (optional)
   */
  recordCacheMiss(cacheType: string, key?: string, spanId?: string): void {
    if (this.config.metrics) {
      this.metrics.recordCacheMiss(cacheType);
    }

    if (this.config.logging) {
      this.logger.cacheOperation('miss', cacheType, key || 'unknown');
    }

    if (this.config.tracing && spanId) {
      this.tracer.addSpanEvent(spanId, 'cache-miss', {
        'cache.type': cacheType,
        'cache.key': key,
      });
    }
  }

  // ==========================================================================
  // Error Instrumentation
  // ==========================================================================

  /**
   * Record an error
   * 
   * @param phase - Phase where error occurred
   * @param error - Error object
   * @param spanId - Current span ID (optional)
   */
  recordError(phase: PipelinePhase, error: Error, spanId?: string): void {
    if (this.config.metrics) {
      this.metrics.recordError(phase, error);
    }

    if (this.config.logging) {
      this.logger.error(`Error in ${phase}`, error, { phase });
    }

    if (this.config.tracing && spanId) {
      this.tracer.addSpanEvent(spanId, 'error', {
        'error.type': error.name,
        'error.message': error.message,
        'error.phase': phase,
      });
    }
  }

  // ==========================================================================
  // Direct Access to Components
  // ==========================================================================

  /**
   * Get the metrics collector
   */
  getMetricsCollector(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Get the logger
   */
  getLogger(): PipelineLogger {
    return this.logger;
  }

  /**
   * Get the tracer
   */
  getTracer(): PipelineTracer {
    return this.tracer;
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  /**
   * Get comprehensive pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return this.metrics.getMetrics();
  }

  /**
   * Get the current trace
   */
  getTrace(): Trace | undefined {
    return this.rootSpan ? this.tracer.getTrace(this.rootSpan.traceId) : undefined;
  }

  /**
   * Export all observability data
   */
  exportAll(): {
    metrics: PipelineMetrics;
    logs: string;
    trace?: string;
  } {
    return {
      metrics: this.metrics.getMetrics(),
      logs: this.logger.exportLogs(true),
      trace: this.rootSpan ? this.tracer.exportTrace(this.rootSpan.traceId) : undefined,
    };
  }

  /**
   * Reset all observability data
   */
  reset(): void {
    this.metrics.reset();
    this.logger.clearLogBuffer();
    this.tracer.clear();
    this.rootSpan = undefined;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private mapLogLevel(level: string): LogLevel {
    const mapping: Record<string, LogLevel> = {
      'DEBUG': LogLevel.DEBUG,
      'INFO': LogLevel.INFO,
      'WARN': LogLevel.WARN,
      'ERROR': LogLevel.ERROR,
    };
    return mapping[level] || LogLevel.INFO;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new observability manager
 * 
 * @param config - Observability configuration
 * @returns Configured observability manager
 * 
 * @example
 * ```typescript
 * const observability = createObservability({
 *   metrics: true,
 *   logging: true,
 *   tracing: true,
 *   logLevel: 'INFO'
 * });
 * ```
 */
export function createObservability(config: ObservabilityConfig): ObservabilityManager {
  return new ObservabilityManager(config);
}

// ============================================================================
// Default Instance (Optional)
// ============================================================================

let defaultObservability: ObservabilityManager | null = null;

/**
 * Get or create the default observability instance
 * 
 * @param config - Optional configuration for first initialization
 * @returns Default observability instance
 */
export function getDefaultObservability(config?: ObservabilityConfig): ObservabilityManager {
  if (!defaultObservability) {
    defaultObservability = createObservability(config || {
      metrics: true,
      logging: true,
      tracing: true,
      logLevel: 'INFO',
    });
  }
  return defaultObservability;
}

/**
 * Reset the default observability instance
 */
export function resetDefaultObservability(): void {
  defaultObservability = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a minimal observability instance for testing
 * 
 * @returns Observability manager with minimal configuration
 */
export function createMinimalObservability(): ObservabilityManager {
  return createObservability({
    metrics: true,
    logging: false,
    tracing: false,
    logLevel: 'ERROR',
  });
}

/**
 * Create a full observability instance for production
 * 
 * @returns Observability manager with full configuration
 */
export function createProductionObservability(): ObservabilityManager {
  return createObservability({
    metrics: true,
    logging: true,
    tracing: true,
    logLevel: process.env.LOG_LEVEL as any || 'INFO',
  });
}

/**
 * Create an observability instance for development
 * 
 * @returns Observability manager with debug configuration
 */
export function createDevelopmentObservability(): ObservabilityManager {
  return createObservability({
    metrics: true,
    logging: true,
    tracing: true,
    logLevel: 'DEBUG',
  });
}

// Made with Bob
