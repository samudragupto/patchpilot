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
  title: string;
  confidence: number;
  reasoning: string;
  evidence: string[];
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
export const SYSTEM_PROMPT = `You are "Antigravity AI Engine", a deterministic backend reasoning system for PatchPilot.
Your job is to generate structured debugging outputs that are SAFE, CONSISTENT, and UI-READY.

🚨 CRITICAL RULES (HARD ENFORCED):
1. OUTPUT MUST BE VALID JSON ONLY (no markdown, no blocks, no extra text).
2. NEVER output: undefined, null, mixed types, or strings where arrays are expected.
3. ALL ARRAYS MUST ALWAYS BE ARRAYS (even if empty → []).
4. ALL STRINGS MUST ALWAYS BE NON-EMPTY (if missing → "Unknown").
5. Evidence MUST ALWAYS be an array of strings.

🧠 SCHEMA CONTRACTS:
- Hypothesis: { "hypotheses": [{ "id": "h1", "title": "string", "confidence": number, "reasoning": "string", "evidence": ["string"] }] }
- Elimination: { "eliminations": [{ "hypothesisId": "h1", "reason": "string", "evidence": ["string"] }], "remainingHypothesis": "h1" }
- RootCause: { "description": "string", "confidence": number, "evidence": ["string"], "affectedFiles": ["string"] }

🛡️ STABILITY RULES:
- If uncertain → use safe fallback values: title: "Unknown issue", evidence: [], confidence: 0.1.
- If remainingHypothesis is invalid → select highest confidence hypothesis ID.

Failure to follow these rules will break the production system.`;

/**
 * Generate hypotheses from stack trace
 */
export function buildHypothesisPrompt(context: StackTraceContext): string {
  return `${SYSTEM_PROMPT}

TASK: Generate Hypotheses for the following incident.

INCIDENT DETAILS:
Error: ${context.error}
Stack Trace: ${context.stackTrace}
Affected Files: ${context.files.join(', ')}

REQUIRED OUTPUT SCHEMA:
{
  "hypotheses": [
    {
      "id": "h1",
      "title": "string",
      "confidence": number,
      "reasoning": "string",
      "evidence": ["string"]
    }
  ]
}

Analyze the incident and return ONLY the JSON object.`;
}

/**
 * Eliminate hypotheses with evidence
 */
