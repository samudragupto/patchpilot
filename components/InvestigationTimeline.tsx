'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Search,
  GitBranch,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Loader2,
  XCircle,
  Sparkles,
  Gauge,
} from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';

export interface TimelineEvent {
  type: string;
  message: string;
  files?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
  index: number;
  total: number;
}

interface InvestigationTimelineProps {
  events: TimelineEvent[];
  isComplete: boolean;
}

const STEP_CONFIG: Record<string, { icon: React.ReactNode; color: string; lineColor: string; label: string }> = {
  parse:       { icon: <Search className="w-4 h-4" />,        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',       lineColor: 'bg-blue-500',    label: 'PARSE' },
  scan:        { icon: <Terminal className="w-4 h-4" />,      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',       lineColor: 'bg-cyan-500',    label: 'SCAN' },
  trace:       { icon: <GitBranch className="w-4 h-4" />,     color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', lineColor: 'bg-purple-500',  label: 'TRACE' },
  hypothesis:  { icon: <Lightbulb className="w-4 h-4" />,     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',   lineColor: 'bg-amber-500',   label: 'HYPOTHESIS' },
  elimination: { icon: <XCircle className="w-4 h-4" />,       color: 'text-red-400 bg-red-500/10 border-red-500/20',         lineColor: 'bg-red-500',     label: 'ELIMINATED' },
  discovery:   { icon: <Sparkles className="w-4 h-4" />,      color: 'text-green-400 bg-green-500/10 border-green-500/20',   lineColor: 'bg-green-500',   label: 'CONFIRMED' },
  warning:     { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', lineColor: 'bg-orange-500', label: 'WARNING' },
  confidence:  { icon: <Gauge className="w-4 h-4" />,         color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', lineColor: 'bg-indigo-500',  label: 'CONFIDENCE' },
  resolve:     { icon: <CheckCircle2 className="w-4 h-4" />,  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', lineColor: 'bg-emerald-500', label: 'RESOLVE' },
  done:        { icon: <CheckCircle2 className="w-4 h-4" />,  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', lineColor: 'bg-emerald-500', label: 'DONE' },
};

export function InvestigationTimeline({ events, isComplete }: InvestigationTimelineProps) {
  return (
    <div className="glass rounded-2xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <Terminal className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold">Bob Reasoning Engine</span>
        <div className="flex-1" />
        {!isComplete && (
          <div className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Reasoning...</span>
          </div>
        )}
        {isComplete && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-medium">{events.length} steps</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
        <AnimatePresence>
          {events.map((event, i) => {
            const config = STEP_CONFIG[event.type] || STEP_CONFIG.scan;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                className="relative"
              >
                <div className="flex gap-3 py-2">
                  {/* Timeline node */}
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${config.color}`}>
                      {config.icon}
                    </div>
                    {i < events.length - 1 && (
                      <div className={`w-px flex-1 mt-1 ${config.lineColor} opacity-25`} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-3 min-w-0">
                    {/* Type badge */}
                    <span className={`inline-block text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded mb-1.5 border ${config.color}`}>
                      {config.label}
                    </span>

                    <p className={`text-[13px] leading-relaxed font-mono ${
                      event.type === 'elimination' ? 'text-white/40 line-through decoration-red-500/40' :
                      event.type === 'discovery' ? 'text-green-300' :
                      event.type === 'hypothesis' ? 'text-amber-200/80' :
                      'text-white/70'
                    }`}>
                      {event.message}
                    </p>

                    {event.confidence != null && event.type !== 'done' && (
                      <div className="mt-1.5">
                        <ConfidenceBadge score={event.confidence} size="sm" />
                      </div>
                    )}

                    {event.files && event.files.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {event.files.slice(0, 5).map((file, fi) => (
                          <span key={fi} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/35 font-mono">
                            {file.split('/').pop()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {!isComplete && events.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 pl-10 py-2 text-white/25 text-xs font-mono"
          >
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Multi-hypothesis analysis in progress...
          </motion.div>
        )}
      </div>
    </div>
  );
}
