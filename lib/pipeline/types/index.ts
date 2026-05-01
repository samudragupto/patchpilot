/**
 * Core Pipeline Types and Interfaces
 * 
 * This module defines the foundational types for the PatchPilot pipeline system.
 * All types are designed to be immutable and type-safe.
 * 
 * @module pipeline/types
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Pipeline execution phases in sequential order
 */
export enum PipelinePhase {
  INPUT_ANALYSIS = 'INPUT_ANALYSIS',
  AI_REASONING = 'AI_REASONING',
  GRAPH_TRAVERSAL = 'GRAPH_TRAVERSAL',
  FIX_GENERATION = 'FIX_GENERATION',
  VALIDATION = 'VALIDATION',
  PR_ASSEMBLY = 'PR_ASSEMBLY',
}

/**
 * Overall pipeline execution status
 */
export enum PipelineStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Individual phase execution status
 */
export enum PhaseStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Validation error types
 */
export enum ValidationType {
  REQUIRED_FIELD = 'REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  OUT_OF_RANGE = 'OUT_OF_RANGE',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  BUSINESS_RULE = 'BUSINESS_RULE',
}

// ============================================================================
// Input/Output Interfaces
// ============================================================================

/**
 * Pipeline input containing all necessary information to start execution
 */
export interface PipelineInput {
  /** Stack trace or error information */
  readonly stackTrace: string;
  
  /** GitHub repository URL */
  readonly repoUrl: string;
  
  /** Local path to cloned repository */
  readonly repoPath: string;
  
  /** Optional configuration overrides */
  readonly config?: Partial<PipelineConfig>;
  
  /** Optional metadata */
  readonly metadata?: Record<string, unknown>;
  
  /** User/tenant identifier for multi-tenancy */
  readonly tenantId?: string;
  
  /** Request correlation ID */
  readonly correlationId?: string;
}

/**
 * Final pipeline output containing the PR package and metrics
 */
export interface PipelineOutput {
  /** Generated pull request package */
  readonly prPackage: PRPackage;
  
  /** Execution metrics */
  readonly metrics: PipelineMetrics;
  
  /** Execution timeline */
  readonly timeline: ExecutionTimeline;
  
  /** Quality assessment */
  readonly quality: QualityMetrics;
}

/**
 * Pull request package ready for submission
 */
export interface PRPackage {
  /** PR title */
  readonly title: string;
  
  /** PR description with context */
  readonly description: string;
  
  /** File changes */
  readonly changes: FileChange[];
  
  /** Generated tests */
  readonly tests: TestFile[];
  
  /** Branch name */
  readonly branchName: string;
  
  /** Labels to apply */
  readonly labels: string[];
  
  /** Reviewers to assign */
  readonly reviewers?: string[];
  
  /** Confidence score (0-1) */
  readonly confidence: number;
}

/**
 * Individual file change
 */
export interface FileChange {
  readonly path: string;
  readonly oldContent?: string;
  readonly newContent: string;
  readonly changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly diff?: string;
}

/**
 * Test file information
 */
export interface TestFile {
  readonly path: string;
  readonly content: string;
  readonly framework: string;
  readonly coverage?: number;
}

// ============================================================================
// Pipeline Context
// ============================================================================

/**
 * Comprehensive context object that flows through all pipeline phases.
 * This is the central state container for pipeline execution.
 */
export interface PipelineContext {
  /** Unique execution identifier */
  readonly executionId: string;
  
  /** Original input */
  readonly input: PipelineInput;
  
  /** Pipeline configuration */
  readonly config: PipelineConfig;
  
  /** Current pipeline status */
  readonly status: PipelineStatus;
  
  /** Current phase being executed */
  readonly currentPhase: PipelinePhase | null;
  
  /** Phase-specific outputs */
  readonly phaseOutputs: PhaseOutputs;
  
  /** Execution metadata */
  readonly metadata: PipelineMetadata;
  
  /** Distributed tracing information */
  readonly trace: TraceContext;
  
  /** Accumulated errors */
  readonly errors: PipelineError[];
  
  /** Accumulated warnings */
  readonly warnings: string[];
  
  /** Checkpoints for recovery */
  readonly checkpoints: Checkpoint[];
}

/**
 * Container for all phase outputs
 */
export interface PhaseOutputs {
  readonly inputAnalysis?: InputAnalysisOutput;
  readonly aiReasoning?: AIReasoningOutput;
  readonly graphTraversal?: GraphTraversalOutput;
  readonly fixGeneration?: FixGenerationOutput;
  readonly validation?: ValidationOutput;
  readonly prAssembly?: PRAssemblyOutput;
}

/**
 * Phase 1: Input Analysis Output
 */
export interface InputAnalysisOutput {
  readonly parsedStackTrace: ParsedStackTrace;
  readonly errorContext: ErrorContext;
  readonly repoMetadata: RepoMetadata;
  readonly relevantFiles: string[];
}

/**
 * Phase 2: AI Reasoning Output
 */
