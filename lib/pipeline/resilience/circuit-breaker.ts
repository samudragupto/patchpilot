/**
 * Circuit Breaker - Implements circuit breaker pattern for fault tolerance
 * 
 * Prevents cascading failures by temporarily blocking requests to failing services.
 * Implements three states: CLOSED (normal), OPEN (blocking), and HALF_OPEN (testing).
 * 
 * @module pipeline/resilience/circuit-breaker
 */

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation - requests pass through */
  CLOSED = 'CLOSED',
  
  /** Failure threshold exceeded - requests blocked */
  OPEN = 'OPEN',
  
  /** Testing if service recovered - limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  readonly failureThreshold: number;
  
  /** Number of successes to close from half-open state */
  readonly successThreshold: number;
  
  /** Time in milliseconds before attempting half-open state */
  readonly timeout: number;
  
  /** Minimum number of requests before evaluating failure rate */
  readonly volumeThreshold: number;
  
  /** Failure rate threshold (0-1) to open circuit */
  readonly failureRateThreshold?: number;
  
  /** Time window in milliseconds for failure rate calculation */
  readonly rollingWindowMs?: number;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  /** Current circuit state */
  readonly state: CircuitState;
  
  /** Total number of requests */
  readonly totalRequests: number;
  
  /** Number of successful requests */
  readonly successCount: number;
  
  /** Number of failed requests */
  readonly failureCount: number;
  
  /** Number of rejected requests (when circuit is open) */
  readonly rejectedCount: number;
  
  /** Current success rate (0-1) */
  readonly successRate: number;
  
  /** Current failure rate (0-1) */
  readonly failureRate: number;
  
  /** Time when circuit was last opened */
  readonly lastOpenTime?: number;
  
  /** Time when circuit was last closed */
  readonly lastCloseTime?: number;
  
  /** Duration in current state (milliseconds) */
  readonly stateDuration: number;
  
  /** Number of times circuit has opened */
  readonly openCount: number;
}

/**
 * Request result for tracking
 */
interface RequestResult {
  readonly success: boolean;
  readonly timestamp: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  volumeThreshold: 10,
  failureRateThreshold: 0.5, // 50%
  rollingWindowMs: 60000, // 1 minute
};

