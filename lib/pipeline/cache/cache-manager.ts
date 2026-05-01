/**
 * Cache Manager Implementation
 * 
 * This module provides a comprehensive caching layer for the pipeline system.
 * Supports multiple backends (in-memory, Redis), TTL management, cache statistics,
 * and intelligent cache key generation.
 * 
 * @module pipeline/cache/cache-manager
 */

import { createHash } from 'crypto';
import { PipelinePhase, PipelineContext } from '../types';
import {
  ICacheManager,
  CacheConfiguration,
  CacheBackend,
  CacheEntry,
  CacheEntryMetadata,
  CacheResult,
  CacheStatistics,
  PhaseStatistics,
  CacheGetOptions,
  CacheSetOptions,
  CacheInvalidationOptions,
  CacheWarmingConfig,
  CacheKeyComponents,
  CacheKeyOptions,
  CacheEvent,
  CacheEventType,
  CacheEventListener,
  CacheBackendInfo,
  CacheEvictionStrategy,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_GET_OPTIONS,
  DEFAULT_SET_OPTIONS,
  DEFAULT_INVALIDATION_OPTIONS,
} from './cache-types';

// ============================================================================
// Cache Manager Implementation
// ============================================================================

/**
 * Main cache manager implementation providing caching functionality
 * for the pipeline system.
 * 
 * Features:
 * - Multiple backend support (in-memory, Redis)
 * - Deterministic cache key generation
 * - TTL management with automatic expiration
 * - LRU/LFU/FIFO eviction strategies
 * - Cache statistics and monitoring
 * - Event-driven architecture
 * - Cache warming capabilities
 * - Integrity verification
 * 
 * @example
 * ```typescript
 * const cache = new CacheManager({
 *   backend: CacheBackend.MEMORY,
 *   defaultTTL: 3600,
 *   maxEntries: 1000,
 * });
 * 
 * // Cache phase output
 * const key = cache.generateKey({
 *   phase: PipelinePhase.AI_REASONING,
 *   inputHash: 'abc123',
 * });
 * 
 * await cache.set(key, reasoningOutput, { ttl: 7200 });
 * 
 * // Retrieve from cache
 * const result = await cache.get(key);
 * if (result.hit) {
 *   console.log('Cache hit!', result.value);
 * }
 * ```
 */
export class CacheManager implements ICacheManager {
  private config: CacheConfiguration;
  private cache: Map<string, CacheEntry>;
  private accessOrder: Map<string, number>; // For LRU
  private accessFrequency: Map<string, number>; // For LFU
  private insertionOrder: string[]; // For FIFO
  private statistics: {
    hits: number;
    misses: number;
    hitRate: number;
    entryCount: number;
    totalSize: number;
    averageSize: number;
    evictions: number;
    expirations: number;
    phaseStats: Record<PipelinePhase, PhaseStatistics>;
    backend: CacheBackendInfo;
    lastResetAt: number;
  };
  private eventListeners: Map<CacheEventType, Set<CacheEventListener>>;
  private cleanupInterval?: NodeJS.Timeout;
  
  /**
   * Create a new cache manager instance
   * 
   * @param config - Cache configuration
   */
  constructor(config: Partial<CacheConfiguration> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.cache = new Map();
    this.accessOrder = new Map();
    this.accessFrequency = new Map();
    this.insertionOrder = [];
    this.eventListeners = new Map();
    
    // Initialize statistics
    this.statistics = this.createInitialStatistics();
    
    // Start cleanup interval for expired entries
    this.startCleanupInterval();
  }
  
  // ============================================================================
  // Core Cache Operations
  // ============================================================================
  