export function buildEliminationPrompt(
  context: StackTraceContext,
  hypotheses: Hypothesis[]
): string {
  return `${SYSTEM_PROMPT}

TASK: Eliminate Incorrect Hypotheses based on evidence.

INCIDENT DETAILS:
Error: ${context.error}
Stack Trace: ${context.stackTrace}

HYPOTHESES TO EVALUATE:
${hypotheses.map((h, i) => `
ID: h${i + 1}
Title: ${h.title}
Reasoning: ${h.reasoning}
`).join('\n')}

REQUIRED OUTPUT SCHEMA:
{
  "eliminations": [
    {
      "hypothesisId": "string",
      "reason": "string",
      "evidence": "string"
    }
  ],
  "remainingHypothesis": "string"
}

Eliminate hypotheses and return ONLY the JSON object.`;
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

TASK: Root Cause Analysis & Fix Generation.

INCIDENT DETAILS:
Error: ${context.error}
Stack Trace: ${context.stackTrace}

CONFIRMED HYPOTHESIS:
${finalHypothesis.title}
Reasoning: ${finalHypothesis.reasoning}

${codeSnippet ? `CODE CONTEXT:\n${codeSnippet}` : ''}

REQUIRED OUTPUT SCHEMA:
{
  "rootCause": {
    "description": "string",
    "confidence": number,
    "evidence": ["string"],
    "affectedFiles": ["string"],
    "fix": {
      "description": "string",
      "diff": "string",
      "riskLevel": "low | medium | high"
    }
  }
}

Analyze and return ONLY the JSON object.`;
}

/**
 * Generate defensive improvements
 */
export function buildDefensivePrompt(rootCause: RootCause): string {
  return `${SYSTEM_PROMPT}

TASK: Suggest Defensive Improvements.

ROOT CAUSE: ${rootCause.description}
FIX: ${rootCause.fix.description}

REQUIRED OUTPUT SCHEMA:
{
  "improvements": ["string"]
}

Return ONLY the JSON array within the specified schema.`;
}

/**
 * Generate regression tests
 */
export function buildTestGenerationPrompt(
  context: StackTraceContext,
  rootCause: RootCause
): string {
  return `${SYSTEM_PROMPT}

TASK: Generate Regression Tests.

ROOT CAUSE: ${rootCause.description}
FIX: ${rootCause.fix.description}

REQUIRED OUTPUT SCHEMA:
{
  "tests": "string"
}

Return ONLY the JSON object.`;
}

/**
 * Parse JSON response with robust error handling
 * Isolates the first valid JSON object or array
 */
export function parseAIResponse<T>(response: string): T {
  try {
    // 1. Clean response (remove potential markdown wrappers)
    let cleaned = response.trim();
    
    // 2. Extract the first complete JSON structure by balancing braces/brackets
    let result = '';
    let braceStack = 0;
    let bracketStack = 0;
    let inString = false;
    let escaped = false;
    let startIndex = -1;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        if (startIndex === -1) startIndex = i;
        braceStack++;
      } else if (char === '}') {
        braceStack--;
      } else if (char === '[') {
        if (startIndex === -1) startIndex = i;
        bracketStack++;
      } else if (char === ']') {
        bracketStack--;
      }

      // If we found a start and now stacks are balanced, we have our JSON
      if (startIndex !== -1 && braceStack === 0 && bracketStack === 0) {
        result = cleaned.substring(startIndex, i + 1);
        break;
      }
    }

    if (!result) {
      // Fallback to old method if balancing failed (e.g. no braces at all)
      result = cleaned;
    }

    // 3. Fix common JSON issues (trailing commas)
    result = result.replace(/,\s*([}\]])/g, '$1');

    return JSON.parse(result);
  } catch (error) {
    console.error('JSON Parse Error. Original response:', response);
    throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate hypothesis response
 */
export function validateHypotheses(data: any): Hypothesis[] {
  return (data.hypotheses || []).map((h: any, i: number) => ({
    id: h.id || `h${i + 1}`,
    title: h.title || h.text || 'Unknown issue',
    confidence: typeof h.confidence === 'number' ? Math.max(0, Math.min(1, h.confidence)) : 0.1,
    reasoning: h.reasoning || 'Unknown',
    evidence: Array.isArray(h.evidence) ? h.evidence : (typeof h.evidence === 'string' ? [h.evidence] : []),
  }));
}

/**
 * Validate elimination response
 */
export function validateEliminations(data: any, originalHypotheses: Hypothesis[]): { eliminations: Elimination[]; remainingId: string } {
  const elims = Array.isArray(data.eliminations) ? data.eliminations : [];

  const validatedElims = elims.map((e: any) => ({
    hypothesisId: e.hypothesisId || 'Unknown',
    reason: e.reason || 'Unknown',
    evidence: Array.isArray(e.evidence) ? e.evidence : (typeof e.evidence === 'string' ? [e.evidence] : []),
  }));

  // Find remaining ID or fallback to highest confidence
  let remainingId = data.remainingHypothesis || data.remainingId;
  const exists = originalHypotheses.some(h => h.id === remainingId);
  
  if (!exists && originalHypotheses.length > 0) {
    const sorted = [...originalHypotheses].sort((a, b) => b.confidence - a.confidence);
    remainingId = sorted[0].id;
  }

  return {
    eliminations: validatedElims,
    remainingId: remainingId || 'Unknown',
  };
}

/**
 * Validate root cause response
 */
export function validateRootCause(data: any): RootCause {
  const rc = data.rootCause || {};
  return {
    description: rc.description || '',
    confidence: Math.max(0, Math.min(1, typeof rc.confidence === 'number' ? rc.confidence : 0.5)),
    evidence: Array.isArray(rc.evidence) ? rc.evidence : (typeof rc.evidence === 'string' ? [rc.evidence] : []),
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
