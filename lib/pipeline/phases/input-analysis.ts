/**
 * Phase 1: Input Analysis
 * 
 * This phase is responsible for parsing and analyzing the input data to extract
 * structured information that will be used by subsequent phases in the pipeline.
 * 
 * Key responsibilities:
 * - Parse stack traces and error messages
 * - Extract file paths, line numbers, and error context
 * - Classify issue type and severity
 * - Determine complexity and scope
 * - Identify relevant files and dependencies
 * - Prepare structured data for AI reasoning
 * 
 * @module pipeline/phases/input-analysis
 */

import {
  PipelinePhase,
  PipelineContext,
  InputAnalysisOutput,
  ParsedStackTrace,
  StackFrame,
  ErrorContext,
  RepoMetadata,
  ErrorSeverity,
  ValidationResult,
  ValidationType,
} from '../types';
import {
  BasePhase,
  PhaseConfig,
  createPhaseConfig,
} from '../core/phase-interface';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input data for the Input Analysis phase
 */
export interface InputAnalysisInput {
  /** Raw stack trace or error information */
  readonly stackTrace: string;
  
  /** Repository URL */
  readonly repoUrl: string;
  
  /** Local repository path */
  readonly repoPath: string;
  
  /** Optional metadata */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Issue Classification
// ============================================================================

/**
 * Types of issues that can be classified
 */
export enum IssueType {
  BUG = 'BUG',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  PERFORMANCE = 'PERFORMANCE',
  SECURITY = 'SECURITY',
  DOCUMENTATION = 'DOCUMENTATION',
  REFACTORING = 'REFACTORING',
  DEPENDENCY = 'DEPENDENCY',
  CONFIGURATION = 'CONFIGURATION',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Complexity levels for issues
 */
export enum ComplexityLevel {
  TRIVIAL = 'TRIVIAL',       // Simple one-line fixes
  LOW = 'LOW',               // Single file, straightforward
  MEDIUM = 'MEDIUM',         // Multiple files, moderate logic
  HIGH = 'HIGH',             // Complex logic, multiple components
  CRITICAL = 'CRITICAL',     // System-wide impact, architectural changes
}

/**
 * Issue classification result
 */
export interface IssueClassification {
  readonly type: IssueType;
  readonly complexity: ComplexityLevel;
  readonly confidence: number;
  readonly reasoning: string;
  readonly estimatedScope: {
    readonly filesAffected: number;
    readonly linesOfCode: number;
    readonly testingRequired: boolean;
  };
}

// ============================================================================
// Input Analysis Phase Implementation
// ============================================================================

/**
 * Input Analysis Phase
 * 
 * Parses and analyzes input data to extract structured information
 * for downstream pipeline phases.
 * 
 * @example
 * ```typescript
 * const phase = new InputAnalysisPhase();
 * const result = await phase.execute(context);
 * 
 * if (result.success) {
 *   console.log('Parsed stack trace:', result.data.parsedStackTrace);
 *   console.log('Relevant files:', result.data.relevantFiles);
 * }
 * ```
 */
export class InputAnalysisPhase extends BasePhase<InputAnalysisInput, InputAnalysisOutput> {
  private apiCallCount: number = 0;
  private memoryUsed: number = 0;
  
