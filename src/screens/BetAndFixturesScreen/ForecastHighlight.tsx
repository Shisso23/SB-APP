import React from 'react';

/** Accepts the thresholds from the server's market preference. */
export interface HighlightPreference {
  label: string;
  suggest: number;
  strong?: number | null;
}

const isValidProbability = (p: unknown): p is number => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;

/** Pure comparison of an already-computed probability against this market's
 * own already-provided suggest/strong thresholds - only used as a fallback
 * when a caller doesn't pass `level` explicitly. This is not a copy of engine
 * selection logic: the threshold numbers are owned and computed server-side
 * (see services/predictions); this just picks which of two already-given
 * numbers a probability clears, for this component's own rendering.
 */
const levelFor = (p: unknown, preference: HighlightPreference): 'strong' | 'suggested' | 'none' => {
  if (!isValidProbability(p)) return 'none';
  if (typeof preference.strong === 'number' && p >= preference.strong) return 'strong';
  return p >= preference.suggest ? 'suggested' : 'none';
};

export const ForecastHighlight: React.FC<{
  probability?: number;
  preference: HighlightPreference;
  progressive?: boolean;
  /** Overrides the computed level, e.g. when qualification came from an implication. */
  level?: 'strong' | 'suggested' | 'none';
  /** Overrides the default "meets the N% threshold" text. */
  note?: string;
}> = ({ probability, preference, progressive, level: levelOverride, note }) => {
  const level = levelOverride ?? levelFor(probability, preference);
  if (!isValidProbability(probability) || level === 'none') return null;
  const strong = level === 'strong';
  const threshold = strong && typeof preference.strong === 'number' ? preference.strong : preference.suggest;
  // BTTS prominence rises continuously above the requested 72%, without inventing
  // another user cutoff. Text retains the exact unrounded threshold comparison.
  const prominence = progressive ? Math.max(0, Math.min(1, (probability - preference.suggest) / (1 - preference.suggest))) : 0;
  return <div data-highlight={level} className={`mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border px-2 py-1.5 text-xs leading-relaxed ${strong ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-100' : 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'}`}
    style={progressive ? { backgroundColor: `rgba(6,182,212,${.10 + prominence * .17})`, fontWeight: 500 + Math.round(prominence * 400) } : undefined}>
    <strong className="inline-flex items-center gap-1.5"><span aria-hidden="true">{strong ? '✦' : '✓'}</span>
      {note ? 'Supported by related markets' : strong ? 'Strong highlight' : 'Highlighted'}
    </strong>
    <span>{note ?? `Meets the ${(threshold * 100).toFixed(0)}% ${strong ? 'stronger-highlight' : 'suggestion'} threshold.`}</span>
  </div>;
};

