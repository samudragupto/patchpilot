/**
 * Pipeline Status API Endpoint
 * 
 * Provides endpoints for checking pipeline execution status, retrieving execution
 * history, and monitoring active executions.
 * 
 * @module api/pipeline/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { PhaseRegistry } from '@/lib/pipeline/core/phase-registry';
import { ExecutionManager } from '@/lib/pipeline/core/execution-manager';
import { PipelineStatus, PipelinePhase } from '@/lib/pipeline/types';

// ============================================================================
// Global Execution Manager (shared across requests)
// ============================================================================

// In a production environment, this would be stored in a database or Redis
// For now, we use an in-memory manager
let globalExecutionManager: ExecutionManager | null = null;

function getExecutionManager(): ExecutionManager {
  if (!globalExecutionManager) {
    globalExecutionManager = new ExecutionManager({
      maxHistorySize: 1000,
      maxExecutionAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  return globalExecutionManager;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Status response for a single execution
 */
export interface ExecutionStatusResponse {
  executionId: string;
  status: PipelineStatus;
  currentPhase: PipelinePhase | null;
  startTime: string;
  endTime?: string;
  duration?: number;
  progress?: {
    completedPhases: number;
    totalPhases: number;
    percentage: number;
  };
  error?: {
    message: string;
    phase?: PipelinePhase;
  };
  metadata?: {
    tenantId?: string;
    correlationId?: string;
    tags: string[];
  };
}

/**
 * List of executions response
 */
export interface ExecutionListResponse {
  executions: ExecutionStatusResponse[];
  total: number;
  active: number;
  completed: number;
  failed: number;
  statistics: {
    avgDuration: number;
    successRate: number;
  };
}

// ============================================================================
// GET Handler - Get Execution Status or List
// ============================================================================

/**
 * GET /api/pipeline/status?executionId=xxx
 * GET /api/pipeline/status (list all)
 * 
 * Get execution status or list all executions
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const executionId = searchParams.get('executionId');
    const status = searchParams.get('status') as PipelineStatus | null;
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const manager = getExecutionManager();
    
    // Get specific execution
    if (executionId) {
      const execution = manager.getExecution(executionId);
      
      if (!execution) {
        return NextResponse.json(
          {
            error: 'Execution not found',
            executionId,
          },
          { status: 404 }
        );
      }
      
      const response: ExecutionStatusResponse = formatExecutionStatus(execution);
      return NextResponse.json(response);
    }
    
    // List executions
    const executions = manager.listExecutions({
      status: status || undefined,
      limit,
      sortBy: 'startTime',
      sortOrder: 'desc',
    });
    
    const stats = manager.getStatistics();
    
    const response: ExecutionListResponse = {
      executions: executions.map(formatExecutionStatus),
      total: stats.total,
      active: stats.active,
      completed: stats.completed,
      failed: stats.failed,
      statistics: {
        avgDuration: stats.avgDuration,
        successRate: stats.successRate,
      },
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Status API error:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to get execution status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE Handler - Cancel Execution
// ============================================================================

/**
 * DELETE /api/pipeline/status?executionId=xxx
 * 
 * Cancel an active execution
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const executionId = searchParams.get('executionId');
    
    if (!executionId) {
      return NextResponse.json(
        {
          error: 'executionId parameter is required',
        },
        { status: 400 }
      );
    }
    
    const manager = getExecutionManager();
    const execution = manager.getExecution(executionId);
    
    if (!execution) {
      return NextResponse.json(
        {
          error: 'Execution not found',
          executionId,
        },
        { status: 404 }
      );
    }
    
    // Check if execution can be cancelled
    if (execution.status !== PipelineStatus.RUNNING && execution.status !== PipelineStatus.PENDING) {
      return NextResponse.json(
        {
          error: 'Execution cannot be cancelled',
          reason: `Execution is in ${execution.status} state`,
          executionId,
        },
        { status: 400 }
      );
    }
    
    // Cancel execution
    manager.cancelExecution(executionId);
    
    return NextResponse.json({
      success: true,
      executionId,
      message: 'Execution cancelled successfully',
    });
    
  } catch (error) {
    console.error('Cancel execution error:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to cancel execution',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format execution state for API response
 */
function formatExecutionStatus(execution: any): ExecutionStatusResponse {
  const registry = PhaseRegistry.getInstance();
  const phaseOrder = registry.getPhaseOrder();
  
  // Calculate progress
  const completedPhases = phaseOrder.filter(
    phase => execution.context.phaseOutputs[phase] !== undefined
  ).length;
  
  const progress = {
    completedPhases,
    totalPhases: phaseOrder.length,
    percentage: Math.round((completedPhases / phaseOrder.length) * 100),
  };
  
  const response: ExecutionStatusResponse = {
    executionId: execution.executionId,
    status: execution.status,
    currentPhase: execution.currentPhase,
    startTime: new Date(execution.startTime).toISOString(),
    endTime: execution.endTime ? new Date(execution.endTime).toISOString() : undefined,
    duration: execution.duration,
    progress,
    metadata: {
      tenantId: execution.metadata.tenantId,
      correlationId: execution.metadata.correlationId,
      tags: execution.metadata.tags,
    },
  };
  
  // Add error information if failed
  if (execution.error) {
    response.error = {
      message: execution.error.message,
      phase: execution.currentPhase || undefined,
    };
  }
  
  return response;
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// ============================================================================
// Export Execution Manager for use in main pipeline route
// ============================================================================

export { getExecutionManager };

// Made with Bob
