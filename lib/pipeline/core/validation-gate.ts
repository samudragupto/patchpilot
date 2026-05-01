/**
 * Validation Gate System
 * 
 * Provides validation gates between pipeline phases to ensure quality and
 * correctness before proceeding to the next phase. Implements configurable
 * validation rules with severity levels and custom conditions.
 * 
 * @module pipeline/core/validation-gate
 */

import {
  PipelinePhase,
  PipelineContext,
  ValidationResult,
  ValidationError,
  ValidationType,
  ErrorSeverity,
} from '../types';

// ============================================================================
// Validation Rule Types
// ============================================================================

/**
 * Validation rule condition function
 */
export type ValidationCondition = (context: PipelineContext) => boolean | Promise<boolean>;

/**
 * Validation rule definition
 */
export interface ValidationRule {
  /** Unique rule identifier */
  readonly id: string;
  
  /** Rule name for display */
  readonly name: string;
  
  /** Phase this rule applies to */
  readonly phase: PipelinePhase;
  
  /** Next phase this rule validates transition to */
  readonly nextPhase: PipelinePhase;
  
  /** Validation condition function */
  readonly condition: ValidationCondition;
  
  /** Error severity if validation fails */
  readonly severity: ErrorSeverity;
  
  /** Error message if validation fails */
  readonly message: string;
  
  /** Whether this rule is enabled */
  readonly enabled: boolean;
  
  /** Optional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Validation gate configuration
 */
export interface ValidationGateConfig {
  /** Whether to enforce strict validation (fail on any error) */
  readonly strict: boolean;
  
  /** Minimum confidence threshold for AI phases */
  readonly minConfidence: number;
  
  /** Minimum test coverage for validation phase */
  readonly minTestCoverage: number;
  
  /** Whether to allow warnings */
  readonly allowWarnings: boolean;
  
  /** Custom validation rules */
  readonly customRules?: ValidationRule[];
}

/**
 * Default validation gate configuration
 */
export const DEFAULT_VALIDATION_GATE_CONFIG: ValidationGateConfig = {
  strict: true,
  minConfidence: 0.7,
  minTestCoverage: 0.8,
  allowWarnings: true,
};

// ============================================================================
// Validation Gate Implementation
// ============================================================================

/**
 * Validation gate that enforces quality gates between pipeline phases.
 * 
 * Validates that the current phase output meets requirements before
 * allowing transition to the next phase. Supports configurable rules
 * with different severity levels.
 * 
 * @example
 * ```typescript
 * const gate = new ValidationGate({
 *   strict: true,
 *   minConfidence: 0.7
 * });
 * 
 * // Add custom rule
 * gate.addRule({
 *   id: 'custom-check',
 *   name: 'Custom Check',
 *   phase: PipelinePhase.AI_REASONING,
 *   nextPhase: PipelinePhase.GRAPH_TRAVERSAL,
 *   condition: (ctx) => ctx.phaseOutputs.aiReasoning?.confidence > 0.8,
 *   severity: ErrorSeverity.HIGH,
 *   message: 'AI confidence too low',
 *   enabled: true
 * });
 * 
 * // Validate transition
 * const result = await gate.validate(context, PipelinePhase.GRAPH_TRAVERSAL);
 * ```
 */
export class ValidationGate {
  private readonly config: ValidationGateConfig;
  private readonly rules: Map<string, ValidationRule>;
  private failedRules: ValidationRule[] = [];

  constructor(config: Partial<ValidationGateConfig> = {}) {
    this.config = { ...DEFAULT_VALIDATION_GATE_CONFIG, ...config };
    this.rules = new Map();
    
    // Initialize with default rules
    this.initializeDefaultRules();
    
    // Add custom rules if provided
    if (this.config.customRules) {
      this.config.customRules.forEach(rule => this.addRule(rule));
    }
  }

  /**
   * Validate transition from current phase to next phase
   * 
   * @param context - Current pipeline context
   * @param nextPhase - Phase to transition to
   * @returns Validation result
   */
  async validate(
    context: PipelineContext,
    nextPhase: PipelinePhase
  ): Promise<ValidationResult> {
    this.failedRules = [];
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Get applicable rules for this transition
    const applicableRules = this.getApplicableRules(context.currentPhase, nextPhase);

    // Execute all validation rules
    for (const rule of applicableRules) {
      if (!rule.enabled) {
        continue;
      }

      try {
        const passed = await rule.condition(context);
        
        if (!passed) {
          this.failedRules.push(rule);
          
          const error: ValidationError = {
            field: `${rule.phase}->${nextPhase}`,
            type: ValidationType.BUSINESS_RULE,
            message: rule.message,
            constraint: rule.name,
          };

          if (rule.severity === ErrorSeverity.CRITICAL || rule.severity === ErrorSeverity.HIGH) {
            errors.push(error);
          } else {
            warnings.push(rule.message);
          }
        }
      } catch (error) {
        // Rule execution failed - treat as validation error
        const validationError: ValidationError = {
          field: rule.id,
          type: ValidationType.BUSINESS_RULE,
          message: `Rule execution failed: ${error instanceof Error ? error.message : String(error)}`,
          constraint: rule.name,
        };
        errors.push(validationError);
      }
    }

    // Determine if validation passed
    const isValid = errors.length === 0 && (this.config.allowWarnings || warnings.length === 0);

    return {
      isValid,
      errors,
      warnings: warnings.map(w => ({ field: '', message: w })),
      context: {
        phase: context.currentPhase,
        nextPhase,
        failedRules: this.failedRules.length,
        totalRules: applicableRules.length,
      },
    };
  }

