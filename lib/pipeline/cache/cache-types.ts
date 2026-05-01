/**
 * Cache Types and Interfaces
 * 
 * This module defines all types and interfaces for the pipeline caching layer.
 * Supports multiple cache backends, TTL management, and cache statistics.
 * 
 * @module pipeline/cache/cache-types
 */

import { PipelinePhase } from '../types';

// ============================================================================
// Cache Configuration
// ============================================================================

/**
 * Cache backend type
 */
export enum CacheBackend {
  /** In-memory cache (development) */
  MEMORY = 'MEMORY',
  
  /** Redis cache (production) */
  REDIS = 'REDIS',
  
  /** File-based cache */
  FILE = 'FILE',
}

/**
 * Cache eviction strategy
 */
export enum CacheEvictionStrategy {
  /** Least Recently Used */
  LRU = 'LRU',
  
  /** Least Frequently Used */
  LFU = 'LFU',
  
  /** First In First Out */
  FIFO = 'FIFO',
  
  /** Time To Live only */
  TTL_ONLY = 'TTL_ONLY',
}

/**
 * Cache configuration
 */
export interface CacheConfiguration {
  /** Cache backend to use */
  readonly backend: CacheBackend;
  
  /** Default TTL in seconds */
  readonly defaultTTL: number;
  
  /** Maximum cache size in bytes (for memory backend) */
  readonly maxSize: number;
  
  /** Maximum number of entries */
  readonly maxEntries: number;
  
  /** Eviction strategy */
  readonly evictionStrategy: CacheEvictionStrategy;
  
  /** Enable cache compression */
  readonly compression: boolean;
  
  /** Enable cache encryption */
  readonly encryption: boolean;
  
  /** Redis connection string (if using Redis backend) */
  readonly redisUrl?: string;
  
  /** File cache directory (if using file backend) */
  readonly cacheDir?: string;
  
  /** Enable cache warming */
  readonly warmingEnabled: boolean;
  
  /** Enable cache statistics */
  readonly statisticsEnabled: boolean;
}

// ============================================================================
// Cache Entry
// ============================================================================

/**
 * Cache entry metadata
 */
export interface CacheEntryMetadata {
  /** When the entry was created */
  readonly createdAt: number;
  
  /** When the entry was last accessed */
  readonly lastAccessedAt: number;
  
  /** Number of times accessed */
  readonly accessCount: number;
  
  /** Entry size in bytes */
  readonly size: number;
  
  /** Entry TTL in seconds */
  readonly ttl: number;
  
  /** When the entry expires */
  readonly expiresAt: number;
  
  /** Entry tags for categorization */
  readonly tags: string[];
  
  /** Custom metadata */
  readonly custom?: Record<string, unknown>;
}

/**
 * Cache entry
 */
export interface CacheEntry<T = unknown> {
  /** Cache key */
  readonly key: string;
  
  /** Cached value */
  readonly value: T;
  
  /** Entry metadata */
  readonly metadata: CacheEntryMetadata;
  
  /** Entry hash for integrity verification */
  readonly hash: string;
}

// ============================================================================
// Cache Key
// ============================================================================

/**
 * Cache key components for deterministic key generation
 */
export interface CacheKeyComponents {
  /** Pipeline phase */
  readonly phase: PipelinePhase;
  
  /** Input hash */
  readonly inputHash: string;
  
  /** Configuration hash */
  readonly configHash?: string;
  
  /** Additional context */
  readonly context?: Record<string, unknown>;
  
  /** Version for cache invalidation */
  readonly version?: string;
}

/**
 * Cache key options
 */
export interface CacheKeyOptions {
  /** Include configuration in key */
  readonly includeConfig: boolean;
  
  /** Include context in key */
  readonly includeContext: boolean;
  
  /** Custom key prefix */
  readonly prefix?: string;
  
