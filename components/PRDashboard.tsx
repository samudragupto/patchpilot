'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitPullRequest, AlertTriangle, Shield, RotateCcw, Target,
  FileCode2, TestTube2, Brain, Clock, Download, ChevronRight,
  Lightbulb, XCircle, CheckCircle2, ArrowRight, Sparkles,
  Play, TrendingUp, Cpu, GitBranch, Zap,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Heatmap } from './Heatmap';
import { GraphView } from './GraphView';

interface PRDashboardProps {
  data: {
    title: string;
    rootCause: string;
    confidence: number;
    diff: string;
    tests: string;
    riskAnalysis: string;
    rollbackPlan: string;
    blastRadius: string;
    affectedFiles: { file: string; score: number; reason: string }[];
    reasoning: {
      hypotheses: { id: string; title: string; confidence: number; evidence: string[] }[];
      eliminations: { hypothesisId: string; reason: string; evidence: string }[];
      finalHypothesis: { id: string; title: string; confidence: number; evidence: string[] };
    };
    executionFlow: {
      before: { step: string; result: string }[];
      after: { step: string; result: string }[];
    };
    defensiveImprovements: string[];
    estimatedTimeSaved: string;
    graphMetrics: {
      nodesTraversed: number;
      edgesTraversed: number;
      communitiesAnalyzed: number;
      centralityScore: number;
    };
    traversalPath: string[];
    githubPR?: {
      number: number;
      url: string;
      title: string;
      branch: string;
      state: string;
    };
  };
}

type TabId = 'overview' | 'diff' | 'tests' | 'reasoning' | 'graph';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'reasoning', label: 'Reasoning', icon: <Brain className="w-3.5 h-3.5" /> },
  { id: 'graph', label: 'Graph', icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: 'diff', label: 'Patch', icon: <FileCode2 className="w-3.5 h-3.5" /> },
  { id: 'tests', label: 'Tests', icon: <TestTube2 className="w-3.5 h-3.5" /> },
];

// ─── Execution Flow ──────────────────────────────────────────────────────────