  /**
   * Add a validation rule
   * 
   * @param rule - Validation rule to add
   */
  addRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a validation rule
   * 
   * @param ruleId - ID of rule to remove
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get a validation rule by ID
   * 
   * @param ruleId - Rule ID
   * @returns Validation rule or undefined
   */
  getRule(ruleId: string): ValidationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all validation rules
   * 
   * @returns Array of all rules
   */
  getAllRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get failed rules from last validation
   * 
   * @returns Array of failed rules
   */
  getFailedRules(): ValidationRule[] {
    return [...this.failedRules];
  }

  /**
   * Enable a validation rule
   * 
   * @param ruleId - Rule ID to enable
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.set(ruleId, { ...rule, enabled: true });
    }
  }

  /**
   * Disable a validation rule
   * 
   * @param ruleId - Rule ID to disable
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.set(ruleId, { ...rule, enabled: false });
    }
  }

  /**
   * Clear all failed rules
   */
  clearFailedRules(): void {
    this.failedRules = [];
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Get applicable rules for a phase transition
   */
  private getApplicableRules(
    currentPhase: PipelinePhase | null,
    nextPhase: PipelinePhase
  ): ValidationRule[] {
    if (!currentPhase) {
      return [];
    }

    return Array.from(this.rules.values()).filter(
      rule => rule.phase === currentPhase && rule.nextPhase === nextPhase
    );
  }

  /**
   * Initialize default validation rules
   */
  private initializeDefaultRules(): void {
    // INPUT_ANALYSIS -> AI_REASONING
    this.addRule({
      id: 'input-analysis-complete',
      name: 'Input Analysis Complete',
      phase: PipelinePhase.INPUT_ANALYSIS,
      nextPhase: PipelinePhase.AI_REASONING,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.inputAnalysis;
        return !!(output && output.parsedStackTrace && output.relevantFiles.length > 0);
      },
      severity: ErrorSeverity.CRITICAL,
      message: 'Input analysis must complete with parsed stack trace and relevant files',
      enabled: true,
    });

    this.addRule({
      id: 'repo-metadata-present',
      name: 'Repository Metadata Present',
      phase: PipelinePhase.INPUT_ANALYSIS,
      nextPhase: PipelinePhase.AI_REASONING,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.inputAnalysis;
        return !!(output && output.repoMetadata);
      },
      severity: ErrorSeverity.HIGH,
      message: 'Repository metadata must be present',
      enabled: true,
    });

    // AI_REASONING -> GRAPH_TRAVERSAL
    this.addRule({
      id: 'ai-confidence-threshold',
      name: 'AI Confidence Threshold',
      phase: PipelinePhase.AI_REASONING,
      nextPhase: PipelinePhase.GRAPH_TRAVERSAL,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.aiReasoning;
        return !!(output && output.confidence >= this.config.minConfidence);
      },
      severity: ErrorSeverity.HIGH,
      message: `AI confidence must be at least ${this.config.minConfidence}`,
      enabled: true,
    });