  /** Custom key suffix */
  readonly suffix?: string;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Cache get options
 */
export interface CacheGetOptions {
  /** Update last accessed time */
  readonly updateAccessTime: boolean;
  
  /** Verify entry integrity */
  readonly verifyIntegrity: boolean;
  
  /** Extend TTL on access */
  readonly extendTTL: boolean;
  
  /** TTL extension in seconds */
  readonly ttlExtension?: number;
}

/**
 * Cache set options
 */
export interface CacheSetOptions {
  /** Entry TTL in seconds (overrides default) */
  readonly ttl?: number;
  
  /** Entry tags */
  readonly tags?: string[];
  
  /** Custom metadata */
  readonly metadata?: Record<string, unknown>;
  
  /** Overwrite existing entry */
  readonly overwrite: boolean;
  
  /** Compress entry */
  readonly compress?: boolean;
  
  /** Encrypt entry */
  readonly encrypt?: boolean;
}

/**
 * Cache invalidation options
 */
export interface CacheInvalidationOptions {
  /** Invalidate by phase */
  readonly phase?: PipelinePhase;
  
  /** Invalidate by tags */
  readonly tags?: string[];
  
  /** Invalidate by pattern */
  readonly pattern?: string;
  
  /** Invalidate expired entries */
  readonly expiredOnly: boolean;
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Cache statistics
 */
export interface CacheStatistics {
  /** Total number of cache hits */
  readonly hits: number;
  
  /** Total number of cache misses */
  readonly misses: number;
  
  /** Cache hit rate (0-1) */
  readonly hitRate: number;
  
  /** Total number of entries */
  readonly entryCount: number;
  
  /** Total cache size in bytes */
  readonly totalSize: number;
  
  /** Average entry size in bytes */
  readonly averageSize: number;
  
  /** Number of evictions */
  readonly evictions: number;
  
  /** Number of expirations */
  readonly expirations: number;
  
  /** Per-phase statistics */
  readonly phaseStats: Record<PipelinePhase, PhaseStatistics>;
  
  /** Cache backend info */
  readonly backend: CacheBackendInfo;
  
  /** Last reset time */
  readonly lastResetAt: number;
}

/**
 * Phase-specific cache statistics
 */
export interface PhaseStatistics {
  /** Phase identifier */
  readonly phase: PipelinePhase;
  
  /** Number of hits for this phase */
  readonly hits: number;
  
  /** Number of misses for this phase */
  readonly misses: number;
  
  /** Hit rate for this phase */
  readonly hitRate: number;
  
  /** Number of entries for this phase */
  readonly entryCount: number;
  
  /** Total size for this phase */
  readonly totalSize: number;
  
  /** Average TTL for this phase */
  readonly averageTTL: number;
}

/**
 * Cache backend information
 */
export interface CacheBackendInfo {
  /** Backend type */
  readonly type: CacheBackend;
  
  /** Backend status */
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  
  /** Backend version */
  readonly version?: string;
  
  /** Backend-specific info */
  readonly info?: Record<string, unknown>;
}

// ============================================================================
// Cache Warming
// ============================================================================

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig {
  /** Enable cache warming */
  readonly enabled: boolean;
  
  /** Warming strategies */
  readonly strategies: CacheWarmingStrategy[];
  
  /** Maximum concurrent warming operations */
  readonly maxConcurrent: number;
  
  /** Warming timeout in milliseconds */
  readonly timeout: number;
}

/**
 * Cache warming strategy
 */
export interface CacheWarmingStrategy {
  /** Strategy name */
  readonly name: string;
  
  /** Phase to warm */
  readonly phase: PipelinePhase;
  
  /** Common input patterns */
  readonly patterns: CacheWarmingPattern[];
  
  /** Priority (higher = warmed first) */
  readonly priority: number;
}

/**
 * Cache warming pattern
 */
export interface CacheWarmingPattern {
  /** Pattern description */
  readonly description: string;
  
