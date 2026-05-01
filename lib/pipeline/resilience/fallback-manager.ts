/**
 * Fallback Manager - Implements fallback strategies for graceful degradation
 * 
 * Provides multiple fallback levels and chains for handling failures gracefully.
 * Supports primary/fallback execution patterns with metrics tracking.
 * 
 * @module pipeline/resilience/fallback-manager
 */

/**
 * Fallback strategy types
 */
export enum FallbackStrategy {
  /** Return a default value */
  DEFAULT_VALUE = 'DEFAULT_VALUE',
  
  /** Use cached result */
  CACHED = 'CACHED',
  
  /** Use alternative implementation */
  ALTERNATIVE = 'ALTERNATIVE',
  
  /** Degrade functionality */
  DEGRADED = 'DEGRADED',
  
  /** Custom fallback function */
  CUSTOM = 'CUSTOM',
}

/**
 * Fallback configuration
 */
export interface FallbackConfig<T> {
  /** Fallback strategy type */
  readonly strategy: FallbackStrategy;
  
  /** Default value to return (for DEFAULT_VALUE strategy) */
  readonly defaultValue?: T;
  
  /** Alternative function to execute (for ALTERNATIVE strategy) */
  readonly alternativeFn?: () => Promise<T>;
  
  /** Whether to log fallback usage */
  readonly logFallback?: boolean;
  
  /** Custom error handler */
  readonly onError?: (error: Error) => void;
  
  /** Maximum fallback chain depth */
  readonly maxDepth?: number;
}

/**
 * Fallback execution result
 */
export interface FallbackResult<T> {
  /** The result value */
  readonly value: T;
  
  /** Whether fallback was used */
  readonly usedFallback: boolean;
  
  /** Which fallback level was used (0 = primary, 1+ = fallback) */
  readonly fallbackLevel: number;
  
  /** Strategy that was used */
  readonly strategy?: FallbackStrategy;
  
  /** Original error if primary failed */
  readonly error?: Error;
  
  /** Execution duration in milliseconds */
  readonly duration: number;
}

/**
 * Fallback metrics for monitoring
 */
export interface FallbackMetrics {
  /** Total number of operations */
  readonly totalOperations: number;
  
  /** Number of times primary succeeded */
  readonly primarySuccessCount: number;
  
  /** Number of times fallback was used */
  readonly fallbackUsedCount: number;
  
  /** Fallback usage rate (0-1) */
  readonly fallbackRate: number;
  
  /** Count by fallback level */
  readonly fallbackLevelCounts: Record<number, number>;
  
  /** Count by strategy type */
  readonly strategyUsage: Record<FallbackStrategy, number>;
}

/**
 * Registered fallback handler
 */
interface FallbackHandler<T = any> {
  readonly operation: string;
  readonly fallback: () => Promise<T>;
  readonly config?: FallbackConfig<T>;
}

/**
 * Default fallback configuration
 */
export const DEFAULT_FALLBACK_CONFIG: Partial<FallbackConfig<any>> = {
  logFallback: true,
  maxDepth: 3,
};

/**
 * Fallback Manager - Handles fallback strategies for graceful degradation
 * 
 * Features:
 * - Multiple fallback levels
 * - Fallback chain execution
 * - Strategy-based fallbacks
 * - Metrics tracking
 * - Registered fallback handlers
 * - Graceful degradation support
 * 
 * @example
 * ```typescript
 * const fallbackManager = new FallbackManager();
 * 
 * const result = await fallbackManager.executeWithFallback(
 *   async () => await primaryService.call(),
 *   async () => await fallbackService.call()
 * );
 * ```
 */
export class FallbackManager {
  private registeredFallbacks: Map<string, FallbackHandler>;
  private metrics: {
    totalOperations: number;
    primarySuccessCount: number;
    fallbackUsedCount: number;
    fallbackLevelCounts: Map<number, number>;
    strategyUsage: Map<FallbackStrategy, number>;
  };

  constructor() {
    this.registeredFallbacks = new Map();
    this.metrics = {
      totalOperations: 0,
      primarySuccessCount: 0,
      fallbackUsedCount: 0,
      fallbackLevelCounts: new Map(),
      strategyUsage: new Map(),
    };
  }

