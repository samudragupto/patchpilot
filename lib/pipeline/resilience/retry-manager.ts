/**
 * Retry Manager - Implements retry logic with exponential backoff
 * 
 * Provides configurable retry mechanisms for handling transient failures
 * with exponential backoff, jitter, and retry statistics tracking.
 * 
 * @module pipeline/resilience/retry-manager
 */

import type { PipelineError, ErrorSeverity } from '../types';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  readonly maxAttempts: number;
  
  /** Initial delay in milliseconds before first retry */
  readonly initialDelay: number;
  
  /** Maximum delay in milliseconds between retries */
  readonly maxDelay: number;
  
  /** Multiplier for exponential backoff (e.g., 2 for doubling) */
  readonly backoffMultiplier: number;
  
  /** Error types/names that should trigger retries */
  readonly retryableErrors: string[];
  
  /** Whether to add jitter to backoff delays */
  readonly jitter?: boolean;
  
  /** Custom retry condition function */
  readonly shouldRetryFn?: (error: Error, attempt: number) => boolean;
}

/**
 * Retry statistics for monitoring
 */
export interface RetryStatistics {
  /** Total number of operations attempted */
  readonly totalAttempts: number;
  
  /** Number of successful operations */
  readonly successCount: number;
  
  /** Number of failed operations (after all retries) */
  readonly failureCount: number;
  
  /** Total number of retries performed */
  readonly retryCount: number;
  
  /** Average number of attempts per operation */
  readonly averageAttempts: number;
  
  /** Success rate (0-1) */
  readonly successRate: number;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** The result value if successful */
  readonly value?: T;
  
  /** Error if all retries failed */
  readonly error?: Error;
  
  /** Number of attempts made */
  readonly attempts: number;
  
  /** Total time spent including delays */
  readonly totalDuration: number;
  
  /** Whether the operation succeeded */
  readonly success: boolean;
}

/**
 * Default retry policy for common scenarios
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'NetworkError',
    'TimeoutError',
    'ServiceUnavailable',
    'RateLimitError',
  ],
  jitter: true,
};

/**
 * Retry Manager - Handles retry logic with exponential backoff
 * 
 * Features:
 * - Exponential backoff with configurable multiplier
 * - Optional jitter to prevent thundering herd
 * - Configurable retry conditions
 * - Retry statistics tracking
 * - Type-safe operation execution
 * 
 * @example
 * ```typescript
 * const retryManager = new RetryManager();
 * 
 * const result = await retryManager.executeWithRetry(
 *   async () => await fetchData(),
 *   { maxAttempts: 3, initialDelay: 1000 }
 * );
 * ```
 */
export class RetryManager {
  private statistics: {
    totalAttempts: number;
    successCount: number;
    failureCount: number;
    retryCount: number;
  };

