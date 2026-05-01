/**
 * Metrics Collection System
 * 
 * Provides comprehensive metrics collection for pipeline execution including:
 * - Phase timing and performance metrics
 * - AI call tracking (tokens, cost)
 * - Cache hit/miss rates
 * - Error tracking
 * - Custom metrics support
 * - Aggregation functions (avg, percentiles)
 * 
 * @module pipeline/observability/metrics
 */

import {
  PipelinePhase,
  PipelineMetrics,
  PhaseMetrics,
  ResourceUsage,
  PerformanceMetrics,
  CostMetrics,
  QualityMetrics,
} from '../types/index.js';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Individual metric data point
 */
interface MetricDataPoint {
  readonly timestamp: number;
  readonly value: number;
  readonly tags?: Record<string, string>;
}

/**
 * Aggregated metric statistics
 */
interface MetricStats {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

/**
 * Phase execution record
 */
interface PhaseExecution {
  readonly phase: PipelinePhase;
  readonly startTime: number;
  endTime?: number;
  duration?: number;
  success?: boolean;
  retryCount: number;
  cacheHit: boolean;
  resourceUsage: Partial<ResourceUsage>;
  customMetrics: Record<string, number>;
}

/**
 * AI call record
 */
interface AICallRecord {
  readonly timestamp: number;
  readonly model: string;
  readonly tokens: number;
  readonly cost: number;
  readonly duration: number;
}

/**
 * Cache operation record
 */
interface CacheRecord {
  readonly timestamp: number;
  readonly cacheType: string;
  readonly hit: boolean;
}

/**
 * Error record
 */
interface ErrorRecord {
  readonly timestamp: number;
  readonly phase: PipelinePhase;
  readonly error: Error;
  readonly severity: string;
}

// ============================================================================
// MetricsCollector Class
// ============================================================================

/**
 * Collects and aggregates metrics for pipeline execution
 * 
 * @example
 * ```typescript
 * const collector = new MetricsCollector();
 * 
 * collector.recordPhaseStart(PipelinePhase.INPUT_ANALYSIS);
 * // ... phase execution ...
 * collector.recordPhaseEnd(PipelinePhase.INPUT_ANALYSIS, true, 1500);
 * 
 * const metrics = collector.getMetrics();
 * console.log(`Total duration: ${metrics.totalDuration}ms`);
 * ```
 */
export class MetricsCollector {
  private readonly startTime: number;
  private readonly phaseExecutions: Map<PipelinePhase, PhaseExecution>;
  private readonly aiCalls: AICallRecord[];
  private readonly cacheRecords: CacheRecord[];
  private readonly errorRecords: ErrorRecord[];
  private readonly customMetrics: Map<string, MetricDataPoint[]>;

  constructor() {
    this.startTime = Date.now();
    this.phaseExecutions = new Map();
    this.aiCalls = [];
    this.cacheRecords = [];
    this.errorRecords = [];
    this.customMetrics = new Map();
  }

  // ==========================================================================
  // Phase Metrics
  // ==========================================================================

  /**
   * Record the start of a pipeline phase
   * 
   * @param phase - The phase that is starting
   */
  recordPhaseStart(phase: PipelinePhase): void {
    const execution: PhaseExecution = {
      phase,
      startTime: Date.now(),
      retryCount: 0,
      cacheHit: false,
      resourceUsage: {},
      customMetrics: {},
    };

    this.phaseExecutions.set(phase, execution);
  }

  /**
   * Record the end of a pipeline phase
   * 
   * @param phase - The phase that completed
   * @param success - Whether the phase succeeded
   * @param duration - Phase execution duration in milliseconds
   */
  recordPhaseEnd(phase: PipelinePhase, success: boolean, duration: number): void {
    const execution = this.phaseExecutions.get(phase);
    if (!execution) {
      console.warn(`Phase ${phase} was not started before ending`);
      return;
    }

    const endTime = Date.now();
    const updatedExecution: PhaseExecution = {
      ...execution,
      endTime,
      duration,
      success,
    };

    this.phaseExecutions.set(phase, updatedExecution);
  }

  /**
   * Record a retry attempt for a phase
   * 
   * @param phase - The phase being retried
   */
  recordPhaseRetry(phase: PipelinePhase): void {
    const execution = this.phaseExecutions.get(phase);
    if (execution) {
      this.phaseExecutions.set(phase, {
        ...execution,
        retryCount: execution.retryCount + 1,
      });
    }
  }

  /**
   * Record cache hit for a phase
   * 
   * @param phase - The phase that hit cache
   */
  recordPhaseCacheHit(phase: PipelinePhase): void {
    const execution = this.phaseExecutions.get(phase);
    if (execution) {
      this.phaseExecutions.set(phase, {
        ...execution,
        cacheHit: true,
      });
    }
  }

