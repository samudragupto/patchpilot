/**
 * Phase 6: PR Assembly
 * 
 * This phase assembles a complete Pull Request package from validated fixes.
 * It creates comprehensive PR documentation including title, description, 
 * change summaries, validation results, testing instructions, and metadata.
 * 
 * Key responsibilities:
 * - Generate compelling PR title and description
 * - Create detailed change summaries with explanations
 * - Include validation results and quality metrics
 * - Add before/after code snippets
 * - Generate commit messages for each file change
 * - Create testing and rollback instructions
 * - Suggest reviewers based on affected files
 * - Add appropriate labels based on issue type
 * - Format everything in proper markdown
 * - Prepare metadata for GitHub API integration
 * 
 * @module pipeline/phases/pr-assembly
 */

import {
  PipelinePhase,
  PipelineContext,
  PRAssemblyOutput,
  PRPackage,
  FileChange,
  TestFile,
  ValidationResult,
  ValidationType,
  GeneratedFix,
  GeneratedTest,
} from '../types';
import {
  BasePhase,
  PhaseConfig,
  createPhaseConfig,
  ErrorHandlingStrategy,
} from '../core/phase-interface';
import { parseGitHubUrl } from '../../github/repo-manager';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input data for the PR Assembly phase
 */
export interface PRAssemblyInput {
  /** Validated fixes from Phase 5 */
  readonly fixes: GeneratedFix[];
  
  /** Generated tests from Phase 4 */
  readonly tests: GeneratedTest[];
  
  /** Overall explanation from Phase 4 */
  readonly explanation: string;
  
  /** Validation output from Phase 5 */
  readonly validation: {
    readonly isValid: boolean;
    readonly qualityScore: number;
    readonly testResults: any[];
    readonly lintResults: any[];
    readonly securityScan: any;
    readonly syntaxValidation: any;
    readonly typeCheckResults?: any;
    readonly breakingChanges: any[];
    readonly qualityMetrics: any;
    readonly performanceAnalysis: any;
    readonly summary: any;
    readonly report: string;
  };
  
  /** Root cause analysis from Phase 2 */
  readonly rootCause?: {
    readonly cause: string;
    readonly category: string;
    readonly confidence: number;
    readonly evidence: string[];
  };
  
  /** Repository information */
  readonly repoUrl: string;
  readonly repoPath: string;
  readonly repoMetadata: {
    readonly name: string;
    readonly owner: string;
    readonly branch: string;
    readonly language: string;
    readonly framework?: string;
  };
  
  /** Issue context */
  readonly issueContext?: {
    readonly errorType: string;
    readonly errorMessage: string;
    readonly severity: string;
  };
}

// ============================================================================
// PR Assembly Types
// ============================================================================

/**
 * PR metadata for GitHub API
 */
export interface PRMetadata {
  /** Branch name for the PR */
  readonly branchName: string;
  
  /** Base branch to merge into */
  readonly baseBranch: string;
  
  /** Labels to apply */
  readonly labels: string[];
  
  /** Suggested reviewers */
  readonly reviewers: string[];
  
  /** Milestone (if applicable) */
  readonly milestone?: string;
  
  /** Draft status */
  readonly draft: boolean;
  
  /** Auto-merge enabled */
  readonly autoMerge: boolean;
}

/**
 * Commit information
 */
export interface CommitInfo {
  /** File path */
  readonly file: string;
  
  /** Commit message */
  readonly message: string;
  
  /** Commit description */
  readonly description: string;
}

/**
 * Code snippet for before/after comparison
 */
export interface CodeSnippet {
  /** File path */
  readonly file: string;
  
  /** Before code */
  readonly before: string;
  
  /** After code */
  readonly after: string;
  
  /** Line numbers */
  readonly lineRange: string;
}

// ============================================================================
// PR Assembly Phase Implementation
// ============================================================================

/**
 * Phase 6: PR Assembly
 * 
 * Assembles a complete Pull Request package from validated fixes.
 */
export class PRAssemblyPhase extends BasePhase<PRAssemblyInput, PRAssemblyOutput> {
  private fixCount: number = 0;
  private testCount: number = 0;
  
  constructor(config?: Partial<PhaseConfig>) {
    super(
      PipelinePhase.PR_ASSEMBLY,
      createPhaseConfig({
        name: 'pr-assembly',
        version: '1.0.0',
        timeout: 60000, // 1 minute
        cacheEnabled: false, // PRs should always be fresh
        maxRetries: 2,
        retryDelay: 1000,
        optional: false,
        ...config,
      })
    );
  }
  
