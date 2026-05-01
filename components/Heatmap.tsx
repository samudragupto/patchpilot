'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

interface HeatmapFile {
  file: string;
  score: number;
  reason: string;
}

interface HeatmapProps {
  files: HeatmapFile[];
  activeFiles?: string[];
}

function getHeatColor(score: number): { bar: string; text: string; bg: string; glow: string } {
  if (score >= 0.85) return { bar: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/8', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.15)]' };
  if (score >= 0.6) return { bar: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/8', glow: 'shadow-[0_0_12px_rgba(249,115,22,0.12)]' };
  if (score >= 0.35) return { bar: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/8', glow: '' };
  return { bar: 'bg-white/30', text: 'text-white/40', bg: 'bg-white/[0.02]', glow: '' };
}

export function Heatmap({ files, activeFiles = [] }: HeatmapProps) {
  return (
    <div className="glass rounded-2xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <Flame className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-semibold">Impact Heatmap</span>
        <div className="flex-1" />
        <span className="text-[11px] text-white/30 font-mono">{files.length} files</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {files.map((f, i) => {
          const colors = getHeatColor(f.score);
          const isActive = activeFiles.some(af => f.file.includes(af));
          const percentage = Math.round(f.score * 100);

          return (
            <motion.div
              key={f.file}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className={`relative rounded-lg border border-white/[0.04] overflow-hidden ${colors.bg} ${colors.glow} ${isActive ? 'ring-1 ring-blue-500/30' : ''}`}
            >
              {/* Background bar */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ delay: i * 0.08 + 0.2, duration: 0.6, ease: 'easeOut' }}
                className={`absolute inset-y-0 left-0 ${colors.bar} opacity-[0.07]`}
              />

              <div className="relative flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full ${colors.bar} ${f.score >= 0.85 ? 'animate-pulse' : ''}`} />
                  <span className="font-mono text-[12px] text-white/70 truncate">
                    {f.file.split('/').pop()}
                  </span>
                </div>
                <span className={`font-mono text-[12px] font-semibold ${colors.text} ml-3 shrink-0`}>
                  {percentage}%
                </span>
              </div>
            </motion.div>
          );
        })}

        {files.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-white/20 text-sm py-12">
            Waiting for investigation data...
          </div>
        )}
      </div>
    </div>
  );
}
