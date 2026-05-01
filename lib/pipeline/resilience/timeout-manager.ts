/**
 * Timeout Manager - Implements timeout handling for async operations
 * 
 * Provides configurable timeout mechanisms with proper cleanup and cancellation support.
 * Prevents operations from hanging indefinitely and provides detailed timeout errors.
 * 
 * @module pipeline/resilience/timeout-manager
 */

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  /** Timeout duration in milliseconds */
  readonly timeoutMs: number;
  
  /** Custom error message for timeout */
  readonly message?: string;
  
  /** Whether to include operation context in error */
  readonly includeContext?: boolean;
  
  /** Custom cleanup function to call on timeout */
  readonly onTimeout?: () => void | Promise<void>;
}

/**
 * Timeout result with metadata
 */
export interface TimeoutResult<T> {
  /** The result value if successful */
  readonly value?: T;
  
  /** Error if timeout occurred */
  readonly error?: TimeoutError;
  
  /** Whether the operation timed out */
  readonly timedOut: boolean;
  
  /** Actual duration in milliseconds */
  readonly duration: number;
  
  /** Whether the operation completed successfully */
  readonly success: boolean;
}

/**
 * Timeout statistics for monitoring
 */
export interface TimeoutStatistics {
  /** Total number of operations attempted */
  readonly totalOperations: number;
  
  /** Number of operations that timed out */
  readonly timeoutCount: number;
  
  /** Number of successful operations */
  readonly successCount: number;
  
  /** Timeout rate (0-1) */
  readonly timeoutRate: number;
  
  /** Average operation duration in milliseconds */
  readonly averageDuration: number;
  
  /** Maximum operation duration in milliseconds */
  readonly maxDuration: number;
}

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  timeoutMs: 30000, // 30 seconds
  includeContext: true,
};

/**
 * Timeout Manager - Handles timeout logic for async operations
 * 
 * Features:
 * - Configurable timeout per operation
 * - Automatic cleanup on timeout
 * - Detailed timeout errors with context
 * - Support for cancellation
 * - Statistics tracking
 * - Multiple concurrent timeout tracking
 * 
 * @example
 * ```typescript
 * const timeoutManager = new TimeoutManager();
 * 
 * const result = await timeoutManager.executeWithTimeout(
 *   async () => await longRunningOperation(),
 *   5000 // 5 second timeout
 * );
 * ```
 */
export class TimeoutManager {
  private activeTimeouts: Map<string, NodeJS.Timeout>;
  private statistics: {
    totalOperations: number;
    timeoutCount: number;
    successCount: number;
    totalDuration: number;
    maxDuration: number;
  };

  constructor() {
    this.activeTimeouts = new Map();
    this.statistics = {
      totalOperations: 0,
      timeoutCount: 0,
      successCount: 0,
      totalDuration: 0,
      maxDuration: 0,
    };
  }

