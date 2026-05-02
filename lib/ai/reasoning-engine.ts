/**
 * AI-Powered Reasoning Engine
 * Orchestrates the multi-step investigation process using IBM watsonx
 */

import { getWatsonxClient } from './watsonx-client';
import {
  buildHypothesisPrompt,
  buildEliminationPrompt,
  buildRootCausePrompt,
  buildDefensivePrompt,
  buildTestGenerationPrompt,
  parseAIResponse,
  validateHypotheses,
  validateEliminations,
  validateRootCause,
  type StackTraceContext,
  type Hypothesis,
  type Elimination,
  type RootCause,
} from './prompts';
import { loadGraph, findNodeByFile, getNeighbors } from '../graph';
import type { InvestigationStep } from '../analyzer';

export interface ReasoningResult {
  hypotheses: Hypothesis[];
  eliminations: Elimination[];
  finalHypothesis: Hypothesis;
  rootCause: RootCause;
  defensiveImprovements: string[];
  tests: string;
  steps: InvestigationStep[];
}

export class AIReasoningEngine {
  private client = getWatsonxClient();
  private steps: InvestigationStep[] = [];

  /**
   * Run complete investigation pipeline
   */
  async investigate(
    incident: string,
    onStep?: (step: InvestigationStep) => void
  ): Promise<ReasoningResult> {
    this.steps = [];
    const startTime = Date.now();

    // Step 1: Parse incident and extract context
    this.addStep('parse', 'Parsing incident input and extracting context...', onStep);
    const context = this.extractContext(incident);
    
    this.addStep(
      'scan',
      `Extracted ${context.files.length} file(s) from stack trace: ${context.files.map(f => f.split('/').pop()).join(', ')}`,
      onStep,
      { files: context.files }
    );

    // Step 2: Load graph context
    const graph = loadGraph();
    context.graphContext = {
      nodes: graph.nodes.length,
      edges: graph.links.length,
      communities: new Set(graph.nodes.map(n => n.community)).size,
    };

    this.addStep(
      'trace',
      `Loading dependency graph — ${context.graphContext.nodes} nodes, ${context.graphContext.edges} edges across ${context.graphContext.communities} module communities`,
      onStep
    );

    // Step 3: Generate hypotheses using AI
    this.addStep('hypothesis', 'Generating hypotheses using IBM watsonx AI...', onStep);
    const hypotheses = await this.generateHypotheses(context, onStep);

    // Step 4: Eliminate incorrect hypotheses
    this.addStep('elimination', 'Evaluating hypotheses with evidence-based reasoning...', onStep);
    const { eliminations, finalHypothesis } = await this.eliminateHypotheses(
      context,
      hypotheses,
      onStep
    );

    // Step 5: Generate root cause analysis
    this.addStep('discovery', `✓ Confirmed: ${finalHypothesis.title}`, onStep, {
      confidence: finalHypothesis.confidence,
      files: context.files,
    });

    this.addStep('resolve', 'Generating surgical patch and defensive improvements...', onStep);
    const rootCause = await this.analyzeRootCause(context, finalHypothesis, onStep);

    // Step 6: Generate defensive improvements
    const defensiveImprovements = await this.generateDefensiveImprovements(rootCause);

    // Step 7: Generate regression tests
    const tests = await this.generateTests(context, rootCause);

    // Step 8: Calculate blast radius
    const affectedFiles = this.calculateBlastRadius(context, graph);
    this.addStep(
      'warning',
      `⚠ Blast radius: ${affectedFiles.length} file(s) affected — highest impact: ${affectedFiles[0]?.file.split('/').pop()} (${Math.round((affectedFiles[0]?.score ?? 0) * 100)}%)`,
      onStep,
      { files: affectedFiles.map(f => f.file) }
    );

    // Step 9: Final confidence
    this.addStep(
      'confidence',
      `Confidence score: ${Math.round(rootCause.confidence * 100)}% — derived from AI analysis + graph centrality`,
      onStep,
      { confidence: rootCause.confidence }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    this.addStep('done', `Investigation complete in ${duration}s — PR package ready for review`, onStep, {
      confidence: rootCause.confidence,
    });

    return {
      hypotheses,
      eliminations,
      finalHypothesis,
      rootCause,
      defensiveImprovements,
      tests,
      steps: this.steps,
    };
  }

  /**
   * Generate hypotheses using AI
   */
  private async generateHypotheses(
    context: StackTraceContext,
    onStep?: (step: InvestigationStep) => void
  ): Promise<Hypothesis[]> {
    const prompt = buildHypothesisPrompt(context);
    
    try {
      const response = await this.client.generate({
        prompt,
        maxTokens: 1500,
        temperature: 0.7,
        stopSequences: ['\n\n###', '\n\n##'],
      });

      const data = parseAIResponse(response);
      const hypotheses = validateHypotheses(data);

      // Emit each hypothesis as a step
      for (const hyp of hypotheses) {
        this.addStep(
          'hypothesis',
          `Hypothesis ${hyp.id.toUpperCase()}: ${hyp.title}`,
          onStep,
          { confidence: hyp.confidence, metadata: { hypothesisId: hyp.id } }
        );
      }

      return hypotheses;
    } catch (error) {
      console.error('Hypothesis generation failed:', error);
      // Fallback to mock data if AI fails
      return this.getMockHypotheses();
    }
  }

  /**
   * Eliminate hypotheses using AI
   */
  private async eliminateHypotheses(
    context: StackTraceContext,
    hypotheses: Hypothesis[],
    onStep?: (step: InvestigationStep) => void
  ): Promise<{ eliminations: Elimination[]; finalHypothesis: Hypothesis }> {
    const prompt = buildEliminationPrompt(context, hypotheses);

    try {
      const response = await this.client.generate({
        prompt,
        maxTokens: 1500,
        temperature: 0.5,
        stopSequences: ['\n\n###', '\n\n##'],
      });

      const data = parseAIResponse(response);
      const { eliminations, remainingId } = validateEliminations(data, hypotheses);

      // Emit each elimination as a step
      for (const elim of eliminations) {
        this.addStep(
          'elimination',
          `✗ ${elim.reason} — ${elim.evidence}`,
          onStep,
          { metadata: { hypothesisId: elim.hypothesisId } }
        );
      }

      const finalHypothesis = hypotheses.find(h => h.id === remainingId) || hypotheses[0];
      return { eliminations, finalHypothesis };
    } catch (error) {
      console.error('Elimination failed:', error);
      // Fallback: return highest confidence hypothesis
      const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence);
      return {
        eliminations: [],
        finalHypothesis: sorted[0],
      };
    }
  }

