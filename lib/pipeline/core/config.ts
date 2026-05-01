/**
 * Pipeline Configuration
 * 
 * This module provides configuration management for the pipeline system,
 * including default configurations, environment-based loading, and validation.
 * 
 * @module pipeline/core/config
 */

import {
  PipelineConfig,
  PhaseConfigs,
  RetryConfig,
  TimeoutConfig,
  ValidationConfig,
  FeatureFlags,
  ObservabilityConfig,
  CacheConfig,
  PipelinePhase,
  ErrorSeverity,
} from '../types';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'RATE_LIMIT',
    'TIMEOUT',
    '429',
    '503',
    '504',
  ],
};

/**
 * Default timeout configuration (in milliseconds)
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  pipeline: 1800000, // 30 minutes
  phase: {
    [PipelinePhase.INPUT_ANALYSIS]: 60000, // 1 minute
    [PipelinePhase.AI_REASONING]: 300000, // 5 minutes
    [PipelinePhase.GRAPH_TRAVERSAL]: 180000, // 3 minutes
    [PipelinePhase.FIX_GENERATION]: 300000, // 5 minutes
    [PipelinePhase.VALIDATION]: 600000, // 10 minutes
    [PipelinePhase.PR_ASSEMBLY]: 60000, // 1 minute
  },
};

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  strict: true,
  rules: [
    {
      name: 'required-stack-trace',
      enabled: true,
      severity: ErrorSeverity.CRITICAL,
    },
    {
      name: 'valid-repo-url',
      enabled: true,
      severity: ErrorSeverity.CRITICAL,
    },
    {
      name: 'repo-path-exists',
      enabled: true,
      severity: ErrorSeverity.CRITICAL,
    },
    {
      name: 'valid-confidence-score',
      enabled: true,
      severity: ErrorSeverity.HIGH,
    },
    {
      name: 'test-coverage-threshold',
      enabled: true,
      severity: ErrorSeverity.MEDIUM,
    },
    {
      name: 'security-scan-passed',
      enabled: true,
      severity: ErrorSeverity.HIGH,
    },
  ],
};

/**
 * Default feature flags
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  parallelExecution: false, // Disabled by default for safety
  caching: true,
  streaming: true,
  checkpointing: true,
  aiEnhancement: true,
};

/**
 * Default observability configuration
 */
export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
  metrics: true,
  tracing: true,
  logging: true,
  logLevel: 'INFO',
};

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttl: 3600, // 1 hour
  maxSize: 1000, // 1000 entries
  strategy: 'LRU',
};

/**
 * Default phase-specific configurations
 */
export const DEFAULT_PHASE_CONFIGS: PhaseConfigs = {
  inputAnalysis: {
    maxStackTraceLines: 100,
    includeSourceContext: true,
    contextLines: 5,
  },
  aiReasoning: {
    model: 'granite-3.0-8b-instruct',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.95,
    minConfidence: 0.6,
    maxHypotheses: 5,
  },
  graphTraversal: {
    maxDepth: 10,
    includeTests: true,
    includeDependencies: true,
    maxNodes: 1000,
  },
  fixGeneration: {
    generateTests: true,
    testFramework: 'auto', // Auto-detect
    includeComments: true,
    followStyleGuide: true,
  },
  validation: {
    runTests: true,
    runLinter: true,
    runSecurityScan: true,
    minTestCoverage: 0.8,
    maxLintErrors: 0,
    allowSecurityWarnings: false,
  },
  prAssembly: {
    includeMetrics: true,
    includeTimeline: true,
    generateChangelog: true,
    autoAssignReviewers: false,
  },
};

/**
 * Complete default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  phases: DEFAULT_PHASE_CONFIGS,
  retry: DEFAULT_RETRY_CONFIG,
  timeout: DEFAULT_TIMEOUT_CONFIG,
  validation: DEFAULT_VALIDATION_CONFIG,
  features: DEFAULT_FEATURE_FLAGS,
  observability: DEFAULT_OBSERVABILITY_CONFIG,
  cache: DEFAULT_CACHE_CONFIG,
};

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Environment variable keys for configuration
 */