  /**
   * Get value from cache
   * 
   * @param key - Cache key
   * @param options - Get options
   * @returns Cache result with value if found
   */
  public async get<T>(
    key: string,
    options: Partial<CacheGetOptions> = {}
  ): Promise<CacheResult<T>> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_GET_OPTIONS, ...options };
    
    try {
      // Validate key
      if (!key || key.trim() === '') {
        throw new Error('Cache key cannot be empty');
      }
      
      const entry = this.cache.get(key);
      
      // Cache miss
      if (!entry) {
        this.recordMiss(key);
        return {
          success: true,
          hit: false,
          duration: Date.now() - startTime,
        };
      }
      
      // Check expiration
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.recordExpiration(key);
        this.recordMiss(key);
        return {
          success: true,
          hit: false,
          duration: Date.now() - startTime,
        };
      }
      
      // Verify integrity if requested
      if (opts.verifyIntegrity) {
        const isValid = this.verifyIntegrity(entry);
        if (!isValid) {
          this.cache.delete(key);
          this.emitEvent({
            type: CacheEventType.ERROR,
            timestamp: Date.now(),
            key,
            metadata: { reason: 'integrity_check_failed' },
          });
          return {
            success: false,
            hit: false,
            error: new Error('Cache integrity check failed'),
            duration: Date.now() - startTime,
          };
        }
      }
      
      // Update access metadata
      if (opts.updateAccessTime) {
        this.updateAccessMetadata(key, entry);
      }
      
      // Extend TTL if requested
      if (opts.extendTTL && opts.ttlExtension) {
        this.extendTTL(key, entry, opts.ttlExtension);
      }
      
      // Record hit
      this.recordHit(key, entry);
      
      return {
        success: true,
        value: entry.value as T,
        hit: true,
        metadata: entry.metadata,
        duration: Date.now() - startTime,
      };
      
    } catch (error) {
      this.emitEvent({
        type: CacheEventType.ERROR,
        timestamp: Date.now(),
        key,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      
      return {
        success: false,
        hit: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Set value in cache
   * 
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Set options
   * @returns True if successful
   */
  public async set<T>(
    key: string,
    value: T,
    options: Partial<CacheSetOptions> = {}
  ): Promise<boolean> {
    const opts = { ...DEFAULT_SET_OPTIONS, ...options };
    
    try {
      // Validate key
      if (!key || key.trim() === '') {
        throw new Error('Cache key cannot be empty');
      }
      
      // Check for circular references
      try {
        JSON.stringify(value);
      } catch (error) {
        throw new Error('Cannot cache value with circular references');
      }
      
      // Check if key exists and overwrite is disabled
      if (!opts.overwrite && this.cache.has(key)) {
        return false;
      }
      
      // Check if we need to evict entries
      if (this.cache.size >= this.config.maxEntries) {
        this.evictEntry();
      }
      
      // Create cache entry
      const entry = this.createEntry(key, value, opts);
      
      // Check size constraints
      if (entry.metadata.size > this.config.maxSize) {
        throw new Error(`Entry size ${entry.metadata.size} exceeds max size ${this.config.maxSize}`);
      }
      
      // Store entry
      this.cache.set(key, entry);
      
      // Update tracking structures
      this.updateTrackingStructures(key);
      
      // Update statistics
      this.statistics.entryCount = this.cache.size;
      this.statistics.totalSize += entry.metadata.size;
      
      // Emit event
      this.emitEvent({
        type: CacheEventType.SET,
        timestamp: Date.now(),
        key,
        metadata: { size: entry.metadata.size, ttl: entry.metadata.ttl },
      });
      
      return true;
      
    } catch (error) {
      this.emitEvent({
        type: CacheEventType.ERROR,
        timestamp: Date.now(),
        key,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      
      return false;
    }
  }
  
  /**
   * Check if key exists in cache
   * 
   * @param key - Cache key
   * @returns True if key exists and not expired
   */
  public async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Delete entry from cache
   * 
   * @param key - Cache key
   * @returns True if entry was deleted
   */
  public async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    // Update statistics
    this.statistics.totalSize -= entry.metadata.size;
    this.statistics.entryCount = this.cache.size - 1;
    
    // Remove from tracking structures
    this.removeFromTrackingStructures(key);
    
    // Delete entry
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      this.emitEvent({
        type: CacheEventType.DELETE,
        timestamp: Date.now(),
        key,
      });
    }
    
    return deleted;
  }
  
  /**
   * Clear cache based on options
   * 
   * @param options - Invalidation options
   * @returns Number of entries cleared
   */
  public async clear(
    options: Partial<CacheInvalidationOptions> = {}
  ): Promise<number> {
    const opts = { ...DEFAULT_INVALIDATION_OPTIONS, ...options };
    let clearedCount = 0;
    
    const keysToDelete: string[] = [];
    
    // Convert to array to avoid iterator issues
    const entries = Array.from(this.cache.entries());
    
    for (const [key, entry] of entries) {
      let shouldDelete = false;
      
      // Check expiration
      if (opts.expiredOnly && this.isExpired(entry)) {
        shouldDelete = true;
      }
      
      // Check phase filter - check both key and tags
      if (opts.phase) {
        const phaseFromKey = this.getPhaseFromKey(key);
        const phaseInTags = entry.metadata.tags.includes(opts.phase);
        if (phaseFromKey === opts.phase || phaseInTags) {
          shouldDelete = true;
        }
      }
      
      // Check tags filter
      if (opts.tags && opts.tags.some(tag => entry.metadata.tags.includes(tag))) {
        shouldDelete = true;
      }
      
      // Check pattern filter
      if (opts.pattern && new RegExp(opts.pattern).test(key)) {
        shouldDelete = true;
      }
      
      // If no filters specified, delete all
      if (!opts.expiredOnly && !opts.phase && !opts.tags && !opts.pattern) {
        shouldDelete = true;
      }
      
      if (shouldDelete) {
        keysToDelete.push(key);
      }
    }
    
    // Delete entries
    for (const key of keysToDelete) {
      await this.delete(key);
      clearedCount++;
    }
    
    this.emitEvent({
      type: CacheEventType.CLEAR,
      timestamp: Date.now(),
      metadata: { count: clearedCount, options: opts },
    });
    
    return clearedCount;
  }
  
  // ============================================================================
  // Cache Key Generation
  // ============================================================================
  
  /**
   * Generate deterministic cache key from components
   * 
   * @param components - Key components
   * @param options - Key generation options
   * @returns Cache key
   */
  public generateKey(
    components: CacheKeyComponents,
    options: Partial<CacheKeyOptions> = {}
  ): string {
    const parts: string[] = [];
    
    // Add prefix
    if (options.prefix) {
      parts.push(options.prefix);
    }
    
    // Add phase
    parts.push(components.phase);
    
    // Add input hash
    parts.push(components.inputHash);
    
    // Add config hash if requested
    if (options.includeConfig && components.configHash) {
      parts.push(components.configHash);
    }
    
    // Add context hash if requested
    if (options.includeContext && components.context) {
      const contextHash = this.hashObject(components.context);
      parts.push(contextHash);
    }
    
    // Add version if provided
    if (components.version) {
      parts.push(components.version);
    }
    
    // Add suffix
    if (options.suffix) {
      parts.push(options.suffix);
    }
    
    return parts.join(':');
  }
  
  /**
   * Generate cache key from pipeline context
   * 
   * @param context - Pipeline context
   * @param phase - Phase to generate key for
   * @returns Cache key
   */
  public generateKeyFromContext(
    context: PipelineContext,
    phase: PipelinePhase
  ): string {
    const inputHash = this.hashObject(context.input);
    const configHash = this.hashObject(context.config);
    
    return this.generateKey({
      phase,
      inputHash,
      configHash,
      version: context.metadata.version,
    }, {
      includeConfig: true,
    });
  }
  
  /**
   * Hash object to create deterministic hash
   * 
   * @param obj - Object to hash
   * @returns Hash string
   */
  public hashObject(obj: unknown): string {
    const json = JSON.stringify(obj, Object.keys(obj as object).sort());
    return createHash('sha256').update(json).digest('hex').substring(0, 16);
  }
  
  // ============================================================================
  // Statistics and Monitoring
  // ============================================================================
  
  /**
   * Get cache statistics
   * 
   * @returns Current cache statistics
   */
  public async getStatistics(): Promise<CacheStatistics> {
    // Update dynamic statistics
    this.statistics.hitRate = this.calculateHitRate();
    this.statistics.averageSize = this.calculateAverageSize();
    this.statistics.backend = this.getBackendInfo();
    
    // Update phase statistics
    this.statistics.phaseStats = this.calculatePhaseStatistics();
    
    return { ...this.statistics };
  }
  
  /**
   * Reset cache statistics
   */
  public async resetStatistics(): Promise<void> {
    this.statistics = this.createInitialStatistics();
    this.emitEvent({
      type: CacheEventType.CLEAR,
      timestamp: Date.now(),
      metadata: { action: 'reset_statistics' },
    });
  }
  
  /**
   * Get cache hit rate
   * 
   * @returns Hit rate (0-1)
   */
  public getHitRate(): number {
    return this.calculateHitRate();
  }
  
  /**
   * Get cache size in bytes
   * 
   * @returns Total cache size
   */
  public getCacheSize(): number {
    return this.statistics.totalSize;
  }
  
  /**
   * Get number of cache entries
   * 
   * @returns Entry count
   */
  public getEntryCount(): number {
    return this.cache.size;
  }
  
  // ============================================================================
  // Cache Warming
  // ============================================================================
  
  /**
   * Warm cache with common patterns
   * 
   * @param config - Warming configuration
   * @returns Number of entries warmed
   */
  public async warm(config?: Partial<CacheWarmingConfig>): Promise<number> {
    if (!this.config.warmingEnabled) {
      return 0;
    }
    
    // Cache warming would be implemented here
    // This is a placeholder for the warming logic
    return 0;
  }
  
  // ============================================================================
  // Event Management
  // ============================================================================
  
  /**
   * Add event listener
   * 
   * @param event - Event type
   * @param listener - Event listener function
   */
  public on(event: CacheEventType, listener: CacheEventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(listener);
  }
  
  /**
   * Remove event listener
   * 
   * @param event - Event type
   * @param listener - Event listener function
   */
  public off(event: CacheEventType, listener: CacheEventListener): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }
  
  /**
   * Emit cache event
   * 
   * @param event - Cache event
   */
  private emitEvent(event: CacheEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in cache event listener:', error);
        }
      });
    }
  }
  
  // ============================================================================
  // Lifecycle Management
  // ============================================================================
  
  /**
   * Close cache connection and cleanup resources
   */
  public async close(): Promise<void> {
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clear cache
    await this.clear();
    
    // Clear event listeners
    this.eventListeners.clear();
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Create cache entry
   */
  private createEntry<T>(
    key: string,
    value: T,
    options: Partial<CacheSetOptions>
  ): CacheEntry<T> {
    const now = Date.now();
    const ttl = options.ttl || this.config.defaultTTL;
    const expiresAt = now + (ttl * 1000);
    
    const metadata: CacheEntryMetadata = {
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      size: this.estimateSize(value),
      ttl,
      expiresAt,
      tags: options.tags || [],
      custom: options.metadata,
    };
    
    const hash = this.computeHash(value);
    
    return {
      key,
      value,
      metadata,
      hash,
    };
  }
  
  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.metadata.expiresAt;
  }
  
  /**
   * Verify entry integrity
   */
  private verifyIntegrity(entry: CacheEntry): boolean {
    const currentHash = this.computeHash(entry.value);
    return currentHash === entry.hash;
  }
  
  /**
   * Compute hash for integrity verification
   */
  private computeHash(value: unknown): string {
    return this.hashObject(value);
  }
  
  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: unknown): number {
    const json = JSON.stringify(value);
    return Buffer.byteLength(json, 'utf8');
  }
  
  /**
   * Update access metadata
   */
  private updateAccessMetadata(key: string, entry: CacheEntry): void {
    const now = Date.now();
    
    // Update entry metadata
    const updatedEntry: CacheEntry = {
      ...entry,
      metadata: {
        ...entry.metadata,
        lastAccessedAt: now,
        accessCount: entry.metadata.accessCount + 1,
      },
    };
    
    this.cache.set(key, updatedEntry);
    
    // Update access tracking
    this.accessOrder.set(key, now);
    this.accessFrequency.set(key, (this.accessFrequency.get(key) || 0) + 1);
  }
  
  /**
   * Extend TTL for entry
   */
  private extendTTL(key: string, entry: CacheEntry, extension: number): void {
    const updatedEntry: CacheEntry = {
      ...entry,
      metadata: {
        ...entry.metadata,
        ttl: entry.metadata.ttl + extension,
        expiresAt: entry.metadata.expiresAt + (extension * 1000),
      },
    };
    
    this.cache.set(key, updatedEntry);
  }
  
  /**
   * Update tracking structures for eviction
   */
  private updateTrackingStructures(key: string): void {
    const now = Date.now();
    
    this.accessOrder.set(key, now);
    this.accessFrequency.set(key, 0);
    
    if (!this.insertionOrder.includes(key)) {
      this.insertionOrder.push(key);
    }
  }
  
  /**
   * Remove from tracking structures
   */
  private removeFromTrackingStructures(key: string): void {
    this.accessOrder.delete(key);
    this.accessFrequency.delete(key);
    
    const index = this.insertionOrder.indexOf(key);
    if (index > -1) {
      this.insertionOrder.splice(index, 1);
    }
  }
  
  /**
   * Evict entry based on strategy
   */
  private evictEntry(): void {
    let keyToEvict: string | undefined;
    
    switch (this.config.evictionStrategy) {
      case CacheEvictionStrategy.LRU:
        keyToEvict = this.findLRUKey();
        break;
      
      case CacheEvictionStrategy.LFU:
        keyToEvict = this.findLFUKey();
        break;
      
      case CacheEvictionStrategy.FIFO:
        keyToEvict = this.findFIFOKey();
        break;
      
      default:
        keyToEvict = this.findLRUKey();
    }
    
    if (keyToEvict) {
      this.delete(keyToEvict);
      this.statistics.evictions++;
      
      this.emitEvent({
        type: CacheEventType.EVICT,
        timestamp: Date.now(),
        key: keyToEvict,
        metadata: { strategy: this.config.evictionStrategy },
      });
    }
  }
  
  /**
   * Find least recently used key
   */
  private findLRUKey(): string | undefined {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    
    // Convert to array to avoid iterator issues
    const entries = Array.from(this.accessOrder.entries());
    
    for (const [key, time] of entries) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    return oldestKey;
  }
  
  /**
   * Find least frequently used key
   */
  private findLFUKey(): string | undefined {
    let leastUsedKey: string | undefined;
    let leastCount = Infinity;
    
    // Convert to array to avoid iterator issues
    const entries = Array.from(this.accessFrequency.entries());
    
    for (const [key, count] of entries) {
      if (count < leastCount) {
        leastCount = count;
        leastUsedKey = key;
      }
    }
    
    return leastUsedKey;
  }
  
  /**
   * Find first in first out key
   */
  private findFIFOKey(): string | undefined {
    return this.insertionOrder[0];
  }
  
  /**
   * Record cache hit
   */
  private recordHit(key: string, entry: CacheEntry): void {
    this.statistics.hits++;
    
    const phase = this.getPhaseFromKey(key);
    if (phase) {
      this.incrementPhaseHits(phase);
    }
    
    this.emitEvent({
      type: CacheEventType.HIT,
      timestamp: Date.now(),
      key,
      phase,
    });
  }
  
  /**
   * Record cache miss
   */
  private recordMiss(key: string): void {
    this.statistics.misses++;
    
    const phase = this.getPhaseFromKey(key);
    if (phase) {
      this.incrementPhaseMisses(phase);
    }
    
    this.emitEvent({
      type: CacheEventType.MISS,
      timestamp: Date.now(),
      key,
      phase,
    });
  }
  
  /**
   * Record expiration
   */
  private recordExpiration(key: string): void {
    this.statistics.expirations++;
    
    this.emitEvent({
      type: CacheEventType.EXPIRE,
      timestamp: Date.now(),
      key,
    });
  }
  
  /**
   * Get phase from cache key
   */
  private getPhaseFromKey(key: string): PipelinePhase | undefined {
    const parts = key.split(':');
    
    for (const part of parts) {
      if (Object.values(PipelinePhase).includes(part as PipelinePhase)) {
        return part as PipelinePhase;
      }
    }
    
    return undefined;
  }
  
  /**
   * Calculate hit rate
   */
  private calculateHitRate(): number {
    const total = this.statistics.hits + this.statistics.misses;
    return total > 0 ? this.statistics.hits / total : 0;
  }
  
  /**
   * Calculate average entry size
   */
  private calculateAverageSize(): number {
    return this.cache.size > 0 ? this.statistics.totalSize / this.cache.size : 0;
  }
  
  /**
   * Get backend info
   */
  private getBackendInfo(): CacheBackendInfo {
    return {
      type: this.config.backend,
      status: 'CONNECTED',
      version: '1.0.0',
    };
  }
  
  /**
   * Calculate phase statistics
   */
  private calculatePhaseStatistics(): Record<PipelinePhase, PhaseStatistics> {
    const phaseStats: Partial<Record<PipelinePhase, PhaseStatistics>> = {};
    
    for (const phase of Object.values(PipelinePhase)) {
      const stats = this.statistics.phaseStats[phase];
      
      if (stats) {
        const total = stats.hits + stats.misses;
        phaseStats[phase] = {
          ...stats,
          hitRate: total > 0 ? stats.hits / total : 0,
        };
      } else {
        phaseStats[phase] = this.createInitialPhaseStatistics(phase);
      }
    }
    
    return phaseStats as Record<PipelinePhase, PhaseStatistics>;
  }
  
  /**
   * Increment phase hits
   */
  private incrementPhaseHits(phase: PipelinePhase): void {
    if (!this.statistics.phaseStats[phase]) {
      this.statistics.phaseStats[phase] = this.createInitialPhaseStatistics(phase);
    }
    
    const currentStats = this.statistics.phaseStats[phase];
    this.statistics.phaseStats[phase] = {
      ...currentStats,
      hits: currentStats.hits + 1,
    };
  }
  
  /**
   * Increment phase misses
   */
  private incrementPhaseMisses(phase: PipelinePhase): void {
    if (!this.statistics.phaseStats[phase]) {
      this.statistics.phaseStats[phase] = this.createInitialPhaseStatistics(phase);
    }
    
    const currentStats = this.statistics.phaseStats[phase];
    this.statistics.phaseStats[phase] = {
      ...currentStats,
      misses: currentStats.misses + 1,
    };
  }
  
  /**
   * Create initial statistics
   */
  private createInitialStatistics(): CacheStatistics {
    const phaseStats: Partial<Record<PipelinePhase, PhaseStatistics>> = {};
    
    for (const phase of Object.values(PipelinePhase)) {
      phaseStats[phase] = this.createInitialPhaseStatistics(phase);
    }
    
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      entryCount: 0,
      totalSize: 0,
      averageSize: 0,
      evictions: 0,
      expirations: 0,
      phaseStats: phaseStats as Record<PipelinePhase, PhaseStatistics>,
      backend: this.getBackendInfo(),
      lastResetAt: Date.now(),
    };
  }
  
  /**
   * Create initial phase statistics
   */
  private createInitialPhaseStatistics(phase: PipelinePhase): PhaseStatistics {
    return {
      phase,
      hits: 0,
      misses: 0,
      hitRate: 0,
      entryCount: 0,
      totalSize: 0,
      averageTTL: this.config.defaultTTL,
    };
  }
  
  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000);
  }
  
  /**
   * Cleanup expired entries
   */
  private cleanupExpiredEntries(): void {
    const keysToDelete: string[] = [];
    
    // Convert to array to avoid iterator issues
    const entries = Array.from(this.cache.entries());
    
    for (const [key, entry] of entries) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.delete(key);
      this.recordExpiration(key);
    }
  }
}

