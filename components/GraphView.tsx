'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, Info } from 'lucide-react';

interface GraphNode {
  id: string;
  label: string;
  file: string;
  x: number;
  y: number;
  score: number;
  isRootCause: boolean;
  reason: string;
}

interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

interface GraphViewProps {
  affectedFiles: { file: string; score: number; reason: string }[];
  traversalPath?: string[];
  isAnimating?: boolean;
}

const NODE_LAYOUT: Record<string, { x: number; y: number }> = {
  'auth.service.ts':     { x: 400, y: 80 },
  'user.controller.ts':  { x: 150, y: 200 },
  'auth.middleware.ts':  { x: 650, y: 200 },
  'token.ts':            { x: 250, y: 340 },
  'session.service.ts':  { x: 550, y: 340 },
  'index.ts':            { x: 400, y: 440 },
  'user.model.ts':       { x: 100, y: 440 },
  'config.ts':           { x: 250, y: 530 },
};

const EDGES: GraphEdge[] = [
  { from: 'auth.service.ts', to: 'token.ts', relation: 'imports' },
  { from: 'auth.service.ts', to: 'index.ts', relation: 'imports' },
  { from: 'auth.service.ts', to: 'session.service.ts', relation: 'calls' },
  { from: 'user.controller.ts', to: 'auth.service.ts', relation: 'imports' },
  { from: 'user.controller.ts', to: 'user.model.ts', relation: 'imports' },
  { from: 'auth.middleware.ts', to: 'auth.service.ts', relation: 'imports' },
  { from: 'auth.middleware.ts', to: 'token.ts', relation: 'imports' },
  { from: 'session.service.ts', to: 'index.ts', relation: 'imports' },
  { from: 'token.ts', to: 'config.ts', relation: 'imports' },
];

function getNodeColor(score: number, isRootCause: boolean): string {
  if (isRootCause) return '#ef4444';
  if (score >= 0.7) return '#f97316';
  if (score >= 0.4) return '#eab308';
  return '#6b7280';
}

function getNodeGlow(score: number, isRootCause: boolean): string {
  if (isRootCause) return '0 0 20px rgba(239, 68, 68, 0.4), 0 0 40px rgba(239, 68, 68, 0.15)';
  if (score >= 0.7) return '0 0 15px rgba(249, 115, 22, 0.3)';
  if (score >= 0.4) return '0 0 10px rgba(234, 179, 8, 0.2)';
  return 'none';
}

