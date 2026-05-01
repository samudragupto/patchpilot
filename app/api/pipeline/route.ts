/**
 * Pipeline API Endpoint
 *
 * Main API endpoint for executing the complete PatchPilot AI pipeline.
 * Supports both synchronous and streaming responses for real-time progress updates.
 *
 * @module api/pipeline
 */

// Use standard Request and Response objects
import { createConfiguredOrchestrator, ProgressUpdate } from '@/lib/pipeline/core/orchestrator';
import { PhaseRegistry } from '@/lib/pipeline/core/phase-registry';
import { createCacheManager } from '@/lib/pipeline/cache';
import { CacheBackend } from '@/lib/pipeline/cache/cache-types';
import { PipelineInput, PipelineOutput, PipelinePhase, PipelineStatus, PipelineConfig } from '@/lib/pipeline/types';

// Import all phase implementations
import { InputAnalysisPhase } from '@/lib/pipeline/phases/input-analysis';
import { AIReasoningPhase } from '@/lib/pipeline/phases/ai-reasoning';
import { GraphTraversalPhase } from '@/lib/pipeline/phases/graph-traversal';
import { FixGenerationPhase } from '@/lib/pipeline/phases/fix-generation';
import { ValidationPhase } from '@/lib/pipeline/phases/validation';
import { PRAssemblyPhase } from '@/lib/pipeline/phases/pr-assembly';

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Pipeline API request body
 */
export interface PipelineRequest {
  /** Issue description or error message */
  description: string;
  
  /** GitHub repository URL */
  repoUrl: string;
  
  /** Local path to cloned repository */
  repoPath: string;
  
  /** Optional stack trace */
  stackTrace?: string;
  
  /** Optional error logs */
  errorLogs?: string;
  
  /** Enable streaming responses */
  streaming?: boolean;
  
  /** Enable caching */
  cacheEnabled?: boolean;
  
  /** Specific phases to run (if not all) */
  phasesToRun?: PipelinePhase[];
  
  /** Optional configuration overrides */
  config?: Partial<PipelineConfig>;
  
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  
  /** Tenant/user identifier */
  tenantId?: string;
  
  /** Request correlation ID */
  correlationId?: string;
}

/**
 * Pipeline API response
 */
export interface PipelineResponse {
  /** Execution ID for tracking */
  executionId: string;
  
  /** Pipeline status */
  status: PipelineStatus;
  
  /** PR package (if completed) */
  prPackage?: PipelineOutput['prPackage'];
  
  /** Execution metrics */
  metrics?: PipelineOutput['metrics'];
  
  /** Execution timeline */
  timeline?: PipelineOutput['timeline'];
  
  /** Quality assessment */
  quality?: PipelineOutput['quality'];
  
  /** Error message (if failed) */
  error?: string;
  
  /** Error details */
  errorDetails?: {
    phase?: PipelinePhase;
    message: string;
    stack?: string;
  };
  
  /** Progress information (for streaming) */
  progress?: {
    phase: PipelinePhase | null;
    percentage: number;
    message: string;
  };
}

/**
 * Streaming progress event
 */
export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error';
  data: {
    executionId: string;
    phase?: PipelinePhase | null;
    status?: PipelineStatus;
    progress?: number;
    message?: string;
    result?: PipelineOutput;
    error?: string;
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate pipeline request
 */
function validateRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!body) {
    errors.push('Request body is required');
    return { valid: false, errors };
  }
  
  if (!body.description && !body.stackTrace) {
    errors.push('Either description or stackTrace is required');
  }
  
  if (!body.repoUrl) {
    errors.push('repoUrl is required');
  } else if (!isValidGitHubUrl(body.repoUrl)) {
    errors.push('repoUrl must be a valid GitHub repository URL');
  }
  
  if (!body.repoPath) {
    errors.push('repoPath is required');
  }
  
  if (body.phasesToRun && !Array.isArray(body.phasesToRun)) {
    errors.push('phasesToRun must be an array');
  }
  
  if (body.config && typeof body.config !== 'object') {
    errors.push('config must be an object');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate GitHub URL
 */
function isValidGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'github.com' && parsed.pathname.split('/').length >= 3;
  } catch {
    return false;
  }
}

// ============================================================================
// Pipeline Initialization
// ============================================================================

/**
 * Initialize and configure the pipeline orchestrator
 */
function initializePipeline(cacheEnabled: boolean = true) {
  // Create cache manager (only if caching is enabled)
  const cacheManager = cacheEnabled ? createCacheManager({
    backend: CacheBackend.MEMORY,
    defaultTTL: 3600,
    maxSize: 1000,
  }) : null;
  
  // Create phase instances
  const phases = [
    new InputAnalysisPhase(),
    new AIReasoningPhase(),
    new GraphTraversalPhase(),
    new FixGenerationPhase(),
    new ValidationPhase(),
    new PRAssemblyPhase(),
  ];
  
  // Create orchestrator with all phases
  const orchestrator = createConfiguredOrchestrator(phases, {
    enableCheckpointing: true,
    enableStreaming: true,
    maxConcurrentExecutions: 10,
  });
  
  return { orchestrator, cacheManager };
}