export const ENV_KEYS = {
  // Retry configuration
  RETRY_MAX_ATTEMPTS: 'PIPELINE_RETRY_MAX_ATTEMPTS',
  RETRY_INITIAL_DELAY: 'PIPELINE_RETRY_INITIAL_DELAY',
  
  // Timeout configuration
  PIPELINE_TIMEOUT: 'PIPELINE_TIMEOUT',
  PHASE_TIMEOUT_PREFIX: 'PIPELINE_PHASE_TIMEOUT_',
  
  // Feature flags
  ENABLE_PARALLEL: 'PIPELINE_ENABLE_PARALLEL',
  ENABLE_CACHING: 'PIPELINE_ENABLE_CACHING',
  ENABLE_STREAMING: 'PIPELINE_ENABLE_STREAMING',
  ENABLE_CHECKPOINTING: 'PIPELINE_ENABLE_CHECKPOINTING',
  ENABLE_AI_ENHANCEMENT: 'PIPELINE_ENABLE_AI_ENHANCEMENT',
  
  // Observability
  LOG_LEVEL: 'PIPELINE_LOG_LEVEL',
  ENABLE_METRICS: 'PIPELINE_ENABLE_METRICS',
  ENABLE_TRACING: 'PIPELINE_ENABLE_TRACING',
  
  // Cache configuration
  CACHE_TTL: 'PIPELINE_CACHE_TTL',
  CACHE_MAX_SIZE: 'PIPELINE_CACHE_MAX_SIZE',
  CACHE_STRATEGY: 'PIPELINE_CACHE_STRATEGY',
  
  // AI configuration
  AI_MODEL: 'WATSONX_MODEL',
  AI_TEMPERATURE: 'WATSONX_TEMPERATURE',
  AI_MAX_TOKENS: 'WATSONX_MAX_TOKENS',
  
  // Validation
  STRICT_VALIDATION: 'PIPELINE_STRICT_VALIDATION',
  MIN_TEST_COVERAGE: 'PIPELINE_MIN_TEST_COVERAGE',
} as const;

/**
 * Load configuration from environment variables
 * 
 * @returns Pipeline configuration with environment overrides
 */
