/**
 * Unit Tests for Cache Manager
 * 
 * Tests the caching layer functionality including operations, TTL, and statistics
 */

import { CacheManager } from '@/lib/pipeline/cache/cache-manager'
import { CacheBackend, CacheEvictionStrategy } from '@/lib/pipeline/cache/cache-types'
import { PipelinePhase } from '@/lib/pipeline/types'
import { wait } from '../../utils/helpers'

describe('CacheManager', () => {
  let cacheManager: CacheManager
  
  beforeEach(() => {
    cacheManager = new CacheManager({
      backend: CacheBackend.MEMORY,
      defaultTTL: 1, // 1 second for testing
      maxSize: 100 * 1024 * 1024,
      maxEntries: 100,
      evictionStrategy: CacheEvictionStrategy.LRU,
      compression: false,
      encryption: false,
      warmingEnabled: false,
      statisticsEnabled: true,
    })
  })
  
  afterEach(async () => {
    await cacheManager.clear()
    await cacheManager.close()
  })
  
  describe('Basic Operations', () => {
    it('should set and get a value', async () => {
      await cacheManager.set('test-key', { data: 'test-value' })
      const result = await cacheManager.get('test-key')
      
      expect(result.success).toBe(true)
      expect(result.hit).toBe(true)
      expect(result.value).toEqual({ data: 'test-value' })
    })
    
    it('should return miss for non-existent key', async () => {
      const result = await cacheManager.get('non-existent')
      
      expect(result.success).toBe(true)
      expect(result.hit).toBe(false)
      expect(result.value).toBeUndefined()
    })
    
    it('should delete a value', async () => {
      await cacheManager.set('test-key', { data: 'test-value' })
      const deleted = await cacheManager.delete('test-key')
      const result = await cacheManager.get('test-key')
      
      expect(deleted).toBe(true)
      expect(result.hit).toBe(false)
    })
    
    it('should check if key exists', async () => {
      await cacheManager.set('test-key', { data: 'test-value' })
      
      expect(await cacheManager.has('test-key')).toBe(true)
      expect(await cacheManager.has('non-existent')).toBe(false)
    })
    
    it('should clear all entries', async () => {
      await cacheManager.set('key1', { data: 'value1' })
      await cacheManager.set('key2', { data: 'value2' })
      const cleared = await cacheManager.clear()
      
      expect(cleared).toBeGreaterThan(0)
      expect(await cacheManager.has('key1')).toBe(false)
      expect(await cacheManager.has('key2')).toBe(false)
    })
  })
  
  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      await cacheManager.set('test-key', { data: 'test-value' })
      
      // Value should exist immediately
      let result = await cacheManager.get('test-key')
      expect(result.hit).toBe(true)
      
      // Wait for TTL to expire
      await wait(1100)
      
      // Value should be expired
      result = await cacheManager.get('test-key')
      expect(result.hit).toBe(false)
    })
    
    it('should allow custom TTL per entry', async () => {
      await cacheManager.set('short-ttl', { data: 'value1' }, { ttl: 0.5 })
      await cacheManager.set('long-ttl', { data: 'value2' }, { ttl: 2 })
      
      // Wait for short TTL to expire
      await wait(600)
      
      const shortResult = await cacheManager.get('short-ttl')
      const longResult = await cacheManager.get('long-ttl')
      
      expect(shortResult.hit).toBe(false)
      expect(longResult.hit).toBe(true)
    })
  })
  
  describe('Cache Statistics', () => {
    it('should track cache hits and misses', async () => {
      await cacheManager.set('test-key', { data: 'test-value' })
      
      // Hit
      await cacheManager.get('test-key')
      
      // Miss
      await cacheManager.get('non-existent')
      
      const stats = await cacheManager.getStatistics()
      
      expect(stats.hits).toBeGreaterThanOrEqual(1)
      expect(stats.misses).toBeGreaterThanOrEqual(1)
      expect(stats.hitRate).toBeGreaterThan(0)
    })
    
    it('should track cache size', async () => {
      await cacheManager.set('key1', { data: 'value1' })
      await cacheManager.set('key2', { data: 'value2' })
      
      const stats = await cacheManager.getStatistics()
      
      expect(stats.entryCount).toBeGreaterThanOrEqual(2)
    })
    
    it('should reset statistics', async () => {
      await cacheManager.set('key1', { data: 'value1' })
      await cacheManager.get('key1')
      
      await cacheManager.resetStatistics()
      
      const stats = await cacheManager.getStatistics()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })
  
  describe('Key Generation', () => {
    it('should generate consistent keys for same input', () => {
      const components1 = {
        phase: PipelinePhase.INPUT_ANALYSIS,
        inputHash: 'hash123',
      }
      const components2 = {
        phase: PipelinePhase.INPUT_ANALYSIS,
        inputHash: 'hash123',
      }
      
      const key1 = cacheManager.generateKey(components1)
      const key2 = cacheManager.generateKey(components2)
      
      expect(key1).toBe(key2)
    })
    
    it('should generate different keys for different input', () => {
      const components1 = {
        phase: PipelinePhase.INPUT_ANALYSIS,
        inputHash: 'hash1',
      }
      const components2 = {
        phase: PipelinePhase.INPUT_ANALYSIS,
        inputHash: 'hash2',
      }
      
      const key1 = cacheManager.generateKey(components1)
      const key2 = cacheManager.generateKey(components2)
      
      expect(key1).not.toBe(key2)
    })
    
    it('should include phase in key', () => {
      const components1 = {
        phase: PipelinePhase.INPUT_ANALYSIS,
        inputHash: 'hash123',
      }
      const components2 = {
        phase: PipelinePhase.AI_REASONING,
        inputHash: 'hash123',
      }
      
      const key1 = cacheManager.generateKey(components1)
      const key2 = cacheManager.generateKey(components2)
      
      expect(key1).not.toBe(key2)
    })
  })
  
  describe('Cache Warming', () => {
    it('should warm cache with initial data', async () => {
      const warmed = await cacheManager.warm({
        enabled: true,
        strategies: [],
        maxConcurrent: 5,
        timeout: 5000,
      })
      
      expect(warmed).toBeGreaterThanOrEqual(0)
    })
  })
  
  describe('Event Listeners', () => {
    it('should register and trigger event listeners', async () => {
      const hitListener = jest.fn()
      const missListener = jest.fn()
      
      cacheManager.on('HIT' as any, hitListener)
      cacheManager.on('MISS' as any, missListener)
      
      await cacheManager.set('test-key', { data: 'test-value' })
      await cacheManager.get('test-key') // Hit
      await cacheManager.get('non-existent') // Miss
      
      // Give events time to fire
      await wait(100)
      
      expect(hitListener).toHaveBeenCalled()
      expect(missListener).toHaveBeenCalled()
    })
    
    it('should remove event listeners', async () => {
      const listener = jest.fn()
      
      cacheManager.on('HIT' as any, listener)
      cacheManager.off('HIT' as any, listener)
      
      await cacheManager.set('test-key', { data: 'test-value' })
      await cacheManager.get('test-key')
      
      await wait(100)
      
      // Listener should not be called after removal
      expect(listener).not.toHaveBeenCalled()
    })
  })
  
  describe('Cache Options', () => {
    it('should support tags for categorization', async () => {
      await cacheManager.set('key1', { data: 'value1' }, {
        tags: ['user', 'profile'],
      })
      
      const result = await cacheManager.get('key1')
      expect(result.hit).toBe(true)
      expect(result.metadata?.tags).toContain('user')
      expect(result.metadata?.tags).toContain('profile')
    })
    
    it('should support custom metadata', async () => {
      await cacheManager.set('key1', { data: 'value1' }, {
        metadata: { userId: '123', source: 'api' },
      })
      
      const result = await cacheManager.get('key1')
      expect(result.hit).toBe(true)
      expect(result.metadata?.custom).toHaveProperty('userId', '123')
    })
    
    it('should verify integrity when requested', async () => {
      await cacheManager.set('key1', { data: 'value1' })
      
      const result = await cacheManager.get('key1', {
        verifyIntegrity: true,
      })
      
      expect(result.success).toBe(true)
      expect(result.hit).toBe(true)
    })
  })
  
  describe('Error Handling', () => {
    it('should handle invalid keys gracefully', async () => {
      const result = await cacheManager.get('')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
    
    it('should handle serialization errors', async () => {
      const circular: any = { a: 1 }
      circular.self = circular
      
      const result = await cacheManager.set('circular', circular)
      expect(result).toBe(false)
    })
  })
  
  describe('Performance', () => {
    it('should handle concurrent operations', async () => {
      const operations = Array(50).fill(null).map((_, i) => 
        cacheManager.set(`key${i}`, { data: `value${i}` })
      )
      
      await Promise.all(operations)
      
      const stats = await cacheManager.getStatistics()
      expect(stats.entryCount).toBeGreaterThan(0)
    })
    
    it('should track operation duration', async () => {
      await cacheManager.set('test-key', { data: 'test-value' })
      const result = await cacheManager.get('test-key')
      
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })
  
  describe('Cache Invalidation', () => {
    it('should clear by phase', async () => {
      await cacheManager.set('key1', { data: 'value1' }, {
        tags: [PipelinePhase.INPUT_ANALYSIS],
      })
      await cacheManager.set('key2', { data: 'value2' }, {
        tags: [PipelinePhase.AI_REASONING],
      })
      
      await cacheManager.clear({
        phase: PipelinePhase.INPUT_ANALYSIS,
      })
      
      expect(await cacheManager.has('key1')).toBe(false)
      expect(await cacheManager.has('key2')).toBe(true)
    })
    
    it('should clear by tags', async () => {
      await cacheManager.set('key1', { data: 'value1' }, {
        tags: ['user', 'profile'],
      })
      await cacheManager.set('key2', { data: 'value2' }, {
        tags: ['post'],
      })
      
      await cacheManager.clear({
        tags: ['user'],
      })
      
      expect(await cacheManager.has('key1')).toBe(false)
      expect(await cacheManager.has('key2')).toBe(true)
    })
  })
})

// Made with Bob