/**
 * Circuit Breaker - Implements circuit breaker pattern
 * 
 * Features:
 * - Three-state machine (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * - Automatic state recovery after timeout
 * - Configurable failure thresholds
 * - Rolling window for failure rate calculation
 * - Comprehensive metrics tracking
 * - Thread-safe for concurrent operations
 * 
 * State Transitions:
 * - CLOSED → OPEN: When failure threshold exceeded
 * - OPEN → HALF_OPEN: After timeout period
 * - HALF_OPEN → CLOSED: After success threshold met
 * - HALF_OPEN → OPEN: On any failure
 * 
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   timeout: 60000
 * });
 * 
 * const result = await breaker.execute(async () => {
 *   return await externalService.call();
 * });
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState;
  private readonly config: CircuitBreakerConfig;
  private failureCount: number;
  private successCount: number;
  private totalRequests: number;
  private rejectedCount: number;
  private openCount: number;
  private lastOpenTime?: number;
  private lastCloseTime?: number;
  private stateChangeTime: number;
  private requestHistory: RequestResult[];
  private halfOpenSuccesses: number;
  private nextAttemptTime: number;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.rejectedCount = 0;
    this.openCount = 0;
    this.stateChangeTime = Date.now();
    this.requestHistory = [];
    this.halfOpenSuccesses = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * Execute a function with circuit breaker protection
   * 
   * @template T The return type of the function
   * @param fn The async function to execute
   * @returns Promise resolving to the function result
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should attempt the request
    if (!this.canAttempt()) {
      this.rejectedCount++;
      throw new CircuitBreakerError(
        'Circuit breaker is OPEN - request rejected',
        this.state,
        this.getMetrics()
      );
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   * 
   * @returns Current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.successCount++;
    this.addToHistory(true);

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      
      // Check if we should close the circuit
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.addToHistory(false);

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (this.shouldOpen()) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Manually reset the circuit breaker to closed state
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenSuccesses = 0;
    this.requestHistory = [];
  }

  /**
   * Get comprehensive metrics
   * 
   * @returns Current metrics snapshot
   */
  getMetrics(): CircuitBreakerMetrics {
    this.updateState();
    this.cleanupHistory();

    const recentRequests = this.requestHistory.length;
    const recentSuccesses = this.requestHistory.filter(r => r.success).length;
    const recentFailures = recentRequests - recentSuccesses;

    const successRate = this.totalRequests > 0
      ? this.successCount / this.totalRequests
      : 0;

    const failureRate = this.totalRequests > 0
      ? this.failureCount / this.totalRequests
      : 0;

    return {
      state: this.state,
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      failureCount: this.failureCount,
      rejectedCount: this.rejectedCount,
      successRate,
      failureRate,
      lastOpenTime: this.lastOpenTime,
      lastCloseTime: this.lastCloseTime,
      stateDuration: Date.now() - this.stateChangeTime,
      openCount: this.openCount,
    };
  }

  /**
   * Check if a request can be attempted
   * 
   * @returns True if request should be attempted
   */
  private canAttempt(): boolean {
    this.updateState();

    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      return true;
    }

    // OPEN state - check if timeout has passed
    return Date.now() >= this.nextAttemptTime;
  }

  /**
   * Update state based on current conditions
   */
  private updateState(): void {
    if (this.state === CircuitState.OPEN) {
      // Check if we should transition to half-open
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
  }

  /**
   * Determine if circuit should open based on failure threshold
   * 
   * @returns True if circuit should open
   */
  private shouldOpen(): boolean {
    // Check volume threshold
    if (this.totalRequests < this.config.volumeThreshold) {
      return false;
    }

    // Check failure count threshold
    if (this.failureCount >= this.config.failureThreshold) {
      return true;
    }

    // Check failure rate threshold if configured
    if (this.config.failureRateThreshold !== undefined) {
      const recentRequests = this.requestHistory.length;
      if (recentRequests >= this.config.volumeThreshold) {
        const recentFailures = this.requestHistory.filter(r => !r.success).length;
        const failureRate = recentFailures / recentRequests;
        
        if (failureRate >= this.config.failureRateThreshold) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Transition to a new state
   * 
   * @param newState The state to transition to
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangeTime = Date.now();

    if (newState === CircuitState.OPEN) {
      this.openCount++;
      this.lastOpenTime = Date.now();
      this.nextAttemptTime = Date.now() + this.config.timeout;
      this.halfOpenSuccesses = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.lastCloseTime = Date.now();
      this.failureCount = 0;
      this.halfOpenSuccesses = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses = 0;
    }

    // Emit state change event (could be extended with event emitter)
    this.onStateChange(oldState, newState);
  }

  /**
   * Add request result to history
   * 
   * @param success Whether the request succeeded
   */
  private addToHistory(success: boolean): void {
    this.requestHistory.push({
      success,
      timestamp: Date.now(),
    });

    // Cleanup old entries
    this.cleanupHistory();
  }

  /**
   * Remove old entries from request history
   */
  private cleanupHistory(): void {
    if (!this.config.rollingWindowMs) {
      return;
    }

    const cutoffTime = Date.now() - this.config.rollingWindowMs;
    this.requestHistory = this.requestHistory.filter(
      r => r.timestamp >= cutoffTime
    );
  }

  /**
   * Hook for state change events
   * Can be overridden or extended with event emitter
   * 
   * @param oldState Previous state
   * @param newState New state
   */
  protected onStateChange(oldState: CircuitState, newState: CircuitState): void {
    // Override in subclass or extend with event emitter
    // console.log(`Circuit breaker state changed: ${oldState} → ${newState}`);
  }
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitState,
    public readonly metrics: CircuitBreakerMetrics
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Create a circuit breaker instance with configuration
 * 
 * @param config Circuit breaker configuration
 * @returns New CircuitBreaker instance
 */
export function createCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Convenience function to execute with circuit breaker
 * 
 * @template T The return type of the function
 * @param fn The async function to execute
 * @param config Circuit breaker configuration
 * @returns Promise resolving to the function result
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  const breaker = new CircuitBreaker(config);
  return breaker.execute(fn);
}

// Made with Bob