export function loadConfigFromEnv(): PipelineConfig {
  const config = { ...DEFAULT_PIPELINE_CONFIG };
  
  // Load retry configuration
  if (process.env[ENV_KEYS.RETRY_MAX_ATTEMPTS]) {
    config.retry = {
      ...config.retry,
      maxAttempts: parseInt(process.env[ENV_KEYS.RETRY_MAX_ATTEMPTS]!, 10),
    };
  }
  
  if (process.env[ENV_KEYS.RETRY_INITIAL_DELAY]) {
    config.retry = {
      ...config.retry,
      initialDelay: parseInt(process.env[ENV_KEYS.RETRY_INITIAL_DELAY]!, 10),
    };
  }
  
  // Load timeout configuration
  if (process.env[ENV_KEYS.PIPELINE_TIMEOUT]) {
    config.timeout = {
      ...config.timeout,
      pipeline: parseInt(process.env[ENV_KEYS.PIPELINE_TIMEOUT]!, 10),
    };
  }
  
  // Load phase-specific timeouts
  for (const phase of Object.values(PipelinePhase)) {
    const envKey = `${ENV_KEYS.PHASE_TIMEOUT_PREFIX}${phase}`;
    if (process.env[envKey]) {
      config.timeout.phase[phase] = parseInt(process.env[envKey], 10);
    }
  }
  
  // Load feature flags
  config.features = {
    parallelExecution: parseBooleanEnv(ENV_KEYS.ENABLE_PARALLEL, config.features.parallelExecution),
    caching: parseBooleanEnv(ENV_KEYS.ENABLE_CACHING, config.features.caching),
    streaming: parseBooleanEnv(ENV_KEYS.ENABLE_STREAMING, config.features.streaming),
    checkpointing: parseBooleanEnv(ENV_KEYS.ENABLE_CHECKPOINTING, config.features.checkpointing),
    aiEnhancement: parseBooleanEnv(ENV_KEYS.ENABLE_AI_ENHANCEMENT, config.features.aiEnhancement),
  };
  
  // Load observability configuration
  if (process.env[ENV_KEYS.LOG_LEVEL]) {
    const logLevel = process.env[ENV_KEYS.LOG_LEVEL]!.toUpperCase();
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(logLevel)) {
      config.observability = {
        ...config.observability,
        logLevel: logLevel as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
      };
    }
  }
  
  config.observability = {
    ...config.observability,
    metrics: parseBooleanEnv(ENV_KEYS.ENABLE_METRICS, config.observability.metrics),
    tracing: parseBooleanEnv(ENV_KEYS.ENABLE_TRACING, config.observability.tracing),
  };
  
  // Load cache configuration
  if (process.env[ENV_KEYS.CACHE_TTL]) {
    config.cache = {
      ...config.cache,
      ttl: parseInt(process.env[ENV_KEYS.CACHE_TTL]!, 10),
    };
  }
  
  if (process.env[ENV_KEYS.CACHE_MAX_SIZE]) {
    config.cache = {
      ...config.cache,
      maxSize: parseInt(process.env[ENV_KEYS.CACHE_MAX_SIZE]!, 10),
    };
  }
  
  if (process.env[ENV_KEYS.CACHE_STRATEGY]) {
    const strategy = process.env[ENV_KEYS.CACHE_STRATEGY]!.toUpperCase();
    if (['LRU', 'LFU', 'FIFO'].includes(strategy)) {
      config.cache = {
        ...config.cache,
        strategy: strategy as 'LRU' | 'LFU' | 'FIFO',
      };
    }
  }
  
  // Load AI configuration
  if (process.env[ENV_KEYS.AI_MODEL]) {
    config.phases = {
      ...config.phases,
      aiReasoning: {
        ...config.phases.aiReasoning,
        model: process.env[ENV_KEYS.AI_MODEL],
      },
    };
  }
  
  if (process.env[ENV_KEYS.AI_TEMPERATURE]) {
    config.phases = {
      ...config.phases,
      aiReasoning: {
        ...config.phases.aiReasoning,
        temperature: parseFloat(process.env[ENV_KEYS.AI_TEMPERATURE]!),
      },
    };
  }
  
  if (process.env[ENV_KEYS.AI_MAX_TOKENS]) {
    config.phases = {
      ...config.phases,
      aiReasoning: {
        ...config.phases.aiReasoning,
        maxTokens: parseInt(process.env[ENV_KEYS.AI_MAX_TOKENS]!, 10),
      },
    };
  }
  
  // Load validation configuration
  if (process.env[ENV_KEYS.STRICT_VALIDATION]) {
    config.validation = {
      ...config.validation,
      strict: parseBooleanEnv(ENV_KEYS.STRICT_VALIDATION, config.validation.strict),
    };
  }
  
  if (process.env[ENV_KEYS.MIN_TEST_COVERAGE]) {
    config.phases = {
      ...config.phases,
      validation: {
        ...config.phases.validation,
        minTestCoverage: parseFloat(process.env[ENV_KEYS.MIN_TEST_COVERAGE]!),
      },
    };
  }
  
  return config;
}

/**
 * Load configuration from a JSON file
 * 
 * @param filePath - Path to configuration file
 * @returns Pipeline configuration
 */
export async function loadConfigFromFile(filePath: string): Promise<PipelineConfig> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    const fileConfig = JSON.parse(content);
    
    return mergeConfigs(DEFAULT_PIPELINE_CONFIG, fileConfig);
  } catch (error) {
    console.warn(`Failed to load config from ${filePath}:`, error);
    return DEFAULT_PIPELINE_CONFIG;
  }
}

/**
 * Load configuration with priority: file > env > defaults
 * 
 * @param filePath - Optional path to configuration file
 * @returns Pipeline configuration
 */
export async function loadConfig(filePath?: string): Promise<PipelineConfig> {
  let config = DEFAULT_PIPELINE_CONFIG;
  
  // Load from file if provided
  if (filePath) {
    config = await loadConfigFromFile(filePath);
  }
  
  // Override with environment variables
  const envConfig = loadConfigFromEnv();
  config = mergeConfigs(config, envConfig);
  
  return config;
}

// ============================================================================
// Configuration Utilities
// ============================================================================

/**
 * Merge two configurations with deep merge
 * 
 * @param base - Base configuration
 * @param override - Override configuration
 * @returns Merged configuration
 */
export function mergeConfigs(
  base: PipelineConfig,
  override: Partial<PipelineConfig>
): PipelineConfig {
  return {
    phases: { ...base.phases, ...override.phases },
    retry: { ...base.retry, ...override.retry },
    timeout: {
      ...base.timeout,
      ...override.timeout,
      phase: { ...base.timeout.phase, ...override.timeout?.phase },
    },
    validation: { ...base.validation, ...override.validation },
    features: { ...base.features, ...override.features },
    observability: { ...base.observability, ...override.observability },
    cache: { ...base.cache, ...override.cache },
  };
}

