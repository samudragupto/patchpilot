/**
 * Graph Intelligence Engine
 * Parses graphify-out/graph.json and provides graph traversal,
 * neighbor lookup, and impact scoring for the investigation engine.
 */

export interface GraphNode {
  id: string;
  label: string;
  file_type: string;
  source_file: string;
  source_location: string;
  community: number;
  norm_label: string;
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

export interface CodeGraph {
  nodes: GraphNode[];
  links: GraphEdge[];
}

export interface AffectedFile {
  file: string;
  score: number;
  reason: string;
}

/**
 * Loads and parses the code graph from graphify-out/graph.json.
 * In a real deployment this would read from the filesystem;
 * here we use a curated graph that represents a realistic codebase.
 */
export function loadGraph(): CodeGraph {
  return {
    nodes: [
      { id: "auth_service", label: "auth.service.ts", file_type: "code", source_file: "src/services/auth.service.ts", source_location: "L1", community: 0, norm_label: "auth.service.ts" },
      { id: "user_controller", label: "user.controller.ts", file_type: "code", source_file: "src/controllers/user.controller.ts", source_location: "L1", community: 0, norm_label: "user.controller.ts" },
      { id: "token_util", label: "token.ts", file_type: "code", source_file: "src/utils/token.ts", source_location: "L1", community: 1, norm_label: "token.ts" },
      { id: "db_index", label: "index.ts", file_type: "code", source_file: "src/db/index.ts", source_location: "L1", community: 2, norm_label: "index.ts" },
      { id: "user_model", label: "user.model.ts", file_type: "code", source_file: "src/models/user.model.ts", source_location: "L1", community: 2, norm_label: "user.model.ts" },
      { id: "auth_middleware", label: "auth.middleware.ts", file_type: "code", source_file: "src/middlewares/auth.middleware.ts", source_location: "L1", community: 0, norm_label: "auth.middleware.ts" },
      { id: "session_service", label: "session.service.ts", file_type: "code", source_file: "src/services/session.service.ts", source_location: "L1", community: 0, norm_label: "session.service.ts" },
      { id: "config", label: "config.ts", file_type: "code", source_file: "src/config/config.ts", source_location: "L1", community: 3, norm_label: "config.ts" },
    ],
    links: [
      { source: "auth_service", target: "token_util", relation: "imports", confidence: "HIGH", confidence_score: 0.95, weight: 1.0, source_file: "src/services/auth.service.ts", source_location: "L3" },
      { source: "auth_service", target: "db_index", relation: "imports", confidence: "HIGH", confidence_score: 0.95, weight: 1.0, source_file: "src/services/auth.service.ts", source_location: "L4" },
      { source: "auth_service", target: "session_service", relation: "calls", confidence: "HIGH", confidence_score: 0.9, weight: 0.8, source_file: "src/services/auth.service.ts", source_location: "L45" },
      { source: "user_controller", target: "auth_service", relation: "imports", confidence: "HIGH", confidence_score: 0.95, weight: 1.0, source_file: "src/controllers/user.controller.ts", source_location: "L5" },
      { source: "user_controller", target: "user_model", relation: "imports", confidence: "HIGH", confidence_score: 0.9, weight: 1.0, source_file: "src/controllers/user.controller.ts", source_location: "L6" },
      { source: "auth_middleware", target: "auth_service", relation: "imports", confidence: "HIGH", confidence_score: 0.9, weight: 1.0, source_file: "src/middlewares/auth.middleware.ts", source_location: "L2" },
      { source: "auth_middleware", target: "token_util", relation: "imports", confidence: "MEDIUM", confidence_score: 0.75, weight: 0.7, source_file: "src/middlewares/auth.middleware.ts", source_location: "L3" },
      { source: "session_service", target: "db_index", relation: "imports", confidence: "HIGH", confidence_score: 0.92, weight: 1.0, source_file: "src/services/session.service.ts", source_location: "L2" },
      { source: "token_util", target: "config", relation: "imports", confidence: "MEDIUM", confidence_score: 0.8, weight: 0.6, source_file: "src/utils/token.ts", source_location: "L1" },
    ],
  };
}

/**
 * Get all direct neighbors (both directions) of a given node.
 */
export function getNeighbors(graph: CodeGraph, nodeId: string): GraphNode[] {
  const neighborIds = new Set<string>();

  for (const edge of graph.links) {
    if (edge.source === nodeId) neighborIds.add(edge.target);
    if (edge.target === nodeId) neighborIds.add(edge.source);
  }

  return graph.nodes.filter((n) => neighborIds.has(n.id));
}

/**
 * Rank all files by their impact score relative to a set of "root cause" node IDs.
 * Uses BFS-style propagation: direct connections get highest scores,
 * transitive connections get decayed scores.
 */
export function rankFilesByImpact(
  graph: CodeGraph,
  rootCauseIds: string[]
): AffectedFile[] {
  const scores = new Map<string, number>();
  const reasons = new Map<string, string>();

  // Root cause files get score = 1.0
  for (const id of rootCauseIds) {
    scores.set(id, 1.0);
    reasons.set(id, "Direct root cause — identified from stack trace");
  }

  // First-hop neighbors get decayed scores
  for (const rootId of rootCauseIds) {
    const neighbors = getNeighbors(graph, rootId);
    for (const neighbor of neighbors) {
      const edge = graph.links.find(
        (e) =>
          (e.source === rootId && e.target === neighbor.id) ||
          (e.target === rootId && e.source === neighbor.id)
      );
      const edgeWeight = edge?.confidence_score ?? 0.5;
      const score = 0.7 * edgeWeight;
      const existing = scores.get(neighbor.id) ?? 0;
      if (score > existing) {
        scores.set(neighbor.id, score);
        reasons.set(
          neighbor.id,
          `${edge?.relation ?? "connected"} dependency of root cause`
        );
      }
    }
  }

  // Second-hop neighbors
  for (const [nodeId, parentScore] of Array.from(scores.entries())) {
    if (rootCauseIds.includes(nodeId)) continue;
    const neighbors = getNeighbors(graph, nodeId);
    for (const neighbor of neighbors) {
      if (scores.has(neighbor.id)) continue;
      const score = parentScore * 0.4;
      if (score > 0.15) {
        scores.set(neighbor.id, score);
        reasons.set(neighbor.id, "Transitively connected via dependency graph");
      }
    }
  }

  // Convert to sorted array
  const result: AffectedFile[] = [];
  for (const [nodeId, score] of Array.from(scores.entries())) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) {
      result.push({
        file: node.source_file,
        score: Math.round(score * 100) / 100,
        reason: reasons.get(nodeId) ?? "Unknown",
      });
    }
  }

  return result.sort((a, b) => b.score - a.score);
}

/**
 * Find a node by matching its source_file or label against a search string.
 */
export function findNodeByFile(
  graph: CodeGraph,
  filePath: string
): GraphNode | undefined {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return graph.nodes.find(
    (n) =>
      n.source_file.replace(/\\/g, "/").toLowerCase().includes(normalized) ||
      n.label.toLowerCase().includes(normalized)
  );
}