export interface AIReasoningOutput {
  readonly rootCause: RootCauseAnalysis;
  readonly hypotheses: Hypothesis[];
  readonly confidence: number;
  readonly reasoning: string;
}

/**
 * Phase 3: Graph Traversal Output
 */
export interface GraphTraversalOutput {
  readonly impactedFiles: string[];
  readonly dependencies: DependencyInfo[];
  readonly callGraph: CallGraphNode[];
  readonly impactScore: number;
}

/**
 * Phase 4: Fix Generation Output
 */
export interface FixGenerationOutput {
  readonly fixes: GeneratedFix[];
  readonly tests: GeneratedTest[];
  readonly explanation: string;
}

/**
 * Phase 5: Validation Output
 */
export interface ValidationOutput {
  readonly isValid: boolean;
  readonly testResults: TestResult[];
  readonly lintResults: LintResult[];
  readonly securityScan: SecurityScanResult;
}

/**
 * Phase 6: PR Assembly Output
 */
export interface PRAssemblyOutput {
  readonly prPackage: PRPackage;
  readonly summary: string;
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Parsed stack trace information
 */
export interface ParsedStackTrace {
  readonly errorType: string;
  readonly errorMessage: string;
  readonly frames: StackFrame[];
  readonly language: string;
}

/**
 * Stack frame information
 */
export interface StackFrame {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  readonly function?: string;
  readonly code?: string;
}

/**
 * Error context information
 */
export interface ErrorContext {
  readonly environment: string;
  readonly timestamp: number;
  readonly severity: ErrorSeverity;
  readonly tags: string[];
  readonly metadata: Record<string, unknown>;
}

/**
 * Repository metadata
 */
export interface RepoMetadata {
  readonly name: string;
  readonly owner: string;
  readonly branch: string;
  readonly language: string;
  readonly framework?: string;
  readonly size: number;
  readonly lastCommit: string;
}

/**
 * Root cause analysis
 */
export interface RootCauseAnalysis {
  readonly cause: string;
  readonly category: string;
  readonly confidence: number;
  readonly evidence: string[];
  readonly relatedIssues: string[];
}

/**
 * Hypothesis for potential causes
 */
export interface Hypothesis {
  readonly description: string;
  readonly confidence: number;
  readonly evidence: string[];
  readonly testable: boolean;
}

/**
 * Dependency information
 */
export interface DependencyInfo {
  readonly name: string;
  readonly version: string;
  readonly type: 'direct' | 'transitive';
  readonly vulnerable?: boolean;
}

/**
 * Call graph node
 */
export interface CallGraphNode {
  readonly id: string;
  readonly file: string;
  readonly function: string;
  readonly callers: string[];
  readonly callees: string[];
  readonly depth: number;
}

/**
 * Generated fix
 */
export interface GeneratedFix {
  readonly file: string;
  readonly changes: string;
  readonly explanation: string;
  readonly confidence: number;
}

/**
 * Generated test
 */
export interface GeneratedTest {
  readonly file: string;
  readonly content: string;
  readonly framework: string;
  readonly coverage: string[];
}

/**
 * Test execution result
 */
export interface TestResult {
  readonly name: string;
  readonly status: 'PASSED' | 'FAILED' | 'SKIPPED';
  readonly duration: number;
  readonly error?: string;
}

/**
 * Lint result
 */
export interface LintResult {
  readonly file: string;
  readonly issues: LintIssue[];
  readonly score: number;
}

/**
 * Lint issue
 */
export interface LintIssue {
  readonly line: number;
  readonly column: number;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly rule: string;
}

/**
 * Security scan result
 */
export interface SecurityScanResult {
  readonly vulnerabilities: SecurityVulnerability[];
  readonly score: number;
  readonly passed: boolean;
}

/**
 * Security vulnerability
 */
export interface SecurityVulnerability {
  readonly severity: ErrorSeverity;
  readonly description: string;
  readonly file: string;
  readonly line?: number;
  readonly cwe?: string;
}

/**
 * Pipeline metadata
 */
export interface PipelineMetadata {
  readonly startTime: number;
  readonly endTime?: number;
  readonly duration?: number;
  readonly phaseTimings: Record<PipelinePhase, number>;
  readonly retryCount: number;
  readonly version: string;
}

/**
 * Distributed tracing context
 */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly baggage?: Record<string, string>;
}

/**
 * Pipeline error with context
 */
export interface PipelineError {
  readonly phase: PipelinePhase;
  readonly error: Error;
  readonly severity: ErrorSeverity;
  readonly timestamp: number;
  readonly recoverable: boolean;
  readonly context?: Record<string, unknown>;
}

/**
 * Checkpoint for recovery
 */
export interface Checkpoint {
  readonly id: string;
  readonly executionId: string;
  readonly phase: PipelinePhase;
  readonly timestamp: number;
  readonly context: PipelineContext;
  readonly hash: string;
}

// ============================================================================
// Phase Result
// ============================================================================

/**
 * Generic phase execution result
 * @template T The type of data returned by the phase
 */
export interface PhaseResult<T> {
  /** Whether the phase executed successfully */
  readonly success: boolean;
  