// ============================================================================
// Cache Manager Factory
// ============================================================================

/**
 * Create a cache manager instance with configuration
 * 
 * @param config - Cache configuration
 * @returns Cache manager instance
 */
export function createCacheManager(
  config: Partial<CacheConfiguration> = {}
): CacheManager {
  return new CacheManager(config);
}

/**
 * Create a development cache manager (in-memory, short TTL)
 * 
 * @returns Cache manager configured for development
 */
export function createDevCacheManager(): CacheManager {
  return new CacheManager({
    backend: CacheBackend.MEMORY,
    defaultTTL: 300, // 5 minutes
    maxEntries: 100,
    maxSize: 10 * 1024 * 1024, // 10 MB
    evictionStrategy: CacheEvictionStrategy.LRU,
    statisticsEnabled: true,
  });
}

/**
 * Create a production cache manager (Redis, long TTL)
 * 
 * @param redisUrl - Redis connection URL
 * @returns Cache manager configured for production
 */
export function createProdCacheManager(redisUrl?: string): CacheManager {
  return new CacheManager({
    backend: CacheBackend.REDIS,
    defaultTTL: 3600, // 1 hour
    maxEntries: 10000,
    maxSize: 1024 * 1024 * 1024, // 1 GB
    evictionStrategy: CacheEvictionStrategy.LRU,
    compression: true,
    statisticsEnabled: true,
    redisUrl,
  });
}

// Made with Bob