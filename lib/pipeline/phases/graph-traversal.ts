/**
 * Phase 3: Graph Traversal
 * 
 * This phase analyzes the dependency graph to understand the impact radius of the bug
 * and identify all files that need to be examined or modified. It bridges AI reasoning
 * with fix generation by providing a comprehensive view of code dependencies.
 * 
 * Key responsibilities:
 * - Load or build dependency graph for the repository
 * - Traverse graph to find related files and dependencies
 * - Identify upstream dependencies (files that target files depend on)
 * - Identify downstream dependencies (files that depend on target files)
 * - Calculate impact radius (how many files could be affected)
 * - Determine critical paths in the dependency graph
 * - Identify test files related to affected code
 * - Provide prioritized list of files to examine and modify
 * 
 * @module pipeline/phases/graph-traversal
 */

import {
  PipelinePhase,
  PipelineContext,
  GraphTraversalOutput,
  AIReasoningOutput,
  ValidationResult,
  ValidationType,
  DependencyInfo,
  CallGraphNode,
} from '../types';
import {
  BasePhase,
  PhaseConfig,
  createPhaseConfig,
  ErrorHandlingStrategy,
} from '../core/phase-interface';
import { loadGraph, CodeGraph, GraphNode, GraphEdge, findNodeByFile, getNeighbors } from '../../graph';
import { generateGraphFromRepo, DynamicGraph, markAffectedNodes } from '../../github/graph-generator';
import * as path from 'path';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input data for the Graph Traversal phase
 */
export interface GraphTraversalInput {
  /** Files to examine from AI reasoning */
  readonly filesToExamine: string[];
  
  /** Root cause analysis from AI reasoning */
  readonly rootCause: AIReasoningOutput['rootCause'];
  
  /** Fix strategies from AI reasoning */
  readonly fixStrategies: any[];
  
  /** Repository path for graph generation */
  readonly repoPath: string;
  
  /** Repository metadata */
  readonly repoMetadata: any;
}

// ============================================================================
// Graph Traversal Types
// ============================================================================

/**
 * Dependency relationship between files
 */
export interface FileDependency {
  /** Source file path */
  readonly source: string;
  
  /** Target file path */
  readonly target: string;
  
  /** Relationship type (imports, calls, uses, etc.) */
  readonly relation: string;
  
  /** Confidence score (0-1) */
  readonly confidence: number;
  
  /** Dependency direction */
  readonly direction: 'upstream' | 'downstream';
}

/**
 * File with impact analysis
 */
export interface ImpactedFile {
  /** File path */
  readonly path: string;
  
  /** Impact score (0-1) */
  readonly impactScore: number;
  
  /** Reason for impact */
  readonly reason: string;
  
  /** Distance from root cause (hops) */
  readonly distance: number;
  
  /** Whether this is a direct dependency */
  readonly isDirect: boolean;
  
  /** Whether this is a test file */
  readonly isTest: boolean;
  
  /** Priority for examination (1-10) */
  readonly priority: number;
}

/**
 * Critical path in dependency graph
 */
export interface CriticalPath {
  /** Path identifier */
  readonly id: string;
  
  /** Files in the path (ordered) */
  readonly files: string[];
  
  /** Total path weight/importance */
  readonly weight: number;
  
  /** Path description */
  readonly description: string;
}

/**
 * Graph analysis statistics
 */
export interface GraphStatistics {
  /** Total nodes in graph */
  readonly totalNodes: number;
  
  /** Total edges in graph */
  readonly totalEdges: number;
  
  /** Number of communities/clusters */
  readonly communities: number;
  
  /** Average node degree */
  readonly avgDegree: number;
  
  /** Graph density */
  readonly density: number;
  
  /** Number of affected nodes */
  readonly affectedNodes: number;
}

/**
 * Enhanced Graph Traversal Output
 */
export interface EnhancedGraphTraversalOutput extends GraphTraversalOutput {
  /** All impacted files with analysis */
  readonly impactedFiles: string[];
  
  /** Detailed file impact analysis */
  readonly fileImpacts: ImpactedFile[];
  
  /** Dependency information */
  readonly dependencies: DependencyInfo[];
  
  /** File dependencies with relationships */
  readonly fileDependencies: FileDependency[];
  
  /** Call graph nodes */
  readonly callGraph: CallGraphNode[];
  
