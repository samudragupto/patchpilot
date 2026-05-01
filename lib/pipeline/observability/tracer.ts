/**
 * Distributed Tracing System
 * 
 * Provides comprehensive distributed tracing for pipeline execution with:
 * - Span creation and management
 * - Parent-child span relationships
 * - Span attributes and events
 * - Trace context propagation
 * - OpenTelemetry-compatible export
 * - Performance tracking
 * 
 * @module pipeline/observability/tracer
 */

import { PipelinePhase } from '../types/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Span status
 */
export enum SpanStatus {
  UNSET = 'UNSET',
  OK = 'OK',
  ERROR = 'ERROR',
}

/**
 * Span kind (OpenTelemetry compatible)
 */
export enum SpanKind {
  INTERNAL = 'INTERNAL',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  PRODUCER = 'PRODUCER',
  CONSUMER = 'CONSUMER',
}

/**
 * Span represents a single operation within a trace
 */
export interface Span {
  /** Unique span identifier */
  readonly spanId: string;
  
  /** Trace this span belongs to */
  readonly traceId: string;
  
  /** Parent span ID (if any) */
  readonly parentSpanId?: string;
  
  /** Span name/operation */
  readonly name: string;
  
  /** Span kind */
  readonly kind: SpanKind;
  
  /** Start time in milliseconds */
  readonly startTime: number;
  
  /** End time in milliseconds (undefined if still running) */
  readonly endTime?: number;
  
  /** Span duration in milliseconds */
  readonly duration?: number;
  
  /** Span status */
  readonly status: SpanStatus;
  
  /** Status message (for errors) */
  readonly statusMessage?: string;
  
  /** Span attributes (key-value pairs) */
  readonly attributes: Record<string, any>;
  
  /** Span events (timestamped log entries) */
  readonly events: SpanEvent[];
  
  /** Links to other spans */
  readonly links: SpanLink[];
}

/**
 * Span event (timestamped annotation)
 */
export interface SpanEvent {
  /** Event timestamp */
  readonly timestamp: number;
  
  /** Event name */
  readonly name: string;
  
  /** Event attributes */
  readonly attributes?: Record<string, any>;
}

/**
 * Link to another span
 */
export interface SpanLink {
  /** Linked trace ID */
  readonly traceId: string;
  
  /** Linked span ID */
  readonly spanId: string;
  
  /** Link attributes */
  readonly attributes?: Record<string, any>;
}

/**
 * Trace represents a complete execution flow
 */
export interface Trace {
  /** Unique trace identifier */
  readonly traceId: string;
  
  /** All spans in this trace */
  readonly spans: Span[];
  
  /** Root span (entry point) */
  readonly rootSpan?: Span;
  
  /** Total trace duration */
  readonly duration: number;
  
  /** Trace status (derived from spans) */
  readonly status: SpanStatus;
  
  /** Trace start time */
  readonly startTime: number;
  
  /** Trace end time */
  readonly endTime?: number;
}

/**
 * Trace context for propagation
 */
export interface TraceContext {
  /** Trace ID */
  readonly traceId: string;
  
  /** Current span ID */
  readonly spanId: string;
  
  /** Parent span ID */
  readonly parentSpanId?: string;
  
  /** Trace flags */
  readonly flags?: number;
  
  /** Baggage (key-value pairs propagated with trace) */
  readonly baggage?: Record<string, string>;
}

// ============================================================================
// PipelineTracer Class
// ============================================================================

/**
 * Distributed tracer for pipeline execution
 * 
 * @example
 * ```typescript
 * const tracer = new PipelineTracer();
 * 
 * // Start root span
 * const rootSpan = tracer.startSpan('pipeline-execution');
 * 
 * // Start child span
 * const childSpan = tracer.startSpan('phase-1', rootSpan.spanId);
 * tracer.addSpanAttribute(childSpan.spanId, 'phase', 'INPUT_ANALYSIS');
 * tracer.addSpanEvent(childSpan.spanId, 'validation-complete');
 * 
 * // End spans
 * tracer.endSpan(childSpan.spanId, true);
 * tracer.endSpan(rootSpan.spanId, true);
 * 
 * // Get trace
 * const trace = tracer.getTrace(rootSpan.traceId);
 * ```
 */
