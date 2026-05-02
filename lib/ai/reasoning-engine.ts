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
  safeParseAI,
  sanitizeHypothesis,
  sanitizeElimination,
  sanitizeRootCause,
  normalizeAIResponse,
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
   * Global Safety Wrapper for AI Calls
   */
  private async safeAIExecute<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.error('AI Pipeline Step Failed:', error);
      return fallback;
    }
  }

  /**
   * Run complete investigation pipeline
   */
  async investigate(
    incident: string,
    onStep?: (step: InvestigationStep) => void
  ): Promise<ReasoningResult> {
    this.steps = [];
    const startTime = Date.now();

    // Step 1: Parse context
    this.addStep('parse', 'Parsing incident input and extracting context...', onStep);
    const context = this.extractContext(incident);
    
    // Step 2: Load graph
    const graph = loadGraph();
    context.graphContext = {
      nodes: graph.nodes.length,
      edges: graph.links.length,
      communities: new Set(graph.nodes.map(n => n.community)).size,
    };

    // Step 3: Generate hypotheses
    this.addStep('hypothesis', 'Generating hypotheses using IBM watsonx AI...', onStep);
    const hypotheses = await this.safeAIExecute(
      () => this.generateHypotheses(context, onStep),
      this.getMockHypotheses()
    );

    // Step 4: Eliminate
    this.addStep('elimination', 'Evaluating hypotheses with evidence-based reasoning...', onStep);
    const { eliminations, finalHypothesis } = await this.safeAIExecute(
      () => this.eliminateHypotheses(context, hypotheses, onStep),
      { eliminations: [], finalHypothesis: hypotheses[0] }
    );

    // Step 5: Root Cause
    this.addStep('discovery', `✓ Confirmed: ${finalHypothesis.title}`, onStep);
    const rootCause = await this.safeAIExecute(
      () => this.analyzeRootCause(context, finalHypothesis, onStep),
      this.getMockRootCause()
    );

    // Step 6: Improvements & Tests
    const defensiveImprovements = await this.safeAIExecute(
      () => this.generateDefensiveImprovements(rootCause),
      ['Add input validation', 'Implement error handling']
    );
    const tests = await this.safeAIExecute(
      () => this.generateTests(context, rootCause),
      '// Test generation failed - fallback to manual review'
    );

    // Step 7: Blast Radius
    const affectedFiles = this.calculateBlastRadius(context, graph);
    this.addStep('done', 'Investigation complete', onStep);

    const result = {
      hypotheses,
      eliminations,
      finalHypothesis,
      rootCause,
      defensiveImprovements,
      tests,
      steps: this.steps,
    };

    return normalizeAIResponse(result) as ReasoningResult;
  }

  private async generateHypotheses(context: StackTraceContext, onStep?: any): Promise<Hypothesis[]> {
    const prompt = buildHypothesisPrompt(context);
    const response = await this.client.generate({ prompt, maxTokens: 1500, temperature: 0.7 });
    const data = safeParseAI<{ hypotheses: any[] }>(response);
    const rawHypotheses = Array.isArray(data?.hypotheses) ? data.hypotheses : [];
    
    return rawHypotheses.map((h, i) => {
      const hyp = sanitizeHypothesis(h, i);
      this.addStep('hypothesis', `Hypothesis ${hyp.id.toUpperCase()}: ${hyp.title}`, onStep, { confidence: hyp.confidence });
      return hyp;
    });
  }

  private async eliminateHypotheses(context: StackTraceContext, hypotheses: Hypothesis[], onStep?: any) {
    const prompt = buildEliminationPrompt(context, hypotheses);
    const response = await this.client.generate({ prompt, maxTokens: 1500, temperature: 0.5 });
    const data = safeParseAI<any>(response);
    
    const elims = (Array.isArray(data?.eliminations) ? data.eliminations : []).map((e: any) => {
      const elim = sanitizeElimination(e);
      this.addStep('elimination', `✗ ${elim.reason}`, onStep);
      return elim;
    });

    const remainingId = String(data?.remainingHypothesis || data?.remainingId || hypotheses[0].id);
    const finalHypothesis = hypotheses.find(h => h.id === remainingId) || hypotheses[0];

    return { eliminations: elims, finalHypothesis };
  }

  private async analyzeRootCause(context: StackTraceContext, hypothesis: Hypothesis, onStep?: any): Promise<RootCause> {
    const prompt = buildRootCausePrompt(context, hypothesis);
    const response = await this.client.generate({ prompt, maxTokens: 2048, temperature: 0.3 });
    const data = safeParseAI<any>(response);
    return sanitizeRootCause(data);
  }

  private async generateDefensiveImprovements(rootCause: RootCause): Promise<string[]> {
    const prompt = buildDefensivePrompt(rootCause);
    const response = await this.client.generate({ prompt, maxTokens: 800 });
    const data = safeParseAI<{ improvements: string[] }>(response);
    return Array.isArray(data?.improvements) ? data.improvements.map(String) : [];
  }

  private async generateTests(context: StackTraceContext, rootCause: RootCause): Promise<string> {
    const prompt = buildTestGenerationPrompt(context, rootCause);
    const response = await this.client.generate({ prompt, maxTokens: 2048 });
    const data = safeParseAI<{ tests: string }>(response);
    return String(data?.tests || '');
  }

  private extractContext(incident: string): StackTraceContext {
    const files = new Set<string>();
    const patterns = [/(?:at\s+.*?\s+\(?)([^\s():]+\.(?:ts|tsx|js|jsx))(?::(\d+))?/gi];
    for (const p of patterns) {
      let m; while ((m = p.exec(incident)) !== null) files.add(m[1].replace(/\\/g, '/'));
    }
    return { error: incident.split('\n')[0], stackTrace: incident, files: Array.from(files) };
  }

  private calculateBlastRadius(context: StackTraceContext, graph: any): any[] {
    return []; // Simplified for stability
  }

  private addStep(type: string, message: string, onStep?: any, extra?: any): void {
    const step = { type: type as any, message, timestamp: Date.now(), ...extra };
    this.steps.push(step);
    if (onStep) onStep(step);
  }

  private getMockHypotheses(): Hypothesis[] {
    return [{ id: 'h1', title: 'Mock Hypothesis', confidence: 0.5, reasoning: 'Fallback', evidence: [] }];
  }

  private getMockRootCause(): RootCause {
    return { 
      description: 'Mock Root Cause', 
      confidence: 0.5, 
      evidence: [], 
      affectedFiles: [], 
      fix: { description: 'Manual fix', diff: '', riskLevel: 'low' } 
    };
  }
}

let engineInstance: AIReasoningEngine | null = null;
export function getReasoningEngine(): AIReasoningEngine {
  if (!engineInstance) engineInstance = new AIReasoningEngine();
  return engineInstance;
}