export function GraphView({ affectedFiles, traversalPath = [], isAnimating = false }: GraphViewProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [revealedEdges, setRevealedEdges] = useState<number>(0);
  const [revealedNodes, setRevealedNodes] = useState<Set<string>>(new Set());

  const nodes: GraphNode[] = useMemo(() => {
    return Object.entries(NODE_LAYOUT).map(([label, pos]) => {
      const affected = affectedFiles.find(f => f.file.includes(label) || f.file.endsWith(label));
      return {
        id: label,
        label,
        file: affected?.file ?? label,
        x: pos.x,
        y: pos.y,
        score: affected?.score ?? 0.1,
        isRootCause: (affected?.score ?? 0) >= 0.95,
        reason: affected?.reason ?? 'Not directly affected',
      };
    });
  }, [affectedFiles]);

  // Animate traversal
  useEffect(() => {
    if (!isAnimating || traversalPath.length === 0) {
      setRevealedNodes(new Set(Object.keys(NODE_LAYOUT)));
      setRevealedEdges(EDGES.length);
      return;
    }

    setRevealedNodes(new Set());
    setRevealedEdges(0);

    const nodeTimers: NodeJS.Timeout[] = [];
    traversalPath.forEach((nodeLabel, i) => {
      const timer = setTimeout(() => {
        setRevealedNodes(prev => new Set([...Array.from(prev), nodeLabel]));
      }, i * 600);
      nodeTimers.push(timer);
    });

    const edgeTimers: NodeJS.Timeout[] = [];
    EDGES.forEach((_, i) => {
      const timer = setTimeout(() => {
        setRevealedEdges(prev => prev + 1);
      }, (traversalPath.length * 600) + (i * 300));
      edgeTimers.push(timer);
    });

    return () => {
      nodeTimers.forEach(clearTimeout);
      edgeTimers.forEach(clearTimeout);
    };
  }, [isAnimating, traversalPath]);

  const hoveredNodeData = nodes.find(n => n.id === hoveredNode);

  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <GitBranch className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold">Dependency Graph Traversal</span>
        <div className="flex-1" />
        <span className="text-[11px] text-white/30 font-mono">{nodes.length} nodes • {EDGES.length} edges</span>
      </div>

      <div className="relative" style={{ height: 580 }}>
        {/* SVG Edges */}
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.15)" />
            </marker>
            <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(99,102,241,0.6)" />
            </marker>
          </defs>
          {EDGES.slice(0, revealedEdges).map((edge, i) => {
            const fromNode = NODE_LAYOUT[edge.from];
            const toNode = NODE_LAYOUT[edge.to];
            if (!fromNode || !toNode) return null;

            const isOnPath = traversalPath.includes(edge.from) && traversalPath.includes(edge.to);
            const isHovered = hoveredNode === edge.from || hoveredNode === edge.to;

            return (
              <motion.line
                key={`${edge.from}-${edge.to}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={isOnPath ? 'rgba(99,102,241,0.5)' : isHovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}
                strokeWidth={isOnPath ? 2 : 1}
                markerEnd={isOnPath ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                strokeDasharray={isOnPath ? '6 3' : 'none'}
              />
            );
          })}

          {/* Animated traversal pulse */}
          {isAnimating && traversalPath.length >= 2 && traversalPath.slice(0, -1).map((nodeLabel, i) => {
            const from = NODE_LAYOUT[nodeLabel];
            const to = NODE_LAYOUT[traversalPath[i + 1]];
            if (!from || !to) return null;
            return (
              <motion.circle
                key={`pulse-${i}`}
                r="4"
                fill="#6366f1"
                initial={{ cx: from.x, cy: from.y, opacity: 0 }}
                animate={{
                  cx: [from.x, to.x],
                  cy: [from.y, to.y],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 1.5,
                  delay: i * 0.8 + 2,
                  repeat: Infinity,
                  repeatDelay: traversalPath.length * 0.8,
                }}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        <AnimatePresence>
          {nodes.map((node) => {
            const isRevealed = revealedNodes.has(node.id);
            if (!isRevealed) return null;

            const color = getNodeColor(node.score, node.isRootCause);
            const glow = getNodeGlow(node.score, node.isRootCause);
            const isOnPath = traversalPath.includes(node.id);
            const isHovered = hoveredNode === node.id;
            const percentage = Math.round(node.score * 100);

            return (
              <motion.div
                key={node.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="absolute cursor-pointer"
                style={{
                  left: node.x - 55,
                  top: node.y - 18,
                  zIndex: isHovered ? 20 : 10,
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className={`
                    relative px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium
                    border transition-all duration-200
                    ${isOnPath ? 'ring-1 ring-indigo-500/40' : ''}
                  `}
                  style={{
                    backgroundColor: `${color}15`,
                    borderColor: `${color}40`,
                    color: color,
                    boxShadow: glow,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${node.isRootCause ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate max-w-[85px]">{node.label}</span>
                    <span className="text-[9px] opacity-60">{percentage}%</span>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Hover Tooltip */}
        <AnimatePresence>
          {hoveredNodeData && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute z-30 glass-strong rounded-lg px-3 py-2.5 max-w-[220px]"
              style={{
                left: Math.min(hoveredNodeData.x - 60, 580),
                top: hoveredNodeData.y + 30,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Info className="w-3 h-3 text-blue-400" />
                <span className="text-[11px] font-semibold text-white/80">{hoveredNodeData.label}</span>
              </div>
              <p className="text-[10px] text-white/50 leading-relaxed">{hoveredNodeData.reason}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-mono" style={{ color: getNodeColor(hoveredNodeData.score, hoveredNodeData.isRootCause) }}>
                  Impact: {Math.round(hoveredNodeData.score * 100)}%
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex gap-4 text-[10px] text-white/30">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /> Root Cause</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500" /> High Impact</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-500" /> Medium</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-500" /> Low</div>
        </div>
      </div>
    </div>
  );
}
