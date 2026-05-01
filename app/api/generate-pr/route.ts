/**
 * /api/generate-pr — PR Package Generation endpoint
 * Returns the complete PR package (root cause, diff, tests, risk, etc.)
 * Now powered by IBM watsonx AI with fallback to mock data
 * Supports GitHub PR simulation
 */

import { NextResponse } from "next/server";
import { generatePRPackage } from "@/lib/analyzer";
import { simulatePRCreation, parseGitHubUrl, cleanupRepository } from "@/lib/github/repo-manager";

export async function POST(request: Request) {
  let input = "TypeError: Cannot read properties of undefined (reading 'refreshToken')";
  let useAI = true;
  let repoUrl: string | undefined;
  let repoPath: string | undefined;

  try {
    const body = await request.json();
    if (body.incident) input = body.incident;
    if (body.useAI !== undefined) useAI = body.useAI;
    if (body.repoUrl) repoUrl = body.repoUrl;
    if (body.repoPath) repoPath = body.repoPath;
  } catch {
    // Use defaults
  }

  // Check if AI credentials are available
  const hasAICredentials = !!(process.env.WATSONX_API_KEY && process.env.WATSONX_PROJECT_ID);

  try {
    const prPackage = await generatePRPackage(input, useAI && hasAICredentials);
    
    // Simulate GitHub PR creation if repo URL provided
    let githubPR = null;
    if (repoUrl) {
      const repoInfo = parseGitHubUrl(repoUrl);
      if (repoInfo) {
        githubPR = simulatePRCreation(repoUrl, prPackage.title);
      }
    }
    
    // Cleanup cloned repo if path provided
    if (repoPath) {
      cleanupRepository(repoPath).catch(err =>
        console.warn('Failed to cleanup repo:', err)
      );
    }
    
    return NextResponse.json({
      ...prPackage,
      githubPR,
      meta: {
        aiPowered: hasAICredentials && useAI,
        timestamp: new Date().toISOString(),
        repoAnalyzed: !!repoUrl,
      },
    });
  } catch (error) {
    console.error('PR generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PR package' },
      { status: 500 }
    );
  }
}
