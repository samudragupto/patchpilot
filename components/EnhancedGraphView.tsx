'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, Info, Zap, AlertTriangle } from 'lucide-react';

interface GraphNode {
  id: string;
  label: string;
  source_file: string;
  isAffected?: boolean;
  impactScore?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence_score: number;
}

interface EnhancedGraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  affectedFiles?: string[];
  isAnimating?: boolean;
}

// Generate circular layout for nodes
function generateCircularLayout(nodes: GraphNode[], width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;
  
  return nodes.map((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

export function EnhancedGraphView({ nodes, edges, affectedFiles = [], isAnimating = false }: EnhancedGraphViewProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [revealedNodes, setRevealedNodes] = useState<Set<string>>(new Set());
  const [revealedEdges, setRevealedEdges] = useState<number>(0);

  const width = 800;
  const height = 600;

  // Generate layout
  const layoutNodes = useMemo(() => {
    return generateCircularLayout(nodes, width, height);
  }, [nodes]);

  // Animate node reveal
  useEffect(() => {
    if (!isAnimating) {
      setRevealedNodes(new Set(nodes.map(n => n.id)));
      setRevealedEdges(edges.length);
      return;
    }

    setRevealedNodes(new Set());
    setRevealedEdges(0);

    // Reveal affected nodes first
    const affectedNodeIds = nodes
      .filter(n => n.isAffected)
      .map(n => n.id);

    affectedNodeIds.forEach((id, i) => {
      setTimeout(() => {
        setRevealedNodes(prev => new Set([...Array.from(prev), id]));
      }, i * 300);
    });

    // Then reveal other nodes
    const otherNodeIds = nodes
      .filter(n => !n.isAffected)
      .map(n => n.id);

    otherNodeIds.forEach((id, i) => {
      setTimeout(() => {
        setRevealedNodes(prev => new Set([...Array.from(prev), id]));
      }, (affectedNodeIds.length * 300) + (i * 100));
    });

    // Reveal edges
    setTimeout(() => {
      const interval = setInterval(() => {
        setRevealedEdges(prev => {
          if (prev >= edges.length) {
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, 50);

      return () => clearInterval(interval);
    }, nodes.length * 150);
  }, [isAnimating, nodes, edges]);

  // Get connected nodes
  const getConnectedNodes = (nodeId: string): Set<string> => {
    const connected = new Set<string>();
    edges.forEach(edge => {
      if (edge.source === nodeId) connected.add(edge.target);
      if (edge.target === nodeId) connected.add(edge.source);
    });
    return connected;
  };

  const connectedToHovered = hoveredNode ? getConnectedNodes(hoveredNode) : new Set();
  const connectedToSelected = selectedNode ? getConnectedNodes(selectedNode) : new Set();

  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <GitBranch className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold">Dynamic Dependency Graph</span>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-[11px] text-white/30 font-mono">
          <span>{nodes.length} nodes</span>
          <span>•</span>
          <span>{edges.length} edges</span>
          <span>•</span>
          <span className="text-red-400">{nodes.filter(n => n.isAffected).length} affected</span>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="relative bg-black/20" style={{ width, height }}>
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <marker id="arrowhead-normal" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.15)" />
            </marker>
            <marker id="arrowhead-affected" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(239,68,68,0.6)" />
            </marker>
            <marker id="arrowhead-hover" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(139,92,246,0.8)" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.slice(0, revealedEdges).map((edge, i) => {
            const sourceNode = layoutNodes.find(n => n.id === edge.source);
            const targetNode = layoutNodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            const isAffectedEdge = sourceNode.isAffected || targetNode.isAffected;
            const isHovered = hoveredNode === edge.source || hoveredNode === edge.target;
            const isSelected = selectedNode === edge.source || selectedNode === edge.target;

            return (
              <motion.line
                key={`${edge.source}-${edge.target}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: i * 0.02 }}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke={
                  isSelected ? 'rgba(139,92,246,0.8)' :
                  isHovered ? 'rgba(139,92,246,0.5)' :
                  isAffectedEdge ? 'rgba(239,68,68,0.4)' :
                  'rgba(255,255,255,0.08)'
                }
                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : isAffectedEdge ? 1.5 : 1}
                markerEnd={
                  isSelected ? 'url(#arrowhead-hover)' :
                  isHovered ? 'url(#arrowhead-hover)' :
                  isAffectedEdge ? 'url(#arrowhead-affected)' :
                  'url(#arrowhead-normal)'
                }
                strokeDasharray={isAffectedEdge ? '4 2' : 'none'}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        <AnimatePresence>
          {layoutNodes.map((node) => {
            if (!revealedNodes.has(node.id)) return null;

            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNode === node.id;
            const isConnected = connectedToHovered.has(node.id) || connectedToSelected.has(node.id);
            const impactScore = node.impactScore || 0;

            return (
              <motion.div
                key={node.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="absolute cursor-pointer"
                style={{
                  left: node.x - 40,
                  top: node.y - 16,
                  zIndex: isHovered || isSelected ? 30 : isConnected ? 20 : 10,
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className={`
                    relative px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium
                    border transition-all duration-200
                    ${node.isAffected 
                      ? 'bg-red-500/20 border-red-500/40 text-red-300' 
                      : isConnected
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                      : 'bg-white/5 border-white/10 text-white/60'
                    }
                    ${isSelected ? 'ring-2 ring-violet-500/50' : ''}
                  `}
                  style={{
                    boxShadow: node.isAffected 
                      ? '0 0 20px rgba(239, 68, 68, 0.3)' 
                      : isConnected
                      ? '0 0 15px rgba(139, 92, 246, 0.3)'
                      : 'none',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {node.isAffected && (
                      <AlertTriangle className="w-3 h-3 animate-pulse" />
                    )}
                    {isConnected && !node.isAffected && (
                      <Zap className="w-3 h-3" />
                    )}
                    <span className="truncate max-w-[70px]">{node.label}</span>
                    {impactScore > 0 && (
                      <span className="text-[9px] opacity-60">
                        {Math.round(impactScore * 100)}%
                      </span>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Hover Tooltip */}
        <AnimatePresence>
          {hoveredNode && (() => {
            const node = layoutNodes.find(n => n.id === hoveredNode);
            if (!node) return null;

            const connected = Array.from(getConnectedNodes(hoveredNode));
            const connectedNodes = layoutNodes.filter(n => connected.includes(n.id));

            return (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute z-40 glass-strong rounded-lg px-3 py-2.5 max-w-[250px]"
                style={{
                  left: Math.min(node.x + 50, width - 260),
                  top: Math.max(node.y - 40, 10),
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Info className="w-3 h-3 text-blue-400" />
                  <span className="text-[11px] font-semibold text-white/80">{node.label}</span>
                </div>
                <p className="text-[10px] text-white/50 mb-2">{node.source_file}</p>
                {connectedNodes.length > 0 && (
                  <div className="text-[10px] text-white/40">
                    <span className="font-medium">Connected to:</span>
                    <div className="mt-1 space-y-0.5">
                      {connectedNodes.slice(0, 3).map(cn => (
                        <div key={cn.id}>• {cn.label}</div>
                      ))}
                      {connectedNodes.length > 3 && (
                        <div>• +{connectedNodes.length - 3} more</div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex gap-4 text-[10px] text-white/30">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            Affected
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            Connected
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
            Other
          </div>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
