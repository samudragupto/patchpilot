/**
 * /api/generate-graph — Generate dependency graph from cloned repository
 * Returns a simplified graph optimized for demo visualization
 */

import { NextResponse } from 'next/server';
import { generateGraphFromRepo, markAffectedNodes } from '@/lib/github/graph-generator';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoPath, affectedFiles, maxFiles = 50 } = body;

    if (!repoPath) {
      return NextResponse.json(
        { error: 'Repository path is required' },
        { status: 400 }
      );
    }

    // Generate graph from repository
    let graph = await generateGraphFromRepo(repoPath, maxFiles);

    // Mark affected nodes if provided
    if (affectedFiles && Array.isArray(affectedFiles) && affectedFiles.length > 0) {
      graph = markAffectedNodes(graph, affectedFiles);
    }

    return NextResponse.json({
      success: true,
      graph,
      message: `Generated graph with ${graph.nodes.length} nodes and ${graph.links.length} edges`,
    });
  } catch (error) {
    console.error('Graph generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate graph' },
      { status: 500 }
    );
  }
}

// Made with Bob