  /**
   * Execute primary function with fallback
   * 
   * @template T The return type of the functions
   * @param primary Primary function to execute
   * @param fallback Fallback function to execute if primary fails
   * @param config Optional fallback configuration
   * @returns Promise resolving to the result
   */
  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    config: Partial<FallbackConfig<T>> = {}
  ): Promise<T> {
    const result = await this.executeWithFallbackResult(primary, fallback, config);
    return result.value;
  }

  /**
   * Execute with fallback and return detailed result
   * 
   * @template T The return type of the functions
   * @param primary Primary function to execute
   * @param fallback Fallback function to execute if primary fails
   * @param config Optional fallback configuration
   * @returns Promise resolving to FallbackResult with details
   */
  async executeWithFallbackResult<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    config: Partial<FallbackConfig<T>> = {}
  ): Promise<FallbackResult<T>> {
    const fullConfig = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    const startTime = Date.now();
    
    this.metrics.totalOperations++;

    try {
      // Try primary function
      const value = await primary();
      
      // Success - update metrics
      this.metrics.primarySuccessCount++;
      this.incrementLevelCount(0);

      return {
        value,
        usedFallback: false,
        fallbackLevel: 0,
        duration: Date.now() - startTime,
      };
    } catch (primaryError) {
      const error = primaryError instanceof Error 
        ? primaryError 
        : new Error(String(primaryError));

      // Call error handler if provided
      if (fullConfig.onError) {
        fullConfig.onError(error);
      }

      // Log fallback usage if enabled
      if (fullConfig.logFallback) {
        console.warn('Primary operation failed, using fallback:', error.message);
      }

      try {
        // Execute fallback
        const value = await fallback();
        
        // Update metrics
        this.metrics.fallbackUsedCount++;
        this.incrementLevelCount(1);
        if (fullConfig.strategy) {
          this.incrementStrategyCount(fullConfig.strategy);
        }

        return {
          value,
          usedFallback: true,
          fallbackLevel: 1,
          strategy: fullConfig.strategy,
          error,
          duration: Date.now() - startTime,
        };
      } catch (fallbackError) {
        // Both primary and fallback failed
        throw new FallbackError(
          'Both primary and fallback operations failed',
          error,
          fallbackError instanceof Error 
            ? fallbackError 
            : new Error(String(fallbackError))
        );
      }
    }
  }

  /**
   * Execute with fallback chain (multiple fallback levels)
   * 
   * @template T The return type of the functions
   * @param operations Array of functions to try in order
   * @param config Optional fallback configuration
   * @returns Promise resolving to FallbackResult with details
   */
  async executeWithFallbackChain<T>(
    operations: Array<() => Promise<T>>,
    config: Partial<FallbackConfig<T>> = {}
  ): Promise<FallbackResult<T>> {
    const fullConfig = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    const startTime = Date.now();
    const maxDepth = fullConfig.maxDepth || operations.length;
    const errors: Error[] = [];

    this.metrics.totalOperations++;

    for (let level = 0; level < Math.min(operations.length, maxDepth); level++) {
      try {
        const value = await operations[level]();
        
        // Success at this level
        if (level === 0) {
          this.metrics.primarySuccessCount++;
        } else {
          this.metrics.fallbackUsedCount++;
          if (fullConfig.strategy) {
            this.incrementStrategyCount(fullConfig.strategy);
          }
        }
        
        this.incrementLevelCount(level);

        return {
          value,
          usedFallback: level > 0,
          fallbackLevel: level,
          strategy: level > 0 ? fullConfig.strategy : undefined,
          error: errors[0],
          duration: Date.now() - startTime,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);

        // Call error handler if provided
        if (fullConfig.onError) {
          fullConfig.onError(err);
        }

        // Log fallback usage if enabled and not last attempt
        if (fullConfig.logFallback && level < operations.length - 1) {
          console.warn(`Operation at level ${level} failed, trying next fallback:`, err.message);
        }
      }
    }

    // All operations failed
    throw new FallbackChainError(
      `All ${errors.length} operations in fallback chain failed`,
      errors
    );
  }

  /**
   * Register a fallback handler for a named operation
   * 
   * @param operation Operation name/identifier
   * @param fallback Fallback function
   * @param config Optional fallback configuration
   */
  registerFallback<T>(
    operation: string,
    fallback: () => Promise<T>,
    config?: FallbackConfig<T>
  ): void {
    this.registeredFallbacks.set(operation, {
      operation,
      fallback,
      config,
    });
  }

  /**
   * Get registered fallback for an operation
   * 
   * @param operation Operation name/identifier
   * @returns Fallback function if registered, undefined otherwise
   */
  getFallback(operation: string): (() => Promise<any>) | undefined {
    const handler = this.registeredFallbacks.get(operation);
    return handler?.fallback;
  }

  /**
   * Execute operation with registered fallback
   * 
   * @template T The return type of the functions
   * @param operation Operation name/identifier
   * @param primary Primary function to execute
   * @returns Promise resolving to the result
   * @throws Error if no fallback is registered for the operation
   */
  async executeWithRegisteredFallback<T>(
    operation: string,
    primary: () => Promise<T>
  ): Promise<T> {
    const handler = this.registeredFallbacks.get(operation);
    
    if (!handler) {
      throw new Error(`No fallback registered for operation: ${operation}`);
    }

    return this.executeWithFallback(
      primary,
      handler.fallback as () => Promise<T>,
      handler.config
    );
  }

  /**
   * Unregister a fallback handler
   * 
   * @param operation Operation name/identifier
   * @returns True if fallback was unregistered, false if not found
   */
  unregisterFallback(operation: string): boolean {
    return this.registeredFallbacks.delete(operation);
  }

  /**
   * Clear all registered fallbacks
   */
  clearFallbacks(): void {
    this.registeredFallbacks.clear();
  }

  /**
   * Get fallback metrics
   * 
   * @returns Current metrics snapshot
   */
  getMetrics(): FallbackMetrics {
    const fallbackRate = this.metrics.totalOperations > 0
      ? this.metrics.fallbackUsedCount / this.metrics.totalOperations
      : 0;

    const fallbackLevelCounts: Record<number, number> = {};
    this.metrics.fallbackLevelCounts.forEach((count, level) => {
      fallbackLevelCounts[level] = count;
    });

    const strategyUsage: Record<FallbackStrategy, number> = {} as any;
    this.metrics.strategyUsage.forEach((count, strategy) => {
      strategyUsage[strategy] = count;
    });

    return {
      totalOperations: this.metrics.totalOperations,
      primarySuccessCount: this.metrics.primarySuccessCount,
      fallbackUsedCount: this.metrics.fallbackUsedCount,
      fallbackRate,
      fallbackLevelCounts,
      strategyUsage,
    };
  }

  /**
   * Reset metrics counters
   */
  resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      primarySuccessCount: 0,
      fallbackUsedCount: 0,
      fallbackLevelCounts: new Map(),
      strategyUsage: new Map(),
    };
  }

  /**
   * Increment fallback level count
   * 
   * @param level Fallback level
   */
  private incrementLevelCount(level: number): void {
    const current = this.metrics.fallbackLevelCounts.get(level) || 0;
    this.metrics.fallbackLevelCounts.set(level, current + 1);
  }

  /**
   * Increment strategy usage count
   * 
   * @param strategy Fallback strategy
   */
  private incrementStrategyCount(strategy: FallbackStrategy): void {
    const current = this.metrics.strategyUsage.get(strategy) || 0;
    this.metrics.strategyUsage.set(strategy, current + 1);
  }
}

