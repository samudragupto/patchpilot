/**
 * /api/investigate — Server-Sent Events (SSE) streaming endpoint
 * Streams typed investigation events: hypothesis, elimination, discovery, etc.
 * Now powered by IBM watsonx AI with fallback to mock data
 */

import { generateInvestigationSteps } from "@/lib/analyzer";
import { createInvestigationStream } from "@/lib/stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let input = "TypeError: Cannot read properties of undefined (reading 'refreshToken')";
  let useAI = true;

  try {
    const body = await request.json();
    if (body?.incident) input = body.incident;
    if (body?.useAI !== undefined) useAI = body.useAI;
  } catch {
    // Use defaults
  }

  // Check if AI credentials are available
  const hasAICredentials = !!(process.env.WATSONX_API_KEY && process.env.WATSONX_PROJECT_ID);
  
  // Generate investigation steps (async now)
  const steps = await generateInvestigationSteps(input, useAI && hasAICredentials);
  const stream = createInvestigationStream(steps);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-AI-Powered": hasAICredentials && useAI ? "true" : "false",
    },
  });
}