function ExecutionFlow({ flow }: { flow: { before: { step: string; result: string }[]; after: { step: string; result: string }[] } }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Before */}
      <div className="rounded-xl border border-red-500/15 bg-red-500/5 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-red-500/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[11px] font-bold text-red-400 tracking-wider">BEFORE</span>
        </div>
        <div className="p-3 space-y-2">
          {Array.isArray(flow?.before) && flow.before.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className="flex gap-2"
            >
              <div className="text-[11px] font-mono text-white/25 shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <div className="text-[11px] font-mono text-white/60">{item?.step}</div>
                <div className="text-[10px] text-red-400/70 mt-0.5">→ {item?.result}</div>
              </div>
            </motion.div>
          ))}
          {(!flow?.before || flow.before.length === 0) && <div className="text-[10px] text-white/20 italic p-2">No execution flow identified</div>}
        </div>
      </div>

      {/* After */}
      <div className="rounded-xl border border-green-500/15 bg-green-500/5 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-green-500/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[11px] font-bold text-green-400 tracking-wider">AFTER</span>
        </div>
        <div className="p-3 space-y-2">
          {Array.isArray(flow?.after) && flow.after.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className="flex gap-2"
            >
              <div className="text-[11px] font-mono text-white/25 shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <div className="text-[11px] font-mono text-white/60">{item?.step}</div>
                <div className="text-[10px] text-green-400/70 mt-0.5">→ {item?.result}</div>
              </div>
            </motion.div>
          ))}
          {(!flow?.after || flow.after.length === 0) && <div className="text-[10px] text-white/20 italic p-2">Awaiting reasoning completion...</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Reasoning Chain ─────────────────────────────────────────────────────────

function ReasoningChain({ reasoning }: { reasoning: PRDashboardProps['data']['reasoning'] }) {
  const eliminatedIds = new Set(reasoning.eliminations.map(e => e.hypothesisId));

  return (
    <div className="space-y-6">
      {/* Hypotheses */}
      <section>
        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          Generated Hypotheses
        </h4>
        <div className="space-y-2">
          {Array.isArray(reasoning?.hypotheses) && reasoning.hypotheses.map((h, i) => {
            const isEliminated = Array.isArray(reasoning?.eliminations) && reasoning.eliminations.some(e => e.hypothesisId === h.id);
            const isFinal = h.id === reasoning?.finalHypothesis?.id;
            return (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-start gap-3 p-3 rounded-lg border ${isFinal
                    ? 'bg-green-500/8 border-green-500/20'
                    : isEliminated
                      ? 'bg-red-500/5 border-red-500/10 opacity-50'
                      : 'bg-white/[0.02] border-white/[0.06]'
                  }`}
              >
                <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${isFinal ? 'bg-green-500/20 text-green-400' :
                    isEliminated ? 'bg-red-500/20 text-red-400' :
                      'bg-white/5 text-white/30'
                  }`}>
                  {h.id.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-mono leading-relaxed ${isFinal ? 'text-green-300' :
                      isEliminated ? 'text-white/30 line-through decoration-red-500/40' :
                        'text-white/60'
                    }`}>
                    {h.title}
                  </p>
                  {Array.isArray(h.evidence) && h.evidence.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {h.evidence.map((ev, j) => (
                        <div key={j} className="flex items-start gap-1.5 text-[10px]">
                          <ArrowRight className={`w-2.5 h-2.5 mt-0.5 ${isEliminated ? 'text-red-500/30' : 'text-blue-500/50'}`} />
                          <span className={isEliminated ? 'text-white/20' : 'text-white/40'}>{ev}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ConfidenceBadge score={h.confidence} size="sm" />
                  {isFinal && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  {isEliminated && <XCircle className="w-4 h-4 text-red-400/60" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Eliminations */}
      <section>
        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-red-400" />
          Elimination Evidence
        </h4>
        <div className="space-y-2">
          {Array.isArray(reasoning?.eliminations) && reasoning.eliminations.map((e, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-3 rounded-lg bg-red-500/5 border border-red-500/10"
            >
              <div className="text-[11px] font-bold text-red-400 mb-1">{e.reason}</div>
              <p className="text-[11px] text-white/40 font-mono leading-relaxed">{e.evidence}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final conclusion */}
      <section>
        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-green-400" />
          Confirmed Root Cause
        </h4>
        <div className="p-4 rounded-xl bg-green-500/8 border border-green-500/20">
          <p className="text-[13px] text-green-200 font-mono leading-relaxed mb-3">{reasoning?.finalHypothesis?.title || 'No hypothesis confirmed yet'}</p>
          <div className="space-y-1.5">
            {Array.isArray(reasoning?.finalHypothesis?.evidence) &&
              reasoning.finalHypothesis.evidence.map((ev: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <ArrowRight className="w-3 h-3 text-green-500/60 shrink-0 mt-0.5" />
                  <span className="text-white/50 font-mono">{ev}</span>
                </div>
              ))
            }
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Scalability + IBM Section ───────────────────────────────────────────────

function ScalabilitySection({ metrics }: { metrics: PRDashboardProps['data']['graphMetrics'] }) {
  return (
    <div className="space-y-4 mt-6">
      {/* IBM positioning */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-blue-300">Powered by IBM-style Reasoning Pipeline</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Multi-stage reasoning', desc: 'Hypothesis generation → elimination → confirmation' },
            { label: 'Graph-based inference', desc: 'BFS traversal across dependency graph edges' },
            { label: 'Explainable outputs', desc: 'Full audit trail with evidence per decision' },
          ].map((item, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <div className="text-[11px] font-semibold text-blue-300 mb-1">{item.label}</div>
              <div className="text-[10px] text-white/30">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Graph metrics */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { value: metrics.nodesTraversed, label: 'Nodes traversed', color: 'text-violet-400' },
          { value: metrics.edgesTraversed, label: 'Edges analyzed', color: 'text-blue-400' },
          { value: metrics.communitiesAnalyzed, label: 'Communities', color: 'text-cyan-400' },
          { value: `${Math.round(metrics.centralityScore * 100)}%`, label: 'Centrality score', color: 'text-green-400' },
        ].map((m, i) => (
          <div key={i} className="glass rounded-lg p-3 text-center">
            <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
            <div className="text-[10px] text-white/30 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Why it scales */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold">Why This Scales</span>
        </div>
        <div className="space-y-2">
          {[
            { icon: <GitBranch className="w-3.5 h-3.5" />, text: 'Graph traversal is O(N + E) — works across 10k+ node repos without performance degradation' },
            { icon: <Zap className="w-3.5 h-3.5" />, text: 'CI/CD integration: run on every PR, flag regressions before they reach production' },
            { icon: <Sparkles className="w-3.5 h-3.5" />, text: 'Graphify generates the dependency graph automatically — no manual codebase configuration' },
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, text: 'Reasoning audit trail satisfies compliance requirements in regulated industries (finance, healthcare)' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[12px]">
              <span className="text-emerald-400/70 shrink-0 mt-0.5">{item.icon}</span>
              <span className="text-white/50">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function PRDashboard({ data }: PRDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [replayActive, setReplayActive] = useState(false);

  const handleReplay = () => {
    setActiveTab('graph');
    setReplayActive(false);
    setTimeout(() => setReplayActive(true), 100);
    setTimeout(() => setReplayActive(false), (data.traversalPath.length * 600) + (10 * 300) + 3000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-6xl mx-auto space-y-4"
    >
      {/* Header */}
      <div className="glass-strong rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <GitPullRequest className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight mb-1.5">{data.title}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {data.estimatedTimeSaved} saved
                  </span>
                  <span>·</span>
                  <span>{data.affectedFiles.length} files in blast radius</span>
                  <span>·</span>
                  <ConfidenceBadge score={data.confidence} size="sm" />
                  <span>·</span>
                  <span className="text-violet-400 font-medium">{data.graphMetrics.nodesTraversed} graph nodes traversed</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {data.githubPR && (
                <a
                  href={data.githubPR.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition-colors"
                >
                  View PR #{data.githubPR.number}
                  <ChevronRight className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={handleReplay}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 hover:text-violet-200 text-xs font-medium transition-colors border border-violet-500/20"
              >
                <Play className="w-3 h-3" />
                Replay Investigation
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/90 text-xs font-medium transition-colors border border-white/[0.06]">
                <Download className="w-3 h-3" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] px-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors ${activeTab === tab.id ? 'text-white' : 'text-white/40 hover:text-white/60'
                }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="prTab" className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-6">
                {/* Root Cause */}
                <section>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    Root Cause Analysis
                  </h3>
                  <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.06] text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap font-mono">
                    {data.rootCause}
                  </div>
                </section>

                {/* Execution Flow */}
                <section>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <ArrowRight className="w-4 h-4 text-cyan-400" />
                    Execution Flow — Before &amp; After
                  </h3>
                  <ExecutionFlow flow={data.executionFlow} />
                </section>

                {/* Defensive Improvements */}
                <section>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-blue-400" />
                    Defensive Improvements
                  </h3>
                  <div className="space-y-2">
                    {Array.isArray(data?.defensiveImprovements) && data.defensiveImprovements.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-[12px] text-white/60">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                        {item}
                      </div>
                    ))}
                    {(!data?.defensiveImprovements || data.defensiveImprovements.length === 0) && (
                      <div className="text-[11px] text-white/20 italic p-3">No specific improvements identified</div>
                    )}
                  </div>
                </section>

                {/* Risk + Rollback */}
                <div className="grid grid-cols-2 gap-4">
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-red-400" />
                      Risk & Blast Radius
                    </h3>
                    <div className="space-y-3">
                      <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.06] text-[13px] text-white/70 leading-relaxed">{data.riskAnalysis}</div>
                      <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.06] text-[13px] text-white/70 leading-relaxed">{data.blastRadius}</div>
                    </div>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <RotateCcw className="w-4 h-4 text-blue-400" />
                      Rollback Plan
                    </h3>
                    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.06] text-[13px] text-white/70 leading-relaxed">{data.rollbackPlan}</div>
                    <div className="mt-3">
                      <Heatmap files={data.affectedFiles} />
                    </div>
                  </section>
                </div>

                <ScalabilitySection metrics={data.graphMetrics} />
              </motion.div>
            )}

            {activeTab === 'reasoning' && (
              <motion.div key="reasoning" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <ReasoningChain reasoning={data.reasoning} />
              </motion.div>
            )}

            {activeTab === 'graph' && (
              <motion.div key="graph" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <GraphView
                  affectedFiles={data.affectedFiles}
                  traversalPath={data.traversalPath}
                  isAnimating={replayActive}
                />
              </motion.div>
            )}

            {activeTab === 'diff' && (
              <motion.div key="diff" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <DiffViewer diff={data.diff} />
              </motion.div>
            )}

            {activeTab === 'tests' && (
              <motion.div key="tests" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#0d1117]">
                  <div className="flex items-center px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                    <span className="text-[11px] font-mono text-white/40">src/services/__tests__/auth.service.test.ts</span>
                  </div>
                  <pre className="p-4 text-[12px] font-mono text-white/60 leading-[1.7] overflow-x-auto">{data.tests}</pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