  /**
   * Execute a function with timeout
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param timeoutMs Timeout in milliseconds
   * @param config Optional timeout configuration
   * @returns Promise resolving to the function result
   * @throws TimeoutError if operation times out
   */
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    config: Partial<TimeoutConfig> = {}
  ): Promise<T> {
    const fullConfig: TimeoutConfig = {
      ...DEFAULT_TIMEOUT_CONFIG,
      timeoutMs,
      ...config,
    };

    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    this.statistics.totalOperations++;

    try {
      const result = await Promise.race([
        fn(),
        this.createTimeoutPromise(operationId, fullConfig),
      ]);

      // Success - cleanup and update statistics
      this.clearTimeout(operationId);
      const duration = Date.now() - startTime;
      this.updateStatistics(duration, false);

      return result as T;
    } catch (error) {
      // Check if it's a timeout error
      if (error instanceof TimeoutError) {
        const duration = Date.now() - startTime;
        this.updateStatistics(duration, true);
        
        // Call cleanup function if provided
        if (fullConfig.onTimeout) {
          try {
            await fullConfig.onTimeout();
          } catch (cleanupError) {
            // Log cleanup error but don't throw
            console.error('Timeout cleanup failed:', cleanupError);
          }
        }
      }

      this.clearTimeout(operationId);
      throw error;
    }
  }

  /**
   * Execute with timeout and return detailed result
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param timeoutMs Timeout in milliseconds
   * @param config Optional timeout configuration
   * @returns Promise resolving to TimeoutResult with details
   */
  async executeWithTimeoutResult<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    config: Partial<TimeoutConfig> = {}
  ): Promise<TimeoutResult<T>> {
    const startTime = Date.now();

    try {
      const value = await this.executeWithTimeout(fn, timeoutMs, config);
      return {
        value,
        success: true,
        timedOut: false,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      return {
        error: isTimeout ? error : undefined,
        success: false,
        timedOut: isTimeout,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Create a promise that rejects after timeout
   * 
   * @param operationId Unique operation identifier
   * @param config Timeout configuration
   * @returns Promise that rejects with TimeoutError
   */
  createTimeoutPromise(
    operationId: string,
    config: TimeoutConfig
  ): Promise<never> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(operationId);
        
        const error = new TimeoutError(
          config.message || `Operation timed out after ${config.timeoutMs}ms`,
          config.timeoutMs,
          config.includeContext ? { operationId } : undefined
        );
        
        reject(error);
      }, config.timeoutMs);

      this.activeTimeouts.set(operationId, timeoutId);
    });
  }

  /**
   * Clear a specific timeout
   * 
   * @param operationId Operation identifier
   */
  clearTimeout(operationId: string): void {
    const timeoutId = this.activeTimeouts.get(operationId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(operationId);
    }
  }

  /**
   * Clear all active timeouts
   */
  clearAllTimeouts(): void {
    this.activeTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.activeTimeouts.clear();
  }

  /**
   * Get number of active timeouts
   * 
   * @returns Number of operations currently being tracked
   */
  getActiveCount(): number {
    return this.activeTimeouts.size;
  }

  /**
   * Get timeout statistics
   * 
   * @returns Current statistics snapshot
   */
  getStatistics(): TimeoutStatistics {
    const timeoutRate = this.statistics.totalOperations > 0
      ? this.statistics.timeoutCount / this.statistics.totalOperations
      : 0;

    const averageDuration = this.statistics.totalOperations > 0
      ? this.statistics.totalDuration / this.statistics.totalOperations
      : 0;

    return {
      totalOperations: this.statistics.totalOperations,
      timeoutCount: this.statistics.timeoutCount,
      successCount: this.statistics.successCount,
      timeoutRate,
      averageDuration,
      maxDuration: this.statistics.maxDuration,
    };
  }

  /**
   * Reset statistics counters
   */
  resetStatistics(): void {
    this.statistics = {
      totalOperations: 0,
      timeoutCount: 0,
      successCount: 0,
      totalDuration: 0,
      maxDuration: 0,
    };
  }

  /**
   * Update statistics after operation completion
   * 
   * @param duration Operation duration in milliseconds
   * @param timedOut Whether the operation timed out
   */
  private updateStatistics(duration: number, timedOut: boolean): void {
    this.statistics.totalDuration += duration;
    this.statistics.maxDuration = Math.max(this.statistics.maxDuration, duration);

    if (timedOut) {
      this.statistics.timeoutCount++;
    } else {
      this.statistics.successCount++;
    }
  }

  /**
   * Generate unique operation identifier
   * 
   * @returns Unique operation ID
   */
  private generateOperationId(): string {
    return `timeout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Timeout error with context
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Create a timeout manager instance
 * 
 * @returns New TimeoutManager instance
 */
export function createTimeoutManager(): TimeoutManager {
  return new TimeoutManager();
}

/**
 * Convenience function to execute with timeout
 * 
 * @template T The return type of the function
 * @param fn The async function to execute
 * @param timeoutMs Timeout in milliseconds
 * @param config Optional timeout configuration
 * @returns Promise resolving to the function result
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  config: Partial<TimeoutConfig> = {}
): Promise<T> {
  const manager = new TimeoutManager();
  return manager.executeWithTimeout(fn, timeoutMs, config);
}

/**
 * Create a timeout promise that can be used with Promise.race
 * 
 * @param timeoutMs Timeout in milliseconds
 * @param message Optional custom error message
 * @returns Promise that rejects after timeout
 */
export function createTimeout(
  timeoutMs: number,
  message?: string
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(
        message || `Operation timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
    }, timeoutMs);
  });
}

/**
 * Race multiple promises with a timeout
 * 
 * @template T The return type of the promises
 * @param promises Array of promises to race
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise resolving to the first completed promise
 */
export async function raceWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    ...promises,
    createTimeout(timeoutMs),
  ]) as Promise<T>;
}

/**
 * Execute multiple operations with individual timeouts
 * 
 * @template T The return type of the operations
 * @param operations Array of async functions to execute
 * @param timeoutMs Timeout in milliseconds for each operation
 * @returns Promise resolving to array of results
 */
export async function executeAllWithTimeout<T>(
  operations: Array<() => Promise<T>>,
  timeoutMs: number
): Promise<Array<TimeoutResult<T>>> {
  const manager = new TimeoutManager();
  
  return Promise.all(
    operations.map(op => 
      manager.executeWithTimeoutResult(op, timeoutMs)
    )
  );
}

// Made with Bob
