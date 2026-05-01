/**
 * Phase Registry
 * 
 * Manages registration and retrieval of pipeline phases with dependency
 * validation and ordering enforcement.
 * 
 * @module pipeline/core/phase-registry
 */

import {
  PipelinePhase,
  ValidationResult,
  ValidationError,
  ValidationType,
} from '../types';
import { IPhase } from './phase-interface';

// ============================================================================
// Phase Registry Types
// ============================================================================

/**
 * Phase dependency information
 */
export interface PhaseDependency {
  /** Phase that has the dependency */
  readonly phase: PipelinePhase;
  
  /** Phases that must complete before this phase */
  readonly dependsOn: PipelinePhase[];
  
  /** Whether this phase is optional */
  readonly optional: boolean;
}

/**
 * Phase registration metadata
 */
export interface PhaseRegistration {
  /** The phase instance */
  readonly phase: IPhase<any, any>;
  
  /** Registration timestamp */
  readonly registeredAt: number;
  
  /** Phase metadata */
  readonly metadata: Record<string, unknown>;
}

/**
 * Registry validation result
 */
export interface RegistryValidationResult extends ValidationResult {
  /** Missing phases */
  readonly missingPhases?: PipelinePhase[];
  
  /** Duplicate phases */
  readonly duplicatePhases?: PipelinePhase[];
  
  /** Dependency violations */
  readonly dependencyViolations?: string[];
}

// ============================================================================
// Phase Registry Implementation
// ============================================================================

/**
 * Phase registry for managing pipeline phases.
 * 
 * Provides centralized phase management with:
 * - Phase registration and retrieval
 * - Dependency validation
 * - Phase ordering enforcement
 * - Singleton pattern for global access
 * 
 * @example
 * ```typescript
 * const registry = PhaseRegistry.getInstance();
 * 
 * // Register phases
 * registry.registerPhase(inputAnalysisPhase);
 * registry.registerPhase(aiReasoningPhase);
 * 
 * // Get phase
 * const phase = registry.getPhase(PipelinePhase.INPUT_ANALYSIS);
 * 
 * // Validate registry
 * const validation = registry.validateRegistry();
 * ```
 */
export class PhaseRegistry {
  private static instance: PhaseRegistry | null = null;
  
  private readonly phases: Map<PipelinePhase, PhaseRegistration>;
  private readonly dependencies: Map<PipelinePhase, PhaseDependency>;
  private readonly phaseOrder: PipelinePhase[];

  private constructor() {
    this.phases = new Map();
    this.dependencies = new Map();
    this.phaseOrder = [
      PipelinePhase.INPUT_ANALYSIS,
      PipelinePhase.AI_REASONING,
      PipelinePhase.GRAPH_TRAVERSAL,
      PipelinePhase.FIX_GENERATION,
      PipelinePhase.VALIDATION,
      PipelinePhase.PR_ASSEMBLY,
    ];
    
    this.initializeDependencies();
  }

  /**
   * Get singleton instance
   * 
   * @returns Phase registry instance
   */
  static getInstance(): PhaseRegistry {
    if (!PhaseRegistry.instance) {
      PhaseRegistry.instance = new PhaseRegistry();
    }
    return PhaseRegistry.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    PhaseRegistry.instance = null;
  }

  /**
   * Register a phase
   * 
   * @param phase - Phase to register
   * @param metadata - Optional metadata
   * @throws Error if phase is already registered
   */
  registerPhase(phase: IPhase<any, any>, metadata: Record<string, unknown> = {}): void {
    if (this.phases.has(phase.phase)) {
      throw new Error(`Phase ${phase.phase} is already registered`);
    }

    const registration: PhaseRegistration = {
      phase,
      registeredAt: Date.now(),
      metadata,
    };

    this.phases.set(phase.phase, registration);
  }

  /**
   * Unregister a phase
   * 
   * @param phaseType - Phase type to unregister
   * @returns True if phase was unregistered, false if not found
   */
  unregisterPhase(phaseType: PipelinePhase): boolean {
    return this.phases.delete(phaseType);
  }

  /**
   * Get a registered phase
   * 
   * @param phaseType - Phase type to retrieve
   * @returns Phase instance or undefined
   */
  getPhase(phaseType: PipelinePhase): IPhase<any, any> | undefined {
    const registration = this.phases.get(phaseType);
    return registration?.phase;
  }

  /**
   * Get phase registration
   * 
   * @param phaseType - Phase type
   * @returns Phase registration or undefined
   */
  getPhaseRegistration(phaseType: PipelinePhase): PhaseRegistration | undefined {
    return this.phases.get(phaseType);
  }