  /** Overall impact score (0-1) */
  readonly impactScore: number;
  
  /** Critical paths in the graph */
  readonly criticalPaths: CriticalPath[];
  
  /** Test files related to affected code */
  readonly testFiles: string[];
  
  /** Prioritized list of files to modify */
  readonly prioritizedFiles: string[];
  
  /** Graph statistics */
  readonly statistics: GraphStatistics;
  
  /** Upstream dependencies (files that affected files depend on) */
  readonly upstreamDependencies: string[];
  
  /** Downstream dependencies (files that depend on affected files) */
  readonly downstreamDependencies: string[];
}

// ============================================================================
// Graph Traversal Phase Implementation
// ============================================================================

/**
 * Graph Traversal Phase
 * 
 * Analyzes the dependency graph to understand impact radius and identify
 * all files that need examination or modification.
 * 
 * @example
 * ```typescript
 * const phase = new GraphTraversalPhase();
 * const result = await phase.execute(context);
 * 
 * if (result.success) {
 *   console.log('Impacted files:', result.data.impactedFiles);
 *   console.log('Impact score:', result.data.impactScore);
 *   console.log('Critical paths:', result.data.criticalPaths);
 * }
 * ```
 */
export class GraphTraversalPhase extends BasePhase<GraphTraversalInput, EnhancedGraphTraversalOutput> {
  private graph: CodeGraph | DynamicGraph | null = null;
  private memoryUsed: number = 0;
  private graphLoadTime: number = 0;
  private traversalTime: number = 0;
  
  /**
   * Create a new Graph Traversal phase instance
   * 
   * @param config - Optional phase configuration overrides
   */
  constructor(config?: Partial<PhaseConfig>) {
    super(
      PipelinePhase.GRAPH_TRAVERSAL,
      createPhaseConfig({
        name: 'graph-traversal',
        version: '1.0.0',
        timeout: 60000, // 1 minute for graph analysis
        cacheEnabled: true,
        cacheTTL: 3600, // 1 hour
        maxRetries: 2,
        retryDelay: 1000,
        optional: false,
        ...config,
      })
    );
  }
  
  /**
   * Extract input from pipeline context
   * 
   * @param context - Pipeline context
   * @returns Input data for this phase
   */
  protected extractInput(context: PipelineContext): GraphTraversalInput {
    const aiReasoning = context.phaseOutputs.aiReasoning;
    const inputAnalysis = context.phaseOutputs.inputAnalysis;
    
    if (!aiReasoning) {
      throw new Error('AI Reasoning output not found in context');
    }
    
    if (!inputAnalysis) {
      throw new Error('Input Analysis output not found in context');
    }
    
    // Extract files to examine from enhanced AI reasoning output
    const filesToExamine = (aiReasoning as any).filesToExamine ||
                          inputAnalysis.relevantFiles ||
                          [];
    
    return {
      filesToExamine,
      rootCause: aiReasoning.rootCause,
      fixStrategies: (aiReasoning as any).fixStrategies || [],
      repoPath: context.input.repoPath,
      repoMetadata: inputAnalysis.repoMetadata,
    };
  }
  
