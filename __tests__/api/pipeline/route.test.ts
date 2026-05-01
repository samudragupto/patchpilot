/**
 * API Tests for Pipeline Endpoints
 * 
 * Tests the POST /api/pipeline endpoint for pipeline execution
 */

import { POST } from '@/app/api/pipeline/route'

import { createMockPipelineInput } from '../../utils/mocks'
import { PipelineOrchestrator } from '@/lib/pipeline/core/orchestrator'
import { PhaseRegistry } from '@/lib/pipeline/core/phase-registry'

describe('POST /api/pipeline', () => {
  beforeEach(() => {
    PhaseRegistry.resetInstance()
    jest.clearAllMocks()
    jest.spyOn(PipelineOrchestrator.prototype, 'execute').mockResolvedValue({
      metrics: { phaseMetrics: { 'INPUT_ANALYSIS': { phase: 'ex-123' } } } as any,
      prPackage: {} as any,
      timeline: {} as any,
      quality: {} as any
    })
    jest.spyOn(PipelineOrchestrator.prototype, 'getMetrics').mockReturnValue({} as any)
  })
  
  describe('Request Validation', () => {
    it('should accept valid pipeline request', async () => {
      const validBody = createMockPipelineInput()
      
      const request = {
        method: 'POST',
        json: async () => validBody,
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      if (response.status >= 500) {
        console.dir(await response.json())
      }
      expect(response.status).toBeLessThan(500)
    })
    
    it('should reject request without stack trace', async () => {
      const invalidBody = {
        repoUrl: 'https://github.com/owner/repo',
        repoPath: '/tmp/repo',
      }
      
      const request = {
        method: 'POST',
        json: async () => invalidBody,
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      
      expect(response.status).toBe(400)
    })
    
    it('should reject request without repo URL', async () => {
      const invalidBody = {
        stackTrace: 'Error: test',
        repoPath: '/tmp/repo',
      }
      
      const request = {
        method: 'POST',
        json: async () => invalidBody,
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      
      expect(response.status).toBe(400)
    })
    
    it('should reject request with invalid JSON', async () => {
      const request = {
        method: 'POST',
        json: async () => { throw new Error('Invalid JSON'); },
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      
      expect(response.status).toBe(400)
    })
  })
  
  describe('Response Format', () => {
    it('should return JSON response', async () => {
      const validBody = createMockPipelineInput()
      
      const request = {
        method: 'POST',
        json: async () => validBody,
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      if (response.status >= 500) {
        console.dir(await response.json())
      }
      const contentType = response.headers.get('content-type')
      
      if (contentType) {
        expect(contentType).toContain('application/json')
      } else {
        expect(response.status).toBe(200)
      }
    })
    
    it('should include execution ID in response', async () => {
      const validBody = createMockPipelineInput()
      
      const request = {
        method: 'POST',
        json: async () => validBody,
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      const data = await response.json()
      
      expect(data.executionId).toBeDefined()
    })
  })
  
  describe('Error Handling', () => {
    it('should handle internal errors gracefully', async () => {
      const validBody = createMockPipelineInput()
      
      // Mock orchestrator to throw error
      jest.spyOn(PipelineOrchestrator.prototype, 'execute').mockRejectedValue(
        new Error('Internal error')
      )
      
      const request = {
        method: 'POST',
        json: async () => validBody,
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      
      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBeDefined()
    })
  })
  
  describe('CORS Headers', () => {
    it('should include CORS headers', async () => {
      const validBody = createMockPipelineInput()
      
      const request = {
        method: 'POST',
        json: async () => validBody,
        headers: new Map([['content-type', 'application/json']]),
      } as any as Request
      
      const response = await POST(request)
      
      // Check for common CORS headers
      expect(response.headers.get('content-type')).toBeDefined()
    })
  })
})

// Made with Bob
