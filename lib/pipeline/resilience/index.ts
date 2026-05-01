/**
 * Resilience Layer - Unified interface for all resilience components
 * 
 * Combines retry logic, circuit breaker, timeout handling, and fallback strategies
 * into a cohesive resilience management system for robust error handling.
 * 
 * @module pipeline/resilience
 */

import { RetryManager, RetryPolicy, RetryStatistics } from './retry-manager';
import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerMetrics, CircuitState } from './circuit-breaker';
import { TimeoutManager, TimeoutConfig, TimeoutStatistics } from './timeout-manager';
import { FallbackManager, FallbackConfig, FallbackMetrics, FallbackStrategy } from './fallback-manager';

// Re-export all types and classes
export * from './retry-manager';
export * from './circuit-breaker';
export * from './timeout-manager';
export * from './fallback-manager';

/**
 * Comprehensive resilience configuration
 */
export interface ResilienceConfig {
  /** Retry configuration */
  readonly retry?: Partial<RetryPolicy>;
  
  /** Circuit breaker configuration */
  readonly circuitBreaker?: Partial<CircuitBreakerConfig>;
  
  /** Timeout configuration */
  readonly timeout?: Partial<TimeoutConfig>;
  
  /** Fallback configuration */
  readonly fallback?: Partial<FallbackConfig<any>>;
  
  /** Enable/disable specific resilience features */
  readonly features?: {
    readonly retry?: boolean;
    readonly circuitBreaker?: boolean;
    readonly timeout?: boolean;
    readonly fallback?: boolean;
  };
}

/**
 * Resilience execution options
 */
export interface ResilienceOptions {
  /** Operation name for logging and metrics */
  readonly operationName?: string;
  
  /** Timeout in milliseconds */
  readonly timeoutMs?: number;
  
  /** Retry policy override */
  readonly retryPolicy?: Partial<RetryPolicy>;
  
  /** Fallback function */
  readonly fallback?: () => Promise<any>;
  
  /** Whether to use circuit breaker */
  readonly useCircuitBreaker?: boolean;
  
  /** Custom error handler */
  readonly onError?: (error: Error) => void;
}

/**
 * Comprehensive resilience metrics
 */
export interface ResilienceMetrics {
  /** Retry metrics */
  readonly retry: RetryStatistics;
  
  /** Circuit breaker metrics */
  readonly circuitBreaker: CircuitBreakerMetrics;
  
  /** Timeout metrics */
  readonly timeout: TimeoutStatistics;
  
  /** Fallback metrics */
  readonly fallback: FallbackMetrics;
}

/**
 * Resilience execution result
 */
export interface ResilienceResult<T> {
  /** The result value if successful */
  readonly value?: T;
  
  /** Error if operation failed */
  readonly error?: Error;
  
  /** Whether the operation succeeded */
  readonly success: boolean;
  
  /** Total execution duration */
  readonly duration: number;
  
  /** Number of retry attempts */
  readonly retryAttempts: number;
  
  /** Whether fallback was used */
  readonly usedFallback: boolean;
  
  /** Whether timeout occurred */
  readonly timedOut: boolean;
  
  /** Circuit breaker state during execution */
  readonly circuitState: CircuitState;
}

/**
 * Default resilience configuration
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  features: {
    retry: true,
    circuitBreaker: true,
    timeout: true,
    fallback: true,
  },
};

/**
 * Resilience Manager - Unified interface for all resilience components
 * 
 * Combines retry logic, circuit breaker, timeout handling, and fallback strategies
 * into a single, easy-to-use interface. Provides automatic error recovery with
 * comprehensive metrics and observability.
 * 
 * Features:
 * - Integrated retry + circuit breaker + timeout + fallback
 * - Configurable resilience strategies
 * - Comprehensive metrics tracking
 * - Automatic error recovery
 * - Operation-level configuration
 * - Thread-safe for concurrent operations
 * 
 * @example
 * ```typescript
 * const resilience = new ResilienceManager({
 *   retry: { maxAttempts: 3 },
 *   timeout: { timeoutMs: 5000 },
 *   circuitBreaker: { failureThreshold: 5 }
 * });
 * 
 * const result = await resilience.executeResilient(
 *   async () => await externalService.call(),
 *   {
 *     operationName: 'external-service-call',
 *     fallback: async () => await cachedService.get()
 *   }
 * );
 * ```
 */