export class PipelineTracer {
  private readonly traces: Map<string, Map<string, Span>>;
  private readonly activeSpans: Map<string, string>; // spanId -> traceId

  constructor() {
    this.traces = new Map();
    this.activeSpans = new Map();
  }

  // ==========================================================================
  // Span Management
  // ==========================================================================

  /**
   * Start a new span
   * 
   * @param name - Span name/operation
   * @param parentSpanId - Parent span ID (optional)
   * @param kind - Span kind (default: INTERNAL)
   * @param attributes - Initial attributes (optional)
   * @returns Created span
   */
  startSpan(
    name: string,
    parentSpanId?: string,
    kind: SpanKind = SpanKind.INTERNAL,
    attributes?: Record<string, any>
  ): Span {
    const spanId = this.generateSpanId();
    const traceId = parentSpanId 
      ? this.getTraceIdForSpan(parentSpanId) || this.generateTraceId()
      : this.generateTraceId();

    const span: Span = {
      spanId,
      traceId,
      parentSpanId,
      name,
      kind,
      startTime: Date.now(),
      status: SpanStatus.UNSET,
      attributes: attributes || {},
      events: [],
      links: [],
    };

    // Store span
    this.storeSpan(span);
    this.activeSpans.set(spanId, traceId);

    return span;
  }

