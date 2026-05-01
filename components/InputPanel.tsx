'use client';

import { useState } from 'react';
import { Play, FileWarning, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface InputPanelProps {
  onSubmit: (input: string) => void;
}

const SAMPLE_INCIDENTS = [
  {
    label: "Auth Race Condition",
    value: `TypeError: Cannot read properties of undefined (reading 'refreshToken')
    at AuthService.refreshToken (/src/services/auth.service.ts:45:12)
    at UserController.getProfile (/src/controllers/user.controller.ts:112:24)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)

Error: Unhandled promise rejection in auth refresh flow.
Multiple concurrent requests attempting to refresh the same token.
Production logs show intermittent 500 errors on /api/user/profile endpoint.`,
  },
];

export function InputPanel({ onSubmit }: InputPanelProps) {
  const [value, setValue] = useState(SAMPLE_INCIDENTS[0].value);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-3xl mx-auto"
    >
      {/* Hero */}
      <div className="text-center mb-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-4"
        >
          <Sparkles className="w-3 h-3" />
          Graph-Powered AI Investigation
        </motion.div>
        <h2 className="text-3xl font-bold tracking-tight mb-3">
          Paste your incident.{' '}
          <span className="text-gradient">Get a PR.</span>
        </h2>
        <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
          PatchPilot uses dependency graph traversal and AI reasoning to
          diagnose bugs and generate reviewer-ready pull requests in minutes.
        </p>
      </div>

      {/* Input Card */}
      <div className={`glass rounded-2xl overflow-hidden transition-all duration-300 ${isFocused ? 'glow-blue ring-1 ring-blue-500/20' : ''}`}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06]">
          <FileWarning className="w-4 h-4 text-red-400" />
          <span className="text-xs font-medium text-white/60">Incident Input</span>
          <div className="flex-1" />
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
        </div>

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full h-56 bg-transparent p-5 font-mono text-[13px] text-green-400/90 focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
          placeholder="Paste a stack trace, error log, or bug report..."
          spellCheck={false}
        />

        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-white/[0.01]">
          <div className="flex gap-2">
            {SAMPLE_INCIDENTS.map((s, i) => (
              <button
                key={i}
                onClick={() => setValue(s.value)}
                className="text-[11px] px-2.5 py-1 rounded-md bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => onSubmit(value)}
            disabled={!value.trim()}
            className="flex items-center gap-2 bg-white text-black px-5 py-2 rounded-lg text-sm font-semibold hover:bg-white/90 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
          >
            <Play className="w-3.5 h-3.5" />
            Investigate
          </button>
        </div>
      </div>
    </motion.div>
  );
}
