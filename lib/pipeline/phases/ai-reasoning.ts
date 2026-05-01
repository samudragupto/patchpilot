/**
 * Phase 2: AI Reasoning
 * 
 * This phase uses IBM watsonx AI to analyze the issue and generate reasoning about
 * potential root causes, fix strategies, and impacted files. It bridges the gap between
 * raw input analysis and graph traversal by providing AI-powered insights.
 * 
 * Key responsibilities:
 * - Analyze parsed stack traces and error context using AI
 * - Generate multiple hypotheses about root causes
 * - Evaluate and rank hypotheses by confidence
 * - Identify potential fix strategies
 * - Determine which files need detailed examination
 * - Create a reasoning chain explaining the AI's thought process
 * - Provide confidence scores for downstream phases
 * 
 * @module pipeline/phases/ai-reasoning
 */

import {
  PipelinePhase,
  PipelineContext,
  AIReasoningOutput,
  InputAnalysisOutput,
  RootCauseAnalysis,
  Hypothesis,
  ValidationResult,
  ValidationType,
  ErrorSeverity,
} from '../types';
import {
  BasePhase,
  PhaseConfig,
  createPhaseConfig,
  ErrorHandlingStrategy,
} from '../core/phase-interface';
import { getWatsonxClient } from '../../ai/watsonx-client';
import { getReasoningEngine } from '../../ai/reasoning-engine';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input data for the AI Reasoning phase
 */
export interface AIReasoningInput {
  /** Parsed stack trace from Phase 1 */
  readonly parsedStackTrace: InputAnalysisOutput['parsedStackTrace'];
  
  /** Error context from Phase 1 */
  readonly errorContext: InputAnalysisOutput['errorContext'];
  
  /** Repository metadata from Phase 1 */
  readonly repoMetadata: InputAnalysisOutput['repoMetadata'];
  
  /** Relevant files identified in Phase 1 */
  readonly relevantFiles: string[];
}

// ============================================================================
// AI Reasoning Types
// ============================================================================

/**
 * Hypothesis about potential root cause
 */
export interface AIHypothesis extends Hypothesis {
  /** Unique hypothesis identifier */
  readonly id: string;
  
  /** Hypothesis description */
  readonly description: string;
  
  /** Confidence score (0-1) */
  readonly confidence: number;
  
  /** Supporting evidence */
  readonly evidence: string[];
  
  /** Whether this hypothesis can be tested */
  readonly testable: boolean;
  
  /** Files that would need to be examined */
  readonly filesToExamine: string[];
  
  /** Potential fix strategy */
  readonly fixStrategy?: string;
  
  /** Risk level if this hypothesis is correct */
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Fix strategy recommendation
 */
export interface FixStrategy {
  /** Strategy identifier */
  readonly id: string;
  
  /** Strategy description */
  readonly description: string;
  
  /** Approach to implement the fix */
  readonly approach: string;
  
  /** Files that need modification */
  readonly affectedFiles: string[];
  
  /** Estimated complexity */
  readonly complexity: 'trivial' | 'low' | 'medium' | 'high';
  
  /** Confidence in this strategy */
  readonly confidence: number;
  
  /** Potential side effects */
  readonly sideEffects: string[];
}

/**
 * Reasoning chain step
 */
export interface ReasoningStep {
  /** Step number */
  readonly step: number;
  
  /** Step description */
  readonly description: string;
  
  /** Reasoning behind this step */
  readonly reasoning: string;
  
  /** Confidence at this step */
  readonly confidence: number;
  
  /** Evidence supporting this step */
  readonly evidence: string[];
}

/**
 * Enhanced AI Reasoning Output
 */
export interface EnhancedAIReasoningOutput extends AIReasoningOutput {
  /** Root cause analysis */
  readonly rootCause: RootCauseAnalysis;
  
  /** All generated hypotheses */
  readonly hypotheses: AIHypothesis[];
  
  /** Overall confidence score */
  readonly confidence: number;
  
  /** Reasoning explanation */
  readonly reasoning: string;
  
