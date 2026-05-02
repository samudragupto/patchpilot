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
  evidence: string[];
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
 * System prompt for Antigravity AI Engine
 */
export const SYSTEM_PROMPT = `You are "Antigravity AI Engine", a deterministic backend reasoning system for PatchPilot.
Your job is to generate structured debugging outputs that are SAFE, CONSISTENT, and UI-READY.

🚨 CRITICAL RULES (HARD ENFORCED):
1. OUTPUT MUST BE VALID JSON ONLY (no markdown, no blocks, no extra text).
2. NEVER output: undefined, null, mixed types, or strings where arrays are expected.
3. ALL ARRAYS MUST ALWAYS BE ARRAYS (even if empty → []).
4. Evidence MUST ALWAYS be an array of strings.
5. NO PLACEHOLDERS: Never output "number", "string", "TBD", or type names as values.

🛡️ STABILITY RULES:
- If uncertain → use safe fallback values: title: "Unknown issue", evidence: [], confidence: 0.1.
- If remainingHypothesis is invalid → select highest confidence hypothesis ID.`;

/**
 * Robust JSON Extraction and Parsing
 * Designed to survive malformed/truncated AI responses in Docker environments
 */
export function safeParseAI<T>(response: string): T {
  console.log('--- RAW AI RESPONSE ---');
  console.log(response);

  try {
    // 1. Pre-cleaning (remove metadata headers that AI sometimes echoes)
    let cleaned = response
      .replace(/Original snippet:[\s\S]*?(?={)/gi, '')
      .replace(/RAW AI RESPONSE:[\s\S]*?(?={)/gi, '')
      .replace(/with the following (format|properties|structure):/gi, '')
      .trim();

    // 2. Extract the first valid-looking JSON object using regex
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON object found in response');
      return {} as T;
    }
    cleaned = jsonMatch[0];

    // 3. Cleanup specific LLM artifacts
    cleaned = cleaned
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/\.\.\./g, '') // Truncation dots
      .replace(/,\s*([}\]])/g, '$1') // Trailing commas
      // Handle placeholders like "id": number
      .replace(/:\s*number\b/g, ': 0.5')
      .replace(/:\s*string\b/g, ': ""')
      .replace(/:\s*\[\s*string\s*\]/g, ': []')
      .trim();

    console.log('--- CLEANED JSON ---');
    console.log(cleaned);

    const parsed = JSON.parse(cleaned);
    console.log('--- PARSE SUCCESS ---');
    return parsed as T;
  } catch (error) {
    console.error('--- PARSE FAILURE ---');
    console.error('Error:', error);
    // If it fails, try a manual fix for common bracket issues before giving up
    return {} as T;
  }
}

/**
 * Individual Sanitizers for Domain Objects
 */
export function sanitizeHypothesis(h: any, i: number = 0): Hypothesis {
  return {
    id: String(h?.id || `h${i + 1}`),
    title: String(h?.title || h?.text || 'Unknown issue'),
    confidence: typeof h?.confidence === 'number' ? Math.max(0, Math.min(1, h.confidence)) : 0.1,
    reasoning: String(h?.reasoning || 'No details provided'),
    evidence: Array.isArray(h?.evidence) ? h.evidence.map(String) : []
  };
}

export function sanitizeElimination(e: any): Elimination {
  return {
    hypothesisId: String(e?.hypothesisId || 'Unknown'),
    reason: String(e?.reason || 'Unknown'),
    evidence: Array.isArray(e?.evidence) ? e.evidence.map(String) : [String(e?.evidence || '')].filter(Boolean)
  };
}

export function sanitizeRootCause(rc: any): RootCause {
  const data = rc?.rootCause || rc || {};
  return {
    description: String(data.description || 'No root cause identified'),
    confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.5,
    evidence: Array.isArray(data.evidence) ? data.evidence.map(String) : [],
    affectedFiles: Array.isArray(data.affectedFiles) ? data.affectedFiles.map(String) : [],
    fix: {
      description: String(data.fix?.description || 'No fix suggested'),
      diff: String(data.fix?.diff || ''),
      riskLevel: ['low', 'medium', 'high'].includes(data.fix?.riskLevel) ? data.fix.riskLevel : 'medium'
    }
  };
}

/**
 * Global Normalization Entry Point
 */
export function normalizeAIResponse(data: any): any {
  const hypotheses = Array.isArray(data?.hypotheses) 
    ? data.hypotheses.map((h: any, i: number) => sanitizeHypothesis(h, i))
    : [];

  const eliminations = Array.isArray(data?.eliminations)
    ? data.eliminations.map((e: any) => sanitizeElimination(e))
    : [];

  let remainingId = data?.remainingHypothesis || data?.remainingId;
  if (remainingId) remainingId = String(remainingId);

  const finalHypothesis = hypotheses.find((h: Hypothesis) => h.id === remainingId) 
    || hypotheses.sort((a: Hypothesis, b: Hypothesis) => b.confidence - a.confidence)[0]
    || sanitizeHypothesis({ id: 'h1', title: 'Investigation in progress' });

  return {
    hypotheses,
    eliminations,
    finalHypothesis,
    rootCause: sanitizeRootCause(data),
    defensiveImprovements: Array.isArray(data?.defensiveImprovements) ? data.defensiveImprovements.map(String) : [],
    tests: String(data?.tests || '// No tests generated'),
    steps: Array.isArray(data?.steps) ? data.steps : []
  };
}

/**
 * Prompt Builders
 */
export function buildHypothesisPrompt(context: StackTraceContext): string {
  return `${SYSTEM_PROMPT}\n\nTASK: Generate Hypotheses for: ${context.error}\nFiles: ${context.files.join(', ')}\n\nReturn JSON { hypotheses: [...] }`;
}

export function buildEliminationPrompt(context: StackTraceContext, hypotheses: Hypothesis[]): string {
  return `${SYSTEM_PROMPT}\n\nTASK: Eliminate hypotheses based on: ${context.error}\n\nReturn JSON { eliminations: [...], remainingHypothesis: "ID" }`;
}

export function buildRootCausePrompt(context: StackTraceContext, hyp: Hypothesis): string {
  return `${SYSTEM_PROMPT}\n\nTASK: Analyze Root Cause for: ${hyp.title}\n\nReturn JSON { rootCause: { ... } }`;
}

export function buildDefensivePrompt(rc: RootCause): string {
  return `${SYSTEM_PROMPT}\n\nTASK: Suggest improvements for: ${rc.description}\n\nReturn JSON { improvements: [...] }`;
}

export function buildTestGenerationPrompt(context: StackTraceContext, rc: RootCause): string {
  return `${SYSTEM_PROMPT}\n\nTASK: Generate tests for fix: ${rc.fix.description}\n\nReturn JSON { tests: "string" }`;
}
