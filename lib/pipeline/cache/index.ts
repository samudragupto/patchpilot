/**
 * Pipeline Cache Module
 * 
 * This module provides a comprehensive caching layer for the PatchPilot pipeline system.
 * It supports multiple backends, TTL management, cache statistics, and intelligent
 * cache key generation.
 * 
 * @module pipeline/cache
 * 
 * @example
 * ```typescript
 * import { CacheManager, CacheBackend, createDevCacheManager } from '@/lib/pipeline/cache';
 * 
 * // Create a cache manager
 * const cache = createDevCacheManager();
 * 
 * // Generate cache key
 * const key = cache.generateKey({
 *   phase: PipelinePhase.AI_REASONING,
 *   inputHash: cache.hashObject(input),
 * });
 * 
 * // Cache phase output
 * await cache.set(key, output, { ttl: 3600 });
 * 
 * // Retrieve from cache
 * const result = await cache.get(key);
 * if (result.hit) {
 *   console.log('Cache hit!', result.value);
 * }
 * 
 * // Get statistics
 * const stats = await cache.getStatistics();
 * console.log(`Hit rate: ${stats.hitRate * 100}%`);
 * ```
 */

// ============================================================================
// Type Exports (must come first for internal use)
// ============================================================================

export type {
  // Configuration
  CacheConfiguration,
  CacheKeyComponents,
  CacheKeyOptions,
  
  // Cache Entry
  CacheEntry,
  CacheEntryMetadata,
  
  // Operations
  CacheGetOptions,
  CacheSetOptions,
  CacheInvalidationOptions,
  
  // Statistics
  CacheStatistics,
  PhaseStatistics,
  CacheBackendInfo,
  
  // Warming
  CacheWarmingConfig,
  CacheWarmingStrategy,
  CacheWarmingPattern,
  
  // Events
  CacheEvent,
  CacheEventListener,
  
  // Results
  CacheResult,
  
  // Interface
  ICacheManager,
} from './cache-types';

// ============================================================================
// Enum Exports
// ============================================================================

export {
  CacheBackend,
  CacheEvictionStrategy,
  CacheEventType,
} from './cache-types';

// ============================================================================
// Default Configuration Exports
// ============================================================================

export {
  DEFAULT_CACHE_CONFIG,
  DEFAULT_GET_OPTIONS,
  DEFAULT_SET_OPTIONS,
  DEFAULT_INVALIDATION_OPTIONS,
} from './cache-types';

// ============================================================================
// Core Exports
// ============================================================================

export {
  CacheManager,
  createCacheManager,
  createDevCacheManager,
  createProdCacheManager,
} from './cache-manager';

// ============================================================================
// Utility Functions
// ============================================================================

// Import types for internal use
import type { CacheConfiguration, CacheStatistics } from './cache-types';
import { createDevCacheManager } from './cache-manager';

/**
 * Create a cache key for a specific phase and input
 *
 * @param phase - Pipeline phase
 * @param input - Input to hash
 * @param config - Optional configuration to include
 * @returns Cache key
 *
 * @example
 * ```typescript
 * const key = createCacheKey(
 *   PipelinePhase.AI_REASONING,
 *   { stackTrace: '...', repoUrl: '...' }
 * );
 * ```
 */
export function createCacheKey(
  phase: string,
  input: unknown,
  config?: unknown
): string {
  const cache = createDevCacheManager();
  const inputHash = cache.hashObject(input);
  const configHash = config ? cache.hashObject(config) : undefined;
  
  return cache.generateKey({
    phase: phase as any,
    inputHash,
    configHash,
  }, {
    includeConfig: !!config,
  });
}

/**
 * Check if cache is enabled in configuration
 * 
 * @param config - Pipeline configuration
 * @returns True if caching is enabled
 */
export function isCacheEnabled(config: { cache?: { enabled?: boolean } }): boolean {
  return config.cache?.enabled ?? true;
}

/**
 * Get cache TTL for a specific phase
 * 
 * @param phase - Pipeline phase
 * @param config - Cache configuration
 * @returns TTL in seconds
 */
