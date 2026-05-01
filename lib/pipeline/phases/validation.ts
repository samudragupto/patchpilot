/**
 * Phase 5: Validation
 * 
 * This phase validates generated fixes through multiple checks:
 * - Syntax validation (parse code for syntax errors)
 * - Static analysis (linting, type checking)
 * - Security scanning (vulnerability detection)
 * - Test coverage validation
 * - Breaking changes detection
 * - Code quality scoring
 * - Performance regression checks
 * 
 * @module pipeline/phases/validation
 */

import {
  PipelinePhase,
  PhaseStatus,
  PipelineContext,
  ValidationOutput,
  TestResult,
  LintResult,
  LintIssue,
  SecurityScanResult,
  SecurityVulnerability,
  ErrorSeverity,
  ValidationResult,
  ValidationType,
  FixGenerationOutput,
  GeneratedFix,
  GeneratedTest,
} from '../types';
import {
  BasePhase,
  PhaseConfig,
  createPhaseConfig,
} from '../core/phase-interface';

// ============================================================================
// Validation Input/Output Types
// ============================================================================

/**
 * Input for validation phase
 */
export interface ValidationInput {
  /** Generated fixes from Phase 4 */
  readonly fixes: GeneratedFix[];
  
  /** Generated tests from Phase 4 */
  readonly tests: GeneratedTest[];
  
  /** Overall explanation */
  readonly explanation: string;
  
  /** Repository path for file access */
  readonly repoPath: string;
  
  /** Repository metadata */
  readonly repoMetadata?: {
    readonly language: string;
    readonly framework?: string;
  };
}

/**
 * Enhanced validation output with detailed reports
 */
export interface EnhancedValidationOutput extends ValidationOutput {
  /** Overall validation status */
  readonly isValid: boolean;
  
  /** Test execution results */
  readonly testResults: TestResult[];
  
  /** Linting results */
  readonly lintResults: LintResult[];
  
  /** Security scan results */
  readonly securityScan: SecurityScanResult;
  
  /** Syntax validation results */
  readonly syntaxValidation: SyntaxValidationResult;
  
  /** Type checking results (if applicable) */
  readonly typeCheckResults?: TypeCheckResult;
  
  /** Breaking changes detected */
  readonly breakingChanges: BreakingChange[];
  
  /** Code quality metrics */
  readonly qualityMetrics: CodeQualityMetrics;
  
  /** Performance analysis */
  readonly performanceAnalysis: PerformanceAnalysis;
  
  /** Overall quality score (0-100) */
  readonly qualityScore: number;
  
  /** Validation summary */
  readonly summary: ValidationSummary;
  
  /** Detailed validation report */
  readonly report: string;
}

/**
 * Syntax validation result
 */
export interface SyntaxValidationResult {
  readonly passed: boolean;
  readonly errors: SyntaxError[];
  readonly filesChecked: number;
}

/**
 * Syntax error details
 */
export interface SyntaxError {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly code?: string;
}

/**
 * Type checking result
 */
export interface TypeCheckResult {
  readonly passed: boolean;
  readonly errors: TypeCheckError[];
  readonly warnings: string[];
}

/**
 * Type check error
 */
export interface TypeCheckError {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly code: string;
}

/**
 * Breaking change detection
 */
export interface BreakingChange {
  readonly type: 'API_CHANGE' | 'SIGNATURE_CHANGE' | 'REMOVAL' | 'BEHAVIOR_CHANGE';
  readonly file: string;
  readonly description: string;
  readonly severity: ErrorSeverity;
  readonly mitigation?: string;
}

/**
 * Code quality metrics
 */
export interface CodeQualityMetrics {
  readonly complexity: number;
  readonly maintainability: number;
  readonly readability: number;
  readonly testability: number;
  readonly documentation: number;
  readonly overallScore: number;
}

/**
 * Performance analysis
 */
export interface PerformanceAnalysis {
  readonly potentialRegressions: PerformanceIssue[];
  readonly optimizationOpportunities: string[];
  readonly score: number;
}