  /**
   * Get all registered phases
   * 
   * @returns Array of all registered phases
   */
  getAllPhases(): IPhase<any, any>[] {
    return Array.from(this.phases.values()).map(reg => reg.phase);
  }

  /**
   * Get all phase registrations
   * 
   * @returns Array of all phase registrations
   */
  getAllRegistrations(): PhaseRegistration[] {
    return Array.from(this.phases.values());
  }

  /**
   * Get phase order
   * 
   * @returns Array of phases in execution order
   */
  getPhaseOrder(): PipelinePhase[] {
    return [...this.phaseOrder];
  }

  /**
   * Get next phase in order
   * 
   * @param currentPhase - Current phase
   * @returns Next phase or undefined if at end
   */
  getNextPhase(currentPhase: PipelinePhase): PipelinePhase | undefined {
    const index = this.phaseOrder.indexOf(currentPhase);
    if (index === -1 || index === this.phaseOrder.length - 1) {
      return undefined;
    }
    return this.phaseOrder[index + 1];
  }

  /**
   * Get previous phase in order
   * 
   * @param currentPhase - Current phase
   * @returns Previous phase or undefined if at start
   */
  getPreviousPhase(currentPhase: PipelinePhase): PipelinePhase | undefined {
    const index = this.phaseOrder.indexOf(currentPhase);
    if (index <= 0) {
      return undefined;
    }
    return this.phaseOrder[index - 1];
  }

  /**
   * Check if phase is registered
   * 
   * @param phaseType - Phase type to check
   * @returns True if phase is registered
   */
  hasPhase(phaseType: PipelinePhase): boolean {
    return this.phases.has(phaseType);
  }

  /**
   * Get phase dependencies
   * 
   * @param phaseType - Phase type
   * @returns Phase dependency information or undefined
   */
  getPhaseDependencies(phaseType: PipelinePhase): PhaseDependency | undefined {
    return this.dependencies.get(phaseType);
  }

  /**
   * Check if phase dependencies are satisfied
   * 
   * @param phaseType - Phase to check
   * @param completedPhases - Set of completed phases
   * @returns True if dependencies are satisfied
   */
  areDependenciesSatisfied(
    phaseType: PipelinePhase,
    completedPhases: Set<PipelinePhase>
  ): boolean {
    const dependency = this.dependencies.get(phaseType);
    
    if (!dependency) {
      return true; // No dependencies
    }

    return dependency.dependsOn.every(dep => completedPhases.has(dep));
  }

  /**
   * Validate the registry
   * 
   * Checks for:
   * - All required phases are registered
   * - No duplicate phases
   * - Dependencies are valid
   * 
   * @returns Validation result
   */
  validateRegistry(): RegistryValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const missingPhases: PipelinePhase[] = [];
    const duplicatePhases: PipelinePhase[] = [];
    const dependencyViolations: string[] = [];

    // Check for missing phases
    for (const phase of this.phaseOrder) {
      if (!this.phases.has(phase)) {
        missingPhases.push(phase);
        errors.push({
          field: 'phases',
          type: ValidationType.REQUIRED_FIELD,
          message: `Required phase ${phase} is not registered`,
        });
      }
    }

    // Check for dependency violations
    const dependencyEntries = Array.from(this.dependencies.entries());
    for (const [phase, dependency] of dependencyEntries) {
      for (const requiredPhase of dependency.dependsOn) {
        if (!this.phases.has(requiredPhase)) {
          const violation = `Phase ${phase} depends on ${requiredPhase} which is not registered`;
          dependencyViolations.push(violation);
          errors.push({
            field: 'dependencies',
            type: ValidationType.CONSTRAINT_VIOLATION,
            message: violation,
          });
        }
      }
    }

