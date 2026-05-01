/**
 * Integration Tests for Complete Pipeline Execution
 * 
 * Tests the end-to-end execution of all 6 phases working together
 */

import { PipelineOrchestrator, createConfiguredOrchestrator } from '@/lib/pipeline/core/orchestrator'
import { PipelinePhase } from '@/lib/pipeline/types'
import { createMockPipelineInput } from '../../utils/mocks'
import * as fs from 'fs/promises'

import { InputAnalysisPhase } from '@/lib/pipeline/phases/input-analysis'
import { AIReasoningPhase } from '@/lib/pipeline/phases/ai-reasoning'
import { GraphTraversalPhase } from '@/lib/pipeline/phases/graph-traversal'
import { FixGenerationPhase } from '@/lib/pipeline/phases/fix-generation'
import { ValidationPhase } from '@/lib/pipeline/phases/validation'
import { PRAssemblyPhase } from '@/lib/pipeline/phases/pr-assembly'
import { PhaseRegistry } from '@/lib/pipeline/core/phase-registry'

// Mock dependencies
jest.mock('fs/promises')

describe('Pipeline Integration Tests', () => {
  let orchestrator: PipelineOrchestrator
  
  beforeEach(() => {
    PhaseRegistry.resetInstance()
    const phases = [
      new InputAnalysisPhase(),
      new AIReasoningPhase(),
      new GraphTraversalPhase(),
      new FixGenerationPhase(),
      new ValidationPhase(),
      new PRAssemblyPhase(),
    ]
    orchestrator = createConfiguredOrchestrator(phases)
    
    // Setup fs mocks
    ;(fs.access as jest.Mock).mockResolvedValue(undefined)
    ;(fs.readdir as jest.Mock).mockResolvedValue([
      { name: 'utils.ts', isDirectory: () => false },
      { name: 'index.ts', isDirectory: () => false },
    ])
    ;(fs.stat as jest.Mock).mockResolvedValue({ size: 1024 })
    ;(fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
      dependencies: { react: '^18.0.0' },
    }))

    // Mock phase executions
    jest.spyOn(InputAnalysisPhase.prototype as any, 'executePhase').mockResolvedValue({
      parsedStackTrace: { errorType: 'Test', errorMessage: 'test', frames: [{}], language: 'ts' },
      repoMetadata: { name: 'test', owner: 'test', branch: 'main', language: 'ts', size: 100, lastCommit: '' },
      relevantFiles: ['utils.ts'],
      errorContext: { environment: 'test', timestamp: 123, severity: 'HIGH', tags: [], metadata: {} }
    })

    jest.spyOn(AIReasoningPhase.prototype as any, 'executePhase').mockResolvedValue({
      rootCause: { cause: 'test', confidence: 0.9, explanation: '' },
      hypotheses: [
        { id: '1', description: 'desc', probability: 0.8, actionPlan: [] },
        { id: '2', description: 'desc2', probability: 0.6, actionPlan: [] }
      ],
      confidence: 0.9,
      reasoningSteps: []
    })

    jest.spyOn(GraphTraversalPhase.prototype as any, 'executePhase').mockResolvedValue({
      impactedFiles: ['utils.ts'],
      fileImpacts: [{ path: 'utils.ts', impactScore: 0.8, reason: 'test', distance: 0, isDirect: true, isTest: false, priority: 10 }],
      dependencies: [],
      fileDependencies: [],
      callGraph: [],
      impactScore: 0.8,
      criticalPaths: [],
      testFiles: [],
      prioritizedFiles: ['utils.ts'],
      statistics: { totalNodes: 1, totalEdges: 0, communities: 1, avgDegree: 0, density: 0, affectedNodes: 1 },
      upstreamDependencies: [],
      downstreamDependencies: []
    })

    jest.spyOn(FixGenerationPhase.prototype as any, 'executePhase').mockResolvedValue({
      fixes: [{ file: 'utils.ts', changes: 'test', explanation: 'test', confidence: 0.9 }],
      fixAlternatives: [],
      tests: [{ file: 'utils.test.ts', content: 'test', framework: 'jest', coverage: [] }],
      explanation: 'test',
      rollbackInfo: [],
      processedFiles: ['utils.ts'],
      failedFiles: [],
      overallConfidence: 0.9,
      totalLinesChanged: 10,
      estimatedFixTime: 5
    })

    jest.spyOn(ValidationPhase.prototype as any, 'executePhase').mockResolvedValue({
      isValid: true,
      testResults: [{ name: 'test', status: 'PASSED', duration: 10 }],
      lintResults: [{ file: 'utils.ts', issues: [], score: 1 }],
      securityScan: { passed: true, issues: [], score: 1 },
      coverage: { lines: 100, functions: 100, branches: 100 }
    })

    jest.spyOn(PRAssemblyPhase.prototype as any, 'executePhase').mockResolvedValue({
      prPackage: { title: 'Fix', description: 'Desc', changes: [{}], branchName: 'fix-123', commitMessage: 'test' }
    })
  })
  
  afterEach(() => {
    jest.clearAllMocks()
  })
  
  describe('Complete Pipeline Execution', () => {
    it('should execute pipeline and return output', async () => {
      const input = createMockPipelineInput()
      
      const result = await orchestrator.execute(input)
      
      expect(result).toBeDefined()
      expect(result.prPackage).toBeDefined()
      expect(result.metrics).toBeDefined()
      expect(result.timeline).toBeDefined()
      expect(result.quality).toBeDefined()
    }, 30000)
    
    it('should generate valid PR package', async () => {
      const input = createMockPipelineInput()
      
      const result = await orchestrator.execute(input)
      
      expect(result.prPackage.title).toBeDefined()
      expect(result.prPackage.description).toBeDefined()
      expect(result.prPackage.changes).toBeDefined()
      expect(Array.isArray(result.prPackage.changes)).toBe(true)
      expect(result.prPackage.branchName).toBeDefined()
    }, 30000)
  })
  
  describe('Performance and Metrics', () => {
    it('should track execution time', async () => {
      const input = createMockPipelineInput()
      
      const result = await orchestrator.execute(input)
      
      expect(result.metrics.totalDuration).toBeGreaterThan(0)
      expect(result.metrics.phaseMetrics).toBeDefined()
    }, 30000)
    
    it('should complete within reasonable time', async () => {
      const input = createMockPipelineInput()
      
      const startTime = Date.now()
      await orchestrator.execute(input)
      const duration = Date.now() - startTime
      
      expect(duration).toBeLessThan(30000)
    }, 35000)
  })
  
  describe('Quality Metrics', () => {
    it('should calculate quality scores', async () => {
      const input = createMockPipelineInput()
      
      const result = await orchestrator.execute(input)
      
      expect(result.quality.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.quality.overallScore).toBeLessThanOrEqual(1)
      expect(result.quality.confidence).toBeDefined()
    }, 30000)
  })
  
  describe('Timeline Tracking', () => {
    it('should track execution timeline', async () => {
      const input = createMockPipelineInput()
      
      const result = await orchestrator.execute(input)
      
      expect(result.timeline.events.length).toBeGreaterThan(0)
      expect(result.timeline.totalDuration).toBeGreaterThan(0)
    }, 30000)
  })
})

// Made with Bob
