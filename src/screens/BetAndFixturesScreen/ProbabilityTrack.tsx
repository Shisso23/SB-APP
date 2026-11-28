import React from 'react';

export const ProbabilityTrack: React.FC<{ value?: number | null }> = ({ value }) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return (
    <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
      <div className="h-full rounded-full bg-emerald-300" style={{ width: `${value * 100}%` }} />
    </div>
  );
};