  /** Phase output data (if successful) */
  readonly data?: T;
  
  /** Error information (if failed) */
  readonly error?: PipelineError;
  
  /** Phase execution metrics */
  readonly metrics: PhaseMetrics;
  
  /** Execution duration in milliseconds */
  readonly duration: number;
  
  /** Phase status */
  readonly status: PhaseStatus;
  
  /** Warnings generated during execution */
  readonly warnings?: string[];
}

/**
 * Phase-specific metrics
 */
export interface PhaseMetrics {
  readonly phase: PipelinePhase;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly retryCount: number;
  readonly cacheHit: boolean;
  readonly resourceUsage: ResourceUsage;
  readonly customMetrics?: Record<string, number>;
}

/**
 * Resource usage metrics
 */
export interface ResourceUsage {
  readonly cpuTime: number;
  readonly memoryUsed: number;
  readonly apiCalls: number;
  readonly tokensUsed?: number;
  readonly cost?: number;
}

// ============================================================================
// Pipeline Metrics
// ============================================================================

/**
 * Comprehensive pipeline execution metrics
 */
export interface PipelineMetrics {
  /** Overall execution time */
  readonly totalDuration: number;
  
  /** Per-phase metrics */
  readonly phaseMetrics: Record<PipelinePhase, PhaseMetrics>;
  
  /** Performance metrics */
  readonly performance: PerformanceMetrics;
  
  /** Cost metrics */
  readonly cost: CostMetrics;
  
  /** Quality metrics */
  readonly quality: QualityMetrics;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  readonly throughput: number;
  readonly latency: number;
  readonly cacheHitRate: number;
  readonly parallelizationFactor: number;
}

/**
 * Cost tracking metrics
 */
export interface CostMetrics {
  readonly totalCost: number;
  readonly aiCost: number;
  readonly computeCost: number;
  readonly storageCost: number;
  readonly breakdown: Record<string, number>;
}

/**
 * Quality assessment metrics
 */
export interface QualityMetrics {
  readonly overallScore: number;
  readonly confidence: number;
  readonly testCoverage: number;
  readonly codeQuality: number;
  readonly securityScore: number;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  readonly isValid: boolean;
  
  /** Validation errors */
  readonly errors: ValidationError[];
  
  /** Validation warnings */
  readonly warnings: ValidationWarning[];
  
  /** Additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Validation error
 */
export interface ValidationError {
  readonly field: string;
  readonly type: ValidationType;
  readonly message: string;
  readonly value?: unknown;
  readonly constraint?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  readonly field: string;
  readonly message: string;
  readonly suggestion?: string;
}

// ============================================================================
// Execution Timeline
// ============================================================================

/**
 * Execution timeline for visualization
 */
export interface ExecutionTimeline {
  readonly events: TimelineEvent[];
  readonly totalDuration: number;
  readonly criticalPath: string[];
}

/**
 * Timeline event
 */
export interface TimelineEvent {
  readonly timestamp: number;
  readonly phase: PipelinePhase;
  readonly event: 'START' | 'END' | 'ERROR' | 'CHECKPOINT';
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Configuration (Forward Declaration)
// ============================================================================

/**
 * Pipeline configuration interface
 * Full definition in config.ts
 */
export interface PipelineConfig {
  readonly phases: PhaseConfigs;
  readonly retry: RetryConfig;
  readonly timeout: TimeoutConfig;
  readonly validation: ValidationConfig;
  readonly features: FeatureFlags;
  readonly observability: ObservabilityConfig;
  readonly cache: CacheConfig;
}

/**
 * Phase-specific configurations
 */
export interface PhaseConfigs {
  readonly inputAnalysis: Record<string, unknown>;
  readonly aiReasoning: Record<string, unknown>;
  readonly graphTraversal: Record<string, unknown>;
  readonly fixGeneration: Record<string, unknown>;
  readonly validation: Record<string, unknown>;
  readonly prAssembly: Record<string, unknown>;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly backoffMultiplier: number;
  readonly initialDelay: number;
  readonly maxDelay: number;
  readonly retryableErrors: string[];
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  readonly pipeline: number;
  readonly phase: Record<PipelinePhase, number>;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  readonly strict: boolean;
  readonly rules: ValidationRule[];
}

/**
 * Validation rule
 */
export interface ValidationRule {
  readonly name: string;
  readonly enabled: boolean;
  readonly severity: ErrorSeverity;
}

/**
 * Feature flags
 */
export interface FeatureFlags {
  readonly parallelExecution: boolean;
  readonly caching: boolean;
  readonly streaming: boolean;
  readonly checkpointing: boolean;
  readonly aiEnhancement: boolean;
}

/**
 * Observability configuration
 */
export interface ObservabilityConfig {
  readonly metrics: boolean;
  readonly tracing: boolean;
  readonly logging: boolean;
  readonly logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  readonly enabled: boolean;
  readonly ttl: number;
  readonly maxSize: number;
  readonly strategy: 'LRU' | 'LFU' | 'FIFO';
}

// Made with Bob