/**
 * Performance issue
 */
export interface PerformanceIssue {
  readonly file: string;
  readonly line: number;
  readonly type: 'COMPLEXITY' | 'MEMORY' | 'IO' | 'ALGORITHM';
  readonly description: string;
  readonly impact: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Validation summary
 */
export interface ValidationSummary {
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly warnings: number;
  readonly criticalIssues: number;
  readonly recommendation: 'APPROVE' | 'APPROVE_WITH_CHANGES' | 'REJECT';
}

// ============================================================================
// Validation Phase Implementation
// ============================================================================

/**
 * Phase 5: Validation
 * 
 * Validates generated fixes through comprehensive checks including syntax,
 * static analysis, security, testing, and quality metrics.
 */
export class ValidationPhase extends BasePhase<ValidationInput, EnhancedValidationOutput> {
  private checksPerformed: number = 0;
  private issuesFound: number = 0;
  
  constructor(config?: Partial<PhaseConfig>) {
    super(
      PipelinePhase.VALIDATION,
      createPhaseConfig({
        name: 'validation',
        version: '1.0.0',
        timeout: 180000, // 3 minutes
        cacheEnabled: false, // Always validate fresh
        maxRetries: 2,
        retryDelay: 2000,
        optional: false,
        ...config,
      })
    );
  }
  
  /**
   * Extract validation input from pipeline context
   */
  protected extractInput(context: PipelineContext): ValidationInput {
    const fixGeneration = context.phaseOutputs.fixGeneration;
    
    if (!fixGeneration) {
      throw new Error('Fix generation output not found in context');
    }
    
    return {
      fixes: fixGeneration.fixes,
      tests: fixGeneration.tests,
      explanation: fixGeneration.explanation,
      repoPath: context.input.repoPath,
      repoMetadata: context.phaseOutputs.inputAnalysis?.repoMetadata,
    };
  }
  