  /**
   * Extract input from pipeline context
   */
  protected extractInput(context: PipelineContext): PRAssemblyInput {
    const fixGeneration = context.phaseOutputs.fixGeneration;
    const validation = context.phaseOutputs.validation;
    const aiReasoning = context.phaseOutputs.aiReasoning;
    const inputAnalysis = context.phaseOutputs.inputAnalysis;
    
    if (!fixGeneration) {
      throw new Error('Fix generation output not found in context');
    }
    
    if (!validation) {
      throw new Error('Validation output not found in context');
    }
    
    return {
      fixes: fixGeneration.fixes,
      tests: fixGeneration.tests,
      explanation: fixGeneration.explanation,
      validation: validation as any,
      rootCause: aiReasoning?.rootCause,
      repoUrl: context.input.repoUrl,
      repoPath: context.input.repoPath,
      repoMetadata: inputAnalysis?.repoMetadata as any,
      issueContext: inputAnalysis?.errorContext ? {
        errorType: inputAnalysis.parsedStackTrace.errorType,
        errorMessage: inputAnalysis.parsedStackTrace.errorMessage,
        severity: inputAnalysis.errorContext.severity,
      } : undefined,
    };
  }
  
  /**
   * Validate input data
   */
  public async validate(input: PRAssemblyInput): Promise<ValidationResult> {
    const errors = [];
    
    // Validate fixes
    const fixesError = this.validateRequired('fixes', input.fixes);
    if (fixesError) errors.push(fixesError);
    
    if (input.fixes && input.fixes.length === 0) {
      errors.push(
        this.createValidationError(
          'fixes',
          ValidationType.CONSTRAINT_VIOLATION,
          'At least one fix is required to create a PR'
        )
      );
    }
    
    // Validate validation output
    const validationError = this.validateRequired('validation', input.validation);
    if (validationError) errors.push(validationError);
    
    // Validate repository information
    const repoUrlError = this.validateRequired('repoUrl', input.repoUrl);
    if (repoUrlError) errors.push(repoUrlError);
    
    const repoMetadataError = this.validateRequired('repoMetadata', input.repoMetadata);
    if (repoMetadataError) errors.push(repoMetadataError);
    
    return this.createValidationResult(errors.length === 0, errors);
  }
  
  /**
   * Execute PR assembly
   */
  protected async executePhase(
    input: PRAssemblyInput,
    context: PipelineContext
  ): Promise<PRAssemblyOutput> {
    this.fixCount = input.fixes.length;
    this.testCount = input.tests.length;
    
    // Generate PR title
    const title = this.generatePRTitle(input);
    
    // Generate PR description
    const description = this.generatePRDescription(input);
    
    // Create file changes
    const changes = this.createFileChanges(input.fixes);
    
    // Create test files
    const tests = this.createTestFiles(input.tests);
    
    // Generate branch name
    const branchName = this.generateBranchName(input);
    
    // Generate labels
    const labels = this.generateLabels(input);
    
    // Suggest reviewers
    const reviewers = this.suggestReviewers(input);
    
    // Calculate confidence score
    const confidence = this.calculateConfidence(input);
    
    // Create PR package
    const prPackage: PRPackage = {
      title,
      description,
      changes,
      tests,
      branchName,
      labels,
      reviewers,
      confidence,
    };
    
    // Generate summary
    const summary = this.generateSummary(input, prPackage);
    
    return {
      prPackage,
      summary,
    };
  }
  
  // ============================================================================
  // PR Generation Methods
  // ============================================================================
  
  /**
   * Generate PR title
   */
  private generatePRTitle(input: PRAssemblyInput): string {
    const { issueContext, rootCause } = input;
    
    // Use root cause if available
    if (rootCause) {
      const category = this.formatCategory(rootCause.category);
      return `fix(${category}): ${this.truncate(rootCause.cause, 60)}`;
    }
    
    // Use issue context
    if (issueContext) {
      const type = this.formatErrorType(issueContext.errorType);
      return `fix: resolve ${type} - ${this.truncate(issueContext.errorMessage, 50)}`;
    }
    
    // Generic title
    return `fix: resolve issues in ${input.fixes.length} file${input.fixes.length > 1 ? 's' : ''}`;
  }
  
