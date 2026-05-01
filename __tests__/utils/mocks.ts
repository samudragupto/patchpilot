/**
 * Mock Utilities for Testing
 * 
 * Provides mock objects and functions for testing the pipeline system.
 */

import { PipelineContext, PipelineInput, PipelinePhase } from '../../lib/pipeline/types';
import * as fs from 'fs/promises';

describe('Mock Utilities', () => {
  it('should provide mock utilities', () => {
    const context = createMockPipelineContext();
    expect(context).toBeDefined();
    expect(context.input).toBeDefined();
  });
});

/**
 * Create a mock pipeline context
 */
export function createMockPipelineContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    executionId: 'test-execution-id',
    input: createMockPipelineInput(),
    config: {
      phases: {
        inputAnalysis: {},
        aiReasoning: {},
        graphTraversal: {},
        fixGeneration: {},
        validation: {},
        prAssembly: {},
      },
      retry: {
        maxAttempts: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
        maxDelay: 30000,
        retryableErrors: [],
      },
      timeout: {
        [PipelinePhase.INPUT_ANALYSIS]: 30000,
        [PipelinePhase.AI_REASONING]: 60000,
        [PipelinePhase.GRAPH_TRAVERSAL]: 45000,
        [PipelinePhase.FIX_GENERATION]: 60000,
        [PipelinePhase.VALIDATION]: 45000,
        [PipelinePhase.PR_ASSEMBLY]: 30000,
      } as any,
      validation: {
        inputValidation: true,
        outputValidation: true,
        schemaValidation: false,
      } as any,
      features: {
        caching: true,
        parallelExecution: false,
        streaming: false,
        checkpointing: false,
        aiEnhancement: true,
      },
      observability: {
        metrics: true,
        tracing: true,
        logging: true,
        logLevel: 'INFO',
      },
      cache: {
        enabled: true,
        ttl: 3600,
        maxSize: 100 * 1024 * 1024,
        strategy: 'LRU' as any,
      },
    } as any,
    metadata: {
      startTime: Date.now(),
      phaseTimings: {
        [PipelinePhase.INPUT_ANALYSIS]: 0,
        [PipelinePhase.AI_REASONING]: 0,
        [PipelinePhase.GRAPH_TRAVERSAL]: 0,
        [PipelinePhase.FIX_GENERATION]: 0,
        [PipelinePhase.VALIDATION]: 0,
        [PipelinePhase.PR_ASSEMBLY]: 0,
      },
      retryCount: 0,
      version: '1.0.0',
    },
    startTime: Date.now(),
    ...overrides,
  } as PipelineContext;
}

/**
 * Create a mock pipeline input
 */
export function createMockPipelineInput(overrides?: Partial<PipelineInput>): PipelineInput {
  return {
    stackTrace: 'Error: Test error\n    at test (/app/test.js:10:5)',
    repoUrl: 'https://github.com/test-owner/test-repo',
    repoPath: '/tmp/test-repo',
    metadata: {},
    ...overrides,
  };
}

/**
 * Mock fs module
 */
export const mockFs = {
  access: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ size: 1024, isDirectory: () => false }),
};

// Made with Bob