  /** Recommended fix strategies */
  readonly fixStrategies: FixStrategy[];
  
  /** Files to examine in detail */
  readonly filesToExamine: string[];
  
  /** Reasoning chain */
  readonly reasoningChain: ReasoningStep[];
  
  /** AI model information */
  readonly modelInfo: {
    readonly model: string;
    readonly tokensUsed: number;
    readonly temperature: number;
  };
}

// ============================================================================
// AI Reasoning Phase Implementation
// ============================================================================

/**
 * AI Reasoning Phase
 * 
 * Uses IBM watsonx AI to analyze issues and generate reasoning about
 * root causes, fix strategies, and impacted files.
 * 
 * @example
 * ```typescript
 * const phase = new AIReasoningPhase();
 * const result = await phase.execute(context);
 * 
 * if (result.success) {
 *   console.log('Root cause:', result.data.rootCause);
 *   console.log('Hypotheses:', result.data.hypotheses);
 *   console.log('Confidence:', result.data.confidence);
 * }
 * ```
 */
export class AIReasoningPhase extends BasePhase<AIReasoningInput, EnhancedAIReasoningOutput> {
  private watsonxClient = getWatsonxClient();
  private reasoningEngine = getReasoningEngine();
  private apiCallCount: number = 0;
  private tokensUsed: number = 0;
  private memoryUsed: number = 0;
  