  /**
   * Validate input before execution
   */
  public async validate(input: ValidationInput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate fixes exist
    if (!input.fixes || input.fixes.length === 0) {
      errors.push(
        this.createValidationError(
          'fixes',
          ValidationType.REQUIRED_FIELD,
          'At least one fix is required for validation'
        )
      );
    }
    
    // Validate repository path
    if (!input.repoPath) {
      errors.push(
        this.createValidationError(
          'repoPath',
          ValidationType.REQUIRED_FIELD,
          'Repository path is required for validation'
        )
      );
    }
    
    // Warn if no tests provided
    if (!input.tests || input.tests.length === 0) {
      warnings.push({
        field: 'tests',
        message: 'No tests provided - test coverage validation will be skipped',
      });
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Execute validation phase
   */
  protected async executePhase(
    input: ValidationInput,
    context: PipelineContext
  ): Promise<EnhancedValidationOutput> {
    this.checksPerformed = 0;
    this.issuesFound = 0;
    
    // Run all validation checks in parallel where possible
    const [
      syntaxValidation,
      lintResults,
      securityScan,
      testResults,
      typeCheckResults,
      breakingChanges,
      qualityMetrics,
      performanceAnalysis,
    ] = await Promise.all([
      this.validateSyntax(input),
      this.runStaticAnalysis(input),
      this.runSecurityScan(input),
      this.validateTests(input),
      this.runTypeChecking(input),
      this.detectBreakingChanges(input),
      this.calculateQualityMetrics(input),
      this.analyzePerformance(input),
    ]);
    
    // Calculate overall quality score
    const qualityScore = this.calculateOverallQualityScore({
      syntaxValidation,
      lintResults,
      securityScan,
      testResults,
      qualityMetrics,
      performanceAnalysis,
    });
    
    // Determine if validation passed
    const isValid = this.determineValidationStatus({
      syntaxValidation,
      lintResults,
      securityScan,
      testResults,
      breakingChanges,
      qualityScore,
    });
    
    // Generate summary
    const summary = this.generateSummary({
      syntaxValidation,
      lintResults,
      securityScan,
      testResults,
      breakingChanges,
      qualityScore,
    });
    
    // Generate detailed report
    const report = this.generateDetailedReport({
      syntaxValidation,
      lintResults,
      securityScan,
      testResults,
      typeCheckResults,
      breakingChanges,
      qualityMetrics,
      performanceAnalysis,
      qualityScore,
      summary,
    });
    
    return {
      isValid,
      testResults,
      lintResults,
      securityScan,
      syntaxValidation,
      typeCheckResults,
      breakingChanges,
      qualityMetrics,
      performanceAnalysis,
      qualityScore,
      summary,
      report,
    };
  }
  
  // ============================================================================
  // Validation Methods
  // ============================================================================
  
  /**
   * Validate syntax of generated code
   */
  private async validateSyntax(input: ValidationInput): Promise<SyntaxValidationResult> {
    this.checksPerformed++;
    const errors: SyntaxError[] = [];
    
    for (const fix of input.fixes) {
      try {
        const code = fix.changes;
        const language = this.detectLanguage(fix.file);
        const syntaxErrors = this.parseSyntax(code, language, fix.file);
        errors.push(...syntaxErrors);
      } catch (error) {
        errors.push({
          file: fix.file,
          line: 0,
          column: 0,
          message: `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    
    if (errors.length > 0) {
      this.issuesFound += errors.length;
    }
    
    return {
      passed: errors.length === 0,
      errors,
      filesChecked: input.fixes.length,
    };
  }
  
  /**
   * Run static analysis (linting)
   */
  private async runStaticAnalysis(input: ValidationInput): Promise<LintResult[]> {
    this.checksPerformed++;
    const results: LintResult[] = [];
    
    for (const fix of input.fixes) {
      const issues = this.analyzeLintIssues(fix.changes, fix.file);
      const score = this.calculateLintScore(issues);
      
      results.push({
        file: fix.file,
        issues,
        score,
      });
      
      if (issues.length > 0) {
        this.issuesFound += issues.filter(i => i.severity === 'error').length;
      }
    }
    
    return results;
  }
  
  /**
   * Run security vulnerability scan
   */
  private async runSecurityScan(input: ValidationInput): Promise<SecurityScanResult> {
    this.checksPerformed++;
    const vulnerabilities: SecurityVulnerability[] = [];
    
    for (const fix of input.fixes) {
      const vulns = this.detectSecurityIssues(fix.changes, fix.file);
      vulnerabilities.push(...vulns);
    }
    
    const score = this.calculateSecurityScore(vulnerabilities);
    const passed = vulnerabilities.filter(v => 
      v.severity === ErrorSeverity.HIGH || v.severity === ErrorSeverity.CRITICAL
    ).length === 0;
    
    if (vulnerabilities.length > 0) {
      this.issuesFound += vulnerabilities.filter(v => 
        v.severity === ErrorSeverity.HIGH || v.severity === ErrorSeverity.CRITICAL
      ).length;
    }
    
    return {
      vulnerabilities,
      score,
      passed,
    };
  }
  
  /**
   * Validate test coverage and execution
   */
  private async validateTests(input: ValidationInput): Promise<TestResult[]> {
    this.checksPerformed++;
    const results: TestResult[] = [];
    
    if (!input.tests || input.tests.length === 0) {
      return [{
        name: 'Test Coverage',
        status: 'SKIPPED',
        duration: 0,
        error: 'No tests provided',
      }];
    }
    
    for (const test of input.tests) {
      const testValidation = this.validateTestSyntax(test);
      
      results.push({
        name: test.file,
        status: testValidation.valid ? 'PASSED' : 'FAILED',
        duration: 0,
        error: testValidation.error,
      });
      
      if (!testValidation.valid) {
        this.issuesFound++;
      }
    }
    
    // Check test coverage
    const coverageResult = this.checkTestCoverage(input.fixes, input.tests);
    results.push(coverageResult);
    
    return results;
  }
  
  /**
   * Run type checking (for TypeScript)
   */
  private async runTypeChecking(input: ValidationInput): Promise<TypeCheckResult | undefined> {
    const language = input.repoMetadata?.language?.toLowerCase();
    
    if (language !== 'typescript' && language !== 'javascript') {
      return undefined;
    }
    
    this.checksPerformed++;
    const errors: TypeCheckError[] = [];
    const warnings: string[] = [];
    
    for (const fix of input.fixes) {
      if (fix.file.endsWith('.ts') || fix.file.endsWith('.tsx')) {
        const typeErrors = this.checkTypes(fix.changes, fix.file);
        errors.push(...typeErrors);
      }
    }
    
    if (errors.length > 0) {
      this.issuesFound += errors.length;
    }
    
    return {
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * Detect breaking changes in fixes
   */
  private async detectBreakingChanges(input: ValidationInput): Promise<BreakingChange[]> {
    this.checksPerformed++;
    const changes: BreakingChange[] = [];
    
    for (const fix of input.fixes) {
      const breakingChanges = this.analyzeBreakingChanges(fix.changes, fix.file);
      changes.push(...breakingChanges);
    }
    
    if (changes.length > 0) {
      this.issuesFound += changes.filter(c => 
        c.severity === ErrorSeverity.HIGH || c.severity === ErrorSeverity.CRITICAL
      ).length;
    }
    
    return changes;
  }
  
  /**
   * Calculate code quality metrics
   */
  private async calculateQualityMetrics(input: ValidationInput): Promise<CodeQualityMetrics> {
    this.checksPerformed++;
    
    let totalComplexity = 0;
    let totalMaintainability = 0;
    let totalReadability = 0;
    let totalTestability = 0;
    let totalDocumentation = 0;
    
    for (const fix of input.fixes) {
      const metrics = this.analyzeCodeQuality(fix.changes, fix.file);
      totalComplexity += metrics.complexity;
      totalMaintainability += metrics.maintainability;
      totalReadability += metrics.readability;
      totalTestability += metrics.testability;
      totalDocumentation += metrics.documentation;
    }
    
    const count = input.fixes.length || 1;
    const complexity = totalComplexity / count;
    const maintainability = totalMaintainability / count;
    const readability = totalReadability / count;
    const testability = totalTestability / count;
    const documentation = totalDocumentation / count;
    
    const overallScore = (maintainability + readability + testability + documentation) / 4;
    
    return {
      complexity,
      maintainability,
      readability,
      testability,
      documentation,
      overallScore,
    };
  }
  
  /**
   * Analyze performance implications
   */
  private async analyzePerformance(input: ValidationInput): Promise<PerformanceAnalysis> {
    this.checksPerformed++;
    const potentialRegressions: PerformanceIssue[] = [];
    const optimizationOpportunities: string[] = [];
    
    for (const fix of input.fixes) {
      const issues = this.detectPerformanceIssues(fix.changes, fix.file);
      potentialRegressions.push(...issues);
      
      const optimizations = this.findOptimizationOpportunities(fix.changes, fix.file);
      optimizationOpportunities.push(...optimizations);
    }
    
    const highImpactIssues = potentialRegressions.filter(i => i.impact === 'HIGH').length;
    const mediumImpactIssues = potentialRegressions.filter(i => i.impact === 'MEDIUM').length;
    
    const score = Math.max(0, 100 - (highImpactIssues * 20) - (mediumImpactIssues * 10));
    
    if (highImpactIssues > 0) {
      this.issuesFound += highImpactIssues;
    }
    
    return {
      potentialRegressions,
      optimizationOpportunities,
      score,
    };
  }
  
  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  private detectLanguage(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript',
      js: 'javascript', jsx: 'javascript',
      py: 'python', java: 'java', go: 'go',
      rb: 'ruby', php: 'php',
    };
    return languageMap[ext || ''] || 'unknown';
  }
  
  private parseSyntax(code: string, language: string, file: string): SyntaxError[] {
    const errors: SyntaxError[] = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Check for undefined variables
      if (line.includes('undefined') && !line.includes('typeof') && 
          !line.includes('===') && !line.includes('!==')) {
        errors.push({
          file,
          line: lineNum,
          column: line.indexOf('undefined'),
          message: 'Potential undefined variable usage',
          code: line.trim(),
        });
      }
    }
    
    return errors;
  }
  
  private analyzeLintIssues(code: string, file: string): LintIssue[] {
    const issues: LintIssue[] = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      if (line.includes('console.log') || line.includes('console.error')) {
        issues.push({
          line: lineNum,
          column: line.indexOf('console'),
          severity: 'warning',
          message: 'Avoid using console statements in production code',
          rule: 'no-console',
        });
      }
      
      if (line.length > 120) {
        issues.push({
          line: lineNum,
          column: 120,
          severity: 'warning',
          message: 'Line exceeds maximum length of 120 characters',
          rule: 'max-len',
        });
      }
      
      if (line.includes('var ')) {
        issues.push({
          line: lineNum,
          column: line.indexOf('var'),
          severity: 'warning',
          message: 'Use const or let instead of var',
          rule: 'no-var',
        });
      }
      
      if (line.includes('==') && !line.includes('===') && !line.includes('!==')) {
        issues.push({
          line: lineNum,
          column: line.indexOf('=='),
          severity: 'error',
          message: 'Use === instead of ==',
          rule: 'eqeqeq',
        });
      }
    }
    
    return issues;
  }
  
  private calculateLintScore(issues: LintIssue[]): number {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    return Math.max(0, 100 - (errorCount * 10) - (warningCount * 5));
  }
  
  private detectSecurityIssues(code: string, file: string): SecurityVulnerability[] {
    const vulnerabilities: SecurityVulnerability[] = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      if (line.includes('eval(')) {
        vulnerabilities.push({
          severity: ErrorSeverity.HIGH,
          description: 'Use of eval() can lead to code injection vulnerabilities',
          file,
          line: lineNum,
          cwe: 'CWE-95',
        });
      }
      
      if (line.includes('SELECT') && line.includes('+') && !line.includes('//')) {
        vulnerabilities.push({
          severity: ErrorSeverity.CRITICAL,
          description: 'Potential SQL injection vulnerability - use parameterized queries',
          file,
          line: lineNum,
          cwe: 'CWE-89',
        });
      }
      
      if (line.match(/password\s*=\s*["'][^"']+["']/i) || 
          line.match(/api[_-]?key\s*=\s*["'][^"']+["']/i)) {
        vulnerabilities.push({
          severity: ErrorSeverity.CRITICAL,
          description: 'Hardcoded credentials detected - use environment variables',
          file,
          line: lineNum,
          cwe: 'CWE-798',
        });
      }
      
      if (line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) {
        vulnerabilities.push({
          severity: ErrorSeverity.HIGH,
          description: 'Potential XSS vulnerability - sanitize user input before rendering',
          file,
          line: lineNum,
          cwe: 'CWE-79',
        });
      }
    }
    
    return vulnerabilities;
  }
  
  private calculateSecurityScore(vulnerabilities: SecurityVulnerability[]): number {
    const criticalCount = vulnerabilities.filter(v => v.severity === ErrorSeverity.CRITICAL).length;
    const highCount = vulnerabilities.filter(v => v.severity === ErrorSeverity.HIGH).length;
    const mediumCount = vulnerabilities.filter(v => v.severity === ErrorSeverity.MEDIUM).length;
    return Math.max(0, 100 - (criticalCount * 30) - (highCount * 20) - (mediumCount * 10));
  }
  
  private validateTestSyntax(test: GeneratedTest): { valid: boolean; error?: string } {
    const content = test.content;
    const hasFramework = content.includes('describe') || content.includes('test') || 
                        content.includes('it(') || content.includes('expect');
    
    if (!hasFramework) {
      return { valid: false, error: 'Test does not appear to use a recognized testing framework' };
    }
    
    const hasTestCase = content.includes('it(') || content.includes('test(');
    if (!hasTestCase) {
      return { valid: false, error: 'No test cases found' };
    }
    
    const hasAssertions = content.includes('expect(') || content.includes('assert');
    if (!hasAssertions) {
      return { valid: false, error: 'No assertions found in test' };
    }
    
    return { valid: true };
  }
  
  private checkTestCoverage(fixes: GeneratedFix[], tests: GeneratedTest[]): TestResult {
    const fixedFiles = new Set(fixes.map(f => f.file));
    const testedFiles = new Set(tests.flatMap(t => t.coverage || []));
    
    const coverage = fixedFiles.size > 0 ? (testedFiles.size / fixedFiles.size) * 100 : 0;
    const passed = coverage >= 80;
    
    return {
      name: 'Test Coverage',
      status: passed ? 'PASSED' : 'FAILED',
      duration: 0,
      error: passed ? undefined : `Test coverage is ${coverage.toFixed(1)}% (minimum 80% required)`,
    };
  }
  
  private checkTypes(code: string, file: string): TypeCheckError[] {
    const errors: TypeCheckError[] = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      if (line.includes(': any')) {
        errors.push({
          file,
          line: lineNum,
          message: 'Avoid using "any" type - use specific types instead',
          code: 'TS2571',
        });
      }
    }
    
    return errors;
  }
  
  private analyzeBreakingChanges(code: string, file: string): BreakingChange[] {
    const changes: BreakingChange[] = [];
    const lines = code.split('\n');
    
    for (const line of lines) {
      if (line.includes('// export') || line.includes('/* export')) {
        changes.push({
          type: 'REMOVAL',
          file,
          description: 'Exported member appears to be removed or commented out',
          severity: ErrorSeverity.HIGH,
          mitigation: 'Consider deprecating instead of removing, or provide migration guide',
        });
      }
      
      if (line.includes('public') && line.includes('private')) {
        changes.push({
          type: 'API_CHANGE',
          file,
          description: 'Public API member changed to private',
          severity: ErrorSeverity.HIGH,
          mitigation: 'Ensure this change is intentional and document in changelog',
        });
      }
    }
    
    return changes;
  }
  
  private analyzeCodeQuality(code: string, file: string): CodeQualityMetrics {
    const lines = code.split('\n').filter(l => l.trim());
    
    const complexityKeywords = ['if', 'else', 'for', 'while', 'case', 'catch', '&&', '||'];
    let complexity = 1;
    for (const line of lines) {
      for (const keyword of complexityKeywords) {
        complexity += (line.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
      }
    }
    const normalizedComplexity = Math.min(100, Math.max(0, 100 - complexity * 2));
    
    const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
    const maintainability = Math.max(0, 100 - (avgLineLength / 2));
    
    const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('*')).length;
    const commentRatio = commentLines / lines.length;
    const readability = Math.min(100, 50 + (commentRatio * 100));
    
    const functionCount = (code.match(/function\s+\w+/g) || []).length + (code.match(/=>\s*{/g) || []).length;
    const avgFunctionSize = lines.length / Math.max(1, functionCount);
    const testability = Math.max(0, 100 - (avgFunctionSize / 2));
    
    const documentation = code.includes('/**') ? 80 : 40;
    
    const overallScore = (normalizedComplexity + maintainability + readability + testability + documentation) / 5;
    
    return {
      complexity: normalizedComplexity,
      maintainability,
      readability,
      testability,
      documentation,
      overallScore,
    };
  }
  
  private detectPerformanceIssues(code: string, file: string): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      if (line.includes('for') && code.slice(0, code.indexOf(line)).includes('for')) {
        issues.push({
          file,
          line: lineNum,
          type: 'COMPLEXITY',
          description: 'Nested loops detected - consider optimizing algorithm',
          impact: 'MEDIUM',
        });
      }
      
      if (line.includes('readFileSync') || line.includes('writeFileSync')) {
        issues.push({
          file,
          line: lineNum,
          type: 'IO',
          description: 'Synchronous file operation - use async version for better performance',
          impact: 'HIGH',
        });
      }
    }
    
    return issues;
  }
  
  private findOptimizationOpportunities(code: string, file: string): string[] {
    const opportunities: string[] = [];
    
    if ((code.match(/\.map\(/g) || []).length > 1) {
      opportunities.push(`${file}: Multiple array iterations - consider combining map operations`);
    }
    
    if (code.includes('+=') && code.includes('for')) {
      opportunities.push(`${file}: String concatenation in loop - use array join for better performance`);
    }
    
    return opportunities;
  }
  
  private calculateOverallQualityScore(results: {
    syntaxValidation: SyntaxValidationResult;
    lintResults: LintResult[];
    securityScan: SecurityScanResult;
    testResults: TestResult[];
    qualityMetrics: CodeQualityMetrics;
    performanceAnalysis: PerformanceAnalysis;
  }): number {
    const weights = {
      syntax: 0.20,
      lint: 0.15,
      security: 0.25,
      tests: 0.20,
      quality: 0.15,
      performance: 0.05,
    };
    
    const syntaxScore = results.syntaxValidation.passed ? 100 : 0;
    const lintScore = results.lintResults.reduce((sum, r) => sum + r.score, 0) / Math.max(1, results.lintResults.length);
    const securityScore = results.securityScan.score;
    const testScore = results.testResults.filter(t => t.status === 'PASSED').length / Math.max(1, results.testResults.length) * 100;
    const qualityScore = results.qualityMetrics.overallScore;
    const performanceScore = results.performanceAnalysis.score;
    
    const overallScore = 
      (syntaxScore * weights.syntax) +
      (lintScore * weights.lint) +
      (securityScore * weights.security) +
      (testScore * weights.tests) +
      (qualityScore * weights.quality) +
      (performanceScore * weights.performance);
    
    return Math.round(overallScore);
  }
  
  private determineValidationStatus(results: {
    syntaxValidation: SyntaxValidationResult;
    lintResults: LintResult[];
    securityScan: SecurityScanResult;
    testResults: TestResult[];
    breakingChanges: BreakingChange[];
    qualityScore: number;
  }): boolean {
    if (!results.syntaxValidation.passed) return false;
    if (!results.securityScan.passed) return false;
    
    const criticalBreakingChanges = results.breakingChanges.filter(
      c => c.severity === ErrorSeverity.CRITICAL
    );
    if (criticalBreakingChanges.length > 0) return false;
    
    if (results.qualityScore < 60) return false;
    
    const passedTests = results.testResults.filter(t => t.status === 'PASSED').length;
    const totalTests = results.testResults.length;
    if (totalTests > 0 && passedTests / totalTests < 0.8) return false;
    
    return true;
  }
  
  private generateSummary(results: {
    syntaxValidation: SyntaxValidationResult;
    lintResults: LintResult[];
    securityScan: SecurityScanResult;
    testResults: TestResult[];
    breakingChanges: BreakingChange[];
    qualityScore: number;
  }): ValidationSummary {
    const totalChecks = this.checksPerformed;
    
    let passedChecks = 0;
    if (results.syntaxValidation.passed) passedChecks++;
    if (results.securityScan.passed) passedChecks++;
    passedChecks += results.testResults.filter(t => t.status === 'PASSED').length;
    passedChecks += results.lintResults.filter(r => r.score >= 80).length;
    
    const failedChecks = totalChecks - passedChecks;
    
    const warnings = results.lintResults.reduce(
      (sum, r) => sum + r.issues.filter(i => i.severity === 'warning').length,
      0
    );
    
    const criticalIssues = 
      results.syntaxValidation.errors.length +
      results.securityScan.vulnerabilities.filter(v => v.severity === ErrorSeverity.CRITICAL).length +
      results.breakingChanges.filter(c => c.severity === ErrorSeverity.CRITICAL).length;
    
    let recommendation: 'APPROVE' | 'APPROVE_WITH_CHANGES' | 'REJECT';
    if (criticalIssues > 0 || results.qualityScore < 60) {
      recommendation = 'REJECT';
    } else if (warnings > 5 || results.qualityScore < 80) {
      recommendation = 'APPROVE_WITH_CHANGES';
    } else {
      recommendation = 'APPROVE';
    }
    
    return {
      totalChecks,
      passedChecks,
      failedChecks,
      warnings,
      criticalIssues,
      recommendation,
    };
  }
  
  private generateDetailedReport(results: {
    syntaxValidation: SyntaxValidationResult;
    lintResults: LintResult[];
    securityScan: SecurityScanResult;
    testResults: TestResult[];
    typeCheckResults?: TypeCheckResult;
    breakingChanges: BreakingChange[];
    qualityMetrics: CodeQualityMetrics;
    performanceAnalysis: PerformanceAnalysis;
    qualityScore: number;
    summary: ValidationSummary;
  }): string {
    const lines: string[] = [];
    
    lines.push('# Validation Report\n');
    lines.push(`**Overall Quality Score:** ${results.qualityScore}/100`);
    lines.push(`**Recommendation:** ${results.summary.recommendation}\n`);
    
    lines.push('## Summary');
    lines.push(`- Total Checks: ${results.summary.totalChecks}`);
    lines.push(`- Passed: ${results.summary.passedChecks}`);
    lines.push(`- Failed: ${results.summary.failedChecks}`);
    lines.push(`- Warnings: ${results.summary.warnings}`);
    lines.push(`- Critical Issues: ${results.summary.criticalIssues}\n`);
    
    lines.push('## Syntax Validation');
    lines.push(`**Status:** ${results.syntaxValidation.passed ? '✓ PASSED' : '✗ FAILED'}`);
    lines.push(`**Files Checked:** ${results.syntaxValidation.filesChecked}`);
    if (results.syntaxValidation.errors.length > 0) {
      lines.push('**Errors:**');
      for (const error of results.syntaxValidation.errors.slice(0, 5)) {
        lines.push(`- ${error.file}:${error.line}:${error.column} - ${error.message}`);
      }
    }
    lines.push('');
    
    lines.push('## Security Scan');
    lines.push(`**Status:** ${results.securityScan.passed ? '✓ PASSED' : '✗ FAILED'}`);
    lines.push(`**Score:** ${results.securityScan.score}/100`);
    if (results.securityScan.vulnerabilities.length > 0) {
      lines.push('**Vulnerabilities:**');
      for (const vuln of results.securityScan.vulnerabilities.slice(0, 5)) {
        lines.push(`- [${vuln.severity}] ${vuln.file}${vuln.line ? `:${vuln.line}` : ''} - ${vuln.description}`);
      }
    }
    lines.push('');
    
    lines.push('## Code Quality Metrics');
    lines.push(`- Complexity: ${results.qualityMetrics.complexity.toFixed(1)}/100`);
    lines.push(`- Maintainability: ${results.qualityMetrics.maintainability.toFixed(1)}/100`);
    lines.push(`- Readability: ${results.qualityMetrics.readability.toFixed(1)}/100`);
    lines.push(`- Testability: ${results.qualityMetrics.testability.toFixed(1)}/100`);
    lines.push(`- Documentation: ${results.qualityMetrics.documentation.toFixed(1)}/100`);
    lines.push(`- Overall: ${results.qualityMetrics.overallScore.toFixed(1)}/100\n`);
    
    if (results.breakingChanges.length > 0) {
      lines.push('## Breaking Changes');
      for (const change of results.breakingChanges) {
        lines.push(`- [${change.severity}] ${change.type} in ${change.file}`);
        lines.push(`  ${change.description}`);
      }
      lines.push('');
    }
    
    lines.push('---');
    lines.push('*Generated by PatchPilot Validation Phase*');
    
    return lines.join('\n');
  }
}

/**
 * Factory function to create validation phase instance
 */
export function createValidationPhase(config?: Partial<PhaseConfig>): ValidationPhase {
  return new ValidationPhase(config);
}

// Made with Bob