  /**
   * Validate input data
   * 
   * @param input - Input to validate
   * @returns Validation result
   */
  public async validate(input: GraphTraversalInput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate files to examine
    if (!input.filesToExamine || input.filesToExamine.length === 0) {
      warnings.push({
        field: 'filesToExamine',
        message: 'No files identified for examination, graph traversal may be limited',
      });
    }
    
    // Validate root cause
    if (!input.rootCause) {
      errors.push(this.createValidationError(
        'rootCause',
        ValidationType.REQUIRED_FIELD,
        'Root cause analysis is required'
      ));
    }
    
    // Validate repository path
    if (!input.repoPath) {
      errors.push(this.createValidationError(
        'repoPath',
        ValidationType.REQUIRED_FIELD,
        'Repository path is required for graph generation'
      ));
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Execute the graph traversal phase
   * 
   * @param input - Phase input
   * @param context - Pipeline context
   * @returns Phase output
   */
  protected async executePhase(
    input: GraphTraversalInput,
    context: PipelineContext
  ): Promise<EnhancedGraphTraversalOutput> {
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      // Step 1: Load or generate dependency graph
      const graphStartTime = Date.now();
      this.graph = await this.loadOrGenerateGraph(input);
      this.graphLoadTime = Date.now() - graphStartTime;
      
      // Step 2: Identify affected nodes from files to examine
      const affectedNodes = this.identifyAffectedNodes(this.graph, input.filesToExamine);
      
      // Step 3: Traverse graph to find dependencies
      const traversalStartTime = Date.now();
      const fileDependencies = this.traverseDependencies(this.graph, affectedNodes);
      this.traversalTime = Date.now() - traversalStartTime;
      
      // Step 4: Calculate impact scores for all files
      const fileImpacts = this.calculateImpactScores(this.graph, affectedNodes, fileDependencies);
      
      // Step 5: Identify upstream and downstream dependencies
      const upstreamDeps = this.identifyUpstreamDependencies(this.graph, affectedNodes);
      const downstreamDeps = this.identifyDownstreamDependencies(this.graph, affectedNodes);
      
      // Step 6: Find critical paths
      const criticalPaths = this.findCriticalPaths(this.graph, affectedNodes, fileDependencies);
      
      // Step 7: Identify test files
      const testFiles = this.identifyTestFiles(fileImpacts);
      
      // Step 8: Prioritize files for modification
      const prioritizedFiles = this.prioritizeFiles(fileImpacts, input);
      
      // Step 9: Build call graph
      const callGraph = this.buildCallGraph(this.graph, affectedNodes);
      
      // Step 10: Calculate overall impact score
      const impactScore = this.calculateOverallImpactScore(fileImpacts, criticalPaths);
      
      // Step 11: Generate statistics
      const statistics = this.generateStatistics(this.graph, affectedNodes);
      
      // Track resource usage
      this.memoryUsed = process.memoryUsage().heapUsed - startMemory;
      
      return {
        impactedFiles: fileImpacts.map(f => f.path),
        fileImpacts,
        dependencies: this.convertToDependencyInfo(fileDependencies),
        fileDependencies,
        callGraph,
        impactScore,
        criticalPaths,
        testFiles,
        prioritizedFiles,
        statistics,
        upstreamDependencies: upstreamDeps,
        downstreamDependencies: downstreamDeps,
      };
    } catch (error) {
      throw new Error(`Graph traversal failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate output data
   * 
   * @param output - Output to validate
   * @returns Validation result
   */
  public async validateOutput(output: EnhancedGraphTraversalOutput): Promise<ValidationResult> {
    const errors = [];
    const warnings = [];
    
    // Validate impacted files
    if (!output.impactedFiles || output.impactedFiles.length === 0) {
      warnings.push({
        field: 'impactedFiles',
        message: 'No impacted files identified, fix generation may be limited',
      });
    }
    
    // Validate impact score
    if (output.impactScore < 0 || output.impactScore > 1) {
      errors.push({
        field: 'impactScore',
        type: ValidationType.OUT_OF_RANGE,
        message: 'Impact score must be between 0 and 1',
        value: output.impactScore,
      });
    }
    
    // Validate file impacts
    if (!output.fileImpacts || output.fileImpacts.length === 0) {
      warnings.push({
        field: 'fileImpacts',
        message: 'No file impact analysis available',
      });
    }
    
    // Validate prioritized files
    if (!output.prioritizedFiles || output.prioritizedFiles.length === 0) {
      warnings.push({
        field: 'prioritizedFiles',
        message: 'No files prioritized for modification',
      });
    }
    
    // Check for high impact
    if (output.impactScore > 0.7) {
      warnings.push({
        field: 'impactScore',
        message: 'High impact score detected - changes may affect many files',
      });
    }
    
    return this.createValidationResult(errors.length === 0, errors, warnings.map(w => w.message));
  }
  
  /**
   * Handle errors with graph-specific retry logic
   */
  public async handleError(error: Error, context: PipelineContext): Promise<ErrorHandlingStrategy> {
    // Check for graph-specific errors
    if (error.message.includes('graph not found') || error.message.includes('no graph')) {
      // Try to generate graph dynamically
      return ErrorHandlingStrategy.RETRY;
    }
    
    if (error.message.includes('file not found') || error.message.includes('ENOENT')) {
      // Skip if files are missing
      return ErrorHandlingStrategy.SKIP;
    }
    
    // Use default error handling for other cases
    return super.handleError(error, context);
  }
  
  /**
   * Get resource usage for this phase
   */
  protected getResourceUsage() {
    return {
      cpuTime: this.graphLoadTime + this.traversalTime,
      memoryUsed: this.memoryUsed,
      apiCalls: 0,
      graphLoadTime: this.graphLoadTime,
      traversalTime: this.traversalTime,
    };
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Load existing graph or generate new one from repository
   */
  private async loadOrGenerateGraph(input: GraphTraversalInput): Promise<CodeGraph | DynamicGraph> {
    try {
      // Try to load pre-generated graph first
      const graph = loadGraph();
      console.log('Loaded pre-generated graph');
      return graph;
    } catch (error) {
      // Generate graph dynamically from repository
      console.log('Generating graph from repository...');
      const graph = await generateGraphFromRepo(input.repoPath, 100);
      
      // Mark affected nodes
      return markAffectedNodes(graph, input.filesToExamine);
    }
  }
  
  /**
   * Identify affected nodes in the graph
   */
  private identifyAffectedNodes(graph: CodeGraph | DynamicGraph, filesToExamine: string[]): GraphNode[] {
    const affectedNodes: GraphNode[] = [];
    
    for (const filePath of filesToExamine) {
      const node = findNodeByFile(graph, filePath);
      if (node) {
        affectedNodes.push(node);
      } else {
        // Try to find by filename only
        const filename = path.basename(filePath);
        const matchingNode = graph.nodes.find(n => 
          n.label.toLowerCase() === filename.toLowerCase() ||
          n.source_file.toLowerCase().includes(filename.toLowerCase())
        );
        if (matchingNode) {
          affectedNodes.push(matchingNode);
        }
      }
    }
    
    return affectedNodes;
  }
  
  /**
   * Traverse graph to find all dependencies
   */
  private traverseDependencies(
    graph: CodeGraph | DynamicGraph,
    affectedNodes: GraphNode[]
  ): FileDependency[] {
    const dependencies: FileDependency[] = [];
    const visited = new Set<string>();
    
    // BFS traversal from each affected node
    for (const node of affectedNodes) {
      const queue: Array<{ node: GraphNode; distance: number }> = [{ node, distance: 0 }];
      const localVisited = new Set<string>();
      
      while (queue.length > 0) {
        const { node: currentNode, distance } = queue.shift()!;
        
        if (localVisited.has(currentNode.id) || distance > 3) {
          continue;
        }
        
        localVisited.add(currentNode.id);
        
        // Find all edges connected to this node
        for (const edge of graph.links) {
          let targetNode: GraphNode | undefined;
          let direction: 'upstream' | 'downstream' | undefined;
          
          if (edge.source === currentNode.id) {
            targetNode = graph.nodes.find(n => n.id === edge.target);
            direction = 'downstream';
          } else if (edge.target === currentNode.id) {
            targetNode = graph.nodes.find(n => n.id === edge.source);
            direction = 'upstream';
          }
          
          if (targetNode && direction && !localVisited.has(targetNode.id)) {
            const depKey = `${currentNode.source_file}->${targetNode.source_file}`;
            
            if (!visited.has(depKey)) {
              dependencies.push({
                source: currentNode.source_file,
                target: targetNode.source_file,
                relation: edge.relation,
                confidence: edge.confidence_score,
                direction,
              });
              visited.add(depKey);
            }
            
            // Add to queue for further traversal
            if (distance < 2) {
              queue.push({ node: targetNode, distance: distance + 1 });
            }
          }
        }
      }
    }
    
    return dependencies;
  }
  
  /**
   * Calculate impact scores for all files
   */
  private calculateImpactScores(
    graph: CodeGraph | DynamicGraph,
    affectedNodes: GraphNode[],
    dependencies: FileDependency[]
  ): ImpactedFile[] {
    const impactMap = new Map<string, ImpactedFile>();
    
    // Root cause files get highest score
    for (const node of affectedNodes) {
      impactMap.set(node.source_file, {
        path: node.source_file,
        impactScore: 1.0,
        reason: 'Direct root cause - identified from AI reasoning',
        distance: 0,
        isDirect: true,
        isTest: this.isTestFile(node.source_file),
        priority: 10,
      });
    }
    
    // Calculate scores for dependencies
    for (const dep of dependencies) {
      // Update target file score
      const existing = impactMap.get(dep.target);
      const sourceScore = impactMap.get(dep.source)?.impactScore || 0.5;
      const newScore = sourceScore * dep.confidence * 0.7;
      
      if (!existing || newScore > existing.impactScore) {
        const distance = (impactMap.get(dep.source)?.distance || 0) + 1;
        impactMap.set(dep.target, {
          path: dep.target,
          impactScore: Math.round(newScore * 100) / 100,
          reason: `${dep.relation} dependency of affected file`,
          distance,
          isDirect: distance === 1,
          isTest: this.isTestFile(dep.target),
          priority: Math.max(1, 10 - distance * 2),
        });
      }
    }
    
    return Array.from(impactMap.values()).sort((a, b) => b.impactScore - a.impactScore);
  }
  
  /**
   * Identify upstream dependencies (files that affected files depend on)
   */
  private identifyUpstreamDependencies(
    graph: CodeGraph | DynamicGraph,
    affectedNodes: GraphNode[]
  ): string[] {
    const upstream = new Set<string>();
    
    for (const node of affectedNodes) {
      // Find all edges where this node is the source (it depends on target)
      for (const edge of graph.links) {
        if (edge.source === node.id) {
          const targetNode = graph.nodes.find(n => n.id === edge.target);
          if (targetNode) {
            upstream.add(targetNode.source_file);
          }
        }
      }
    }
    
    return Array.from(upstream);
  }
  
  /**
   * Identify downstream dependencies (files that depend on affected files)
   */
  private identifyDownstreamDependencies(
    graph: CodeGraph | DynamicGraph,
    affectedNodes: GraphNode[]
  ): string[] {
    const downstream = new Set<string>();
    
    for (const node of affectedNodes) {
      // Find all edges where this node is the target (source depends on it)
      for (const edge of graph.links) {
        if (edge.target === node.id) {
          const sourceNode = graph.nodes.find(n => n.id === edge.source);
          if (sourceNode) {
            downstream.add(sourceNode.source_file);
          }
        }
      }
    }
    
    return Array.from(downstream);
  }
  
  /**
   * Find critical paths in the dependency graph
   */
  private findCriticalPaths(
    graph: CodeGraph | DynamicGraph,
    affectedNodes: GraphNode[],
    dependencies: FileDependency[]
  ): CriticalPath[] {
    const paths: CriticalPath[] = [];
    
    // Find paths from affected nodes to high-impact dependencies
    for (let i = 0; i < affectedNodes.length; i++) {
      const startNode = affectedNodes[i];
      const path = this.findLongestPath(graph, startNode, dependencies, 5);
      
      if (path.length > 1) {
        paths.push({
          id: `path-${i + 1}`,
          files: path,
          weight: path.length * 0.8,
          description: `Critical dependency chain from ${path[0]} to ${path[path.length - 1]}`,
        });
      }
    }
    
    return paths.sort((a, b) => b.weight - a.weight).slice(0, 5);
  }
  
  /**
   * Find longest path from a node using DFS
   */
  private findLongestPath(
    graph: CodeGraph | DynamicGraph,
    startNode: GraphNode,
    dependencies: FileDependency[],
    maxDepth: number
  ): string[] {
    let longestPath: string[] = [startNode.source_file];
    
    const dfs = (currentFile: string, visited: Set<string>, path: string[], depth: number) => {
      if (depth >= maxDepth) {
        if (path.length > longestPath.length) {
          longestPath = [...path];
        }
        return;
      }
      
      const nextDeps = dependencies.filter(d => d.source === currentFile && !visited.has(d.target));
      
      if (nextDeps.length === 0) {
        if (path.length > longestPath.length) {
          longestPath = [...path];
        }
        return;
      }
      
      for (const dep of nextDeps) {
        visited.add(dep.target);
        path.push(dep.target);
        dfs(dep.target, visited, path, depth + 1);
        path.pop();
        visited.delete(dep.target);
      }
    };
    
    dfs(startNode.source_file, new Set([startNode.source_file]), [startNode.source_file], 0);
    return longestPath;
  }
  
  /**
   * Identify test files related to affected code
   */
  private identifyTestFiles(fileImpacts: ImpactedFile[]): string[] {
    return fileImpacts
      .filter(f => f.isTest)
      .map(f => f.path);
  }
  
  /**
   * Check if a file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.test\./i,
      /\.spec\./i,
      /_test\./i,
      /_spec\./i,
      /\/tests?\//i,
      /\/__tests__\//i,
      /\/spec\//i,
    ];
    
    return testPatterns.some(pattern => pattern.test(filePath));
  }
  
  /**
   * Prioritize files for modification
   */
  private prioritizeFiles(fileImpacts: ImpactedFile[], input: GraphTraversalInput): string[] {
    // Sort by priority (high to low), then by impact score
    const sorted = [...fileImpacts]
      .filter(f => !f.isTest) // Exclude test files from modification list
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return b.impactScore - a.impactScore;
      });
    
    return sorted.map(f => f.path);
  }
  
  /**
   * Build call graph from dependency information
   */
  private buildCallGraph(
    graph: CodeGraph | DynamicGraph,
    affectedNodes: GraphNode[]
  ): CallGraphNode[] {
    const callGraphNodes: CallGraphNode[] = [];
    
    for (const node of affectedNodes) {
      const callers: string[] = [];
      const callees: string[] = [];
      
      // Find callers (nodes that call this node)
      for (const edge of graph.links) {
        if (edge.target === node.id && edge.relation === 'calls') {
          const caller = graph.nodes.find(n => n.id === edge.source);
          if (caller) {
            callers.push(caller.source_file);
          }
        }
        if (edge.source === node.id && edge.relation === 'calls') {
          const callee = graph.nodes.find(n => n.id === edge.target);
          if (callee) {
            callees.push(callee.source_file);
          }
        }
      }
      
      callGraphNodes.push({
        id: node.id,
        file: node.source_file,
        function: node.label,
        callers,
        callees,
        depth: 0, // Will be calculated in a separate pass if needed
      });
    }
    
    return callGraphNodes;
  }
  
  /**
   * Calculate overall impact score
   */
  private calculateOverallImpactScore(
    fileImpacts: ImpactedFile[],
    criticalPaths: CriticalPath[]
  ): number {
    if (fileImpacts.length === 0) {
      return 0;
    }
    
    // Average of top 5 file impact scores
    const topScores = fileImpacts.slice(0, 5).map(f => f.impactScore);
    const avgTopScore = topScores.reduce((sum, s) => sum + s, 0) / topScores.length;
    
    // Factor in number of critical paths
    const pathFactor = Math.min(1, criticalPaths.length / 3);
    
    // Factor in total number of impacted files
    const volumeFactor = Math.min(1, fileImpacts.length / 20);
    
    // Weighted combination
    const score = avgTopScore * 0.5 + pathFactor * 0.3 + volumeFactor * 0.2;
    
    return Math.round(score * 100) / 100;
  }
  
  /**
   * Generate graph statistics
   */
  private generateStatistics(
    graph: CodeGraph | DynamicGraph,
    affectedNodes: GraphNode[]
  ): GraphStatistics {
    const totalNodes = graph.nodes.length;
    const totalEdges = graph.links.length;
    
    // Calculate average degree
    const degrees = new Map<string, number>();
    for (const edge of graph.links) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    }
    const avgDegree = Array.from(degrees.values()).reduce((sum, d) => sum + d, 0) / totalNodes;
    
    // Calculate density
    const maxEdges = totalNodes * (totalNodes - 1);
    const density = maxEdges > 0 ? totalEdges / maxEdges : 0;
    
    // Count communities
    const communities = new Set(graph.nodes.map(n => n.community)).size;
    
    return {
      totalNodes,
      totalEdges,
      communities,
      avgDegree: Math.round(avgDegree * 100) / 100,
      density: Math.round(density * 1000) / 1000,
      affectedNodes: affectedNodes.length,
    };
  }
  
  /**
   * Convert file dependencies to DependencyInfo format
   */
  private convertToDependencyInfo(fileDependencies: FileDependency[]): DependencyInfo[] {
    const depMap = new Map<string, DependencyInfo>();
    
    for (const dep of fileDependencies) {
      const name = path.basename(dep.target);
      if (!depMap.has(name)) {
        depMap.set(name, {
          name,
          version: 'unknown',
          type: dep.direction === 'upstream' ? 'direct' : 'transitive',
          vulnerable: false,
        });
      }
    }
    
    return Array.from(depMap.values());
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Graph Traversal phase instance
 * 
 * @param config - Optional phase configuration
 * @returns Graph Traversal phase instance
 */
export function createGraphTraversalPhase(config?: Partial<PhaseConfig>): GraphTraversalPhase {
  return new GraphTraversalPhase(config);
}

// Made with Bob