    this.addRule({
      id: 'root-cause-identified',
      name: 'Root Cause Identified',
      phase: PipelinePhase.AI_REASONING,
      nextPhase: PipelinePhase.GRAPH_TRAVERSAL,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.aiReasoning;
        return !!(output && output.rootCause && output.rootCause.cause);
      },
      severity: ErrorSeverity.CRITICAL,
      message: 'Root cause must be identified',
      enabled: true,
    });

    this.addRule({
      id: 'hypotheses-generated',
      name: 'Hypotheses Generated',
      phase: PipelinePhase.AI_REASONING,
      nextPhase: PipelinePhase.GRAPH_TRAVERSAL,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.aiReasoning;
        return !!(output && output.hypotheses && output.hypotheses.length >= 2);
      },
      severity: ErrorSeverity.MEDIUM,
      message: 'At least 2 hypotheses must be generated',
      enabled: true,
    });

    // GRAPH_TRAVERSAL -> FIX_GENERATION
    this.addRule({
      id: 'impacted-files-identified',
      name: 'Impacted Files Identified',
      phase: PipelinePhase.GRAPH_TRAVERSAL,
      nextPhase: PipelinePhase.FIX_GENERATION,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.graphTraversal;
        return !!(output && output.impactedFiles && output.impactedFiles.length > 0);
      },
      severity: ErrorSeverity.CRITICAL,
      message: 'At least one impacted file must be identified',
      enabled: true,
    });

    this.addRule({
      id: 'impact-score-calculated',
      name: 'Impact Score Calculated',
      phase: PipelinePhase.GRAPH_TRAVERSAL,
      nextPhase: PipelinePhase.FIX_GENERATION,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.graphTraversal;
        return !!(output && typeof output.impactScore === 'number');
      },
      severity: ErrorSeverity.HIGH,
      message: 'Impact score must be calculated',
      enabled: true,
    });

    // FIX_GENERATION -> VALIDATION
    this.addRule({
      id: 'fixes-generated',
      name: 'Fixes Generated',
      phase: PipelinePhase.FIX_GENERATION,
      nextPhase: PipelinePhase.VALIDATION,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.fixGeneration;
        return !!(output && output.fixes && output.fixes.length > 0);
      },
      severity: ErrorSeverity.CRITICAL,
      message: 'At least one fix must be generated',
      enabled: true,
    });

    this.addRule({
      id: 'tests-generated',
      name: 'Tests Generated',
      phase: PipelinePhase.FIX_GENERATION,
      nextPhase: PipelinePhase.VALIDATION,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.fixGeneration;
        return !!(output && output.tests && output.tests.length > 0);
      },
      severity: ErrorSeverity.HIGH,
      message: 'At least one test must be generated',
      enabled: true,
    });

    // VALIDATION -> PR_ASSEMBLY
    this.addRule({
      id: 'validation-passed',
      name: 'Validation Passed',
      phase: PipelinePhase.VALIDATION,
      nextPhase: PipelinePhase.PR_ASSEMBLY,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.validation;
        return !!(output && output.isValid);
      },
      severity: ErrorSeverity.CRITICAL,
      message: 'Validation must pass before PR assembly',
      enabled: true,
    });

    this.addRule({
      id: 'test-coverage-threshold',
      name: 'Test Coverage Threshold',
      phase: PipelinePhase.VALIDATION,
      nextPhase: PipelinePhase.PR_ASSEMBLY,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.validation;
        if (!output || !output.testResults) return false;
        
        const passed = output.testResults.filter(t => t.status === 'PASSED').length;
        const total = output.testResults.length;
        const coverage = total > 0 ? passed / total : 0;
        
        return coverage >= this.config.minTestCoverage;
      },
      severity: ErrorSeverity.HIGH,
      message: `Test coverage must be at least ${this.config.minTestCoverage * 100}%`,
      enabled: true,
    });

    this.addRule({
      id: 'security-scan-passed',
      name: 'Security Scan Passed',
      phase: PipelinePhase.VALIDATION,
      nextPhase: PipelinePhase.PR_ASSEMBLY,
      condition: (ctx) => {
        const output = ctx.phaseOutputs.validation;
        return !!(output && output.securityScan && output.securityScan.passed);
      },
      severity: ErrorSeverity.HIGH,
      message: 'Security scan must pass',
      enabled: true,
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a validation gate with default configuration
 * 
 * @param config - Optional configuration overrides
 * @returns New validation gate instance
 */
export function createValidationGate(
  config?: Partial<ValidationGateConfig>
): ValidationGate {
  return new ValidationGate(config);
}

/**
 * Create a custom validation rule
 * 
 * @param params - Rule parameters
 * @returns Validation rule
 */
export function createValidationRule(params: {
  id: string;
  name: string;
  phase: PipelinePhase;
  nextPhase: PipelinePhase;
  condition: ValidationCondition;
  severity: ErrorSeverity;
  message: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}): ValidationRule {
  return {
    ...params,
    enabled: params.enabled ?? true,
  };
}

/**
 * Validate phase transition with a simple condition
 * 
 * @param context - Pipeline context
 * @param nextPhase - Next phase
 * @param condition - Validation condition
 * @param message - Error message if validation fails
 * @returns Validation result
 */
export async function validateTransition(
  context: PipelineContext,
  nextPhase: PipelinePhase,
  condition: ValidationCondition,
  message: string
): Promise<ValidationResult> {
  const passed = await condition(context);
  
  if (passed) {
    return {
      isValid: true,
      errors: [],
      warnings: [],
    };
  }
  
  return {
    isValid: false,
    errors: [{
      field: `${context.currentPhase}->${nextPhase}`,
      type: ValidationType.BUSINESS_RULE,
      message,
    }],
    warnings: [],
  };
}

// Made with Bob