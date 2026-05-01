/**
 * GitHub Repository Manager
 * Handles cloning, file reading, and PR simulation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface RepoInfo {
  owner: string;
  name: string;
  url: string;
  branch: string;
}

export interface CloneResult {
  success: boolean;
  localPath: string;
  error?: string;
}

export interface FileContent {
  path: string;
  content: string;
  lines: number;
}

/**
 * Parse GitHub URL into components
 */
export function parseGitHubUrl(url: string): RepoInfo | null {
  // Support formats:
  // - https://github.com/owner/repo
  // - https://github.com/owner/repo.git
  // - git@github.com:owner/repo.git
  
  const httpsPattern = /github\.com\/([^\/]+)\/([^\/\.]+)(\.git)?/;
  const sshPattern = /git@github\.com:([^\/]+)\/([^\/\.]+)(\.git)?/;
  
  let match = url.match(httpsPattern) || url.match(sshPattern);
  
  if (!match) return null;
  
  return {
    owner: match[1],
    name: match[2],
    url: `https://github.com/${match[1]}/${match[2]}.git`,
    branch: 'main', // Default, can be overridden
  };
}

/**
 * Clone repository to temporary directory
 */
export async function cloneRepository(repoUrl: string): Promise<CloneResult> {
  const repoInfo = parseGitHubUrl(repoUrl);
  
  if (!repoInfo) {
    return {
      success: false,
      localPath: '',
      error: 'Invalid GitHub URL format',
    };
  }
  
  // Create temp directory for clones
  const tempDir = path.join(process.cwd(), '.temp-repos');
  const repoDir = path.join(tempDir, `${repoInfo.owner}-${repoInfo.name}-${Date.now()}`);
  
  try {
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });
    
    // Clone repository (shallow clone for speed)
    const cloneCommand = `git clone --depth 1 --branch ${repoInfo.branch} ${repoInfo.url} "${repoDir}"`;
    
    await execAsync(cloneCommand, {
      timeout: 60000, // 60 second timeout
    });
    
    return {
      success: true,
      localPath: repoDir,
    };
  } catch (error) {
    // Try with 'master' branch if 'main' fails
    if (repoInfo.branch === 'main') {
      try {
        const cloneCommand = `git clone --depth 1 --branch master ${repoInfo.url} "${repoDir}"`;
        await execAsync(cloneCommand, { timeout: 60000 });
        
        return {
          success: true,
          localPath: repoDir,
        };
      } catch {
        // Fall through to error handling
      }
    }
    
    return {
      success: false,
      localPath: '',
      error: error instanceof Error ? error.message : 'Clone failed',
    };
  }
}

/**
 * Read file from cloned repository
 */
export async function readRepoFile(repoPath: string, filePath: string): Promise<FileContent | null> {
  try {
    const fullPath = path.join(repoPath, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n').length;
    
    return {
      path: filePath,
      content,
      lines,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Read multiple files from repository
 */
export async function readRepoFiles(repoPath: string, filePaths: string[]): Promise<FileContent[]> {
  const results = await Promise.all(
    filePaths.map(filePath => readRepoFile(repoPath, filePath))
  );
  
  return results.filter((r): r is FileContent => r !== null);
}

/**
 * List all files in repository (with filters)
 */
export async function listRepoFiles(
  repoPath: string,
  extensions: string[] = ['.ts', '.tsx', '.js', '.jsx']
): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(repoPath, fullPath);
      
      // Skip common directories
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
          await walk(fullPath);
        }
      } else {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(relativePath);
        }
      }
    }
  }
  
  await walk(repoPath);
  return files;
}

/**
 * Clean up cloned repository
 */
export async function cleanupRepository(repoPath: string): Promise<void> {
  try {
    await fs.rm(repoPath, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to cleanup repository:', error);
  }
}

/**
 * Generate PR URL (simulated)
 */
export function generatePRUrl(repoInfo: RepoInfo, branchName: string): string {
  return `https://github.com/${repoInfo.owner}/${repoInfo.name}/pull/new/${branchName}`;
}

/**
 * Simulate PR creation (returns formatted data)
 */
export interface SimulatedPR {
  number: number;
  url: string;
  title: string;
  branch: string;
  base: string;
  state: 'open';
  created_at: string;
}

export function simulatePRCreation(
  repoUrl: string,
  title: string,
  branchName: string = `fix/patchpilot-${Date.now()}`
): SimulatedPR {
  const repoInfo = parseGitHubUrl(repoUrl);
  
  if (!repoInfo) {
    throw new Error('Invalid repository URL');
  }
  
  const prNumber = Math.floor(Math.random() * 1000) + 1;
  
  return {
    number: prNumber,
    url: `https://github.com/${repoInfo.owner}/${repoInfo.name}/pull/${prNumber}`,
    title,
    branch: branchName,
    base: repoInfo.branch,
    state: 'open',
    created_at: new Date().toISOString(),
  };
}

/**
 * Check if git is available
 */
export async function checkGitAvailable(): Promise<boolean> {
  try {
    await execAsync('git --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get repository statistics
 */
export async function getRepoStats(repoPath: string): Promise<{
  totalFiles: number;
  codeFiles: number;
  totalLines: number;
}> {
  const codeFiles = await listRepoFiles(repoPath);
  const allFiles = await listRepoFiles(repoPath, ['*']);
  
  let totalLines = 0;
  for (const file of codeFiles) {
    const content = await readRepoFile(repoPath, file);
    if (content) {
      totalLines += content.lines;
    }
  }
  
  return {
    totalFiles: allFiles.length,
    codeFiles: codeFiles.length,
    totalLines,
  };
}

// Made with Bob