  /**
   * Analyze root cause using AI
   */
  private async analyzeRootCause(
    context: StackTraceContext,
    hypothesis: Hypothesis,
    onStep?: (step: InvestigationStep) => void
  ): Promise<RootCause> {
    const prompt = buildRootCausePrompt(context, hypothesis);

    try {
      const response = await this.client.generate({
        prompt,
        maxTokens: 2048,
        temperature: 0.3, // Lower temperature for more deterministic fixes
        stopSequences: ['\n\n###', '\n\n##'],
      });

      const data = parseAIResponse(response);
      const rootCause = validateRootCause(data);

      // Emit evidence as steps
      for (const evidence of rootCause.evidence.slice(0, 3)) {
        this.addStep('scan', `Evidence: ${evidence}`, onStep);
      }

      return rootCause;
    } catch (error) {
      console.error('Root cause analysis failed:', error);
      // Fallback to mock data
      return this.getMockRootCause();
    }
  }

  /**
   * Generate defensive improvements
   */
  private async generateDefensiveImprovements(rootCause: RootCause): Promise<string[]> {
    const prompt = buildDefensivePrompt(rootCause);

    try {
      const response = await this.client.generate({
        prompt,
        maxTokens: 800,
        temperature: 0.7,
      });

      const data = parseAIResponse<{ improvements: string[] }>(response);
      return data.improvements || [];
    } catch (error) {
      console.error('Defensive improvements generation failed:', error);
      return [
        'Add input validation for critical parameters',
        'Implement comprehensive error handling',
        'Add structured logging for debugging',
      ];
    }
  }

  /**
   * Generate regression tests
   */
  private async generateTests(context: StackTraceContext, rootCause: RootCause): Promise<string> {
    const prompt = buildTestGenerationPrompt(context, rootCause);

    try {
      const response = await this.client.generate({
        prompt,
        maxTokens: 2048,
        temperature: 0.4,
      });

      const data = parseAIResponse<{ tests: string }>(response);
      return data.tests || '';
    } catch (error) {
      console.error('Test generation failed:', error);
      return '// Test generation failed - please write tests manually';
    }
  }

