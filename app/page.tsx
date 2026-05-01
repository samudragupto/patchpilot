'use client';

import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { InputPanel } from '@/components/InputPanel';
import { RepoInput } from '@/components/RepoInput';
import { InvestigationTimeline, type TimelineEvent } from '@/components/InvestigationTimeline';
import { Heatmap } from '@/components/Heatmap';
import { GraphView } from '@/components/GraphView';
import { PRDashboard } from '@/components/PRDashboard';
import { AnimatePresence, motion } from 'framer-motion';

type AppPhase = 'input' | 'repo' | 'investigating' | 'complete';

const LIVE_HEATMAP_SCORES: Record<string, number> = {
  'auth.service.ts': 0.95,
  'user.controller.ts': 0.68,
  'token.ts': 0.72,
  'auth.middleware.ts': 0.55,
  'session.service.ts': 0.62,
  'index.ts': 0.45,
  'user.model.ts': 0.30,
  'config.ts': 0.22,
};

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>('input');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [prData, setPrData] = useState<any>(null);
  const [liveFiles, setLiveFiles] = useState<{ file: string; score: number; reason: string }[]>([]);
  const [liveTraversalPath, setLiveTraversalPath] = useState<string[]>([]);
  const [repoData, setRepoData] = useState<{
    repoUrl: string;
    repoPath: string;
    files: string[];
    stats: any;
  } | null>(null);
  const [showRepoInput, setShowRepoInput] = useState(false);

  const handleRepoCloned = useCallback((data: any) => {
    setRepoData(data);
    setShowRepoInput(false);
    setPhase('input');
  }, []);

  const handleInvestigate = useCallback(async (input: string) => {
    setPhase('investigating');
    setEvents([]);
    setLiveFiles([]);
    setLiveTraversalPath([]);
    setPrData(null);

    const response = await fetch('/api/investigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incident: input,
        repoUrl: repoData?.repoUrl,
        repoPath: repoData?.repoPath,
      }),
    });

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split('\n');
        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          if (line.startsWith('data: '))  eventData = line.slice(6).trim();
        }

        if ((eventType === 'complete') || (eventType === 'done' && !eventData.includes('total'))) {
          // Fetch PR data
          try {
            const prResponse = await fetch('/api/generate-pr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                incident: input,
                repoUrl: repoData?.repoUrl,
                repoPath: repoData?.repoPath,
              }),
            });
            const pr = await prResponse.json();
            setPrData(pr);
            setPhase('complete');
          } catch {
            setPhase('complete');
          }
          continue;
        }

        if (eventData) {
          try {
            const parsed = JSON.parse(eventData);

            // Map the SSE event type onto the parsed object
            const event: TimelineEvent = { ...parsed, type: eventType || parsed.type };
            setEvents(prev => [...prev, event]);

            // Update live heatmap from mentioned files
            if (parsed.files && parsed.files.length > 0) {
              setLiveFiles(prev => {
                const existing = new Map(prev.map(f => [f.file, f]));
                for (const filePath of parsed.files as string[]) {
                  const basename = filePath.split('/').pop() || filePath;
                  if (!existing.has(filePath)) {
                    existing.set(filePath, {
                      file: filePath,
                      score: LIVE_HEATMAP_SCORES[basename] ?? 0.25,
                      reason: 'Detected during live investigation',
                    });
                  }
                }
                return Array.from(existing.values()).sort((a, b) => b.score - a.score);
              });
            }

            // Update live traversal path from trace events
            if (eventType === 'trace' && parsed.files) {
              setLiveTraversalPath(prev => {
                const next = new Set([...prev]);
                for (const f of parsed.files as string[]) {
                  const basename = f.split('/').pop() || f;
                  if (basename) next.add(basename);
                }
                return Array.from(next);
              });
            }
          } catch {
            // Ignore malformed chunks
          }
        }
      }
    }
  }, [repoData]);

  const handleReset = useCallback(() => {
    setPhase('input');
    setEvents([]);
    setPrData(null);
    setLiveFiles([]);
    setLiveTraversalPath([]);
    setRepoData(null);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* REPO INPUT */}
          {phase === 'repo' && (
            <motion.div
              key="repo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center min-h-[72vh]"
            >
              <RepoInput onRepoCloned={handleRepoCloned} />
            </motion.div>
          )}

          {/* INPUT */}
          {phase === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {/* Repo Info Banner */}
              {repoData && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white/80">
                        {repoData.repoUrl.split('/').slice(-2).join('/')}
                      </div>
                      <div className="text-xs text-white/40">
                        {repoData.stats.codeFiles} files • {repoData.stats.totalLines.toLocaleString()} lines
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRepoData(null)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                  >
                    Change Repo
                  </button>
                </motion.div>
              )}

              {/* Input Panel */}
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="space-y-4 w-full max-w-3xl">
                  {!repoData && (
                    <div className="text-center mb-6">
                      <button
                        onClick={() => setPhase('repo')}
                        className="text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-blue-500/20
                                 hover:from-purple-500/30 hover:to-blue-500/30 text-white/70 hover:text-white/90
                                 transition-all border border-white/10"
                      >
                        + Connect GitHub Repository (Optional)
                      </button>
                    </div>
                  )}
                  <InputPanel onSubmit={handleInvestigate} />
                </div>
              </div>
            </motion.div>
          )}

          {/* INVESTIGATING */}
          {phase === 'investigating' && (
            <motion.div
              key="investigating"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* Top: Timeline + Heatmap */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5" style={{ minHeight: 500 }}>
                <div className="lg:col-span-3 h-[500px]">
                  <InvestigationTimeline events={events} isComplete={false} />
                </div>
                <div className="lg:col-span-2 h-[500px]">
                  <Heatmap files={liveFiles} activeFiles={liveTraversalPath} />
                </div>
              </div>

              {/* Bottom: Live graph traversal */}
              {liveFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <GraphView
                    affectedFiles={liveFiles}
                    traversalPath={liveTraversalPath}
                    isAnimating={true}
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {/* COMPLETE */}
          {phase === 'complete' && prData && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm text-white/50">
                    Investigation complete — <span className="text-white/80">{events.length} reasoning steps</span> · PR package ready
                  </span>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors border border-white/[0.06]"
                >
                  New Investigation
                </button>
              </div>
              <PRDashboard data={prData} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
