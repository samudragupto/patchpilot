/**
 * /api/generate-pr — PR Package Generation endpoint
 * Returns the complete PR package (root cause, diff, tests, risk, etc.)
 */

import { NextResponse } from "next/server";
import { generatePRPackage } from "@/lib/analyzer";

export async function POST(request: Request) {
  let input = "TypeError: Cannot read properties of undefined (reading 'refreshToken')";

  try {
    const body = await request.json();
    if (body.incident) input = body.incident;
  } catch {
    // Use default input
  }

  const prPackage = generatePRPackage(input);
  return NextResponse.json(prPackage);
}