  constructor() {
    this.statistics = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
    };
  }

  /**
   * Execute a function with retry logic
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param policy Retry policy configuration
   * @returns Promise resolving to the function result
   * @throws Error if all retry attempts fail
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    policy: Partial<RetryPolicy> = {}
  ): Promise<T> {
    const fullPolicy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...policy };
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempt = 0;

    this.statistics.totalAttempts++;

    while (attempt < fullPolicy.maxAttempts) {
      attempt++;

      try {
        const result = await fn();
        
        // Success - update statistics
        this.statistics.successCount++;
        if (attempt > 1) {
          this.statistics.retryCount += (attempt - 1);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const shouldRetry = this.shouldRetry(lastError, attempt, fullPolicy);

        if (!shouldRetry || attempt >= fullPolicy.maxAttempts) {
          // No more retries - fail
          this.statistics.failureCount++;
          if (attempt > 1) {
            this.statistics.retryCount += (attempt - 1);
          }
          throw this.createRetryError(lastError, attempt, Date.now() - startTime);
        }

        // Calculate backoff delay
        const delay = this.calculateBackoff(attempt, fullPolicy);
        
        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    this.statistics.failureCount++;
    throw this.createRetryError(
      lastError || new Error('Unknown error'),
      attempt,
      Date.now() - startTime
    );
  }

  /**
   * Execute with retry and return detailed result
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param policy Retry policy configuration
   * @returns Promise resolving to RetryResult with details
   */
  async executeWithRetryResult<T>(
    fn: () => Promise<T>,
    policy: Partial<RetryPolicy> = {}
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();

    try {
      const value = await this.executeWithRetry(fn, policy);
      return {
        value,
        success: true,
        attempts: 1, // Will be updated by executeWithRetry
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error(String(error)),
        success: false,
        attempts: policy.maxAttempts || DEFAULT_RETRY_POLICY.maxAttempts,
        totalDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Determine if an error should trigger a retry
   * 
   * @param error The error that occurred
   * @param attempt Current attempt number (1-based)
   * @param policy Retry policy
   * @returns True if should retry, false otherwise
   */
  shouldRetry(error: Error, attempt: number, policy: RetryPolicy): boolean {
    // Check if we've exceeded max attempts
    if (attempt >= policy.maxAttempts) {
      return false;
    }

    // Use custom retry function if provided
    if (policy.shouldRetryFn) {
      return policy.shouldRetryFn(error, attempt);
    }

    // Check if error type is retryable
    const errorName = error.name;
    const errorMessage = error.message;
    const errorCode = (error as any).code;

    return policy.retryableErrors.some(retryableError => {
      return (
        errorName === retryableError ||
        errorMessage.includes(retryableError) ||
        errorCode === retryableError
      );
    });
  }

  /**
   * Calculate backoff delay for retry attempt
   * 
   * Uses exponential backoff with optional jitter:
   * delay = min(initialDelay * (multiplier ^ (attempt - 1)), maxDelay)
   * 
   * @param attempt Current attempt number (1-based)
   * @param policy Retry policy
   * @returns Delay in milliseconds
   */
  calculateBackoff(attempt: number, policy: RetryPolicy): number {
    // Calculate exponential backoff
    const exponentialDelay = 
      policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt - 1);
    
    // Cap at max delay
    let delay = Math.min(exponentialDelay, policy.maxDelay);

    // Add jitter if enabled (±25% randomization)
    if (policy.jitter) {
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() * 2 - 1) * jitterRange;
      delay = Math.max(0, delay + jitter);
    }

    return Math.floor(delay);
  }

  /**
   * Get current retry statistics
   * 
   * @returns Current statistics snapshot
   */
  getStatistics(): RetryStatistics {
    const averageAttempts = this.statistics.totalAttempts > 0
      ? (this.statistics.totalAttempts + this.statistics.retryCount) / this.statistics.totalAttempts
      : 0;

    const successRate = this.statistics.totalAttempts > 0
      ? this.statistics.successCount / this.statistics.totalAttempts
      : 0;

    return {
      totalAttempts: this.statistics.totalAttempts,
      successCount: this.statistics.successCount,
      failureCount: this.statistics.failureCount,
      retryCount: this.statistics.retryCount,
      averageAttempts,
      successRate,
    };
  }

  /**
   * Reset statistics counters
   */
  resetStatistics(): void {
    this.statistics = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
    };
  }

  /**
   * Sleep for specified milliseconds
   * 
   * @param ms Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create an enhanced error with retry context
   * 
   * @param originalError The original error
   * @param attempts Number of attempts made
   * @param duration Total duration in milliseconds
   * @returns Enhanced error with retry context
   */
  private createRetryError(
    originalError: Error,
    attempts: number,
    duration: number
  ): Error {
    const error = new Error(
      `Operation failed after ${attempts} attempts (${duration}ms): ${originalError.message}`
    );
    error.name = 'RetryError';
    (error as any).originalError = originalError;
    (error as any).attempts = attempts;
    (error as any).duration = duration;
    error.stack = originalError.stack;
    return error;
  }
}

/**
 * Create a retry manager instance with default configuration
 * 
 * @returns New RetryManager instance
 */
export function createRetryManager(): RetryManager {
  return new RetryManager();
}

/**
 * Convenience function to execute with retry
 * 
 * @template T The return type of the function
 * @param fn The async function to execute
 * @param policy Retry policy configuration
 * @returns Promise resolving to the function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: Partial<RetryPolicy> = {}
): Promise<T> {
  const manager = new RetryManager();
  return manager.executeWithRetry(fn, policy);
}

// Made with Bob