  /**
   * Record resource usage for a phase
   * 
   * @param phase - The phase
   * @param usage - Resource usage data
   */
  recordPhaseResourceUsage(phase: PipelinePhase, usage: Partial<ResourceUsage>): void {
    const execution = this.phaseExecutions.get(phase);
    if (execution) {
      this.phaseExecutions.set(phase, {
        ...execution,
        resourceUsage: { ...execution.resourceUsage, ...usage },
      });
    }
  }

  // ==========================================================================
  // AI Metrics
  // ==========================================================================

  /**
   * Record an AI model call
   * 
   * @param model - Model identifier
   * @param tokens - Number of tokens used
   * @param cost - Cost in USD
   * @param duration - Call duration in milliseconds (optional)
   */
  recordAICall(model: string, tokens: number, cost: number, duration: number = 0): void {
    this.aiCalls.push({
      timestamp: Date.now(),
      model,
      tokens,
      cost,
      duration,
    });
  }

  // ==========================================================================
  // Cache Metrics
  // ==========================================================================

  /**
   * Record a cache hit
   * 
   * @param cacheType - Type of cache (e.g., 'repository', 'graph', 'ai')
   */
  recordCacheHit(cacheType: string): void {
    this.cacheRecords.push({
      timestamp: Date.now(),
      cacheType,
      hit: true,
    });
  }

  /**
   * Record a cache miss
   * 
   * @param cacheType - Type of cache
   */
  recordCacheMiss(cacheType: string): void {
    this.cacheRecords.push({
      timestamp: Date.now(),
      cacheType,
      hit: false,
    });
  }

  // ==========================================================================
  // Error Metrics
  // ==========================================================================

  /**
   * Record an error that occurred during a phase
   * 
   * @param phase - The phase where error occurred
   * @param error - The error object
   * @param severity - Error severity (optional)
   */
  recordError(phase: PipelinePhase, error: Error, severity: string = 'MEDIUM'): void {
    this.errorRecords.push({
      timestamp: Date.now(),
      phase,
      error,
      severity,
    });
  }

  // ==========================================================================
  // Custom Metrics
  // ==========================================================================

  /**
   * Record a custom metric value
   * 
   * @param name - Metric name
   * @param value - Metric value
   * @param tags - Optional tags for filtering
   */
  recordCustomMetric(name: string, value: number, tags?: Record<string, string>): void {
    const dataPoints = this.customMetrics.get(name) || [];
    dataPoints.push({
      timestamp: Date.now(),
      value,
      tags,
    });
    this.customMetrics.set(name, dataPoints);
  }

  // ==========================================================================
  // Metrics Retrieval
  // ==========================================================================

  /**
   * Get comprehensive pipeline metrics
   * 
   * @returns Complete pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    const totalDuration = Math.max(1, Date.now() - this.startTime);
    const phaseMetrics = this.buildPhaseMetrics();
    const performance = this.calculatePerformanceMetrics();
    const cost = this.calculateCostMetrics();
    const quality = this.calculateQualityMetrics();

    return {
      totalDuration,
      phaseMetrics,
      performance,
      cost,
      quality,
    };
  }

  /**
   * Get metrics for a specific phase
   * 
   * @param phase - The phase to get metrics for
   * @returns Phase metrics or undefined if phase hasn't run
   */
  getPhaseMetrics(phase: PipelinePhase): PhaseMetrics | undefined {
    const execution = this.phaseExecutions.get(phase);
    if (!execution || !execution.endTime) {
      return undefined;
    }

    return {
      phase,
      startTime: execution.startTime,
      endTime: execution.endTime,
      duration: execution.duration || 0,
      retryCount: execution.retryCount,
      cacheHit: execution.cacheHit,
      resourceUsage: this.buildResourceUsage(execution),
      customMetrics: execution.customMetrics,
    };
  }