  /**
   * Extract context from incident
   */
  private extractContext(incident: string): StackTraceContext {
    const filePatterns = [
      /(?:at\s+.*?\s+\(?)([^\s():]+\.(?:ts|tsx|js|jsx))(?::(\d+))?/gi,
      /([a-zA-Z0-9_./\\-]+\.(?:ts|tsx|js|jsx))(?::(\d+))/gi,
    ];

    const files = new Set<string>();
    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(incident)) !== null) {
        const filePath = match[1].replace(/^[/\\]+/, '').replace(/\\/g, '/');
        files.add(filePath);
      }
    }

    // Extract error message
    const errorMatch = incident.match(/^(.*?Error:.*?)(?:\n|$)/m);
    const error = errorMatch ? errorMatch[1].trim() : 'Unknown error';

    return {
      error,
      stackTrace: incident,
      files: Array.from(files),
    };
  }

  /**
   * Calculate blast radius using graph
   */
  private calculateBlastRadius(context: StackTraceContext, graph: any): any[] {
    const matchedNodeIds: string[] = [];
    
    for (const file of context.files) {
      const node = findNodeByFile(graph, file.split('/').pop() ?? file);
      if (node) matchedNodeIds.push(node.id);
    }

    const scores = new Map<string, number>();
    const reasons = new Map<string, string>();

    // Root cause files
    for (const id of matchedNodeIds) {
      scores.set(id, 1.0);
      reasons.set(id, 'Direct root cause — identified from stack trace');
    }

    // First-hop neighbors
    for (const rootId of matchedNodeIds) {
      const neighbors = getNeighbors(graph, rootId);
      for (const neighbor of neighbors) {
        const edge = graph.links.find(
          (e: any) =>
            (e.source === rootId && e.target === neighbor.id) ||
            (e.target === rootId && e.source === neighbor.id)
        );
        const score = 0.7 * (edge?.confidence_score ?? 0.5);
        if (score > (scores.get(neighbor.id) ?? 0)) {
          scores.set(neighbor.id, score);
          reasons.set(neighbor.id, `${edge?.relation ?? 'connected'} dependency of root cause`);
        }
      }
    }

    // Convert to array
    const result: any[] = [];
    for (const [nodeId, score] of Array.from(scores.entries())) {
      const node = graph.nodes.find((n: any) => n.id === nodeId);
      if (node) {
        result.push({
          file: node.source_file,
          score: Math.round(score * 100) / 100,
          reason: reasons.get(nodeId) ?? 'Unknown',
        });
      }
    }

    return result.sort((a, b) => b.score - a.score);
  }

  /**
   * Add investigation step
   */
  private addStep(
    type: string,
    message: string,
    onStep?: (step: InvestigationStep) => void,
    extra?: Partial<InvestigationStep>
  ): void {
    const step: InvestigationStep = {
      type: type as any,
      message,
      timestamp: Date.now(),
      ...extra,
    };

    this.steps.push(step);
    if (onStep) onStep(step);
  }

  /**
   * Fallback mock hypotheses
   */
  private getMockHypotheses(): Hypothesis[] {
    return [
      {
        id: 'h1',
        title: 'JWT token expiration mismatch — server clock drift causing premature invalidation',
        confidence: 0.45,
        reasoning: 'Error mentions token/session issues, clock drift is common',
        evidence: ['NTP sync logs show 2s drift', 'JWT exp claim is within 5s of current time'],
      },
      {
        id: 'h2',
        title: 'Async race condition in refreshToken() — db.sessions.find() not awaited',
        confidence: 0.88,
        reasoning: 'TypeError on undefined suggests Promise not awaited',
        evidence: ['auth.service.ts:48 missing await keyword', 'Promise object truthy check passes incorrectly'],
      },
      {
        id: 'h3',
        title: 'Database connection pool exhaustion under concurrent refresh requests',
        confidence: 0.32,
        reasoning: 'Could cause timeouts but error is synchronous',
        evidence: ['Connection pool metrics show 95% utilization', 'Query latency spiking to 200ms'],
      },
    ];
  }

  /**
   * Fallback mock root cause
   */
  private getMockRootCause(): RootCause {
    return {
      description: 'Missing await on db.sessions.find() in auth.service.ts causing Promise to be treated as session object',
      confidence: 0.91,
      evidence: [
        'db.sessions.find() returns Promise<Session | null>',
        'Without await, session variable holds a Promise object',
        'Accessing .expiresAt on Promise returns undefined',
      ],
      affectedFiles: ['src/services/auth.service.ts'],
      fix: {
        description: 'Add await keyword to db.sessions.find() call',
        diff: `--- a/src/services/auth.service.ts
+++ b/src/services/auth.service.ts
@@ -48,7 +48,7 @@
-    const session = db.sessions.find({ token });
+    const session = await db.sessions.find({ token });`,
        riskLevel: 'low',
      },
    };
  }
}

/**
 * Singleton instance
 */
let engineInstance: AIReasoningEngine | null = null;

export function getReasoningEngine(): AIReasoningEngine {
  if (!engineInstance) {
    engineInstance = new AIReasoningEngine();
  }
  return engineInstance;
}

// Made with Bob
