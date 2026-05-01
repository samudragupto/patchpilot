'use client';

import { ShieldCheck, Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="w-full border-b border-white/[0.06] glass-strong sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#08080c]" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight">PatchPilot</h1>
            <span className="text-[11px] text-white/30 font-medium">powered by IBM Bob</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-mono">
            <Zap className="w-3 h-3" />
            <span>AI Engine: Active</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-[11px] font-bold">
            D
          </div>
        </div>
      </div>
    </header>
  );
}
