'use client';

import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { InputPanel } from '@/components/InputPanel';
import { InvestigationTimeline, type TimelineEvent } from '@/components/InvestigationTimeline';
import { Heatmap } from '@/components/Heatmap';
import { GraphView } from '@/components/GraphView';
import { PRDashboard } from '@/components/PRDashboard';
import { AnimatePresence, motion } from 'framer-motion';

type AppPhase = 'input' | 'investigating' | 'complete';

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

  const handleInvestigate = useCallback(async (input: string) => {
    setPhase('investigating');
    setEvents([]);
    setLiveFiles([]);
    setLiveTraversalPath([]);
    setPrData(null);

    const response = await fetch('/api/investigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident: input }),
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
              body: JSON.stringify({ incident: input }),
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
  }, []);

  const handleReset = useCallback(() => {
    setPhase('input');
    setEvents([]);
    setPrData(null);
    setLiveFiles([]);
    setLiveTraversalPath([]);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* INPUT */}
          {phase === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center min-h-[72vh]"
            >
              <InputPanel onSubmit={handleInvestigate} />
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
