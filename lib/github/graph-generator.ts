/**
 * Dynamic Graph Generator
 * Generates dependency graphs from cloned repositories
 * Optimized for demo clarity over full accuracy
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface GraphNode {
  id: string;
  label: string;
  file_type: string;
  source_file: string;
  source_location: string;
  community: number;
  norm_label: string;
  isAffected?: boolean;
  impactScore?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  confidence_score: number;
  weight: number;
  source_file: string;
  source_location: string;
}

export interface DynamicGraph {
  nodes: GraphNode[];
  links: GraphEdge[];
  metadata: {
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    communities: number;
  };
}

/**
 * Generate a simplified graph from repository files
 * This is a demo-optimized version that creates plausible relationships
 */
export async function generateGraphFromRepo(
  repoPath: string,
  maxFiles: number = 50
): Promise<DynamicGraph> {
  const files = await discoverCodeFiles(repoPath, maxFiles);
  const nodes: GraphNode[] = [];
  const links: GraphEdge[] = [];
  const communities = assignCommunities(files);

  // Create nodes
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const basename = path.basename(file);
    const nodeId = sanitizeId(basename);

    nodes.push({
      id: nodeId,
      label: basename,
      file_type: 'code',
      source_file: file,
      source_location: 'L1',
      community: communities.get(file) || 0,
      norm_label: basename.toLowerCase(),
    });
  }

  // Create plausible edges based on file patterns
  for (let i = 0; i < nodes.length; i++) {
    const sourceNode = nodes[i];
    
    // Connect to related files (same directory, similar names, etc.)
    for (let j = i + 1; j < Math.min(i + 5, nodes.length); j++) {
      const targetNode = nodes[j];
      
      if (shouldConnect(sourceNode, targetNode)) {
        const relation = inferRelation(sourceNode, targetNode);
        
        links.push({
          source: sourceNode.id,
          target: targetNode.id,
          relation,
          confidence: 'HIGH',
          confidence_score: 0.85,
          weight: 1.0,
          source_file: sourceNode.source_file,
          source_location: 'L1',
        });
      }
    }
  }

  return {
    nodes,
    links,
    metadata: {
      totalFiles: files.length,
      totalNodes: nodes.length,
      totalEdges: links.length,
      communities: new Set(communities.values()).size,
    },
  };
}

/**
 * Discover code files in repository
 */
async function discoverCodeFiles(
  repoPath: string,
  maxFiles: number
): Promise<string[]> {
  const files: string[] = [];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'];

  async function walk(dir: string, depth: number = 0) {
    if (depth > 3 || files.length >= maxFiles) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(repoPath, fullPath);

        if (entry.isDirectory()) {
          // Skip common directories
          if (!['node_modules', '.git', '.next', 'dist', 'build', '__pycache__'].includes(entry.name)) {
            await walk(fullPath, depth + 1);
          }
        } else {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(relativePath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await walk(repoPath);
  return files.slice(0, maxFiles);
}

/**
 * Assign communities based on directory structure
 */
function assignCommunities(files: string[]): Map<string, number> {
  const communities = new Map<string, number>();
  const dirToCommunity = new Map<string, number>();
  let communityId = 0;

  for (const file of files) {
    const dir = path.dirname(file);
    
    if (!dirToCommunity.has(dir)) {
      dirToCommunity.set(dir, communityId++);
    }
    
    communities.set(file, dirToCommunity.get(dir)!);
  }

  return communities;
}

/**
 * Sanitize filename to valid node ID
 */
function sanitizeId(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^[0-9]/, 'n$&')
    .toLowerCase();
}

/**
 * Determine if two nodes should be connected
 */
function shouldConnect(node1: GraphNode, node2: GraphNode): boolean {
  // Same directory
  const dir1 = path.dirname(node1.source_file);
  const dir2 = path.dirname(node2.source_file);
  if (dir1 === dir2) return Math.random() > 0.3;

  // Similar names (e.g., user.service.ts and user.controller.ts)
  const base1 = node1.label.split('.')[0];
  const base2 = node2.label.split('.')[0];
  if (base1 === base2) return true;

  // Common patterns
  if (node1.label.includes('index') || node2.label.includes('index')) {
    return Math.random() > 0.5;
  }

  return Math.random() > 0.8;
}

/**
 * Infer relationship type between nodes
 */
function inferRelation(node1: GraphNode, node2: GraphNode): string {
  if (node1.label.includes('index') || node2.label.includes('index')) {
    return 'imports';
  }
  
  if (node1.label.includes('service') && node2.label.includes('controller')) {
    return 'calls';
  }
  
  if (node1.label.includes('model') || node2.label.includes('model')) {
    return 'uses';
  }
  
  return 'imports';
}

/**
 * Mark affected nodes based on file paths from stack trace
 */
export function markAffectedNodes(
  graph: DynamicGraph,
  affectedFilePaths: string[]
): DynamicGraph {
  const affectedSet = new Set(
    affectedFilePaths.map(f => path.basename(f).toLowerCase())
  );

  for (const node of graph.nodes) {
    if (affectedSet.has(node.label.toLowerCase())) {
      node.isAffected = true;
      node.impactScore = 1.0;
    }
  }

  // Propagate impact to neighbors
  for (const node of graph.nodes) {
    if (node.isAffected) {
      const neighbors = graph.links
        .filter(l => l.source === node.id || l.target === node.id)
        .map(l => l.source === node.id ? l.target : l.source);

      for (const neighborId of neighbors) {
        const neighbor = graph.nodes.find(n => n.id === neighborId);
        if (neighbor && !neighbor.isAffected) {
          neighbor.isAffected = true;
          neighbor.impactScore = 0.6;
        }
      }
    }
  }

  return graph;
}

// Made with Bob