  /**
   * Create a new Input Analysis phase instance
   * 
   * @param config - Optional phase configuration overrides
   */
  constructor(config?: Partial<PhaseConfig>) {
    super(
      PipelinePhase.INPUT_ANALYSIS,
      createPhaseConfig({
        name: 'input-analysis',
        version: '1.0.0',
        timeout: 30000, // 30 seconds
        cacheEnabled: true,
        cacheTTL: 3600, // 1 hour
        maxRetries: 2,
        retryDelay: 1000,
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
  protected extractInput(context: PipelineContext): InputAnalysisInput {
    return {
      stackTrace: context.input.stackTrace,
      repoUrl: context.input.repoUrl,
      repoPath: context.input.repoPath,
      metadata: context.input.metadata,
    };
  }
  
  /**
   * Validate input data
   * 
   * @param input - Input to validate
   * @returns Validation result
   */
  public async validate(input: InputAnalysisInput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate stack trace
    const stackTraceError = this.validateRequired('stackTrace', input.stackTrace);
    if (stackTraceError) {
      errors.push(stackTraceError);
    } else if (input.stackTrace.length < 10) {
      warnings.push({
        field: 'stackTrace',
        message: 'Stack trace is very short, may not contain enough information',
      });
    }
    
    // Validate repository URL
    const repoUrlError = this.validateRequired('repoUrl', input.repoUrl);
    if (repoUrlError) {
      errors.push(repoUrlError);
    } else {
      const urlFormatError = this.validateFormat(
        'repoUrl',
        input.repoUrl,
        /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+\/.+/
      );
      if (urlFormatError) {
        errors.push(urlFormatError);
      }
    }
    
    // Validate repository path
    const repoPathError = this.validateRequired('repoPath', input.repoPath);
    if (repoPathError) {
      errors.push(repoPathError);
    } else {
      // Check if path exists
      try {
        await fs.access(input.repoPath);
      } catch {
        errors.push({
          field: 'repoPath',
          type: ValidationType.INVALID_FORMAT,
          message: 'Repository path does not exist or is not accessible',
          value: input.repoPath,
        });
      }
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Execute the input analysis phase
   * 
   * @param input - Phase input
   * @param context - Pipeline context
   * @returns Phase output
   */
  protected async executePhase(
    input: InputAnalysisInput,
    context: PipelineContext
  ): Promise<InputAnalysisOutput> {
    const startMemory = process.memoryUsage().heapUsed;
    const warnings: string[] = [];
    
    try {
      // Parse the stack trace
      const parsedStackTrace = await this.parseStackTrace(input.stackTrace);
      
      // Extract error context
      const errorContext = this.extractErrorContext(parsedStackTrace, input.metadata);
      
      // Analyze repository
      const repoMetadata = await this.analyzeRepository(input.repoPath, input.repoUrl);
      
      // Identify relevant files
      const relevantFiles = await this.identifyRelevantFiles(
        parsedStackTrace,
        input.repoPath
      );
      
      // Add warning if no relevant files found
      if (relevantFiles.length === 0) {
        warnings.push('No relevant files identified from stack trace');
      }
      
      // Classify the issue
      const classification = this.classifyIssue(parsedStackTrace, errorContext);
      
      // Track resource usage
      this.memoryUsed = process.memoryUsage().heapUsed - startMemory;
      
      return {
        parsedStackTrace,
        errorContext: {
          ...errorContext,
          metadata: {
            ...errorContext.metadata,
            classification,
          },
        },
        repoMetadata,
        relevantFiles,
      };
    } catch (error) {
      throw new Error(`Input analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate output data
   * 
   * @param output - Output to validate
   * @returns Validation result
   */
  public async validateOutput(output: InputAnalysisOutput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate parsed stack trace
    if (!output.parsedStackTrace.errorType) {
      errors.push({
        field: 'parsedStackTrace.errorType',
        type: ValidationType.REQUIRED_FIELD,
        message: 'Error type is required',
      });
    }
    
    if (!output.parsedStackTrace.errorMessage) {
      warnings.push({
        field: 'parsedStackTrace.errorMessage',
        message: 'Error message is empty',
      });
    }
    
    if (output.parsedStackTrace.frames.length === 0) {
      warnings.push({
        field: 'parsedStackTrace.frames',
        message: 'No stack frames found',
      });
    }
    
    // Validate relevant files
    if (output.relevantFiles.length === 0) {
      warnings.push({
        field: 'relevantFiles',
        message: 'No relevant files identified',
      });
    }
    
    // Validate repository metadata
    if (!output.repoMetadata.language) {
      warnings.push({
        field: 'repoMetadata.language',
        message: 'Could not detect repository language',
      });
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Get resource usage for this phase
   */
  protected getResourceUsage() {
    return {
      cpuTime: 0, // Would need process.cpuUsage() tracking
      memoryUsed: this.memoryUsed,
      apiCalls: this.apiCallCount,
    };
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Parse stack trace into structured format
   */
  private async parseStackTrace(stackTrace: string): Promise<ParsedStackTrace> {
    const lines = stackTrace.split('\n').map(line => line.trim()).filter(Boolean);
    
    // Detect error type and message (usually first line)
    const firstLine = lines[0] || '';
    const errorMatch = firstLine.match(/^(\w+(?:Error|Exception)?):?\s*(.*)$/);
    
    const errorType = errorMatch?.[1] || 'Error';
    const errorMessage = errorMatch?.[2] || firstLine;
    
    // Parse stack frames
    const frames: StackFrame[] = [];
    const language = this.detectLanguage(stackTrace);
    
    for (const line of lines.slice(1)) {
      const frame = this.parseStackFrame(line, language);
      if (frame) {
        frames.push(frame);
      }
    }
    
    return {
      errorType,
      errorMessage,
      frames,
      language,
    };
  }
  
  /**
   * Detect programming language from stack trace
   */
  private detectLanguage(stackTrace: string): string {
    const patterns = [
      { pattern: /\.js:\d+:\d+/, language: 'javascript' },
      { pattern: /\.ts:\d+:\d+/, language: 'typescript' },
      { pattern: /File\s+"[^"]+\.py",\s+line\s+\d+/i, language: 'python' },
      { pattern: /\.py[",]\s+line\s+\d+/i, language: 'python' },
      { pattern: /\.java:\d+/, language: 'java' },
      { pattern: /\.rb:\d+/, language: 'ruby' },
      { pattern: /\.go:\d+/, language: 'go' },
      { pattern: /\.cs:\d+/, language: 'csharp' },
      { pattern: /\.cpp:\d+/, language: 'cpp' },
    ];
    
    for (const { pattern, language } of patterns) {
      if (pattern.test(stackTrace)) {
        return language;
      }
    }
    
    return 'unknown';
  }
  
  /**
   * Parse a single stack frame
   */
  private parseStackFrame(line: string, language: string): StackFrame | null {
    // JavaScript/TypeScript pattern: at functionName (file:line:column)
    const jsPattern = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/;
    const jsMatch = line.match(jsPattern);
    
    if (jsMatch) {
      return {
        file: jsMatch[2],
        line: parseInt(jsMatch[3], 10),
        column: parseInt(jsMatch[4], 10),
        function: jsMatch[1] || undefined,
      };
    }
    
    // Python pattern: File "file", line X, in function
    const pyPattern = /File\s+"(.+?)",\s+line\s+(\d+)(?:,\s+in\s+(.+))?/;
    const pyMatch = line.match(pyPattern);
    
    if (pyMatch) {
      return {
        file: pyMatch[1],
        line: parseInt(pyMatch[2], 10),
        function: pyMatch[3] || undefined,
      };
    }
    
    // Generic pattern: file:line
    const genericPattern = /([^:]+):(\d+)(?::(\d+))?/;
    const genericMatch = line.match(genericPattern);
    
    if (genericMatch) {
      return {
        file: genericMatch[1],
        line: parseInt(genericMatch[2], 10),
        column: genericMatch[3] ? parseInt(genericMatch[3], 10) : undefined,
      };
    }
    
    return null;
  }
  
  /**
   * Extract error context from parsed stack trace
   */
  private extractErrorContext(
    parsedStackTrace: ParsedStackTrace,
    metadata?: Record<string, unknown>
  ): ErrorContext {
    // Determine severity based on error type
    const severity = this.determineSeverity(parsedStackTrace.errorType);
    
    // Extract tags from error message and type
    const tags = this.extractTags(parsedStackTrace);
    
    return {
      environment: (metadata?.environment as string) || 'unknown',
      timestamp: Date.now(),
      severity,
      tags,
      metadata: metadata || {},
    };
  }
  
  /**
   * Determine error severity
   */
  private determineSeverity(errorType: string): ErrorSeverity {
    const criticalErrors = ['SecurityError', 'AuthenticationError', 'DatabaseError'];
    const highErrors = ['TypeError', 'ReferenceError', 'SyntaxError'];
    const mediumErrors = ['ValidationError', 'NotFoundError'];
    
    if (criticalErrors.some(e => errorType.includes(e))) {
      return ErrorSeverity.CRITICAL;
    }
    if (highErrors.some(e => errorType.includes(e))) {
      return ErrorSeverity.HIGH;
    }
    if (mediumErrors.some(e => errorType.includes(e))) {
      return ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.LOW;
  }
  
  /**
   * Extract tags from parsed stack trace
   */
  private extractTags(parsedStackTrace: ParsedStackTrace): string[] {
    const tags: string[] = [];
    
    // Add language tag
    tags.push(parsedStackTrace.language);
    
    // Add error type tag
    tags.push(parsedStackTrace.errorType.toLowerCase());
    
    // Extract component tags from file paths
    const components = new Set<string>();
    for (const frame of parsedStackTrace.frames) {
      const parts = frame.file.split(/[/\\]/);
      if (parts.length > 1) {
        components.add(parts[0]);
      }
    }
    tags.push(...Array.from(components));
    
    return tags;
  }
  
  /**
   * Analyze repository metadata
   */
  private async analyzeRepository(repoPath: string, repoUrl: string): Promise<RepoMetadata> {
    try {
      // Extract owner and name from URL
      const urlMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      const owner = urlMatch?.[1] || 'unknown';
      const name = urlMatch?.[2]?.replace(/\.git$/, '') || 'unknown';
      
      // Detect primary language
      const language = await this.detectRepositoryLanguage(repoPath);
      
      // Detect framework
      const framework = await this.detectFramework(repoPath);
      
      // Get repository size
      const size = await this.getDirectorySize(repoPath);
      
      // Get last commit (simplified - would use git in production)
      const lastCommit = new Date().toISOString();
      
      return {
        name,
        owner,
        branch: 'main', // Would detect from git in production
        language,
        framework,
        size,
        lastCommit,
      };
    } catch (error) {
      throw new Error(`Failed to analyze repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Detect primary programming language in repository
   */
  private async detectRepositoryLanguage(repoPath: string): Promise<string> {
    const languageExtensions: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.rb': 'ruby',
      '.go': 'go',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
    };
    
    const extensionCounts: Record<string, number> = {};
    
    try {
      const files = await this.getAllFiles(repoPath);
      
      for (const file of files) {
        const ext = path.extname(file);
        if (languageExtensions[ext]) {
          extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
        }
      }
      
      // Find most common extension
      let maxCount = 0;
      let primaryExt = '';
      
      for (const [ext, count] of Object.entries(extensionCounts)) {
        if (count > maxCount) {
          maxCount = count;
          primaryExt = ext;
        }
      }
      
      return languageExtensions[primaryExt] || 'unknown';
    } catch {
      return 'unknown';
    }
  }
  
  /**
   * Detect framework from package files
   */
  private async detectFramework(repoPath: string): Promise<string | undefined> {
    try {
      // Check for package.json (Node.js)
      const packageJsonPath = path.join(repoPath, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Check Next.js first (before React) since Next.js includes React
        if (deps.next) return 'Next.js';
        if (deps.react) return 'React';
        if (deps.vue) return 'Vue';
        if (deps.angular) return 'Angular';
        if (deps.express) return 'Express';
      } catch {
        // Not a Node.js project or no package.json
      }
      
      // Check for requirements.txt (Python)
      const requirementsPath = path.join(repoPath, 'requirements.txt');
      try {
        const requirements = await fs.readFile(requirementsPath, 'utf-8');
        if (requirements.includes('django')) return 'Django';
        if (requirements.includes('flask')) return 'Flask';
        if (requirements.includes('fastapi')) return 'FastAPI';
      } catch {
        // Not a Python project or no requirements.txt
      }
      
      return undefined;
    } catch {
      return undefined;
    }
  }
  
  /**
   * Get directory size in bytes
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    
    try {
      const files = await this.getAllFiles(dirPath);
      
      for (const file of files) {
        try {
          const stats = await fs.stat(file);
          size += stats.size;
        } catch {
          // Skip files that can't be accessed
        }
      }
    } catch {
      // Return 0 if directory can't be read
    }
    
    return size;
  }
  
  /**
   * Get all files in directory recursively
   */
  private async getAllFiles(dirPath: string, maxDepth: number = 5): Promise<string[]> {
    const files: string[] = [];
    
    const traverse = async (currentPath: string, depth: number) => {
      if (depth > maxDepth) return;
      
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          // Skip node_modules, .git, etc.
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          
          const fullPath = path.join(currentPath, entry.name);
          
          if (entry.isDirectory()) {
            await traverse(fullPath, depth + 1);
          } else {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip directories that can't be read
      }
    };
    
    await traverse(dirPath, 0);
    return files;
  }
  
  /**
   * Identify relevant files from stack trace
   */
  private async identifyRelevantFiles(
    parsedStackTrace: ParsedStackTrace,
    repoPath: string
  ): Promise<string[]> {
    const relevantFiles = new Set<string>();
    
    // Add files from stack frames
    for (const frame of parsedStackTrace.frames) {
      // Normalize file path - convert backslashes to forward slashes
      let filePath = frame.file.replace(/\\/g, '/');
      
      // Remove absolute paths and make relative to repo
      if (path.isAbsolute(frame.file)) {
        filePath = path.relative(repoPath, frame.file).replace(/\\/g, '/');
      }
      
      // Skip node_modules and external files
      if (!filePath.includes('node_modules') && !filePath.startsWith('..')) {
        relevantFiles.add(filePath);
      }
    }
    
    // Add related files (same directory, test files, etc.)
    const relatedFiles = await this.findRelatedFiles(
      Array.from(relevantFiles),
      repoPath
    );
    
    relatedFiles.forEach(file => relevantFiles.add(file));
    
    return Array.from(relevantFiles);
  }
  
  /**
   * Find files related to the given files
   */
  private async findRelatedFiles(
    files: string[],
    repoPath: string
  ): Promise<string[]> {
    const related: string[] = [];
    
    for (const file of files) {
      const dir = path.dirname(file);
      const basename = path.basename(file, path.extname(file));
      
      // Look for test files
      const testPatterns = [
        `${basename}.test${path.extname(file)}`,
        `${basename}.spec${path.extname(file)}`,
        path.join('__tests__', `${basename}${path.extname(file)}`),
      ];
      
      for (const pattern of testPatterns) {
        const testPath = path.join(dir, pattern);
        const fullPath = path.join(repoPath, testPath);
        
        try {
          await fs.access(fullPath);
          related.push(testPath);
        } catch {
          // File doesn't exist
        }
      }
    }
    
    return related;
  }
  
  /**
   * Classify the issue type and complexity
   */
  private classifyIssue(
    parsedStackTrace: ParsedStackTrace,
    errorContext: ErrorContext
  ): IssueClassification {
    // Determine issue type
    const type = this.determineIssueType(parsedStackTrace);
    
    // Determine complexity
    const complexity = this.determineComplexity(parsedStackTrace, errorContext);
    
    // Calculate confidence
    const confidence = this.calculateClassificationConfidence(parsedStackTrace);
    
    // Generate reasoning
    const reasoning = this.generateClassificationReasoning(type, complexity, parsedStackTrace);
    
    // Estimate scope
    const estimatedScope = {
      filesAffected: parsedStackTrace.frames.length,
      linesOfCode: parsedStackTrace.frames.length * 10, // Rough estimate
      testingRequired: errorContext.severity !== ErrorSeverity.LOW,
    };
    
    return {
      type,
      complexity,
      confidence,
      reasoning,
      estimatedScope,
    };
  }
  
  /**
   * Determine issue type from error information
   */
  private determineIssueType(parsedStackTrace: ParsedStackTrace): IssueType {
    const errorType = parsedStackTrace.errorType.toLowerCase();
    const errorMessage = parsedStackTrace.errorMessage.toLowerCase();
    
    if (errorType.includes('security') || errorMessage.includes('security')) {
      return IssueType.SECURITY;
    }
    
    if (errorType.includes('performance') || errorMessage.includes('timeout')) {
      return IssueType.PERFORMANCE;
    }
    
    if (errorType.includes('dependency') || errorMessage.includes('module')) {
      return IssueType.DEPENDENCY;
    }
    
    if (errorType.includes('config') || errorMessage.includes('configuration')) {
      return IssueType.CONFIGURATION;
    }
    
    // Default to bug for most errors
    return IssueType.BUG;
  }
  
  /**
   * Determine complexity level
   */
  private determineComplexity(
    parsedStackTrace: ParsedStackTrace,
    errorContext: ErrorContext
  ): ComplexityLevel {
    const frameCount = parsedStackTrace.frames.length;
    const severity = errorContext.severity;
    
    // Critical severity or many frames = high complexity
    if (severity === ErrorSeverity.CRITICAL || frameCount > 10) {
      return ComplexityLevel.CRITICAL;
    }
    
    if (severity === ErrorSeverity.HIGH || frameCount > 5) {
      return ComplexityLevel.HIGH;
    }
    
    if (frameCount > 2) {
      return ComplexityLevel.MEDIUM;
    }
    
    if (frameCount === 1) {
      return ComplexityLevel.LOW;
    }
    
    return ComplexityLevel.TRIVIAL;
  }
  
  /**
   * Calculate classification confidence
   */
  private calculateClassificationConfidence(parsedStackTrace: ParsedStackTrace): number {
    let confidence = 0.5; // Base confidence
    
    // More frames = higher confidence
    if (parsedStackTrace.frames.length > 0) {
      confidence += 0.2;
    }
    
    // Clear error message = higher confidence
    if (parsedStackTrace.errorMessage.length > 10) {
      confidence += 0.2;
    }
    
    // Known error type = higher confidence
    if (parsedStackTrace.errorType !== 'Error') {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Generate reasoning for classification
   */
  private generateClassificationReasoning(
    type: IssueType,
    complexity: ComplexityLevel,
    parsedStackTrace: ParsedStackTrace
  ): string {
    const parts = [
      `Classified as ${type} based on error type "${parsedStackTrace.errorType}"`,
      `Complexity level ${complexity} determined from ${parsedStackTrace.frames.length} stack frames`,
    ];
    
    if (parsedStackTrace.errorMessage) {
      parts.push(`Error message: "${parsedStackTrace.errorMessage}"`);
    }
    
    return parts.join('. ');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Input Analysis phase instance
 * 
 * @param config - Optional phase configuration
 * @returns Input Analysis phase instance
 */
export function createInputAnalysisPhase(config?: Partial<PhaseConfig>): InputAnalysisPhase {
  return new InputAnalysisPhase(config);
}

// Made with Bob