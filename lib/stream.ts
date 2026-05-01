/**
 * SSE Stream Utility — v2
 * Supports enriched event types: hypothesis, elimination, discovery, confidence
 */

import { type InvestigationStep } from "./analyzer";

export function encodeSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

export function createInvestigationStream(
  steps: InvestigationStep[]
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let prevTimestamp = steps[0]?.timestamp ?? Date.now();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const delay = i === 0 ? 500 : Math.min(step.timestamp - prevTimestamp, 2500);
        prevTimestamp = step.timestamp;

        await new Promise((resolve) => setTimeout(resolve, delay));

        const payload = JSON.stringify({
          type: step.type,
          message: step.message,
          files: step.files,
          confidence: step.confidence,
          metadata: step.metadata,
          index: i,
          total: steps.length,
        });

        // Use the step type as the SSE event name for typed rendering
        controller.enqueue(encoder.encode(encodeSSE(step.type, payload)));
      }

      controller.enqueue(
        encoder.encode(encodeSSE("complete", JSON.stringify({ status: "complete" })))
      );
      controller.close();
    },
  });
}
