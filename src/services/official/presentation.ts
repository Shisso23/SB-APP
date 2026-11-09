/**
 * Presentation helpers for the official list.
 *
 * Two rules drive everything here:
 *
 *  1. **Never invent a number.** An unavailable monetary figure renders as
 *     "Unavailable", never as R0.00. A null rate renders as "—", never 0%.
 *  2. **Never rely on colour alone.** Every status carries a text label and a
 *     distinct glyph, so the history is readable without colour vision and in
 *     greyscale.
 */
import type {
  HypotheticalResult,
  OfficialLegStatus,
  OfficialListStatus,
} from './types';

/** How one selection's result should read. */
export interface StatusPresentation {
  label: string;
  /** Non-colour cue, so status is never conveyed by colour alone. */
  glyph: string;
  className: string;
}

const LEG_STATUS: Record<OfficialLegStatus, StatusPresentation> = {
  won: { label: 'Won', glyph: '✓', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  lost: { label: 'Lost', glyph: '✕', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  void: { label: 'Void', glyph: '⊘', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  unresolved: { label: 'Unresolved', glyph: '?', className: 'bg-amber-50 text-amber-900 border-amber-300' },
  pending: { label: 'Pending', glyph: '⋯', className: 'bg-sky-50 text-sky-800 border-sky-300' },
};

const LIST_STATUS: Record<OfficialListStatus, StatusPresentation> = {
  won: { label: 'Won', glyph: '✓', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  lost: { label: 'Lost', glyph: '✕', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  void: { label: 'Void', glyph: '⊘', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  unresolved: { label: 'Unresolved', glyph: '?', className: 'bg-amber-50 text-amber-900 border-amber-300' },
  pending: { label: 'Pending', glyph: '⋯', className: 'bg-sky-50 text-sky-800 border-sky-300' },
};

export const describeLegStatus = (status: OfficialLegStatus): StatusPresentation =>
  LEG_STATUS[status] ?? LEG_STATUS.pending;

export const describeListStatus = (status: OfficialListStatus | undefined): StatusPresentation =>
  (status && LIST_STATUS[status]) || LIST_STATUS.pending;

/** Format a decimal-string probability as a percentage. */
export const formatProbability = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${(parsed * 100).toFixed(1)}%`;
};

/** Format a decimal-string rate (0–1) as a percentage, or "—" when absent. */
export const formatRate = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${(parsed * 100).toFixed(1)}%`;
};

/** Format a monetary decimal string. Returns null when genuinely unavailable. */
export const formatMoney = (value: string | null | undefined, currency = 'ZAR'): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const symbol = currency === 'ZAR' ? 'R' : '';
  const sign = parsed < 0 ? '-' : '';
  const absolute = Math.abs(parsed).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbol}${absolute}`;
};

/** Format a decimal-string price as odds, e.g. "1.85". */
export const formatOdds = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
};

/** A business date rendered unambiguously (e.g. "10 March 2026"). */
export const formatBusinessDate = (value: string): string => {
  // Parse as a plain calendar date so no timezone shift can move the day.
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
};

/** A timestamp rendered in the viewer's locale, or null when absent. */
export const formatTimestamp = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/**
 * Describe the monetary figure for a list.
 *
 * Returns a discriminated result so callers must handle the unavailable case
 * explicitly rather than rendering a misleading zero.
 */
export type MoneyPresentation =
  | { kind: 'unavailable'; reason: string; disclosure: string }
  | { kind: 'potential'; combinedOdds: string | null; disclosure: string }
  | { kind: 'settled'; combinedOdds: string | null; totalReturn: string | null; net: string | null; disclosure: string };

export const presentHypothetical = (value: HypotheticalResult | undefined): MoneyPresentation | null => {
  if (!value) return null;
  if (!value.available) {
    return { kind: 'unavailable', reason: value.reason, disclosure: value.disclosure };
  }
  if (value.isPotential || !value.settledFully) {
    return { kind: 'potential', combinedOdds: value.combinedOdds, disclosure: value.disclosure };
  }
  return {
    kind: 'settled',
    combinedOdds: value.combinedOdds,
    totalReturn: value.totalReturn,
    net: value.net,
    disclosure: value.disclosure,
  };
};

/** Final score for a leg, or a dash when the fixture has no result yet. */
export const formatScore = (home: number | null, away: number | null): string =>
  home === null || away === null ? '—' : `${home}–${away}`;