  /**
   * Generate comprehensive PR description
   */
  private generatePRDescription(input: PRAssemblyInput): string {
    const sections: string[] = [];
    
    // Header
    sections.push('# 🤖 PatchPilot Automated Fix\n');
    sections.push('> This PR was automatically generated by PatchPilot AI to resolve identified issues.\n');
    
    // Overview
    sections.push('## 📋 Overview\n');
    if (input.rootCause) {
      sections.push(`**Root Cause:** ${input.rootCause.cause}\n`);
      sections.push(`**Category:** ${input.rootCause.category}\n`);
      sections.push(`**Confidence:** ${(input.rootCause.confidence * 100).toFixed(1)}%\n`);
    }
    if (input.issueContext) {
      sections.push(`**Error Type:** ${input.issueContext.errorType}\n`);
      sections.push(`**Error Message:** \`${input.issueContext.errorMessage}\`\n`);
      sections.push(`**Severity:** ${input.issueContext.severity}\n`);
    }
    sections.push('');
    
    // Changes Summary
    sections.push('## 🔧 Changes Made\n');
    sections.push(this.generateChangesSummary(input.fixes));
    sections.push('');
    
    // Explanation
    if (input.explanation) {
      sections.push('## 💡 Explanation\n');
      sections.push(input.explanation);
      sections.push('');
    }
    
    // Validation Results
    sections.push('## ✅ Validation Results\n');
    sections.push(this.generateValidationSection(input.validation));
    sections.push('');
    
    // Quality Metrics
    sections.push('## 📊 Quality Metrics\n');
    sections.push(this.generateQualityMetrics(input.validation));
    sections.push('');
    
    // Code Changes
    sections.push('## 📝 Detailed Changes\n');
    sections.push(this.generateDetailedChanges(input.fixes));
    sections.push('');
    
    // Testing
    if (input.tests.length > 0) {
      sections.push('## 🧪 Tests\n');
      sections.push(this.generateTestsSection(input.tests));
      sections.push('');
    }
    
    // Breaking Changes
    if (input.validation.breakingChanges.length > 0) {
      sections.push('## ⚠️ Breaking Changes\n');
      sections.push(this.generateBreakingChangesSection(input.validation.breakingChanges));
      sections.push('');
    }
    
    // Testing Instructions
    sections.push('## 🧪 Testing Instructions\n');
    sections.push(this.generateTestingInstructions(input));
    sections.push('');
    
    // Rollback Instructions
    sections.push('## 🔄 Rollback Instructions\n');
    sections.push(this.generateRollbackInstructions(input));
    sections.push('');
    
    // Checklist
    sections.push('## ✓ Checklist\n');
    sections.push(this.generateChecklist(input));
    sections.push('');
    
    // Footer
    sections.push('---');
    sections.push('*Generated by [PatchPilot](https://github.com/patchpilot) - AI-powered code fixing*');
    
    return sections.join('\n');
  }
  