  /**
   * Create a new AI Reasoning phase instance
   * 
   * @param config - Optional phase configuration overrides
   */
  constructor(config?: Partial<PhaseConfig>) {
    super(
      PipelinePhase.AI_REASONING,
      createPhaseConfig({
        name: 'ai-reasoning',
        version: '1.0.0',
        timeout: 120000, // 2 minutes for AI processing
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
  protected extractInput(context: PipelineContext): AIReasoningInput {
    const inputAnalysis = context.phaseOutputs.inputAnalysis;
    
    if (!inputAnalysis) {
      throw new Error('Input Analysis output not found in context');
    }
    
    return {
      parsedStackTrace: inputAnalysis.parsedStackTrace,
      errorContext: inputAnalysis.errorContext,
      repoMetadata: inputAnalysis.repoMetadata,
      relevantFiles: inputAnalysis.relevantFiles,
    };
  }
  
  /**
   * Validate input data
   * 
   * @param input - Input to validate
   * @returns Validation result
   */
  public async validate(input: AIReasoningInput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate parsed stack trace
    if (!input.parsedStackTrace) {
      errors.push(this.createValidationError(
        'parsedStackTrace',
        ValidationType.REQUIRED_FIELD,
        'Parsed stack trace is required'
      ));
    } else {
      if (!input.parsedStackTrace.errorType) {
        errors.push(this.createValidationError(
          'parsedStackTrace.errorType',
          ValidationType.REQUIRED_FIELD,
          'Error type is required'
        ));
      }
      
      if (input.parsedStackTrace.frames.length === 0) {
        warnings.push({
          field: 'parsedStackTrace.frames',
          message: 'No stack frames available, AI reasoning may be limited',
        });
      }
    }
    
    // Validate error context
    if (!input.errorContext) {
      errors.push(this.createValidationError(
        'errorContext',
        ValidationType.REQUIRED_FIELD,
        'Error context is required'
      ));
    }
    
    // Validate repository metadata
    if (!input.repoMetadata) {
      errors.push(this.createValidationError(
        'repoMetadata',
        ValidationType.REQUIRED_FIELD,
        'Repository metadata is required'
      ));
    }
    
    // Validate relevant files
    if (!input.relevantFiles || input.relevantFiles.length === 0) {
      warnings.push({
        field: 'relevantFiles',
        message: 'No relevant files identified, AI may need to infer file locations',
      });
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Execute the AI reasoning phase
   * 
   * @param input - Phase input
   * @param context - Pipeline context
   * @returns Phase output
   */
  protected async executePhase(
    input: AIReasoningInput,
    context: PipelineContext
  ): Promise<EnhancedAIReasoningOutput> {
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      // Step 1: Generate hypotheses using AI
      const hypotheses = await this.generateHypotheses(input);
      
      // Step 2: Evaluate and rank hypotheses
      const rankedHypotheses = await this.rankHypotheses(hypotheses, input);
      
      // Step 3: Perform root cause analysis
      const rootCause = await this.analyzeRootCause(rankedHypotheses, input);
      
      // Step 4: Generate fix strategies
      const fixStrategies = await this.generateFixStrategies(rootCause, rankedHypotheses, input);
      
      // Step 5: Identify files to examine
      const filesToExamine = this.identifyFilesToExamine(rankedHypotheses, fixStrategies, input);
      
      // Step 6: Build reasoning chain
      const reasoningChain = this.buildReasoningChain(hypotheses, rankedHypotheses, rootCause);
      
      // Step 7: Calculate overall confidence
      const confidence = this.calculateOverallConfidence(rootCause, rankedHypotheses);
      
      // Step 8: Generate reasoning explanation
      const reasoning = this.generateReasoningExplanation(rootCause, rankedHypotheses, reasoningChain);
      
      // Track resource usage
      this.memoryUsed = process.memoryUsage().heapUsed - startMemory;
      
      return {
        rootCause,
        hypotheses: rankedHypotheses,
        confidence,
        reasoning,
        fixStrategies,
        filesToExamine,
        reasoningChain,
        modelInfo: {
          model: process.env.WATSONX_MODEL || 'ibm/granite-13b-chat-v2',
          tokensUsed: this.tokensUsed,
          temperature: 0.7,
        },
      };
    } catch (error) {
      throw new Error(`AI reasoning failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate output data
   * 
   * @param output - Output to validate
   * @returns Validation result
   */
  public async validateOutput(output: EnhancedAIReasoningOutput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate root cause
    if (!output.rootCause) {
      errors.push({
        field: 'rootCause',
        type: ValidationType.REQUIRED_FIELD,
        message: 'Root cause analysis is required',
      });
    } else {
      if (!output.rootCause.cause) {
        errors.push({
          field: 'rootCause.cause',
          type: ValidationType.REQUIRED_FIELD,
          message: 'Root cause description is required',
        });
      }
      
      if (output.rootCause.confidence < 0.3) {
        warnings.push({
          field: 'rootCause.confidence',
          message: 'Root cause confidence is low, results may be unreliable',
        });
      }
    }
    
    // Validate hypotheses
    if (!output.hypotheses || output.hypotheses.length === 0) {
      warnings.push({
        field: 'hypotheses',
        message: 'No hypotheses generated, AI reasoning may be incomplete',
      });
    }
    
    // Validate confidence
    if (output.confidence < 0.5) {
      warnings.push({
        field: 'confidence',
        message: 'Overall confidence is below 50%, manual review recommended',
      });
    }
    
    // Validate fix strategies
    if (!output.fixStrategies || output.fixStrategies.length === 0) {
      warnings.push({
        field: 'fixStrategies',
        message: 'No fix strategies generated',
      });
    }
    
    // Validate files to examine
    if (!output.filesToExamine || output.filesToExamine.length === 0) {
      warnings.push({
        field: 'filesToExamine',
        message: 'No files identified for examination',
      });
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Handle errors with AI-specific retry logic
   */
  public async handleError(error: Error, context: PipelineContext): Promise<ErrorHandlingStrategy> {
    // Check for AI-specific errors
    if (error.message.includes('API key') || error.message.includes('authentication')) {
      // Don't retry authentication errors
      return ErrorHandlingStrategy.FAIL;
    }
    
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      // Retry rate limit errors with longer delay
      return ErrorHandlingStrategy.RETRY;
    }
    
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      // Retry timeout errors
      return ErrorHandlingStrategy.RETRY;
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
      apiCalls: this.apiCallCount,
      tokensUsed: this.tokensUsed,
    };
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Generate hypotheses using AI
   */
  private async generateHypotheses(input: AIReasoningInput): Promise<AIHypothesis[]> {
    this.apiCallCount++;
    
    // Build context for AI
    const context = this.buildAIContext(input);
    
    // Generate hypotheses using reasoning engine
    const prompt = this.buildHypothesisPrompt(context);
    
    try {
      const response = await this.watsonxClient.generate({
        prompt,
        maxTokens: 1500,
        temperature: 0.7,
        stopSequences: ['\n\n###', '\n\n##'],
      });
      
      this.tokensUsed += 1500; // Approximate
      
      // Parse AI response into hypotheses
      return this.parseHypothesesFromResponse(response, input);
    } catch (error) {
      console.error('Hypothesis generation failed:', error);
      // Fallback to heuristic-based hypotheses
      return this.generateFallbackHypotheses(input);
    }
  }
  
  /**
   * Build AI context from input
   */
  private buildAIContext(input: AIReasoningInput): string {
    const parts = [
      `Error Type: ${input.parsedStackTrace.errorType}`,
      `Error Message: ${input.parsedStackTrace.errorMessage}`,
      `Language: ${input.parsedStackTrace.language}`,
      `Framework: ${input.repoMetadata.framework || 'Unknown'}`,
      `Severity: ${input.errorContext.severity}`,
      `\nStack Frames:`,
    ];
    
    input.parsedStackTrace.frames.slice(0, 5).forEach((frame, i) => {
      parts.push(`  ${i + 1}. ${frame.file}:${frame.line}${frame.function ? ` in ${frame.function}` : ''}`);
    });
    
    if (input.relevantFiles.length > 0) {
      parts.push(`\nRelevant Files: ${input.relevantFiles.join(', ')}`);
    }
    
    return parts.join('\n');
  }
  
  /**
   * Build hypothesis generation prompt
   */
  private buildHypothesisPrompt(context: string): string {
    return `You are an expert software engineer analyzing a bug. Based on the following error information, generate 3-5 hypotheses about the root cause.

${context}

For each hypothesis, provide:
1. A clear description of the potential root cause
2. Confidence level (0.0 to 1.0)
3. Supporting evidence
4. Files that would need examination
5. Risk level (low/medium/high/critical)

Format your response as JSON:
{
  "hypotheses": [
    {
      "id": "h1",
      "description": "...",
      "confidence": 0.85,
      "evidence": ["...", "..."],
      "filesToExamine": ["..."],
      "riskLevel": "medium"
    }
  ]
}`;
  }
  
  /**
   * Parse hypotheses from AI response
   */
  private parseHypothesesFromResponse(response: string, input: AIReasoningInput): AIHypothesis[] {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      const hypotheses: AIHypothesis[] = [];
      
      for (const h of parsed.hypotheses || []) {
        hypotheses.push({
          id: h.id || `h${hypotheses.length + 1}`,
          description: h.description || '',
          confidence: Math.max(0, Math.min(1, h.confidence || 0.5)),
          evidence: Array.isArray(h.evidence) ? h.evidence : [],
          testable: true,
          filesToExamine: Array.isArray(h.filesToExamine) ? h.filesToExamine : input.relevantFiles,
          fixStrategy: h.fixStrategy,
          riskLevel: h.riskLevel || 'medium',
        });
      }
      
      return hypotheses;
    } catch (error) {
      console.error('Failed to parse hypotheses:', error);
      return this.generateFallbackHypotheses(input);
    }
  }
  
  /**
   * Generate fallback hypotheses when AI fails
   */
  private generateFallbackHypotheses(input: AIReasoningInput): AIHypothesis[] {
    const errorType = input.parsedStackTrace.errorType.toLowerCase();
    const hypotheses: AIHypothesis[] = [];
    
    // Hypothesis based on error type
    if (errorType.includes('type')) {
      hypotheses.push({
        id: 'h1',
        description: 'Type mismatch or undefined value access',
        confidence: 0.7,
        evidence: [`Error type is ${input.parsedStackTrace.errorType}`],
        testable: true,
        filesToExamine: input.relevantFiles,
        riskLevel: 'medium',
      });
    }
    
    if (errorType.includes('reference')) {
      hypotheses.push({
        id: 'h2',
        description: 'Variable or function not defined or out of scope',
        confidence: 0.75,
        evidence: [`Error type is ${input.parsedStackTrace.errorType}`],
        testable: true,
        filesToExamine: input.relevantFiles,
        riskLevel: 'medium',
      });
    }
    
    // Generic hypothesis
    hypotheses.push({
      id: 'h3',
      description: `${input.parsedStackTrace.errorType} in ${input.relevantFiles[0] || 'unknown file'}`,
      confidence: 0.5,
      evidence: [input.parsedStackTrace.errorMessage],
      testable: true,
      filesToExamine: input.relevantFiles,
      riskLevel: 'low',
    });
    
    return hypotheses;
  }
  
  /**
   * Rank hypotheses by confidence and evidence
   */
  private async rankHypotheses(
    hypotheses: AIHypothesis[],
    input: AIReasoningInput
  ): Promise<AIHypothesis[]> {
    // Sort by confidence (descending)
    return [...hypotheses].sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Analyze root cause from top hypotheses
   */
  private async analyzeRootCause(
    hypotheses: AIHypothesis[],
    input: AIReasoningInput
  ): Promise<RootCauseAnalysis> {
    this.apiCallCount++;
    
    const topHypothesis = hypotheses[0];
    
    if (!topHypothesis) {
      // Fallback root cause
      return {
        cause: input.parsedStackTrace.errorMessage,
        category: 'runtime-error',
        confidence: 0.5,
        evidence: ['Stack trace analysis'],
        relatedIssues: [],
      };
    }
    
    return {
      cause: topHypothesis.description,
      category: this.categorizeError(input.parsedStackTrace.errorType),
      confidence: topHypothesis.confidence,
      evidence: topHypothesis.evidence,
      relatedIssues: [],
    };
  }
  
  /**
   * Categorize error type
   */
  private categorizeError(errorType: string): string {
    const type = errorType.toLowerCase();
    
    if (type.includes('type')) return 'type-error';
    if (type.includes('reference')) return 'reference-error';
    if (type.includes('syntax')) return 'syntax-error';
    if (type.includes('range')) return 'range-error';
    if (type.includes('security')) return 'security-error';
    if (type.includes('network')) return 'network-error';
    
    return 'runtime-error';
  }
  
  /**
   * Generate fix strategies
   */
  private async generateFixStrategies(
    rootCause: RootCauseAnalysis,
    hypotheses: AIHypothesis[],
    input: AIReasoningInput
  ): Promise<FixStrategy[]> {
    const strategies: FixStrategy[] = [];
    
    // Generate strategy from top hypothesis
    const topHypothesis = hypotheses[0];
    if (topHypothesis) {
      strategies.push({
        id: 's1',
        description: `Fix ${rootCause.category}`,
        approach: topHypothesis.fixStrategy || 'Address the root cause identified in the analysis',
        affectedFiles: topHypothesis.filesToExamine,
        complexity: this.estimateComplexity(topHypothesis),
        confidence: topHypothesis.confidence,
        sideEffects: this.estimateSideEffects(topHypothesis, input),
      });
    }
    
    return strategies;
  }
  
  /**
   * Estimate fix complexity
   */
  private estimateComplexity(hypothesis: AIHypothesis): 'trivial' | 'low' | 'medium' | 'high' {
    if (hypothesis.filesToExamine.length === 1 && hypothesis.confidence > 0.8) {
      return 'low';
    }
    if (hypothesis.filesToExamine.length <= 3) {
      return 'medium';
    }
    return 'high';
  }
  
  /**
   * Estimate side effects
   */
  private estimateSideEffects(hypothesis: AIHypothesis, input: AIReasoningInput): string[] {
    const effects: string[] = [];
    
    if (hypothesis.riskLevel === 'high' || hypothesis.riskLevel === 'critical') {
      effects.push('May affect other components');
    }
    
    if (hypothesis.filesToExamine.length > 3) {
      effects.push('Multiple files affected');
    }
    
    if (input.errorContext.severity === ErrorSeverity.CRITICAL) {
      effects.push('Critical system component');
    }
    
    return effects;
  }
  
  /**
   * Identify files to examine in detail
   */
  private identifyFilesToExamine(
    hypotheses: AIHypothesis[],
    strategies: FixStrategy[],
    input: AIReasoningInput
  ): string[] {
    const files = new Set<string>();
    
    // Add files from top hypotheses
    hypotheses.slice(0, 3).forEach(h => {
      h.filesToExamine.forEach(f => files.add(f));
    });
    
    // Add files from strategies
    strategies.forEach(s => {
      s.affectedFiles.forEach(f => files.add(f));
    });
    
    // Add relevant files from input
    input.relevantFiles.forEach(f => files.add(f));
    
    return Array.from(files);
  }
  
  /**
   * Build reasoning chain
   */
  private buildReasoningChain(
    hypotheses: AIHypothesis[],
    rankedHypotheses: AIHypothesis[],
    rootCause: RootCauseAnalysis
  ): ReasoningStep[] {
    const steps: ReasoningStep[] = [];
    
    steps.push({
      step: 1,
      description: 'Analyzed error information',
      reasoning: 'Extracted error type, message, and stack trace',
      confidence: 1.0,
      evidence: ['Stack trace parsed successfully'],
    });
    
    steps.push({
      step: 2,
      description: `Generated ${hypotheses.length} hypotheses`,
      reasoning: 'Used AI to generate potential root causes',
      confidence: 0.8,
      evidence: hypotheses.map(h => h.description),
    });
    
    steps.push({
      step: 3,
      description: 'Ranked hypotheses by confidence',
      reasoning: 'Evaluated evidence and confidence scores',
      confidence: rankedHypotheses[0]?.confidence || 0.5,
      evidence: [`Top hypothesis: ${rankedHypotheses[0]?.description}`],
    });
    
    steps.push({
      step: 4,
      description: 'Identified root cause',
      reasoning: rootCause.cause,
      confidence: rootCause.confidence,
      evidence: rootCause.evidence,
    });
    
    return steps;
  }
  
  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(
    rootCause: RootCauseAnalysis,
    hypotheses: AIHypothesis[]
  ): number {
    // Weight root cause confidence heavily
    let confidence = rootCause.confidence * 0.7;
    
    // Add average of top 3 hypotheses
    const topHypotheses = hypotheses.slice(0, 3);
    if (topHypotheses.length > 0) {
      const avgHypothesisConfidence = topHypotheses.reduce((sum, h) => sum + h.confidence, 0) / topHypotheses.length;
      confidence += avgHypothesisConfidence * 0.3;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }
  
  /**
   * Generate reasoning explanation
   */
  private generateReasoningExplanation(
    rootCause: RootCauseAnalysis,
    hypotheses: AIHypothesis[],
    reasoningChain: ReasoningStep[]
  ): string {
    const parts = [
      `Root Cause: ${rootCause.cause}`,
      `\nCategory: ${rootCause.category}`,
      `Confidence: ${Math.round(rootCause.confidence * 100)}%`,
      `\nEvidence:`,
    ];
    
    rootCause.evidence.forEach((e, i) => {
      parts.push(`  ${i + 1}. ${e}`);
    });
    
    if (hypotheses.length > 1) {
      parts.push(`\nAlternative Hypotheses:`);
      hypotheses.slice(1, 3).forEach((h, i) => {
        parts.push(`  ${i + 1}. ${h.description} (${Math.round(h.confidence * 100)}% confidence)`);
      });
    }
    
    parts.push(`\nReasoning Chain:`);
    reasoningChain.forEach(step => {
      parts.push(`  Step ${step.step}: ${step.description}`);
    });
    
    return parts.join('\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AI Reasoning phase instance
 * 
 * @param config - Optional phase configuration
 * @returns AI Reasoning phase instance
 */
export function createAIReasoningPhase(config?: Partial<PhaseConfig>): AIReasoningPhase {
  return new AIReasoningPhase(config);
}

// Made with Bob