export function getCacheTTL(
  phase: string,
  config: Partial<CacheConfiguration>
): number {
  // Phase-specific TTLs can be configured here
  const phaseTTLs: Record<string, number> = {
    INPUT_ANALYSIS: 1800,      // 30 minutes
    AI_REASONING: 7200,        // 2 hours
    GRAPH_TRAVERSAL: 3600,     // 1 hour
    FIX_GENERATION: 1800,      // 30 minutes
    VALIDATION: 900,           // 15 minutes
    PR_ASSEMBLY: 600,          // 10 minutes
  };
  
  return phaseTTLs[phase] || config.defaultTTL || 3600;
}

/**
 * Format cache statistics for display
 * 
 * @param stats - Cache statistics
 * @returns Formatted statistics object
 */
export function formatCacheStatistics(stats: CacheStatistics): Record<string, string | number> {
  return {
    'Hit Rate': `${(stats.hitRate * 100).toFixed(2)}%`,
    'Total Hits': stats.hits,
    'Total Misses': stats.misses,
    'Entry Count': stats.entryCount,
    'Total Size': `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
    'Average Size': `${(stats.averageSize / 1024).toFixed(2)} KB`,
    'Evictions': stats.evictions,
    'Expirations': stats.expirations,
    'Backend': stats.backend.type,
    'Backend Status': stats.backend.status,
  };
}

/**
 * Calculate cache efficiency score (0-100)
 * 
 * @param stats - Cache statistics
 * @returns Efficiency score
 */
export function calculateCacheEfficiency(stats: CacheStatistics): number {
  const hitRateScore = stats.hitRate * 50; // 50% weight
  const utilizationScore = Math.min(stats.entryCount / 1000, 1) * 25; // 25% weight
  const evictionScore = Math.max(0, 1 - (stats.evictions / Math.max(stats.entryCount, 1))) * 25; // 25% weight
  
  return Math.round(hitRateScore + utilizationScore + evictionScore);
}

/**
 * Determine if cache should be warmed based on statistics
 * 
 * @param stats - Cache statistics
 * @returns True if warming is recommended
 */
export function shouldWarmCache(stats: CacheStatistics): boolean {
  // Warm cache if hit rate is low and we have few entries
  return stats.hitRate < 0.5 && stats.entryCount < 100;
}

/**
 * Get cache health status
 * 
 * @param stats - Cache statistics
 * @returns Health status
 */
export function getCacheHealth(stats: CacheStatistics): {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
  
  // Check hit rate
  if (stats.hitRate < 0.3) {
    issues.push('Low cache hit rate');
    recommendations.push('Consider cache warming or increasing TTL');
    status = 'WARNING';
  }
  
  // Check eviction rate
  const evictionRate = stats.evictions / Math.max(stats.entryCount, 1);
  if (evictionRate > 0.5) {
    issues.push('High eviction rate');
    recommendations.push('Increase cache size or reduce TTL');
    status = 'WARNING';
  }
  
  // Check backend status
  if (stats.backend.status !== 'CONNECTED') {
    issues.push('Cache backend not connected');
    recommendations.push('Check cache backend connection');
    status = 'CRITICAL';
  }
  
  // Check utilization
  if (stats.entryCount === 0) {
    issues.push('Cache is empty');
    recommendations.push('Verify cache is being used');
    status = 'WARNING';
  }
  
  return { status, issues, recommendations };
}

// ============================================================================
// Cache Decorators (for future use)
// ============================================================================

/**
 * Decorator to cache function results
 * 
 * @param ttl - Time to live in seconds
 * @returns Decorator function
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @Cacheable(3600)
 *   async expensiveOperation(input: string): Promise<string> {
 *     // ... expensive operation
 *   }
 * }
 * ```
 */
export function Cacheable(ttl?: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      // Cache implementation would go here
      // For now, just call the original method
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

/**
 * Decorator to invalidate cache on method call
 * 
 * @param pattern - Cache key pattern to invalidate
 * @returns Decorator function
 */
export function CacheInvalidate(pattern?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      // Cache invalidation would go here
      return result;
    };
    
    return descriptor;
  };
}

// Made with Bob