// ============================================================================
// POST Handler - Execute Pipeline
// ============================================================================

/**
 * POST /api/pipeline
 * 
 * Execute the complete PatchPilot AI pipeline
 */
export async function POST(request: Request) {
  try {
    // Parse request body
    let body: PipelineRequest;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json(
        {
          error: 'Invalid JSON',
          details: ['Request body must be valid JSON'],
        },
        { status: 400 }
      );
    }
    
    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return Response.json(
        {
          error: 'Validation failed',
          details: validation.errors,
        },
        { status: 400 }
      );
    }
    
    // Check if streaming is requested
    const streaming = body.streaming ?? false;
    
    if (streaming) {
      // Return streaming response
      return handleStreamingRequest(body);
    } else {
      // Return synchronous response
      return handleSynchronousRequest(body);
    }
    
  } catch (error) {
    console.error('Pipeline API error:', error);
    
    return Response.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Handle synchronous pipeline execution
 */
async function handleSynchronousRequest(body: PipelineRequest): Promise<Response> {
  try {
    // Initialize pipeline
    const { orchestrator } = initializePipeline(body.cacheEnabled);
    
    // Prepare pipeline input
    const input: PipelineInput = {
      stackTrace: body.stackTrace || body.description,
      repoUrl: body.repoUrl,
      repoPath: body.repoPath,
      config: body.config,
      metadata: body.metadata,
      tenantId: body.tenantId,
      correlationId: body.correlationId,
    };
    
    // Execute pipeline
    const startTime = Date.now();
    const output = await orchestrator.execute(input);
    const duration = Date.now() - startTime;
    
    // Get execution metrics
    const metrics = orchestrator.getMetrics();
    
    // Build response
    const response: PipelineResponse = {
      executionId: output.metrics.phaseMetrics[PipelinePhase.INPUT_ANALYSIS]?.phase || 'unknown',
      status: PipelineStatus.COMPLETED,
      prPackage: output.prPackage,
      metrics: {
        ...output.metrics,
        totalDuration: duration,
      },
      timeline: output.timeline,
      quality: output.quality,
    };
    
    return Response.json(response, { status: 200 });
    
  } catch (error) {
    console.error('Pipeline execution error:', error);
    
    const response: PipelineResponse = {
      executionId: 'unknown',
      status: PipelineStatus.FAILED,
      error: error instanceof Error ? error.message : 'Pipeline execution failed',
      errorDetails: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
    
    return Response.json(response, { status: 500 });
  }
}

/**
 * Handle streaming pipeline execution
 */
async function handleStreamingRequest(body: PipelineRequest): Promise<Response> {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Initialize pipeline
        const { orchestrator } = initializePipeline(body.cacheEnabled);
        
        // Prepare pipeline input
        const input: PipelineInput = {
          stackTrace: body.stackTrace || body.description,
          repoUrl: body.repoUrl,
          repoPath: body.repoPath,
          config: body.config,
          metadata: body.metadata,
          tenantId: body.tenantId,
          correlationId: body.correlationId,
        };
        
        // Send initial event
        const initialEvent: ProgressEvent = {
          type: 'progress',
          data: {
            executionId: 'pending',
            phase: null,
            status: PipelineStatus.PENDING,
            progress: 0,
            message: 'Initializing pipeline...',
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialEvent)}\n\n`));
        
        // Execute pipeline with progress callback
        const output = await orchestrator.execute(input, (update: ProgressUpdate) => {
          const progressEvent: ProgressEvent = {
            type: 'progress',
            data: {
              executionId: update.executionId,
              phase: update.phase,
              progress: update.progress,
              message: update.message,
            },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressEvent)}\n\n`));
        });
        
        // Send completion event
        const completeEvent: ProgressEvent = {
          type: 'complete',
          data: {
            executionId: output.metrics.phaseMetrics[PipelinePhase.INPUT_ANALYSIS]?.phase || 'unknown',
            status: PipelineStatus.COMPLETED,
            progress: 100,
            message: 'Pipeline completed successfully',
            result: output,
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`));
        
        controller.close();
        
      } catch (error) {
        console.error('Streaming pipeline error:', error);
        
        // Send error event
        const errorEvent: ProgressEvent = {
          type: 'error',
          data: {
            executionId: 'unknown',
            error: error instanceof Error ? error.message : 'Pipeline execution failed',
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ============================================================================
// GET Handler - Get Pipeline Info
// ============================================================================

/**
 * GET /api/pipeline
 * 
 * Get pipeline information and available phases
 */
export async function GET(request: Request) {
  try {
    const registry = PhaseRegistry.getInstance();
    const stats = registry.getStatistics();
    const phaseOrder = registry.getPhaseOrder();
    
    return Response.json({
      version: '1.0.0',
      phases: phaseOrder,
      statistics: stats,
      features: {
        streaming: true,
        caching: true,
        checkpointing: true,
        parallelExecution: false,
      },
      endpoints: {
        execute: '/api/pipeline (POST)',
        status: '/api/pipeline/status (GET)',
      },
    });
    
  } catch (error) {
    console.error('Pipeline info error:', error);
    
    return Response.json(
      {
        error: 'Failed to get pipeline information',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Made with Bob