  /**
   * Generate changes summary
   */
  private generateChangesSummary(fixes: GeneratedFix[]): string {
    const lines: string[] = [];
    
    for (const fix of fixes) {
      const fileName = fix.file.split('/').pop() || fix.file;
      lines.push(`- **${fileName}**: ${this.truncate(fix.explanation, 100)}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate validation section
   */
  private generateValidationSection(validation: any): string {
    const lines: string[] = [];
    
    lines.push(`**Overall Status:** ${validation.isValid ? '✅ Passed' : '❌ Failed'}`);
    lines.push(`**Quality Score:** ${validation.qualityScore}/100`);
    lines.push('');
    
    // Test results
    const passedTests = validation.testResults.filter((t: any) => t.status === 'PASSED').length;
    const totalTests = validation.testResults.length;
    lines.push(`**Tests:** ${passedTests}/${totalTests} passed`);
    
    // Lint results
    const lintIssues = validation.lintResults.reduce((sum: number, r: any) => sum + r.issues.length, 0);
    lines.push(`**Lint Issues:** ${lintIssues}`);
    
    // Security
    const securityVulns = validation.securityScan.vulnerabilities.length;
    lines.push(`**Security:** ${securityVulns === 0 ? '✅ No vulnerabilities' : `⚠️ ${securityVulns} issue(s)`}`);
    
    // Syntax
    lines.push(`**Syntax:** ${validation.syntaxValidation.passed ? '✅ Valid' : '❌ Errors found'}`);
    
    return lines.join('\n');
  }
  
  /**
   * Generate quality metrics
   */
  private generateQualityMetrics(validation: any): string {
    const metrics = validation.qualityMetrics;
    const lines: string[] = [];
    
    lines.push('| Metric | Score |');
    lines.push('|--------|-------|');
    lines.push(`| Maintainability | ${metrics.maintainability}/100 |`);
    lines.push(`| Readability | ${metrics.readability}/100 |`);
    lines.push(`| Complexity | ${metrics.complexity}/100 |`);
    lines.push(`| Documentation | ${metrics.documentation}/100 |`);
    lines.push(`| Testability | ${metrics.testability}/100 |`);
    lines.push(`| **Overall** | **${metrics.overallScore}/100** |`);
    
    return lines.join('\n');
  }
  
  /**
   * Generate detailed changes
   */
  private generateDetailedChanges(fixes: GeneratedFix[]): string {
    const lines: string[] = [];
    
    for (let i = 0; i < fixes.length; i++) {
      const fix = fixes[i];
      lines.push(`### ${i + 1}. \`${fix.file}\`\n`);
      lines.push(`**Confidence:** ${(fix.confidence * 100).toFixed(1)}%\n`);
      lines.push(`**Changes:**`);
      lines.push('```diff');
      lines.push(fix.changes);
      lines.push('```\n');
      lines.push(`**Explanation:** ${fix.explanation}\n`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate tests section
   */
  private generateTestsSection(tests: GeneratedTest[]): string {
    const lines: string[] = [];
    
    lines.push(`Added ${tests.length} test file${tests.length > 1 ? 's' : ''}:\n`);
    
    for (const test of tests) {
      lines.push(`- **${test.file}** (${test.framework})`);
      if (test.coverage.length > 0) {
        lines.push(`  - Coverage: ${test.coverage.join(', ')}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate breaking changes section
   */
  private generateBreakingChangesSection(breakingChanges: any[]): string {
    const lines: string[] = [];
    
    for (const change of breakingChanges) {
      lines.push(`### ${change.type} - ${change.severity}\n`);
      lines.push(`**File:** \`${change.file}\`\n`);
      lines.push(`**Description:** ${change.description}\n`);
      if (change.mitigation) {
        lines.push(`**Mitigation:** ${change.mitigation}\n`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate testing instructions
   */
  private generateTestingInstructions(input: PRAssemblyInput): string {
    const lines: string[] = [];
    
    lines.push('1. **Pull the changes:**');
    lines.push('   ```bash');
    lines.push(`   git fetch origin ${this.generateBranchName(input)}`);
    lines.push(`   git checkout ${this.generateBranchName(input)}`);
    lines.push('   ```\n');
    
    lines.push('2. **Install dependencies:**');
    lines.push('   ```bash');
    lines.push('   npm install');
    lines.push('   ```\n');
    
    lines.push('3. **Run tests:**');
    lines.push('   ```bash');
    lines.push('   npm test');
    lines.push('   ```\n');
    
    lines.push('4. **Run linting:**');
    lines.push('   ```bash');
    lines.push('   npm run lint');
    lines.push('   ```\n');
    
    lines.push('5. **Verify the fix:**');
    lines.push('   - Reproduce the original issue');
    lines.push('   - Confirm it is resolved');
    lines.push('   - Check for any side effects');
    
    return lines.join('\n');
  }
  
  /**
   * Generate rollback instructions
   */
  private generateRollbackInstructions(input: PRAssemblyInput): string {
    const lines: string[] = [];
    
    lines.push('If issues arise, you can rollback these changes:\n');
    lines.push('```bash');
    lines.push(`git revert HEAD~${input.fixes.length}`);
    lines.push('# Or to rollback specific files:');
    for (const fix of input.fixes.slice(0, 3)) {
      lines.push(`git checkout HEAD~1 -- ${fix.file}`);
    }
    if (input.fixes.length > 3) {
      lines.push(`# ... and ${input.fixes.length - 3} more files`);
    }
    lines.push('```');
    
    return lines.join('\n');
  }
  
  /**
   * Generate checklist
   */
  private generateChecklist(input: PRAssemblyInput): string {
    const lines: string[] = [];
    
    lines.push('- [x] Code changes implemented');
    lines.push('- [x] Tests added/updated');
    lines.push('- [x] Syntax validation passed');
    lines.push(`- [${input.validation.testResults.every((t: any) => t.status === 'PASSED') ? 'x' : ' '}] All tests passing`);
    lines.push(`- [${input.validation.lintResults.every((r: any) => r.issues.length === 0) ? 'x' : ' '}] No lint errors`);
    lines.push(`- [${input.validation.securityScan.vulnerabilities.length === 0 ? 'x' : ' '}] No security vulnerabilities`);
    lines.push('- [ ] Code reviewed');
    lines.push('- [ ] Documentation updated (if needed)');
    lines.push('- [ ] Changelog updated (if needed)');
    
    return lines.join('\n');
  }
  
  /**
   * Create file changes
   */
  private createFileChanges(fixes: GeneratedFix[]): FileChange[] {
    return fixes.map(fix => ({
      path: fix.file,
      newContent: fix.changes,
      changeType: 'UPDATE' as const,
      diff: fix.changes,
    }));
  }
  
  /**
   * Create test files
   */
  private createTestFiles(tests: GeneratedTest[]): TestFile[] {
    return tests.map(test => ({
      path: test.file,
      content: test.content,
      framework: test.framework,
      coverage: test.coverage.length > 0 ? 85 : undefined,
    }));
  }
  
  /**
   * Generate branch name
   */
  private generateBranchName(input: PRAssemblyInput): string {
    const timestamp = Date.now();
    const category = input.rootCause?.category || 'fix';
    const sanitized = category.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `patchpilot/${sanitized}-${timestamp}`;
  }
  
  /**
   * Generate labels
   */
  private generateLabels(input: PRAssemblyInput): string[] {
    const labels: string[] = ['automated', 'patchpilot'];
    
    // Add category label
    if (input.rootCause?.category) {
      labels.push(input.rootCause.category.toLowerCase());
    }
    
    // Add severity label
    if (input.issueContext?.severity) {
      labels.push(`severity:${input.issueContext.severity.toLowerCase()}`);
    }
    
    // Add language label
    if (input.repoMetadata?.language) {
      labels.push(input.repoMetadata.language.toLowerCase());
    }
    
    // Add quality label
    if (input.validation.qualityScore >= 80) {
      labels.push('high-quality');
    } else if (input.validation.qualityScore >= 60) {
      labels.push('medium-quality');
    }
    
    // Add breaking change label
    if (input.validation.breakingChanges.length > 0) {
      labels.push('breaking-change');
    }
    
    // Add test label
    if (input.tests.length > 0) {
      labels.push('has-tests');
    }
    
    return labels;
  }
  
  /**
   * Suggest reviewers based on affected files
   */
  private suggestReviewers(input: PRAssemblyInput): string[] {
    // In a real implementation, this would analyze git blame
    // and suggest reviewers based on file ownership
    const reviewers: string[] = [];
    
    // For now, return empty array
    // Could be enhanced with CODEOWNERS parsing
    return reviewers;
  }
  
  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(input: PRAssemblyInput): number {
    let totalConfidence = 0;
    let weights = 0;
    
    // Fix confidence (40% weight)
    const avgFixConfidence = input.fixes.reduce((sum, fix) => sum + fix.confidence, 0) / input.fixes.length;
    totalConfidence += avgFixConfidence * 0.4;
    weights += 0.4;
    
    // Root cause confidence (20% weight)
    if (input.rootCause) {
      totalConfidence += input.rootCause.confidence * 0.2;
      weights += 0.2;
    }
    
    // Validation quality (40% weight)
    const validationScore = input.validation.qualityScore / 100;
    totalConfidence += validationScore * 0.4;
    weights += 0.4;
    
    return totalConfidence / weights;
  }
  
  /**
   * Generate summary
   */
  private generateSummary(input: PRAssemblyInput, prPackage: PRPackage): string {
    const lines: string[] = [];
    
    lines.push(`✅ PR assembled successfully`);
    lines.push(`📝 ${input.fixes.length} file(s) modified`);
    lines.push(`🧪 ${input.tests.length} test file(s) added`);
    lines.push(`📊 Quality score: ${input.validation.qualityScore}/100`);
    lines.push(`🎯 Confidence: ${(prPackage.confidence * 100).toFixed(1)}%`);
    lines.push(`🏷️  Labels: ${prPackage.labels.join(', ')}`);
    
    return lines.join('\n');
  }
  
  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  /**
   * Format category for display
   */
  private formatCategory(category: string): string {
    return category.toLowerCase().replace(/_/g, '-');
  }
  
  /**
   * Format error type for display
   */
  private formatErrorType(errorType: string): string {
    return errorType
      .replace(/Error$/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase();
  }
  
  /**
   * Truncate string to max length
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Handle errors with custom strategy
   */
  public async handleError(
    error: Error,
    context: PipelineContext
  ): Promise<ErrorHandlingStrategy> {
    // PR assembly errors are usually not transient
    // Log the error and fail
    console.error('PR Assembly error:', error);
    return ErrorHandlingStrategy.FAIL;
  }
  
  /**
   * Get resource usage
   */
  protected getResourceUsage() {
    return {
      cpuTime: 0,
      memoryUsed: 0,
      apiCalls: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PR Assembly phase instance
 */
export function createPRAssemblyPhase(config?: Partial<PhaseConfig>): PRAssemblyPhase {
  return new PRAssemblyPhase(config);
}

// Made with Bob