export class ResilienceManager {
  private readonly retryManager: RetryManager;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly timeoutManager: TimeoutManager;
  private readonly fallbackManager: FallbackManager;
  private readonly config: ResilienceConfig;

  constructor(config: ResilienceConfig = {}) {
    this.config = { ...DEFAULT_RESILIENCE_CONFIG, ...config };
    
    this.retryManager = new RetryManager();
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.timeoutManager = new TimeoutManager();
    this.fallbackManager = new FallbackManager();
  }

  /**
   * Execute a function with full resilience protection
   * 
   * Applies retry logic, circuit breaker, timeout, and fallback in an integrated manner.
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param options Execution options
   * @returns Promise resolving to the function result
   */
  async executeResilient<T>(
    fn: () => Promise<T>,
    options: ResilienceOptions = {}
  ): Promise<T> {
    const result = await this.executeResilientWithResult(fn, options);
    
    if (!result.success) {
      throw result.error || new Error('Operation failed');
    }
    
    return result.value as T;
  }

  /**
   * Execute with resilience and return detailed result
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param options Execution options
   * @returns Promise resolving to ResilienceResult with details
   */
  async executeResilientWithResult<T>(
    fn: () => Promise<T>,
    options: ResilienceOptions = {}
  ): Promise<ResilienceResult<T>> {
    const startTime = Date.now();
    let retryAttempts = 0;
    let usedFallback = false;
    let timedOut = false;
    let circuitState = this.circuitBreaker.getState();

    try {
      // Build the resilience chain
      let operation = fn;

      // 1. Apply timeout if enabled and configured
      if (this.isFeatureEnabled('timeout') && options.timeoutMs) {
        const timeoutMs = options.timeoutMs;
        operation = () => this.timeoutManager.executeWithTimeout(fn, timeoutMs);
      }

      // 2. Apply circuit breaker if enabled
      if (this.isFeatureEnabled('circuitBreaker') && options.useCircuitBreaker !== false) {
        const wrappedOp = operation;
        operation = () => this.circuitBreaker.execute(wrappedOp);
      }

      // 3. Apply retry if enabled
      if (this.isFeatureEnabled('retry')) {
        const retryPolicy = { ...this.config.retry, ...options.retryPolicy };
        const wrappedOp = operation;
        operation = async () => {
          const result = await this.retryManager.executeWithRetryResult(wrappedOp, retryPolicy);
          retryAttempts = result.attempts;
          if (!result.success) {
            throw result.error;
          }
          return result.value as T;
        };
      }

      // 4. Apply fallback if enabled and provided
      if (this.isFeatureEnabled('fallback') && options.fallback) {
        const wrappedOp = operation;
        const fallbackOp = options.fallback;
        operation = async () => {
          const result = await this.fallbackManager.executeWithFallbackResult(
            wrappedOp,
            fallbackOp as () => Promise<T>
          );
          usedFallback = result.usedFallback;
          return result.value;
        };
      }

      // Execute the resilience chain
      const value = await operation();
      circuitState = this.circuitBreaker.getState();

      return {
        value,
        success: true,
        duration: Date.now() - startTime,
        retryAttempts,
        usedFallback,
        timedOut,
        circuitState,
      };
    } catch (error) {
      circuitState = this.circuitBreaker.getState();
      
      // Check if it was a timeout
      if (error instanceof Error && error.name === 'TimeoutError') {
        timedOut = true;
      }

      // Call error handler if provided
      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }

      return {
        error: error instanceof Error ? error : new Error(String(error)),
        success: false,
        duration: Date.now() - startTime,
        retryAttempts,
        usedFallback,
        timedOut,
        circuitState,
      };
    }
  }

  /**
   * Execute with retry only
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param policy Retry policy
   * @returns Promise resolving to the function result
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    policy?: Partial<RetryPolicy>
  ): Promise<T> {
    return this.retryManager.executeWithRetry(fn, policy);
  }

  /**
   * Execute with circuit breaker only
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @returns Promise resolving to the function result
   */
  async executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(fn);
  }

  /**
   * Execute with timeout only
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise resolving to the function result
   */
  async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return this.timeoutManager.executeWithTimeout(fn, timeoutMs);
  }

  /**
   * Execute with fallback only
   * 
   * @template T The return type of the function
   * @param primary Primary function to execute
   * @param fallback Fallback function
   * @returns Promise resolving to the function result
   */
  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    return this.fallbackManager.executeWithFallback(primary, fallback);
  }

  /**
   * Register a fallback handler for a named operation
   * 
   * @param operation Operation name
   * @param fallback Fallback function
   */
  registerFallback<T>(operation: string, fallback: () => Promise<T>): void {
    this.fallbackManager.registerFallback(operation, fallback);
  }

  /**
   * Get comprehensive resilience metrics
   * 
   * @returns Current metrics from all resilience components
   */
  getMetrics(): ResilienceMetrics {
    return {
      retry: this.retryManager.getStatistics(),
      circuitBreaker: this.circuitBreaker.getMetrics(),
      timeout: this.timeoutManager.getStatistics(),
      fallback: this.fallbackManager.getMetrics(),
    };
  }

  /**
   * Get circuit breaker state
   * 
   * @returns Current circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker to closed state
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.retryManager.resetStatistics();
    this.timeoutManager.resetStatistics();
    this.fallbackManager.resetMetrics();
  }

  /**
   * Clear all timeouts
   */
  clearTimeouts(): void {
    this.timeoutManager.clearAllTimeouts();
  }

  /**
   * Check if a resilience feature is enabled
   * 
   * @param feature Feature name
   * @returns True if feature is enabled
   */
  private isFeatureEnabled(feature: keyof NonNullable<ResilienceConfig['features']>): boolean {
    return this.config.features?.[feature] !== false;
  }

  /**
   * Get individual component managers (for advanced usage)
   */
  getComponents() {
    return {
      retry: this.retryManager,
      circuitBreaker: this.circuitBreaker,
      timeout: this.timeoutManager,
      fallback: this.fallbackManager,
    };
  }
}

