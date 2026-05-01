/**
 * Unit Tests for Input Analysis Phase
 * 
 * Tests the first phase of the pipeline which parses and analyzes input data
 */

import { InputAnalysisPhase } from '@/lib/pipeline/phases/input-analysis'
import { PipelinePhase, PhaseStatus, ErrorSeverity } from '@/lib/pipeline/types'
import {
  createMockPipelineContext,
  createMockPipelineInput,
  mockFs,
} from '../../utils/mocks'
import {
  assertPhaseSuccess,
  assertPhaseFailure,
  validateRequiredFields,
} from '../../utils/helpers'
import * as fs from 'fs/promises'

// Mock fs module
jest.mock('fs/promises')

describe('InputAnalysisPhase', () => {
  let phase: InputAnalysisPhase
  
  beforeEach(() => {
    phase = new InputAnalysisPhase()
    jest.clearAllMocks()
    
    // Setup default fs mocks
    ;(fs.access as jest.Mock).mockResolvedValue(undefined)
    ;(fs.readdir as jest.Mock).mockResolvedValue([])
    ;(fs.stat as jest.Mock).mockResolvedValue({ size: 1024 })
    ;(fs.readFile as jest.Mock).mockResolvedValue('{}')
  })
  
  describe('Phase Configuration', () => {
    it('should have correct phase identifier', () => {
      expect(phase.phase).toBe(PipelinePhase.INPUT_ANALYSIS)
      expect(phase.name).toBe('input-analysis')
    })
    
    it('should have appropriate timeout', () => {
      expect(phase.config.timeout).toBe(30000) // 30 seconds
    })
    
    it('should have caching enabled', () => {
      expect(phase.config.cacheEnabled).toBe(true)
    })
    
    it('should not be optional', () => {
      expect(phase.config.optional).toBe(false)
    })
  })
  
  describe('Input Validation', () => {
    it('should validate required fields', async () => {
      const validInput = {
        stackTrace: 'Error: test error\n  at file.js:10:5',
        repoUrl: 'https://github.com/owner/repo',
        repoPath: '/tmp/repo',
      }
      
      const result = await phase.validate(validInput)
      
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
    
    it('should reject missing stack trace', async () => {
      const invalidInput = {
        stackTrace: '',
        repoUrl: 'https://github.com/owner/repo',
        repoPath: '/tmp/repo',
      }
      
      const result = await phase.validate(invalidInput)
      
      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.field === 'stackTrace')).toBe(true)
    })
    
    it('should reject invalid repository URL', async () => {
      const invalidInput = {
        stackTrace: 'Error: test',
        repoUrl: 'not-a-valid-url',
        repoPath: '/tmp/repo',
      }
      
      const result = await phase.validate(invalidInput)
      
      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.field === 'repoUrl')).toBe(true)
    })
    
    it('should reject non-existent repository path', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
      
      const invalidInput = {
        stackTrace: 'Error: test',
        repoUrl: 'https://github.com/owner/repo',
        repoPath: '/nonexistent/path',
      }
      
      const result = await phase.validate(invalidInput)
      
      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.field === 'repoPath')).toBe(true)
    })
    
    it('should warn about short stack traces', async () => {
      const input = {
        stackTrace: 'Error',
        repoUrl: 'https://github.com/owner/repo',
        repoPath: '/tmp/repo',
      }
      
      const result = await phase.validate(input)
      
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.message.includes('short'))).toBe(true)
    })
  })
  
  describe('Stack Trace Parsing', () => {
    it('should parse JavaScript stack trace', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `TypeError: Cannot read property 'foo' of undefined
    at Object.bar (/app/src/utils.js:42:15)
    at processData (/app/src/processor.js:128:20)`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.parsedStackTrace.errorType).toBe('TypeError')
      expect(result.data.parsedStackTrace.errorMessage).toContain('Cannot read property')
      expect(result.data.parsedStackTrace.language).toBe('javascript')
      expect(result.data.parsedStackTrace.frames).toHaveLength(2)
    })
    
    it('should parse TypeScript stack trace', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `Error: Test error
    at main (/app/src/index.ts:10:5)`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.parsedStackTrace.language).toBe('typescript')
    })
    
    it('should parse Python stack trace', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `ValueError: invalid literal
  File "/app/main.py", line 42, in process
    value = int(data)`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.parsedStackTrace.errorType).toBe('ValueError')
      expect(result.data.parsedStackTrace.language).toBe('python')
    })
    
    it('should extract stack frames with line numbers', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `Error: test
    at func1 (/app/file1.js:10:5)
    at func2 (/app/file2.js:20:10)`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      const frames = result.data.parsedStackTrace.frames
      expect(frames[0].file).toContain('file1.js')
      expect(frames[0].line).toBe(10)
      expect(frames[0].column).toBe(5)
      expect(frames[0].function).toBe('func1')
    })
  })
  
  describe('Error Context Extraction', () => {
    it('should determine error severity', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: 'SecurityError: Unauthorized access',
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.errorContext.severity).toBe(ErrorSeverity.CRITICAL)
    })
    
    it('should extract tags from error', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `TypeError: test
    at /app/src/utils.ts:10:5`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.errorContext.tags).toContain('typescript')
      expect(result.data.errorContext.tags).toContain('typeerror')
    })
    
    it('should include metadata from input', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          metadata: {
            environment: 'staging',
            userId: 'test-user',
          },
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.errorContext.metadata).toHaveProperty('userId', 'test-user')
    })
  })
  
  describe('Repository Analysis', () => {
    it('should extract repository metadata', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          repoUrl: 'https://github.com/test-owner/test-repo',
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.repoMetadata.owner).toBe('test-owner')
      expect(result.data.repoMetadata.name).toBe('test-repo')
    })
    
    it('should detect repository language', async () => {
      ;(fs.readdir as jest.Mock).mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false },
        { name: 'file2.ts', isDirectory: () => false },
        { name: 'file3.js', isDirectory: () => false },
      ])
      
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.repoMetadata.language).toBe('typescript')
    })
    
    it('should detect framework from package.json', async () => {
      ;(fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          dependencies: {
            react: '^18.0.0',
            next: '^14.0.0',
          },
        })
      )
      
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.repoMetadata.framework).toBe('Next.js')
    })
  })
  
  describe('Relevant Files Identification', () => {
    it('should identify files from stack trace', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `Error: test
    at /tmp/test-repo/src/utils.ts:10:5
    at /tmp/test-repo/src/index.ts:20:10`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.relevantFiles).toContain('src/utils.ts')
      expect(result.data.relevantFiles).toContain('src/index.ts')
    })
    
    it('should exclude node_modules files', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `Error: test
    at /tmp/test-repo/node_modules/lib/index.js:10:5
    at /tmp/test-repo/src/utils.ts:20:10`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.data.relevantFiles).not.toContain('node_modules/lib/index.js')
      expect(result.data.relevantFiles).toContain('src/utils.ts')
    })
  })
  
  describe('Issue Classification', () => {
    it('should classify security errors as SECURITY type', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: 'SecurityError: Unauthorized access attempt',
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      const classification = result.data.errorContext.metadata.classification as any
      expect(classification.type).toBe('SECURITY')
    })
    
    it('should determine complexity based on stack depth', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: `Error: test
    at func1 (file1.js:1:1)
    at func2 (file2.js:2:2)
    at func3 (file3.js:3:3)
    at func4 (file4.js:4:4)
    at func5 (file5.js:5:5)
    at func6 (file6.js:6:6)`,
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      const classification = result.data.errorContext.metadata.classification as any
      expect(classification.complexity).toBe('HIGH')
    })
    
    it('should provide confidence score', async () => {
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      const classification = result.data.errorContext.metadata.classification as any
      expect(classification.confidence).toBeGreaterThan(0)
      expect(classification.confidence).toBeLessThanOrEqual(1)
    })
  })
  
  describe('Output Validation', () => {
    it('should validate output structure', async () => {
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      validateRequiredFields(result.data, [
        'parsedStackTrace',
        'errorContext',
        'repoMetadata',
        'relevantFiles',
      ])
    })
    
    it('should warn if no relevant files found', async () => {
      const context = createMockPipelineContext({
        input: createMockPipelineInput({
          stackTrace: 'Error: generic error',
        }),
      })
      
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.warnings).toBeDefined()
    })
  })
  
  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('Permission denied'))
      
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      // Should still complete but may have warnings
      expect(result.status).toBeDefined()
    })
    
    it('should retry on transient errors', async () => {
      let attempts = 0
      ;(fs.readdir as jest.Mock).mockImplementation(() => {
        attempts++
        if (attempts < 2) {
          return Promise.reject(new Error('ETIMEDOUT'))
        }
        return Promise.resolve([])
      })
      
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      expect(attempts).toBeGreaterThan(1)
    })
    
    it('should fail after max retries', async () => {
      ;(fs.access as jest.Mock).mockRejectedValue(new Error('ETIMEDOUT'))
      
      const phase = new InputAnalysisPhase({
        maxRetries: 1,
        retryDelay: 10,
      })
      
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseFailure(result)
    })
  })
  
  describe('Performance', () => {
    it('should complete within timeout', async () => {
      const context = createMockPipelineContext()
      
      const startTime = Date.now()
      const result = await phase.execute(context)
      const duration = Date.now() - startTime
      
      expect(duration).toBeLessThan(phase.config.timeout)
    })
    
    it('should track resource usage', async () => {
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.metrics.resourceUsage).toBeDefined()
      expect(result.metrics.resourceUsage.memoryUsed).toBeGreaterThanOrEqual(0)
    })
  })
  
  describe('Metrics', () => {
    it('should provide execution metrics', async () => {
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(result.metrics.phase).toBe(PipelinePhase.INPUT_ANALYSIS)
      expect(result.metrics.duration).toBeGreaterThanOrEqual(0)
      expect(result.metrics.retryCount).toBeGreaterThanOrEqual(0)
    })
    
    it('should track cache hits', async () => {
      const context = createMockPipelineContext()
      const result = await phase.execute(context)
      
      assertPhaseSuccess(result)
      expect(typeof result.metrics.cacheHit).toBe('boolean')
    })
  })
})

// Made with Bob
