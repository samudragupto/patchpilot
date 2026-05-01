/**
 * Phase 4: Fix Generation
 * 
 * This phase generates code fixes for identified issues using IBM watsonx AI.
 * It receives graph traversal output, reads file contents, and generates multiple
 * fix alternatives with confidence scores and unified diff patches.
 * 
 * Key responsibilities:
 * - Read actual file contents from repository
 * - Generate multiple fix alternatives using AI
 * - Create unified diff format patches
 * - Provide detailed explanations for each change
 * - Handle different file types (source, tests, configs)
 * - Ensure fixes are contextually aware of dependencies
 * - Generate test fixes if needed
 * - Provide rollback information
 * 
 * @module pipeline/phases/fix-generation
 */

import {
  PipelinePhase,
  PipelineContext,
  FixGenerationOutput,
  GraphTraversalOutput,
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
import { getWatsonxClient } from '../../ai/watsonx-client';
import { readRepoFile, readRepoFiles, FileContent } from '../../github/repo-manager';
import * as path from 'path';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input data for the Fix Generation phase
 */
export interface FixGenerationInput {
  /** Prioritized files to modify from graph traversal */
  readonly prioritizedFiles: string[];
  
  /** All impacted files with analysis */
  readonly impactedFiles: string[];
  
  /** File impact details */
  readonly fileImpacts: any[];
  
  /** Dependencies information */
  readonly dependencies: any[];
  
  /** Test files to update */
  readonly testFiles: string[];
  
  /** Root cause from AI reasoning */
  readonly rootCause: any;
  
  /** Repository path */
  readonly repoPath: string;
  
  /** Repository metadata */
  readonly repoMetadata: any;
}

// ============================================================================
// Fix Generation Types
// ============================================================================

/**
 * Fix alternative with confidence score
 */
export interface FixAlternative {
  /** Alternative identifier */
  readonly id: string;
  
  /** File path */
  readonly file: string;
  
  /** Original file content */
  readonly originalContent: string;
  
  /** Fixed file content */
  readonly fixedContent: string;
  
  /** Unified diff patch */
  readonly diff: string;
  
  /** Explanation of changes */
  readonly explanation: string;
  
  /** Confidence score (0-1) */
  readonly confidence: number;
  
  /** Change type */
  readonly changeType: 'bug_fix' | 'refactor' | 'optimization' | 'test_update';
  
  /** Lines changed */
  readonly linesChanged: number;
  
  /** Risk level */
  readonly riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Rollback information for a fix
 */
export interface RollbackInfo {
  /** File path */
  readonly file: string;
  
  /** Original content for rollback */
  readonly originalContent: string;
  
  /** Backup timestamp */
  readonly timestamp: number;
  
  /** Checksum for verification */
  readonly checksum: string;
}

/**
 * Fix context for AI generation
 */
export interface FixContext {
  /** File to fix */
  readonly file: string;
  
  /** File content */
  readonly content: string;
  
  /** File type */
  readonly fileType: string;
  
  /** Related files content */
  readonly relatedFiles: Map<string, string>;
  
  /** Dependencies */
  readonly dependencies: string[];
  
  /** Error information */
  readonly errorInfo: string;
  
  /** Impact analysis */
  readonly impact: any;
}

/**
 * Enhanced Fix Generation Output
 */
export interface EnhancedFixGenerationOutput extends FixGenerationOutput {
  /** All generated fixes */
  readonly fixes: GeneratedFix[];
  
  /** Fix alternatives for each file */
  readonly fixAlternatives: FixAlternative[];
  
  /** Generated tests */
  readonly tests: GeneratedTest[];
  
  /** Overall explanation */
  readonly explanation: string;
  
  /** Rollback information */
  readonly rollbackInfo: RollbackInfo[];
  
  /** Files successfully processed */
  readonly processedFiles: string[];
  
  /** Files that failed processing */
  readonly failedFiles: string[];
  
  /** Overall confidence score */
  readonly overallConfidence: number;
  
  /** Total lines changed */
  readonly totalLinesChanged: number;
  
  /** Estimated fix time */
  readonly estimatedFixTime: number;
}

// ============================================================================
// Fix Generation Phase Implementation
// ============================================================================

/**
 * Fix Generation Phase
 * 
 * Generates code fixes using IBM watsonx AI with multiple alternatives,
 * confidence scores, and comprehensive explanations.
 * 
 * @example
 * ```typescript
 * const phase = new FixGenerationPhase();
 * const result = await phase.execute(context);
 * 
 * if (result.success) {
 *   console.log('Fixes generated:', result.data.fixes.length);
 *   console.log('Confidence:', result.data.overallConfidence);
 *   console.log('Alternatives:', result.data.fixAlternatives.length);
 * }
 * ```
 */
export class FixGenerationPhase extends BasePhase<FixGenerationInput, EnhancedFixGenerationOutput> {
  private aiClient = getWatsonxClient();
  private apiCalls: number = 0;
  private tokensUsed: number = 0;
  private memoryUsed: number = 0;
  
  /**
   * Create a new Fix Generation phase instance
   * 
   * @param config - Optional phase configuration overrides
   */
  constructor(config?: Partial<PhaseConfig>) {
    super(
      PipelinePhase.FIX_GENERATION,
      createPhaseConfig({
        name: 'fix-generation',
        version: '1.0.0',
        timeout: 180000, // 3 minutes for AI generation
        cacheEnabled: true,
        cacheTTL: 1800, // 30 minutes
        maxRetries: 3,
        retryDelay: 2000,
        optional: false,
        ...config,
      })
    );
  }
  
  /**
   * Extract input from pipeline context
   * 
   * @param context - Pipeline context
   * @returns Input data for this phase
   */
  protected extractInput(context: PipelineContext): FixGenerationInput {
    const graphTraversal = context.phaseOutputs.graphTraversal as any;
    const aiReasoning = context.phaseOutputs.aiReasoning;
    const inputAnalysis = context.phaseOutputs.inputAnalysis;
    
    if (!graphTraversal) {
      throw new Error('Graph Traversal output not found in context');
    }
    
    if (!aiReasoning) {
      throw new Error('AI Reasoning output not found in context');
    }
    
    if (!inputAnalysis) {
      throw new Error('Input Analysis output not found in context');
    }
    
    return {
      prioritizedFiles: graphTraversal.prioritizedFiles || [],
      impactedFiles: graphTraversal.impactedFiles || [],
      fileImpacts: graphTraversal.fileImpacts || [],
      dependencies: graphTraversal.dependencies || [],
      testFiles: graphTraversal.testFiles || [],
      rootCause: aiReasoning.rootCause,
      repoPath: context.input.repoPath,
      repoMetadata: inputAnalysis.repoMetadata,
    };
  }
  
  /**
   * Validate input data
   * 
   * @param input - Input to validate
   * @returns Validation result
   */
  public async validate(input: FixGenerationInput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate prioritized files
    if (!input.prioritizedFiles || input.prioritizedFiles.length === 0) {
      errors.push(this.createValidationError(
        'prioritizedFiles',
        ValidationType.REQUIRED_FIELD,
        'No files prioritized for fix generation'
      ));
    }
    
    // Validate repository path
    if (!input.repoPath) {
      errors.push(this.createValidationError(
        'repoPath',
        ValidationType.REQUIRED_FIELD,
        'Repository path is required'
      ));
    }
    
    // Validate root cause
    if (!input.rootCause) {
      errors.push(this.createValidationError(
        'rootCause',
        ValidationType.REQUIRED_FIELD,
        'Root cause analysis is required'
      ));
    }
    
    // Warn if too many files
    if (input.prioritizedFiles.length > 10) {
      warnings.push({
        field: 'prioritizedFiles',
        message: `Large number of files (${input.prioritizedFiles.length}) may increase processing time`,
      });
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Execute the fix generation phase
   * 
   * @param input - Phase input
   * @param context - Pipeline context
   * @returns Phase output
   */
  protected async executePhase(
    input: FixGenerationInput,
    context: PipelineContext
  ): Promise<EnhancedFixGenerationOutput> {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    
    try {
      // Step 1: Read file contents from repository
      console.log(`Reading ${input.prioritizedFiles.length} files from repository...`);
      const fileContents = await this.readFilesWithContext(input);
      
      // Step 2: Generate fixes for each file
      console.log('Generating fixes using AI...');
      const fixAlternatives: FixAlternative[] = [];
      const processedFiles: string[] = [];
      const failedFiles: string[] = [];
      
      for (const fileContext of fileContents) {
        try {
          const alternatives = await this.generateFixAlternatives(fileContext, input);
          fixAlternatives.push(...alternatives);
          processedFiles.push(fileContext.file);
        } catch (error) {
          console.error(`Failed to generate fix for ${fileContext.file}:`, error);
          failedFiles.push(fileContext.file);
        }
      }
      
      // Step 3: Select best fixes
      const fixes = this.selectBestFixes(fixAlternatives);
      
      // Step 4: Generate test updates
      console.log('Generating test updates...');
      const tests = await this.generateTestUpdates(input, fixes);
      
      // Step 5: Create rollback information
      const rollbackInfo = this.createRollbackInfo(fileContents);
      
      // Step 6: Generate overall explanation
      const explanation = this.generateOverallExplanation(fixes, input);
      
      // Step 7: Calculate metrics
      const overallConfidence = this.calculateOverallConfidence(fixes);
      const totalLinesChanged = this.calculateTotalLinesChanged(fixAlternatives);
      const estimatedFixTime = this.estimateFixTime(fixes);
      
      // Track resource usage
      this.memoryUsed = process.memoryUsage().heapUsed - startMemory;
      
      return {
        fixes,
        fixAlternatives,
        tests,
        explanation,
        rollbackInfo,
        processedFiles,
        failedFiles,
        overallConfidence,
        totalLinesChanged,
        estimatedFixTime,
      };
    } catch (error) {
      throw new Error(`Fix generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate output data
   * 
   * @param output - Output to validate
   * @returns Validation result
   */
  public async validateOutput(output: EnhancedFixGenerationOutput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate fixes generated
    if (!output.fixes || output.fixes.length === 0) {
      errors.push({
        field: 'fixes',
        type: ValidationType.REQUIRED_FIELD,
        message: 'No fixes were generated',
      });
    }
    
    // Validate confidence scores
    for (const fix of output.fixes) {
      if (fix.confidence < 0 || fix.confidence > 1) {
        errors.push({
          field: 'fixes.confidence',
          type: ValidationType.OUT_OF_RANGE,
          message: `Invalid confidence score for ${fix.file}: ${fix.confidence}`,
          value: fix.confidence,
        });
      }
    }
    
    // Warn about low confidence
    if (output.overallConfidence < 0.6) {
      warnings.push({
        field: 'overallConfidence',
        message: `Low overall confidence (${output.overallConfidence.toFixed(2)}), fixes may need review`,
      });
    }
    
    // Warn about failed files
    if (output.failedFiles.length > 0) {
      warnings.push({
        field: 'failedFiles',
        message: `Failed to generate fixes for ${output.failedFiles.length} files: ${output.failedFiles.join(', ')}`,
      });
    }
    
    // Warn about large changes
    if (output.totalLinesChanged > 500) {
      warnings.push({
        field: 'totalLinesChanged',
        message: `Large number of lines changed (${output.totalLinesChanged}), review carefully`,
      });
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Handle errors with AI-specific retry logic
   */
  public async handleError(error: Error, context: PipelineContext): Promise<ErrorHandlingStrategy> {
    // Check for AI-specific errors
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      // Retry with longer delay for rate limits
      return ErrorHandlingStrategy.RETRY;
    }
    
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      // Retry on timeout
      return ErrorHandlingStrategy.RETRY;
    }
    
    if (error.message.includes('API key') || error.message.includes('authentication')) {
      // Fail immediately on auth errors
      return ErrorHandlingStrategy.FAIL;
    }
    
    // Use default error handling for other cases
    return super.handleError(error, context);
  }
  
  /**
   * Get resource usage for this phase
   */
  protected getResourceUsage() {
    return {
      cpuTime: 0,
      memoryUsed: this.memoryUsed,
      apiCalls: this.apiCalls,
      tokensUsed: this.tokensUsed,
    };
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Read files with context (related files, dependencies)
   */
  private async readFilesWithContext(input: FixGenerationInput): Promise<FixContext[]> {
    const contexts: FixContext[] = [];
    
    // Limit to top priority files to avoid overwhelming AI
    const filesToProcess = input.prioritizedFiles.slice(0, 10);
    
    for (const filePath of filesToProcess) {
      try {
        const fileContent = await readRepoFile(input.repoPath, filePath);
        
        if (!fileContent) {
          console.warn(`Could not read file: ${filePath}`);
          continue;
        }
        
        // Find related files (dependencies)
        const relatedFilePaths = this.findRelatedFiles(filePath, input);
        const relatedFiles = new Map<string, string>();
        
        // Read related files (limit to 3 most relevant)
        for (const relatedPath of relatedFilePaths.slice(0, 3)) {
          const relatedContent = await readRepoFile(input.repoPath, relatedPath);
          if (relatedContent) {
            relatedFiles.set(relatedPath, relatedContent.content);
          }
        }
        
        // Find impact analysis for this file
        const impact = input.fileImpacts.find((f: any) => f.path === filePath);
        
        contexts.push({
          file: filePath,
          content: fileContent.content,
          fileType: this.detectFileType(filePath),
          relatedFiles,
          dependencies: this.extractDependencies(filePath, input),
          errorInfo: this.formatErrorInfo(input.rootCause),
          impact,
        });
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
      }
    }
    
    return contexts;
  }
  
  /**
   * Generate fix alternatives for a file using AI
   */
  private async generateFixAlternatives(
    context: FixContext,
    input: FixGenerationInput
  ): Promise<FixAlternative[]> {
    const alternatives: FixAlternative[] = [];
    
    // Generate 2 alternatives: conservative and aggressive
    const strategies = [
      { name: 'conservative', temperature: 0.3, description: 'Minimal changes, high safety' },
      { name: 'optimal', temperature: 0.5, description: 'Balanced approach' },
    ];
    
    for (const strategy of strategies) {
      try {
        const prompt = this.buildFixPrompt(context, input, strategy.description);
        
        this.apiCalls++;
        const response = await this.aiClient.generate({
          prompt,
          maxTokens: 2048,
          temperature: strategy.temperature,
        });
        
        this.tokensUsed += 2048; // Approximate
        
        const fixedContent = this.extractFixedContent(response, context.content);
        const diff = this.generateUnifiedDiff(context.content, fixedContent, context.file);
        const explanation = this.extractExplanation(response);
        const confidence = this.calculateConfidence(context, fixedContent, strategy.name);
        const linesChanged = this.countLinesChanged(diff);
        const riskLevel = this.assessRiskLevel(linesChanged, context.fileType);
        
        alternatives.push({
          id: `${context.file}-${strategy.name}`,
          file: context.file,
          originalContent: context.content,
          fixedContent,
          diff,
          explanation,
          confidence,
          changeType: this.determineChangeType(explanation),
          linesChanged,
          riskLevel,
        });
      } catch (error) {
        console.error(`Failed to generate ${strategy.name} fix for ${context.file}:`, error);
      }
    }
    
    return alternatives;
  }
  
  /**
   * Build AI prompt for fix generation
   */
  private buildFixPrompt(context: FixContext, input: FixGenerationInput, strategy: string): string {
    const relatedFilesContext = Array.from(context.relatedFiles.entries())
      .map(([path, content]) => `\n### Related File: ${path}\n\`\`\`\n${content.slice(0, 500)}\n\`\`\``)
      .join('\n');
    
    return `You are an expert software engineer fixing a bug in a ${input.repoMetadata.language} codebase.

**Error Information:**
${context.errorInfo}

**File to Fix:** ${context.file}
**File Type:** ${context.fileType}
**Strategy:** ${strategy}
**Impact:** ${context.impact?.reason || 'Unknown'}

**Current Code:**
\`\`\`${context.fileType}
${context.content}
\`\`\`

**Related Files Context:**${relatedFilesContext}

**Dependencies:**
${context.dependencies.join(', ')}

**Instructions:**
1. Analyze the error and identify the root cause in the code
2. Generate a fix that addresses the issue
3. Ensure the fix is compatible with related files and dependencies
4. Maintain code style and patterns
5. Add comments explaining the fix if needed

**Output Format:**
EXPLANATION:
[Explain what was wrong and how you fixed it]

FIXED_CODE:
\`\`\`${context.fileType}
[Complete fixed file content]
\`\`\`

Generate the fix now:`;
  }
  
  /**
   * Extract fixed content from AI response
   */
  private extractFixedContent(response: string, originalContent: string): string {
    // Try to extract code from FIXED_CODE section
    const fixedCodeMatch = response.match(/FIXED_CODE:\s*```[\w]*\s*([\s\S]*?)```/);
    
    if (fixedCodeMatch && fixedCodeMatch[1]) {
      return fixedCodeMatch[1].trim();
    }
    
    // Try to extract any code block
    const codeBlockMatch = response.match(/```[\w]*\s*([\s\S]*?)```/);
    
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }
    
    // If no code block found, return original (AI might have said no changes needed)
    return originalContent;
  }
  
  /**
   * Extract explanation from AI response
   */
  private extractExplanation(response: string): string {
    const explanationMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?:FIXED_CODE:|$)/);
    
    if (explanationMatch && explanationMatch[1]) {
      return explanationMatch[1].trim();
    }
    
    // Return first paragraph as explanation
    const firstParagraph = response.split('\n\n')[0];
    return firstParagraph.trim();
  }
  
  /**
   * Generate unified diff format
   */
  private generateUnifiedDiff(original: string, fixed: string, filePath: string): string {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');
    
    // Simple diff generation (in production, use a proper diff library)
    const diff: string[] = [];
    diff.push(`--- a/${filePath}`);
    diff.push(`+++ b/${filePath}`);
    diff.push(`@@ -1,${originalLines.length} +1,${fixedLines.length} @@`);
    
    const maxLines = Math.max(originalLines.length, fixedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i];
      const fixedLine = fixedLines[i];
      
      if (origLine === fixedLine) {
        diff.push(` ${origLine || ''}`);
      } else {
        if (origLine !== undefined) {
          diff.push(`-${origLine}`);
        }
        if (fixedLine !== undefined) {
          diff.push(`+${fixedLine}`);
        }
      }
    }
    
    return diff.join('\n');
  }
  
  /**
   * Calculate confidence score for a fix
   */
  private calculateConfidence(context: FixContext, fixedContent: string, strategy: string): number {
    let confidence = 0.7; // Base confidence
    
    // Increase confidence if fix is similar to original (conservative)
    const similarity = this.calculateSimilarity(context.content, fixedContent);
    if (strategy === 'conservative' && similarity > 0.8) {
      confidence += 0.15;
    }
    
    // Increase confidence if file has high impact score
    if (context.impact?.impactScore > 0.8) {
      confidence += 0.1;
    }
    
    // Decrease confidence for complex file types
    if (context.fileType === 'config' || context.fileType === 'unknown') {
      confidence -= 0.1;
    }
    
    return Math.min(0.95, Math.max(0.3, confidence));
  }
  
  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const lines1 = str1.split('\n');
    const lines2 = str2.split('\n');
    
    let matchingLines = 0;
    const maxLines = Math.max(lines1.length, lines2.length);
    
    for (let i = 0; i < Math.min(lines1.length, lines2.length); i++) {
      if (lines1[i] === lines2[i]) {
        matchingLines++;
      }
    }
    
    return matchingLines / maxLines;
  }
  
  /**
   * Select best fix for each file
   */
  private selectBestFixes(alternatives: FixAlternative[]): GeneratedFix[] {
    const fileMap = new Map<string, FixAlternative>();
    
    // Group by file and select highest confidence
    for (const alt of alternatives) {
      const existing = fileMap.get(alt.file);
      if (!existing || alt.confidence > existing.confidence) {
        fileMap.set(alt.file, alt);
      }
    }
    
    // Convert to GeneratedFix format
    return Array.from(fileMap.values()).map(alt => ({
      file: alt.file,
      changes: alt.diff,
      explanation: alt.explanation,
      confidence: alt.confidence,
    }));
  }
  
  /**
   * Generate test updates
   */
  private async generateTestUpdates(
    input: FixGenerationInput,
    fixes: GeneratedFix[]
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];
    
    // Generate tests for modified files
    for (const fix of fixes.slice(0, 3)) { // Limit to 3 test files
      try {
        const testPrompt = this.buildTestPrompt(fix, input);
        
        this.apiCalls++;
        const response = await this.aiClient.generate({
          prompt: testPrompt,
          maxTokens: 1024,
          temperature: 0.4,
        });
        
        const testContent = this.extractFixedContent(response, '');
        const testPath = this.generateTestPath(fix.file);
        
        tests.push({
          file: testPath,
          content: testContent,
          framework: this.detectTestFramework(input.repoMetadata),
          coverage: [fix.file],
        });
      } catch (error) {
        console.error(`Failed to generate test for ${fix.file}:`, error);
      }
    }
    
    return tests;
  }
  
  /**
   * Build test generation prompt
   */
  private buildTestPrompt(fix: GeneratedFix, input: FixGenerationInput): string {
    return `Generate a test file for the following fix in a ${input.repoMetadata.language} project.

**Fixed File:** ${fix.file}
**Fix Explanation:** ${fix.explanation}

**Changes:**
\`\`\`
${fix.changes}
\`\`\`

Generate a comprehensive test that verifies the fix works correctly. Include:
1. Test for the bug that was fixed
2. Edge cases
3. Integration with related functionality

Output the complete test file:`;
  }
  
  /**
   * Create rollback information
   */
  private createRollbackInfo(contexts: FixContext[]): RollbackInfo[] {
    return contexts.map(ctx => ({
      file: ctx.file,
      originalContent: ctx.content,
      timestamp: Date.now(),
      checksum: this.calculateChecksum(ctx.content),
    }));
  }
  
  /**
   * Calculate checksum for content
   */
  private calculateChecksum(content: string): string {
    // Simple checksum (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  /**
   * Generate overall explanation
   */
  private generateOverallExplanation(fixes: GeneratedFix[], input: FixGenerationInput): string {
    const fileList = fixes.map(f => `- ${f.file}`).join('\n');
    
    return `Fixed ${fixes.length} file(s) to resolve the issue: ${input.rootCause.cause}

**Files Modified:**
${fileList}

**Root Cause:** ${input.rootCause.category}
**Confidence:** ${input.rootCause.confidence.toFixed(2)}

Each fix includes detailed explanations and has been generated with dependency awareness.`;
  }
  
  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(fixes: GeneratedFix[]): number {
    if (fixes.length === 0) return 0;
    
    const avgConfidence = fixes.reduce((sum, f) => sum + f.confidence, 0) / fixes.length;
    return Math.round(avgConfidence * 100) / 100;
  }
  
  /**
   * Calculate total lines changed
   */
  private calculateTotalLinesChanged(alternatives: FixAlternative[]): number {
    return alternatives.reduce((sum, alt) => sum + alt.linesChanged, 0);
  }
  
  /**
   * Count lines changed in diff
   */
  private countLinesChanged(diff: string): number {
    const lines = diff.split('\n');
    return lines.filter(line => line.startsWith('+') || line.startsWith('-')).length;
  }
  
  /**
   * Estimate fix time in minutes
   */
  private estimateFixTime(fixes: GeneratedFix[]): number {
    // Estimate 5 minutes per file + 10 minutes for testing
    return fixes.length * 5 + 10;
  }
  
  /**
   * Find related files for context
   */
  private findRelatedFiles(filePath: string, input: FixGenerationInput): string[] {
    const related: string[] = [];
    
    // Find files with dependencies to this file
    for (const dep of input.dependencies) {
      if (dep.name && filePath.includes(dep.name)) {
        // Find other files in the same directory
        const dir = path.dirname(filePath);
        const relatedInDir = input.impactedFiles.filter(f => 
          f.startsWith(dir) && f !== filePath
        );
        related.push(...relatedInDir);
      }
    }
    
    return Array.from(new Set(related));
  }
  
  /**
   * Extract dependencies for a file
   */
  private extractDependencies(filePath: string, input: FixGenerationInput): string[] {
    return input.dependencies
      .filter((dep: any) => dep.type === 'direct')
      .map((dep: any) => dep.name)
      .slice(0, 5);
  }
  
  /**
   * Format error information
   */
  private formatErrorInfo(rootCause: any): string {
    return `${rootCause.category}: ${rootCause.cause}
Confidence: ${rootCause.confidence.toFixed(2)}
Evidence: ${rootCause.evidence.join(', ')}`;
  }
  
  /**
   * Detect file type
   */
  private detectFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const typeMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.json': 'config',
      '.yaml': 'config',
      '.yml': 'config',
    };
    
    return typeMap[ext] || 'unknown';
  }
  
  /**
   * Determine change type from explanation
   */
  private determineChangeType(explanation: string): 'bug_fix' | 'refactor' | 'optimization' | 'test_update' {
    const lower = explanation.toLowerCase();
    
    if (lower.includes('test')) return 'test_update';
    if (lower.includes('refactor') || lower.includes('restructure')) return 'refactor';
    if (lower.includes('optimize') || lower.includes('performance')) return 'optimization';
    
    return 'bug_fix';
  }
  
  /**
   * Assess risk level
   */
  private assessRiskLevel(linesChanged: number, fileType: string): 'low' | 'medium' | 'high' {
    if (fileType === 'config') return 'high';
    if (linesChanged > 100) return 'high';
    if (linesChanged > 30) return 'medium';
    return 'low';
  }
  
  /**
   * Generate test file path
   */
  private generateTestPath(filePath: string): string {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    
    return path.join(dir, `${basename}.test${ext}`);
  }
  
  /**
   * Detect test framework
   */
  private detectTestFramework(repoMetadata: any): string {
    const language = repoMetadata.language?.toLowerCase() || '';
    
    if (language.includes('javascript') || language.includes('typescript')) {
      return 'jest';
    }
    if (language.includes('python')) {
      return 'pytest';
    }
    if (language.includes('java')) {
      return 'junit';
    }
    
    return 'unknown';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Fix Generation phase instance
 * 
 * @param config - Optional phase configuration
 * @returns Fix Generation phase instance
 */
export function createFixGenerationPhase(config?: Partial<PhaseConfig>): FixGenerationPhase {
  return new FixGenerationPhase(config);
}

// Made with Bob