/**
 * Validate configuration
 * 
 * @param config - Configuration to validate
 * @returns Validation errors (empty if valid)
 */
export function validateConfig(config: PipelineConfig): string[] {
  const errors: string[] = [];
  
  // Validate retry configuration
  if (config.retry.maxAttempts < 0) {
    errors.push('retry.maxAttempts must be non-negative');
  }
  
  if (config.retry.initialDelay < 0) {
    errors.push('retry.initialDelay must be non-negative');
  }
  
  if (config.retry.maxDelay < config.retry.initialDelay) {
    errors.push('retry.maxDelay must be greater than or equal to initialDelay');
  }
  
  // Validate timeout configuration
  if (config.timeout.pipeline <= 0) {
    errors.push('timeout.pipeline must be positive');
  }
  
  for (const [phase, timeout] of Object.entries(config.timeout.phase)) {
    if (timeout <= 0) {
      errors.push(`timeout.phase.${phase} must be positive`);
    }
  }
  
  // Validate cache configuration
  if (config.cache.ttl < 0) {
    errors.push('cache.ttl must be non-negative');
  }
  
  if (config.cache.maxSize <= 0) {
    errors.push('cache.maxSize must be positive');
  }
  
  // Validate AI configuration
  const aiConfig = config.phases.aiReasoning as Record<string, unknown>;
  if (typeof aiConfig.temperature === 'number') {
    if (aiConfig.temperature < 0 || aiConfig.temperature > 2) {
      errors.push('phases.aiReasoning.temperature must be between 0 and 2');
    }
  }
  
  if (typeof aiConfig.minConfidence === 'number') {
    if (aiConfig.minConfidence < 0 || aiConfig.minConfidence > 1) {
      errors.push('phases.aiReasoning.minConfidence must be between 0 and 1');
    }
  }
  
  // Validate validation configuration
  const validationConfig = config.phases.validation as Record<string, unknown>;
  if (typeof validationConfig.minTestCoverage === 'number') {
    if (validationConfig.minTestCoverage < 0 || validationConfig.minTestCoverage > 1) {
      errors.push('phases.validation.minTestCoverage must be between 0 and 1');
    }
  }
  
  return errors;
}

/**
 * Get configuration for a specific phase
 * 
 * @param config - Pipeline configuration
 * @param phase - Phase to get configuration for
 * @returns Phase configuration
 */
export function getPhaseConfig(
  config: PipelineConfig,
  phase: PipelinePhase
): Record<string, unknown> {
  const phaseKey = getPhaseConfigKey(phase);
  return config.phases[phaseKey] || {};
}

/**
 * Get timeout for a specific phase
 * 
 * @param config - Pipeline configuration
 * @param phase - Phase to get timeout for
 * @returns Timeout in milliseconds
 */
export function getPhaseTimeout(config: PipelineConfig, phase: PipelinePhase): number {
  return config.timeout.phase[phase];
}

/**
 * Check if a feature is enabled
 * 
 * @param config - Pipeline configuration
 * @param feature - Feature to check
 * @returns True if feature is enabled
 */
export function isFeatureEnabled(
  config: PipelineConfig,
  feature: keyof FeatureFlags
): boolean {
  return config.features[feature];
}

/**
 * Export configuration as JSON
 * 
 * @param config - Configuration to export
 * @returns JSON string
 */
export function exportConfig(config: PipelineConfig): string {
  return JSON.stringify(config, null, 2);
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Parse boolean from environment variable
 */
function parseBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get phase configuration key
 */
function getPhaseConfigKey(phase: PipelinePhase): keyof PhaseConfigs {
  const keyMap: Record<PipelinePhase, keyof PhaseConfigs> = {
    [PipelinePhase.INPUT_ANALYSIS]: 'inputAnalysis',
    [PipelinePhase.AI_REASONING]: 'aiReasoning',
    [PipelinePhase.GRAPH_TRAVERSAL]: 'graphTraversal',
    [PipelinePhase.FIX_GENERATION]: 'fixGeneration',
    [PipelinePhase.VALIDATION]: 'validation',
    [PipelinePhase.PR_ASSEMBLY]: 'prAssembly',
  };
  
  return keyMap[phase];
}

// Made with Bob