/**
 * Create a resilience manager instance with configuration
 * 
 * @param config Resilience configuration
 * @returns New ResilienceManager instance
 */
export function createResilience(config: ResilienceConfig = {}): ResilienceManager {
  return new ResilienceManager(config);
}

/**
 * Convenience function to execute with full resilience
 * 
 * @template T The return type of the function
 * @param fn The async function to execute
 * @param options Execution options
 * @returns Promise resolving to the function result
 */
export async function executeResilient<T>(
  fn: () => Promise<T>,
  options: ResilienceOptions = {}
): Promise<T> {
  const manager = new ResilienceManager();
  return manager.executeResilient(fn, options);
}

/**
 * Create a resilient wrapper function
 * 
 * Returns a new function that wraps the original with resilience protection.
 * 
 * @template T The return type of the function
 * @param fn The async function to wrap
 * @param config Resilience configuration
 * @param options Default execution options
 * @returns Wrapped function with resilience
 */
export function createResilientFunction<T>(
  fn: () => Promise<T>,
  config: ResilienceConfig = {},
  options: ResilienceOptions = {}
): () => Promise<T> {
  const manager = new ResilienceManager(config);
  
  return async () => {
    return manager.executeResilient(fn, options);
  };
}

/**
 * Decorator for adding resilience to class methods (for future use)
 * 
 * @param config Resilience configuration
 * @param options Execution options
 */
export function Resilient(
  config: ResilienceConfig = {},
  options: ResilienceOptions = {}
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const manager = new ResilienceManager(config);

    descriptor.value = async function (...args: any[]) {
      return manager.executeResilient(
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

// Made with Bob
