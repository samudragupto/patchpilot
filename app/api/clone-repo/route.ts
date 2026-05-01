/**
 * /api/clone-repo — Clone GitHub repository endpoint
 * Clones a repository and returns file list
 */

import { NextResponse } from 'next/server';
import {
  parseGitHubUrl,
  cloneRepository,
  listRepoFiles,
  getRepoStats,
  checkGitAvailable,
} from '@/lib/github/repo-manager';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoUrl } = body;

    if (!repoUrl) {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    const repoInfo = parseGitHubUrl(repoUrl);
    if (!repoInfo) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL format' },
        { status: 400 }
      );
    }

    // Check if git is available
    const gitAvailable = await checkGitAvailable();
    if (!gitAvailable) {
      return NextResponse.json(
        { error: 'Git is not available on the server' },
        { status: 500 }
      );
    }

    // Clone repository
    const cloneResult = await cloneRepository(repoUrl);
    
    if (!cloneResult.success) {
      return NextResponse.json(
        { error: cloneResult.error || 'Failed to clone repository' },
        { status: 500 }
      );
    }

    // Get file list and stats
    const files = await listRepoFiles(cloneResult.localPath);
    const stats = await getRepoStats(cloneResult.localPath);

    return NextResponse.json({
      success: true,
      repoInfo,
      localPath: cloneResult.localPath,
      files: files.slice(0, 100), // Limit to first 100 files for response size
      stats,
      message: `Successfully cloned ${repoInfo.owner}/${repoInfo.name}`,
    });
  } catch (error) {
    console.error('Clone repository error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Made with Bob