  /**
   * End a span
   * 
   * @param spanId - Span to end
   * @param success - Whether the operation succeeded
   * @param statusMessage - Optional status message
   */
  endSpan(spanId: string, success: boolean, statusMessage?: string): void {
    const span = this.getSpan(spanId);
    if (!span) {
      console.warn(`Span ${spanId} not found`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - span.startTime;
    const status = success ? SpanStatus.OK : SpanStatus.ERROR;

    const updatedSpan: Span = {
      ...span,
      endTime,
      duration,
      status,
      statusMessage,
    };

    this.updateSpan(updatedSpan);
    this.activeSpans.delete(spanId);
  }

  /**
   * Add an attribute to a span
   * 
   * @param spanId - Span ID
   * @param key - Attribute key
   * @param value - Attribute value
   */
  addSpanAttribute(spanId: string, key: string, value: any): void {
    const span = this.getSpan(spanId);
    if (!span) {
      console.warn(`Span ${spanId} not found`);
      return;
    }

    const updatedSpan: Span = {
      ...span,
      attributes: {
        ...span.attributes,
        [key]: value,
      },
    };

    this.updateSpan(updatedSpan);
  }

  /**
   * Add multiple attributes to a span
   * 
   * @param spanId - Span ID
   * @param attributes - Attributes to add
   */
  addSpanAttributes(spanId: string, attributes: Record<string, any>): void {
    const span = this.getSpan(spanId);
    if (!span) {
      console.warn(`Span ${spanId} not found`);
      return;
    }

    const updatedSpan: Span = {
      ...span,
      attributes: {
        ...span.attributes,
        ...attributes,
      },
    };

    this.updateSpan(updatedSpan);
  }

  /**
   * Add an event to a span
   * 
   * @param spanId - Span ID
   * @param eventName - Event name
   * @param attributes - Event attributes (optional)
   */
  addSpanEvent(spanId: string, eventName: string, attributes?: Record<string, any>): void {
    const span = this.getSpan(spanId);
    if (!span) {
      console.warn(`Span ${spanId} not found`);
      return;
    }

    const event: SpanEvent = {
      timestamp: Date.now(),
      name: eventName,
      attributes,
    };

    const updatedSpan: Span = {
      ...span,
      events: [...span.events, event],
    };

    this.updateSpan(updatedSpan);
  }

  /**
   * Add a link to another span
   * 
   * @param spanId - Current span ID
   * @param linkedTraceId - Linked trace ID
   * @param linkedSpanId - Linked span ID
   * @param attributes - Link attributes (optional)
   */
  addSpanLink(
    spanId: string,
    linkedTraceId: string,
    linkedSpanId: string,
    attributes?: Record<string, any>
  ): void {
    const span = this.getSpan(spanId);
    if (!span) {
      console.warn(`Span ${spanId} not found`);
      return;
    }

    const link: SpanLink = {
      traceId: linkedTraceId,
      spanId: linkedSpanId,
      attributes,
    };

    const updatedSpan: Span = {
      ...span,
      links: [...span.links, link],
    };

    this.updateSpan(updatedSpan);
  }

  // ==========================================================================
  // Trace Retrieval
  // ==========================================================================

  /**
   * Get a complete trace
   * 
   * @param traceId - Trace ID
   * @returns Trace object or undefined if not found
   */
  getTrace(traceId: string): Trace | undefined {
    const spans = this.traces.get(traceId);
    if (!spans || spans.size === 0) {
      return undefined;
    }

    const spanArray = Array.from(spans.values());
    const rootSpan = spanArray.find(s => !s.parentSpanId);
    
    // Calculate trace duration
    const startTimes = spanArray.map(s => s.startTime);
    const endTimes = spanArray
      .filter(s => s.endTime !== undefined)
      .map(s => s.endTime!);
    
    const startTime = Math.min(...startTimes);
    const endTime = endTimes.length > 0 ? Math.max(...endTimes) : undefined;
    const duration = endTime ? endTime - startTime : Date.now() - startTime;

    // Determine overall status
    const hasError = spanArray.some(s => s.status === SpanStatus.ERROR);
    const status = hasError ? SpanStatus.ERROR : SpanStatus.OK;

    return {
      traceId,
      spans: spanArray,
      rootSpan,
      duration,
      status,
      startTime,
      endTime,
    };
  }

  /**
   * Get a specific span
   * 
   * @param spanId - Span ID
   * @returns Span or undefined if not found
   */
  getSpan(spanId: string): Span | undefined {
    const traceId = this.activeSpans.get(spanId) || this.findTraceIdForSpan(spanId);
    if (!traceId) {
      return undefined;
    }

    const spans = this.traces.get(traceId);
    return spans?.get(spanId);
  }

  /**
   * Get all traces
   * 
   * @returns Array of all traces
   */
  getAllTraces(): Trace[] {
    const traces: Trace[] = [];
    
    for (const traceId of this.traces.keys()) {
      const trace = this.getTrace(traceId);
      if (trace) {
        traces.push(trace);
      }
    }

    return traces;
  }

  /**
   * Get active (incomplete) spans
   * 
   * @returns Array of active spans
   */
  getActiveSpans(): Span[] {
    const activeSpans: Span[] = [];
    
    for (const spanId of this.activeSpans.keys()) {
      const span = this.getSpan(spanId);
      if (span && !span.endTime) {
        activeSpans.push(span);
      }
    }

    return activeSpans;
  }

  // ==========================================================================
  // Context Propagation
  // ==========================================================================

  /**
   * Create trace context from a span
   * 
   * @param spanId - Span ID
   * @returns Trace context or undefined if span not found
   */
  createTraceContext(spanId: string): TraceContext | undefined {
    const span = this.getSpan(spanId);
    if (!span) {
      return undefined;
    }

    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      flags: 1, // Sampled
    };
  }

  /**
   * Extract trace context from headers (W3C Trace Context format)
   * 
   * @param traceparent - traceparent header value
   * @param tracestate - tracestate header value (optional)
   * @returns Trace context
   */
  extractTraceContext(traceparent: string, tracestate?: string): TraceContext | null {
    // Parse W3C traceparent: version-traceId-spanId-flags
    const parts = traceparent.split('-');
    if (parts.length !== 4) {
      return null;
    }

    const [version, traceId, spanId, flags] = parts;
    
    if (version !== '00') {
      return null; // Unsupported version
    }

    return {
      traceId,
      spanId,
      flags: parseInt(flags, 16),
    };
  }

  /**
   * Inject trace context into headers (W3C Trace Context format)
   * 
   * @param context - Trace context
   * @returns Headers object
   */
  injectTraceContext(context: TraceContext): Record<string, string> {
    const flags = (context.flags || 1).toString(16).padStart(2, '0');
    const traceparent = `00-${context.traceId}-${context.spanId}-${flags}`;

    return {
      traceparent,
    };
  }

  // ==========================================================================
  // Export
  // ==========================================================================

  /**
   * Export trace in OpenTelemetry JSON format
   * 
   * @param traceId - Trace ID
   * @returns JSON string or undefined if trace not found
   */
  exportTrace(traceId: string): string | undefined {
    const trace = this.getTrace(traceId);
    if (!trace) {
      return undefined;
    }

    const otlpTrace = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'patchpilot-pipeline' } },
          ],
        },
        scopeSpans: [{
          scope: {
            name: 'pipeline-tracer',
            version: '1.0.0',
          },
          spans: trace.spans.map(span => this.spanToOTLP(span)),
        }],
      }],
    };

    return JSON.stringify(otlpTrace, null, 2);
  }

  /**
   * Export all traces
   * 
   * @returns JSON string of all traces
   */
  exportAllTraces(): string {
    const traces = this.getAllTraces();
    return JSON.stringify(traces, null, 2);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Clear all traces
   */
  clear(): void {
    this.traces.clear();
    this.activeSpans.clear();
  }

  /**
   * Clear a specific trace
   * 
   * @param traceId - Trace ID to clear
   */
  clearTrace(traceId: string): void {
    const spans = this.traces.get(traceId);
    if (spans) {
      for (const spanId of spans.keys()) {
        this.activeSpans.delete(spanId);
      }
      this.traces.delete(traceId);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private storeSpan(span: Span): void {
    let spans = this.traces.get(span.traceId);
    if (!spans) {
      spans = new Map();
      this.traces.set(span.traceId, spans);
    }
    spans.set(span.spanId, span);
  }

  private updateSpan(span: Span): void {
    const spans = this.traces.get(span.traceId);
    if (spans) {
      spans.set(span.spanId, span);
    }
  }

  private getTraceIdForSpan(spanId: string): string | undefined {
    return this.activeSpans.get(spanId);
  }

  private findTraceIdForSpan(spanId: string): string | undefined {
    for (const [traceId, spans] of this.traces.entries()) {
      if (spans.has(spanId)) {
        return traceId;
      }
    }
    return undefined;
  }

  private generateTraceId(): string {
    return this.generateId(32);
  }

  private generateSpanId(): string {
    return this.generateId(16);
  }

  private generateId(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private spanToOTLP(span: Span): any {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: this.spanKindToOTLP(span.kind),
      startTimeUnixNano: span.startTime * 1000000,
      endTimeUnixNano: span.endTime ? span.endTime * 1000000 : undefined,
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: this.valueToOTLP(value),
      })),
      events: span.events.map(event => ({
        timeUnixNano: event.timestamp * 1000000,
        name: event.name,
        attributes: event.attributes ? Object.entries(event.attributes).map(([key, value]) => ({
          key,
          value: this.valueToOTLP(value),
        })) : [],
      })),
      status: {
        code: span.status === SpanStatus.ERROR ? 2 : span.status === SpanStatus.OK ? 1 : 0,
        message: span.statusMessage,
      },
      links: span.links.map(link => ({
        traceId: link.traceId,
        spanId: link.spanId,
        attributes: link.attributes ? Object.entries(link.attributes).map(([key, value]) => ({
          key,
          value: this.valueToOTLP(value),
        })) : [],
      })),
    };
  }

  private spanKindToOTLP(kind: SpanKind): number {
    const mapping: Record<SpanKind, number> = {
      [SpanKind.INTERNAL]: 1,
      [SpanKind.SERVER]: 2,
      [SpanKind.CLIENT]: 3,
      [SpanKind.PRODUCER]: 4,
      [SpanKind.CONSUMER]: 5,
    };
    return mapping[kind] || 0;
  }

  private valueToOTLP(value: any): any {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    } else {
      return { stringValue: JSON.stringify(value) };
    }
  }
}

// Made with Bob
