'use client';

interface ConfidenceBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceBadge({ score, size = 'md' }: ConfidenceBadgeProps) {
  const percentage = Math.round(score * 100);

  let color: string;
  let bgColor: string;
  let label: string;

  if (percentage >= 80) {
    color = 'text-green-400';
    bgColor = 'bg-green-500/10 border-green-500/20';
    label = 'High';
  } else if (percentage >= 50) {
    color = 'text-yellow-400';
    bgColor = 'bg-yellow-500/10 border-yellow-500/20';
    label = 'Medium';
  } else {
    color = 'text-red-400';
    bgColor = 'bg-red-500/10 border-red-500/20';
    label = 'Low';
  }

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2',
  };

  return (
    <span className={`inline-flex items-center font-mono font-semibold rounded-md border ${bgColor} ${color} ${sizeClasses[size]}`}>
      <span className="opacity-60">{label}</span>
      <span>{percentage}%</span>
    </span>
  );
}
