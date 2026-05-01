/**
 * Structured prompts for IBM watsonx AI reasoning
 * Optimized for low latency and explainable outputs
 */

export interface StackTraceContext {
  error: string;
  stackTrace: string;
  files: string[];
  graphContext?: {
    nodes: number;
    edges: number;
    communities: number;
  };
}

export interface Hypothesis {
  id: string;
  text: string;
  confidence: number;
  reasoning: string;
}

export interface Elimination {
  hypothesisId: string;
  reason: string;
  evidence: string;
}

export interface RootCause {
  description: string;
  confidence: number;
  evidence: string[];
  affectedFiles: string[];
  fix: {
    description: string;
    diff: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

/**
 * System prompt for incident analysis
 */
export const SYSTEM_PROMPT = `You are an expert software engineer and debugging specialist. Your role is to analyze production incidents, generate hypotheses, eliminate incorrect ones through evidence-based reasoning, and identify root causes with fixes.

Key principles:
1. Be systematic: Generate multiple hypotheses, then eliminate them one by one
2. Be evidence-based: Every conclusion must be backed by concrete evidence
3. Be precise: Reference specific files, line numbers, and code patterns
4. Be explainable: Every reasoning step must be clear and auditable
5. Be practical: Suggest fixes that are surgical, low-risk, and production-ready

Output format: Always respond with valid JSON matching the requested schema.`;

/**
 * Generate hypotheses from stack trace
 */
export function buildHypothesisPrompt(context: StackTraceContext): string {
  return `${SYSTEM_PROMPT}

## Task: Generate Hypotheses

Analyze this production incident and generate 3-5 hypotheses about the root cause.

### Incident Details:
Error: ${context.error}

Stack Trace:
${context.stackTrace}

Affected Files: ${context.files.join(', ')}

${context.graphContext ? `
Codebase Context:
- ${context.graphContext.nodes} modules analyzed
- ${context.graphContext.edges} dependencies mapped
- ${context.graphContext.communities} module communities
` : ''}

### Instructions:
1. Analyze the error message and stack trace
2. Consider common patterns for this error type
3. Think about async/await issues, race conditions, null checks, type mismatches
4. Generate 3-5 distinct hypotheses ordered by likelihood
5. Assign confidence scores (0.0-1.0) based on evidence strength

### Output Format (JSON):
{
  "hypotheses": [
    {
      "id": "h1",
      "text": "Brief hypothesis description",
      "confidence": 0.85,
      "reasoning": "Why this is likely based on the evidence"
    }
  ]
}

Generate hypotheses now:`;
}

/**
 * Eliminate hypotheses with evidence
 */
export function buildEliminationPrompt(
  context: StackTraceContext,
  hypotheses: Hypothesis[]
): string {
  return `${SYSTEM_PROMPT}

## Task: Eliminate Incorrect Hypotheses

You previously generated these hypotheses. Now eliminate the incorrect ones through evidence-based reasoning.

### Incident Details:
Error: ${context.error}
Stack Trace:
${context.stackTrace}

### Hypotheses to Evaluate:
${hypotheses.map(h => `
**${h.id.toUpperCase()}** (confidence: ${h.confidence})
${h.text}
Reasoning: ${h.reasoning}
`).join('\n')}

### Instructions:
1. For each hypothesis, look for evidence that contradicts it
2. Consider: error type, timing, affected modules, common patterns
3. Eliminate hypotheses that don't match the evidence
4. Keep the most likely hypothesis (highest confidence + strongest evidence)
5. Be specific about WHY each hypothesis is eliminated

### Output Format (JSON):
{
  "eliminations": [
    {
      "hypothesisId": "h1",
      "reason": "Brief reason for elimination",
      "evidence": "Specific evidence that contradicts this hypothesis"
    }
  ],
  "remainingHypothesis": "h2"
}

Eliminate hypotheses now:`;
}

/**
 * Generate root cause analysis and fix
 */
export function buildRootCausePrompt(
  context: StackTraceContext,
  finalHypothesis: Hypothesis,
  codeSnippet?: string
): string {
  return `${SYSTEM_PROMPT}

## Task: Root Cause Analysis & Fix Generation

Based on the confirmed hypothesis, provide a detailed root cause analysis and generate a fix.

### Incident Details:
Error: ${context.error}
Stack Trace:
${context.stackTrace}

### Confirmed Hypothesis:
${finalHypothesis.text}
Confidence: ${finalHypothesis.confidence}
Reasoning: ${finalHypothesis.reasoning}

${codeSnippet ? `
### Code Context:
\`\`\`
${codeSnippet}
\`\`\`
` : ''}

### Instructions:
1. Explain the root cause in detail (what, why, how)
2. List concrete evidence supporting this conclusion
3. Identify all affected files
4. Generate a surgical fix (minimal changes, low risk)
5. Provide a unified diff format
6. Assess risk level (low/medium/high)
7. Explain why this fix resolves the issue

### Output Format (JSON):
{
  "rootCause": {
    "description": "Detailed explanation of what went wrong and why",
    "confidence": 0.91,
    "evidence": [
      "Evidence point 1",
      "Evidence point 2"
    ],
    "affectedFiles": ["file1.ts", "file2.ts"],
    "fix": {
      "description": "What the fix does and why it works",
      "diff": "--- a/file.ts\\n+++ b/file.ts\\n@@ -10,5 +10,5 @@\\n-old line\\n+new line",
      "riskLevel": "low"
    }
  }
}

Generate root cause analysis now:`;
}

/**
 * Generate defensive improvements
 */
export function buildDefensivePrompt(rootCause: RootCause): string {
  return `${SYSTEM_PROMPT}

## Task: Suggest Defensive Improvements

Based on this root cause, suggest 3-5 defensive improvements to prevent similar issues.

### Root Cause:
${rootCause.description}

### Current Fix:
${rootCause.fix.description}

### Instructions:
1. Think beyond the immediate fix
2. Consider: input validation, error handling, logging, monitoring
3. Suggest improvements that catch similar issues early
4. Keep suggestions practical and implementable
5. Order by impact (highest first)

### Output Format (JSON):
{
  "improvements": [
    "Add session integrity validation to detect corrupted data",
    "Implement circuit breaker for database operations",
    "Add structured logging for auth flow debugging"
  ]
}

Generate improvements now:`;
}

/**
 * Generate regression tests
 */
export function buildTestGenerationPrompt(
  context: StackTraceContext,
  rootCause: RootCause
): string {
  return `${SYSTEM_PROMPT}

## Task: Generate Regression Tests

Create comprehensive test cases that would have caught this bug.

### Root Cause:
${rootCause.description}

### Fix Applied:
${rootCause.fix.description}

### Instructions:
1. Generate 3-5 test cases covering:
   - The exact bug scenario
   - Edge cases
   - Concurrent/race conditions if applicable
   - Error handling paths
2. Use Jest/TypeScript syntax
3. Include setup, execution, and assertions
4. Add descriptive test names
5. Mock external dependencies

### Output Format (JSON):
{
  "tests": "// Full test file content as a string\\nimport { describe, it, expect } from 'jest';\\n..."
}

Generate tests now:`;
}

/**
 * Parse JSON response with error handling
 */
export function parseAIResponse<T>(response: string): T {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                     response.match(/```\n([\s\S]*?)\n```/);
    
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    return JSON.parse(jsonStr.trim());
  } catch (error) {
    throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate hypothesis response
 */
export function validateHypotheses(data: any): Hypothesis[] {
  if (!data.hypotheses || !Array.isArray(data.hypotheses)) {
    throw new Error('Invalid hypotheses format');
  }

  return data.hypotheses.map((h: any) => ({
    id: h.id || `h${Math.random().toString(36).substr(2, 9)}`,
    text: h.text || '',
    confidence: Math.max(0, Math.min(1, h.confidence || 0.5)),
    reasoning: h.reasoning || '',
  }));
}

/**
 * Validate elimination response
 */
export function validateEliminations(data: any): { eliminations: Elimination[]; remainingId: string } {
  if (!data.eliminations || !Array.isArray(data.eliminations)) {
    throw new Error('Invalid eliminations format');
  }

  return {
    eliminations: data.eliminations.map((e: any) => ({
      hypothesisId: e.hypothesisId || '',
      reason: e.reason || '',
      evidence: e.evidence || '',
    })),
    remainingId: data.remainingHypothesis || data.remainingId || '',
  };
}

/**
 * Validate root cause response
 */
export function validateRootCause(data: any): RootCause {
  if (!data.rootCause) {
    throw new Error('Invalid root cause format');
  }

  const rc = data.rootCause;
  return {
    description: rc.description || '',
    confidence: Math.max(0, Math.min(1, rc.confidence || 0.5)),
    evidence: Array.isArray(rc.evidence) ? rc.evidence : [],
    affectedFiles: Array.isArray(rc.affectedFiles) ? rc.affectedFiles : [],
    fix: {
      description: rc.fix?.description || '',
      diff: rc.fix?.diff || '',
      riskLevel: ['low', 'medium', 'high'].includes(rc.fix?.riskLevel) 
        ? rc.fix.riskLevel 
        : 'medium',
    },
  };
}

// Made with Bob
