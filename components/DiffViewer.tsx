'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = diff.split('\n');

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="text-[11px] font-mono text-white/40">src/services/auth.service.ts</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto">
        <pre className="p-4 text-[12px] font-mono leading-[1.7]">
          {lines.map((line, i) => {
            let lineClass = 'text-white/50';
            let bgClass = '';

            if (line.startsWith('+') && !line.startsWith('+++')) {
              lineClass = 'text-green-400';
              bgClass = 'bg-green-500/[0.06]';
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              lineClass = 'text-red-400';
              bgClass = 'bg-red-500/[0.06]';
            } else if (line.startsWith('@@')) {
              lineClass = 'text-blue-400';
              bgClass = 'bg-blue-500/[0.03]';
            } else if (line.startsWith('---') || line.startsWith('+++')) {
              lineClass = 'text-white/30';
            }

            return (
              <div key={i} className={`${bgClass} -mx-4 px-4`}>
                <span className="inline-block w-8 text-right mr-4 text-white/15 select-none text-[11px]">
                  {i + 1}
                </span>
                <span className={lineClass}>{line}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
