/**
 * /api/investigate — Server-Sent Events (SSE) streaming endpoint
 * Streams typed investigation events: hypothesis, elimination, discovery, etc.
 */

import { generateInvestigationSteps } from "@/lib/analyzer";
import { createInvestigationStream } from "@/lib/stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let input = "TypeError: Cannot read properties of undefined (reading 'refreshToken')";

  try {
    const body = await request.json();
    if (body?.incident) input = body.incident;
  } catch {
    // Use default
  }

  const steps = generateInvestigationSteps(input);
  const stream = createInvestigationStream(steps);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