  /**
   * Get statistics for a custom metric
   * 
   * @param name - Metric name
   * @returns Metric statistics or undefined if metric doesn't exist
   */
  getCustomMetricStats(name: string): MetricStats | undefined {
    const dataPoints = this.customMetrics.get(name);
    if (!dataPoints || dataPoints.length === 0) {
      return undefined;
    }

    return this.calculateStats(dataPoints.map(dp => dp.value));
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  /**
   * Reset all collected metrics
   */
  reset(): void {
    this.phaseExecutions.clear();
    this.aiCalls.length = 0;
    this.cacheRecords.length = 0;
    this.errorRecords.length = 0;
    this.customMetrics.clear();
  }

  // ==========================================================================
  // Export Formats
  // ==========================================================================

  /**
   * Export metrics in Prometheus format
   * 
   * @returns Prometheus-formatted metrics string
   */
  exportPrometheus(): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    // Pipeline duration
    lines.push(`# HELP pipeline_duration_ms Total pipeline execution duration`);
    lines.push(`# TYPE pipeline_duration_ms gauge`);
    lines.push(`pipeline_duration_ms ${Date.now() - this.startTime} ${timestamp}`);

    // Phase metrics
    for (const [phase, execution] of this.phaseExecutions) {
      if (execution.duration) {
        lines.push(`# HELP phase_duration_ms Phase execution duration`);
        lines.push(`# TYPE phase_duration_ms gauge`);
        lines.push(`phase_duration_ms{phase="${phase}"} ${execution.duration} ${timestamp}`);
      }
    }

    // AI metrics
    const totalTokens = this.aiCalls.reduce((sum, call) => sum + call.tokens, 0);
    const totalCost = this.aiCalls.reduce((sum, call) => sum + call.cost, 0);
    
    lines.push(`# HELP ai_tokens_total Total AI tokens used`);
    lines.push(`# TYPE ai_tokens_total counter`);
    lines.push(`ai_tokens_total ${totalTokens} ${timestamp}`);
    
    lines.push(`# HELP ai_cost_total Total AI cost in USD`);
    lines.push(`# TYPE ai_cost_total counter`);
    lines.push(`ai_cost_total ${totalCost} ${timestamp}`);

    // Cache metrics
    const cacheHits = this.cacheRecords.filter(r => r.hit).length;
    const cacheMisses = this.cacheRecords.filter(r => !r.hit).length;
    const cacheHitRate = cacheHits + cacheMisses > 0 
      ? cacheHits / (cacheHits + cacheMisses) 
      : 0;

    lines.push(`# HELP cache_hit_rate Cache hit rate`);
    lines.push(`# TYPE cache_hit_rate gauge`);
    lines.push(`cache_hit_rate ${cacheHitRate} ${timestamp}`);

    // Error count
    lines.push(`# HELP error_count_total Total errors`);
    lines.push(`# TYPE error_count_total counter`);
    lines.push(`error_count_total ${this.errorRecords.length} ${timestamp}`);

    return lines.join('\n');
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private buildPhaseMetrics(): Record<PipelinePhase, PhaseMetrics> {
    const metrics: Partial<Record<PipelinePhase, PhaseMetrics>> = {};

    for (const phase of Object.values(PipelinePhase)) {
      const phaseMetric = this.getPhaseMetrics(phase);
      if (phaseMetric) {
        metrics[phase] = phaseMetric;
      }
    }

    return metrics as Record<PipelinePhase, PhaseMetrics>;
  }

  private buildResourceUsage(execution: PhaseExecution): ResourceUsage {
    return {
      cpuTime: execution.resourceUsage.cpuTime || 0,
      memoryUsed: execution.resourceUsage.memoryUsed || 0,
      apiCalls: execution.resourceUsage.apiCalls || 0,
      tokensUsed: execution.resourceUsage.tokensUsed || 0,
      cost: execution.resourceUsage.cost || 0,
    };
  }

  private calculatePerformanceMetrics(): PerformanceMetrics {
    const totalDuration = Math.max(1, Date.now() - this.startTime);
    const cacheHits = this.cacheRecords.filter(r => r.hit).length;
    const totalCacheOps = this.cacheRecords.length;
    const cacheHitRate = totalCacheOps > 0 ? cacheHits / totalCacheOps : 0;

    // Calculate average latency across phases
    const phaseDurations = Array.from(this.phaseExecutions.values())
      .filter(e => e.duration !== undefined)
      .map(e => e.duration!);
    
    const avgLatency = phaseDurations.length > 0
      ? phaseDurations.reduce((sum, d) => sum + d, 0) / phaseDurations.length
      : 0;

    return {
      throughput: totalDuration > 0 ? 1000 / totalDuration : 0,
      latency: avgLatency,
      cacheHitRate,
      parallelizationFactor: 1, // Default, can be enhanced
    };
  }

  private calculateCostMetrics(): CostMetrics {
    const aiCost = this.aiCalls.reduce((sum, call) => sum + call.cost, 0);
    
    return {
      totalCost: aiCost,
      aiCost,
      computeCost: 0, // Can be enhanced with actual compute tracking
      storageCost: 0, // Can be enhanced with actual storage tracking
      breakdown: {
        ai: aiCost,
        compute: 0,
        storage: 0,
      },
    };
  }

  private calculateQualityMetrics(): QualityMetrics {
    const successfulPhases = Array.from(this.phaseExecutions.values())
      .filter(e => e.success === true).length;
    const totalPhases = this.phaseExecutions.size;
    
    const overallScore = totalPhases > 0 ? successfulPhases / totalPhases : 0;

    return {
      overallScore,
      confidence: overallScore, // Can be enhanced with actual confidence tracking
      testCoverage: 0, // To be populated by validation phase
      codeQuality: 0, // To be populated by validation phase
      securityScore: 0, // To be populated by validation phase
    };
  }

  private calculateStats(values: number[]): MetricStats {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);

    return {
      count: values.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }
}

// Made with Bob