/**
 * Fallback error when both primary and fallback fail
 */
export class FallbackError extends Error {
  constructor(
    message: string,
    public readonly primaryError: Error,
    public readonly fallbackError: Error
  ) {
    super(message);
    this.name = 'FallbackError';
  }
}

/**
 * Fallback chain error when all operations in chain fail
 */
export class FallbackChainError extends Error {
  constructor(
    message: string,
    public readonly errors: Error[]
  ) {
    super(message);
    this.name = 'FallbackChainError';
  }
}

/**
 * Create a fallback manager instance
 * 
 * @returns New FallbackManager instance
 */
export function createFallbackManager(): FallbackManager {
  return new FallbackManager();
}

/**
 * Convenience function to execute with fallback
 * 
 * @template T The return type of the functions
 * @param primary Primary function to execute
 * @param fallback Fallback function to execute if primary fails
 * @param config Optional fallback configuration
 * @returns Promise resolving to the result
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  config: Partial<FallbackConfig<T>> = {}
): Promise<T> {
  const manager = new FallbackManager();
  return manager.executeWithFallback(primary, fallback, config);
}

/**
 * Create a fallback function that returns a default value
 * 
 * @template T The return type
 * @param defaultValue The default value to return
 * @returns Fallback function
 */
export function createDefaultValueFallback<T>(defaultValue: T): () => Promise<T> {
  return async () => defaultValue;
}

/**
 * Create a fallback function that returns cached value
 * 
 * @template T The return type
 * @param cache Cache object with get method
 * @param key Cache key
 * @returns Fallback function
 */
export function createCachedFallback<T>(
  cache: { get: (key: string) => T | undefined },
  key: string
): () => Promise<T> {
  return async () => {
    const cached = cache.get(key);
    if (cached === undefined) {
      throw new Error(`No cached value found for key: ${key}`);
    }
    return cached;
  };
}

// Made with Bob
