# Pipeline API Endpoints Documentation

This document provides comprehensive documentation for the PatchPilot AI Pipeline API endpoints.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Execute Pipeline](#execute-pipeline)
  - [Get Pipeline Info](#get-pipeline-info)
  - [Get Execution Status](#get-execution-status)
  - [List Executions](#list-executions)
  - [Cancel Execution](#cancel-execution)
- [Request/Response Types](#requestresponse-types)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

The Pipeline API provides endpoints for executing the complete PatchPilot AI pipeline, which includes:

1. **Input Analysis** - Parse and analyze error information
2. **AI Reasoning** - Generate hypotheses about root causes
3. **Graph Traversal** - Analyze dependency graph and impact radius
4. **Fix Generation** - Generate code fixes using AI
5. **Validation** - Validate fixes through testing and analysis
6. **PR Assembly** - Create a complete pull request package

## Authentication

Currently, the API does not require authentication. In production, you should implement proper authentication and authorization.

## Endpoints

### Execute Pipeline

Execute the complete PatchPilot AI pipeline.

**Endpoint:** `POST /api/pipeline`

**Request Body:**

```typescript
{
  // Required: Issue description or error message
  description: string;
  
  // Required: GitHub repository URL
  repoUrl: string;
  
  // Required: Local path to cloned repository
  repoPath: string;
  
  // Optional: Stack trace
  stackTrace?: string;
  
  // Optional: Error logs
  errorLogs?: string;
  
  // Optional: Enable streaming responses (default: false)
  streaming?: boolean;
  
  // Optional: Enable caching (default: true)
  cacheEnabled?: boolean;
  
  // Optional: Specific phases to run
  phasesToRun?: PipelinePhase[];
  
  // Optional: Configuration overrides
  config?: Partial<PipelineConfig>;
  
  // Optional: Metadata
  metadata?: Record<string, unknown>;
  
  // Optional: Tenant/user identifier
  tenantId?: string;
  
  // Optional: Request correlation ID
  correlationId?: string;
}
```

**Response (Synchronous):**

```typescript
{
  // Execution ID for tracking
  executionId: string;
  
  // Pipeline status
  status: 'COMPLETED' | 'FAILED';
  
  // PR package (if completed)
  prPackage?: {
    title: string;
    description: string;
    changes: FileChange[];
    tests: TestFile[];
    branchName: string;
    labels: string[];
    reviewers?: string[];
    confidence: number;
  };
  
  // Execution metrics
  metrics?: {
    totalDuration: number;
    phaseMetrics: Record<PipelinePhase, PhaseMetrics>;
    performance: PerformanceMetrics;
    cost: CostMetrics;
    quality: QualityMetrics;
  };
  
  // Execution timeline
  timeline?: {
    events: TimelineEvent[];
    totalDuration: number;
    criticalPath: string[];
  };
  
  // Quality assessment
  quality?: {
    overallScore: number;
    confidence: number;
    testCoverage: number;
    codeQuality: number;
    securityScore: number;
  };
  
  // Error information (if failed)
  error?: string;
  errorDetails?: {
    phase?: PipelinePhase;
    message: string;
    stack?: string;
  };
}
```

**Response (Streaming):**

When `streaming: true`, the endpoint returns Server-Sent Events (SSE) with progress updates:

```typescript
// Progress event
data: {
  "type": "progress",
  "data": {
    "executionId": "uuid",
    "phase": "AI_REASONING",
    "progress": 40,
    "message": "Analyzing root causes..."
  }
}

// Completion event
data: {
  "type": "complete",
  "data": {
    "executionId": "uuid",
    "status": "COMPLETED",
    "progress": 100,
    "message": "Pipeline completed successfully",
    "result": { /* PipelineOutput */ }
  }
}

// Error event
data: {
  "type": "error",
  "data": {
    "executionId": "uuid",
    "error": "Error message"
  }
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad Request (validation failed)
- `500` - Internal Server Error

---

### Get Pipeline Info

Get information about the pipeline and available phases.

**Endpoint:** `GET /api/pipeline`

**Response:**

```typescript
{
  version: string;
  phases: PipelinePhase[];
  statistics: {
    totalPhases: number;
    registeredPhases: number;
    missingPhases: number;
    phaseOrder: number;
  };
  features: {
    streaming: boolean;
    caching: boolean;
    checkpointing: boolean;
    parallelExecution: boolean;
  };
  endpoints: {
    execute: string;
    status: string;
  };
}
```

**Status Codes:**

- `200` - Success
- `500` - Internal Server Error

---

### Get Execution Status

Get the status of a specific execution.

**Endpoint:** `GET /api/pipeline/status?executionId={id}`

**Query Parameters:**

- `executionId` (required) - The execution ID to query

**Response:**

```typescript
{
  executionId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentPhase: PipelinePhase | null;
  startTime: string; // ISO 8601
  endTime?: string; // ISO 8601
  duration?: number; // milliseconds
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
```

**Status Codes:**

- `200` - Success
- `404` - Execution not found
- `500` - Internal Server Error

---

### List Executions

List all executions with optional filtering.

**Endpoint:** `GET /api/pipeline/status`

**Query Parameters:**

- `status` (optional) - Filter by status
- `limit` (optional) - Maximum number of results (default: 50)

**Response:**

```typescript
{
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
```

**Status Codes:**

- `200` - Success
- `500` - Internal Server Error

---

### Cancel Execution

Cancel an active execution.

**Endpoint:** `DELETE /api/pipeline/status?executionId={id}`

**Query Parameters:**

- `executionId` (required) - The execution ID to cancel

**Response:**

```typescript
{
  success: boolean;
  executionId: string;
  message: string;
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad Request (execution cannot be cancelled)
- `404` - Execution not found
- `500` - Internal Server Error

---

## Request/Response Types

### PipelinePhase

```typescript
enum PipelinePhase {
  INPUT_ANALYSIS = 'INPUT_ANALYSIS',
  AI_REASONING = 'AI_REASONING',
  GRAPH_TRAVERSAL = 'GRAPH_TRAVERSAL',
  FIX_GENERATION = 'FIX_GENERATION',
  VALIDATION = 'VALIDATION',
  PR_ASSEMBLY = 'PR_ASSEMBLY',
}
```

### PipelineStatus

```typescript
enum PipelineStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
```

### FileChange

```typescript
interface FileChange {
  path: string;
  oldContent?: string;
  newContent: string;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  diff?: string;
}
```

### TestFile

```typescript
interface TestFile {
  path: string;
  content: string;
  framework: string;
  coverage?: number;
}
```

---

## Error Handling

All endpoints return consistent error responses:

```typescript
{
  error: string; // Error type
  message?: string; // Detailed error message
  details?: string[] | object; // Additional error details
}
```

### Common Error Codes

- `400` - Validation error, missing required fields
- `404` - Resource not found
- `500` - Internal server error, pipeline execution failed

---

## Examples

### Example 1: Execute Pipeline (Synchronous)

```bash
curl -X POST http://localhost:3000/api/pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "description": "NullPointerException in UserService",
    "repoUrl": "https://github.com/user/repo",
    "repoPath": "/tmp/repo",
    "stackTrace": "java.lang.NullPointerException\n  at UserService.getUser(UserService.java:42)",
    "cacheEnabled": true
  }'
```

### Example 2: Execute Pipeline (Streaming)

```javascript
const eventSource = new EventSource('/api/pipeline', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'Bug in authentication flow',
    repoUrl: 'https://github.com/user/repo',
    repoPath: '/tmp/repo',
    streaming: true
  })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'progress') {
    console.log(`Progress: ${data.data.progress}% - ${data.data.message}`);
  } else if (data.type === 'complete') {
    console.log('Pipeline completed!', data.data.result);
    eventSource.close();
  } else if (data.type === 'error') {
    console.error('Pipeline failed:', data.data.error);
    eventSource.close();
  }
};
```

### Example 3: Get Execution Status

```bash
curl http://localhost:3000/api/pipeline/status?executionId=abc-123
```

### Example 4: List All Executions

```bash
curl http://localhost:3000/api/pipeline/status?limit=10
```

### Example 5: Cancel Execution

```bash
curl -X DELETE http://localhost:3000/api/pipeline/status?executionId=abc-123
```

### Example 6: Get Pipeline Info

```bash
curl http://localhost:3000/api/pipeline
```

---

## Integration with Frontend

### React Example

```typescript
import { useState } from 'react';

interface PipelineRequest {
  description: string;
  repoUrl: string;
  repoPath: string;
  streaming?: boolean;
}

function usePipeline() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const executePipeline = async (request: PipelineRequest) => {
    setLoading(true);
    setError(null);

    if (request.streaming) {
      // Streaming execution
      const eventSource = new EventSource('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
          setProgress(data.data.progress);
        } else if (data.type === 'complete') {
          setResult(data.data.result);
          setLoading(false);
          eventSource.close();
        } else if (data.type === 'error') {
          setError(data.data.error);
          setLoading(false);
          eventSource.close();
        }
      };
    } else {
      // Synchronous execution
      try {
        const response = await fetch('/api/pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        });

        const data = await response.json();

        if (response.ok) {
          setResult(data);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return { executePipeline, loading, progress, result, error };
}
```

---

## Performance Considerations

1. **Caching**: Enable caching (`cacheEnabled: true`) to improve performance for repeated requests
2. **Streaming**: Use streaming for long-running operations to provide real-time feedback
3. **Timeouts**: Default pipeline timeout is 30 minutes; adjust via config if needed
4. **Concurrency**: Maximum 10 concurrent executions by default

---

## Security Considerations

1. **Input Validation**: All inputs are validated before execution
2. **Repository Access**: Ensure proper access controls for repository paths
3. **Rate Limiting**: Implement rate limiting in production
4. **Authentication**: Add authentication/authorization in production
5. **CORS**: Configure CORS policies appropriately

---

## Monitoring and Observability

The pipeline includes comprehensive observability:

- **Metrics**: Execution time, cache hit rate, API calls, costs
- **Logging**: Structured logs for all phases
- **Tracing**: Distributed tracing with trace IDs
- **Statistics**: Execution statistics and success rates

Access metrics via the execution response or status endpoints.

---

## Support

For issues or questions:
- Check the [main documentation](../README.md)
- Review [pipeline architecture](./PIPELINE_ARCHITECTURE_DESIGN.md)
- See [implementation details](./PIPELINE_IMPLEMENTATION_COMPLETE.md)