    // Check phase order consistency
    const registeredPhases = Array.from(this.phases.keys());
    for (const phase of registeredPhases) {
      if (!this.phaseOrder.includes(phase)) {
        warnings.push(`Phase ${phase} is registered but not in phase order`);
      }
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings: warnings.map(w => ({ field: '', message: w })),
      missingPhases: missingPhases.length > 0 ? missingPhases : undefined,
      duplicatePhases: duplicatePhases.length > 0 ? duplicatePhases : undefined,
      dependencyViolations: dependencyViolations.length > 0 ? dependencyViolations : undefined,
    };
  }

  /**
   * Get registry statistics
   * 
   * @returns Registry statistics
   */
  getStatistics(): {
    totalPhases: number;
    registeredPhases: number;
    missingPhases: number;
    phaseOrder: number;
  } {
    const totalPhases = this.phaseOrder.length;
    const registeredPhases = this.phases.size;
    const missingPhases = totalPhases - registeredPhases;

    return {
      totalPhases,
      registeredPhases,
      missingPhases,
      phaseOrder: this.phaseOrder.length,
    };
  }

  /**
   * Clear all registered phases
   */
  clear(): void {
    this.phases.clear();
  }

  /**
   * Export registry state
   * 
   * @returns Registry state as JSON-serializable object
   */
  export(): Record<string, unknown> {
    const phases: Record<string, unknown> = {};
    
    const phaseEntries = Array.from(this.phases.entries());
    for (const [phaseType, registration] of phaseEntries) {
      phases[phaseType] = {
        name: registration.phase.name,
        registeredAt: registration.registeredAt,
        metadata: registration.metadata,
      };
    }

    return {
      phases,
      phaseOrder: this.phaseOrder,
      dependencies: Array.from(this.dependencies.entries()).map(([phase, dep]) => ({
        phase,
        dependsOn: dep.dependsOn,
        optional: dep.optional,
      })),
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Initialize phase dependencies
   */
  private initializeDependencies(): void {
    // INPUT_ANALYSIS has no dependencies (first phase)
    this.dependencies.set(PipelinePhase.INPUT_ANALYSIS, {
      phase: PipelinePhase.INPUT_ANALYSIS,
      dependsOn: [],
      optional: false,
    });

    // AI_REASONING depends on INPUT_ANALYSIS
    this.dependencies.set(PipelinePhase.AI_REASONING, {
      phase: PipelinePhase.AI_REASONING,
      dependsOn: [PipelinePhase.INPUT_ANALYSIS],
      optional: false,
    });

    // GRAPH_TRAVERSAL depends on INPUT_ANALYSIS and AI_REASONING
    this.dependencies.set(PipelinePhase.GRAPH_TRAVERSAL, {
      phase: PipelinePhase.GRAPH_TRAVERSAL,
      dependsOn: [PipelinePhase.INPUT_ANALYSIS, PipelinePhase.AI_REASONING],
      optional: false,
    });

    // FIX_GENERATION depends on AI_REASONING and GRAPH_TRAVERSAL
    this.dependencies.set(PipelinePhase.FIX_GENERATION, {
      phase: PipelinePhase.FIX_GENERATION,
      dependsOn: [PipelinePhase.AI_REASONING, PipelinePhase.GRAPH_TRAVERSAL],
      optional: false,
    });

    // VALIDATION depends on FIX_GENERATION
    this.dependencies.set(PipelinePhase.VALIDATION, {
      phase: PipelinePhase.VALIDATION,
      dependsOn: [PipelinePhase.FIX_GENERATION],
      optional: false,
    });

    // PR_ASSEMBLY depends on VALIDATION
    this.dependencies.set(PipelinePhase.PR_ASSEMBLY, {
      phase: PipelinePhase.PR_ASSEMBLY,
      dependsOn: [PipelinePhase.VALIDATION],
      optional: false,
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the global phase registry instance
 * 
 * @returns Phase registry instance
 */
export function getPhaseRegistry(): PhaseRegistry {
  return PhaseRegistry.getInstance();
}

/**
 * Register multiple phases at once
 * 
 * @param phases - Array of phases to register
 * @param registry - Optional registry instance (uses global if not provided)
 */
export function registerPhases(
  phases: IPhase<any, any>[],
  registry?: PhaseRegistry
): void {
  const reg = registry || PhaseRegistry.getInstance();
  
  for (const phase of phases) {
    reg.registerPhase(phase);
  }
}

/**
 * Check if all required phases are registered
 * 
 * @param registry - Optional registry instance (uses global if not provided)
 * @returns True if all required phases are registered
 */
export function areAllPhasesRegistered(registry?: PhaseRegistry): boolean {
  const reg = registry || PhaseRegistry.getInstance();
  const validation = reg.validateRegistry();
  return validation.isValid;
}

/**
 * Get missing phases
 * 
 * @param registry - Optional registry instance (uses global if not provided)
 * @returns Array of missing phases
 */
export function getMissingPhases(registry?: PhaseRegistry): PipelinePhase[] {
  const reg = registry || PhaseRegistry.getInstance();
  const allPhases = reg.getPhaseOrder();
  const missing: PipelinePhase[] = [];
  
  for (const phase of allPhases) {
    if (!reg.hasPhase(phase)) {
      missing.push(phase);
    }
  }
  
  return missing;
}

/**
 * Create a phase execution plan based on dependencies
 * 
 * @param registry - Optional registry instance (uses global if not provided)
 * @returns Ordered array of phases to execute
 */
export function createExecutionPlan(registry?: PhaseRegistry): PipelinePhase[] {
  const reg = registry || PhaseRegistry.getInstance();
  return reg.getPhaseOrder();
}

// Made with Bob