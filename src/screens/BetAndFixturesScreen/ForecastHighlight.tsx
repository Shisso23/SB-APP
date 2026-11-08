import React from 'react';
import { ForecastPreference, highlightLevel, validProbability } from '../../config/forecast-highlights';

export const ForecastHighlight: React.FC<{
  probability?: number;
  preference: ForecastPreference;
  progressive?: boolean;
  /** Overrides the computed level, e.g. when qualification came from an implication. */
  level?: 'strong' | 'suggested' | 'none';
  /** Overrides the default "meets the N% threshold" text. */
  note?: string;
}> = ({ probability, preference, progressive, level: levelOverride, note }) => {
  const level = levelOverride ?? highlightLevel(probability, preference);
  if (!validProbability(probability) || level === 'none') return null;
  const strong = level === 'strong';
  const threshold = strong && preference.strong !== undefined ? preference.strong : preference.suggest;
  // BTTS prominence rises continuously above the requested 72%, without inventing
  // another user cutoff. Text retains the exact unrounded threshold comparison.
  const prominence = progressive ? Math.max(0, Math.min(1, (probability - preference.suggest) / (1 - preference.suggest))) : 0;
  return <div data-highlight={level} className={`mt-1 rounded border px-1.5 py-1 text-[10px] ${strong ? 'border-emerald-300 bg-emerald-500/25 font-bold text-emerald-100' : 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100'}`}
    style={progressive ? { backgroundColor: `rgba(6,182,212,${.10 + prominence * .25})`, fontWeight: 500 + Math.round(prominence * 400) } : undefined}>
    {preference.label}: {(probability * 100).toFixed(2)}% — {note ?? `meets the ${(threshold * 100).toFixed(0)}% ${strong ? 'stronger-highlight' : 'suggestion'} threshold.`}
  </div>;
};

