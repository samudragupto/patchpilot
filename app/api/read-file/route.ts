/**
 * /api/read-file — Read file from cloned repository
 * Returns file content for analysis
 */

import { NextResponse } from 'next/server';
import { readRepoFile, readRepoFiles } from '@/lib/github/repo-manager';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoPath, filePath, filePaths } = body;

    if (!repoPath) {
      return NextResponse.json(
        { error: 'Repository path is required' },
        { status: 400 }
      );
    }

    // Handle multiple files
    if (filePaths && Array.isArray(filePaths)) {
      const files = await readRepoFiles(repoPath, filePaths);
      return NextResponse.json({
        success: true,
        files,
        count: files.length,
      });
    }

    // Handle single file
    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    const fileContent = await readRepoFile(repoPath, filePath);
    
    if (!fileContent) {
      return NextResponse.json(
        { error: 'File not found or cannot be read' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      file: fileContent,
    });
  } catch (error) {
    console.error('Read file error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Made with Bob