  /** Input template */
  readonly inputTemplate: Record<string, unknown>;
  
  /** Expected frequency */
  readonly frequency: number;
}

// ============================================================================
// Cache Events
// ============================================================================

/**
 * Cache event type
 */
export enum CacheEventType {
  HIT = 'HIT',
  MISS = 'MISS',
  SET = 'SET',
  DELETE = 'DELETE',
  EVICT = 'EVICT',
  EXPIRE = 'EXPIRE',
  CLEAR = 'CLEAR',
  ERROR = 'ERROR',
}

/**
 * Cache event
 */
export interface CacheEvent {
  /** Event type */
  readonly type: CacheEventType;
  
  /** Event timestamp */
  readonly timestamp: number;
  
  /** Cache key involved */
  readonly key?: string;
  
  /** Phase involved */
  readonly phase?: PipelinePhase;
  
  /** Event metadata */
  readonly metadata?: Record<string, unknown>;
  
  /** Error if applicable */
  readonly error?: Error;
}

/**
 * Cache event listener
 */
export type CacheEventListener = (event: CacheEvent) => void | Promise<void>;

// ============================================================================
// Cache Result
// ============================================================================

/**
 * Cache operation result
 */
export interface CacheResult<T = unknown> {
  /** Whether operation was successful */
  readonly success: boolean;
  
  /** Cached value (if found) */
  readonly value?: T;
  
  /** Whether this was a cache hit */
  readonly hit: boolean;
  
  /** Entry metadata (if found) */
  readonly metadata?: CacheEntryMetadata;
  
  /** Error (if failed) */
  readonly error?: Error;
  
  /** Operation duration in milliseconds */
  readonly duration: number;
}

// ============================================================================
// Cache Manager Interface
// ============================================================================

/**
 * Cache manager interface
 */
export interface ICacheManager {
  /**
   * Get value from cache
   */
  get<T>(key: string, options?: Partial<CacheGetOptions>): Promise<CacheResult<T>>;
  
  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, options?: Partial<CacheSetOptions>): Promise<boolean>;
  
  /**
   * Check if key exists in cache
   */
  has(key: string): Promise<boolean>;
  
  /**
   * Delete entry from cache
   */
  delete(key: string): Promise<boolean>;
  
  /**
   * Clear cache
   */
  clear(options?: Partial<CacheInvalidationOptions>): Promise<number>;
  
  /**
   * Get cache statistics
   */
  getStatistics(): Promise<CacheStatistics>;
  
  /**
   * Reset cache statistics
   */
  resetStatistics(): Promise<void>;
  
  /**
   * Warm cache with common patterns
   */
  warm(config?: Partial<CacheWarmingConfig>): Promise<number>;
  
  /**
   * Add event listener
   */
  on(event: CacheEventType, listener: CacheEventListener): void;
  
  /**
   * Remove event listener
   */
  off(event: CacheEventType, listener: CacheEventListener): void;
  
  /**
   * Close cache connection
   */
  close(): Promise<void>;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfiguration = {
  backend: CacheBackend.MEMORY,
  defaultTTL: 3600, // 1 hour
  maxSize: 100 * 1024 * 1024, // 100 MB
  maxEntries: 1000,
  evictionStrategy: CacheEvictionStrategy.LRU,
  compression: false,
  encryption: false,
  warmingEnabled: false,
  statisticsEnabled: true,
};

/**
 * Default cache get options
 */
export const DEFAULT_GET_OPTIONS: CacheGetOptions = {
  updateAccessTime: true,
  verifyIntegrity: true,
  extendTTL: false,
};

/**
 * Default cache set options
 */
export const DEFAULT_SET_OPTIONS: CacheSetOptions = {
  overwrite: true,
};

/**
 * Default cache invalidation options
 */
export const DEFAULT_INVALIDATION_OPTIONS: CacheInvalidationOptions = {
  expiredOnly: false,
};

// Made with Bob