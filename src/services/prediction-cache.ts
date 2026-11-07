import type { FixtureDataModel } from '../models/fixtures';
import type { FixturePrediction } from '../prediction-engine/types';
import { deleteBrowserCache, readBrowserCache, writeBrowserCache } from './browser-cache';

export const PREDICTION_CACHE_TTL = 6 * 60 * 60 * 1000;
export const PREDICTION_CACHE_RECORD = 'league-predictions-v1';
const LEGACY_PREDICTIONS_KEY = 'leaguePredictions_v3';
const LEGACY_VIEW_KEY = 'predictionView_v1';
export interface PredictionViewCache { ts: number; from: string; to: string; optionIds: number[] }
export interface PredictionsCacheItem {
  enginePredictions?: FixturePrediction[];
  oddsMessages?: Record<number, string>;
  leagueId: number;
  season: number;
  from: string;
  to: string;
  optionIds: number[];
  fixtures: FixtureDataModel[];
  predicted: {
    fixtures: FixtureDataModel[];
    option: { id: number; name: string; level: number; shortName: string; description: string };
  }[];
  ts: number;
}
export interface PredictionsCacheShape { items: PredictionsCacheItem[]; view?: PredictionViewCache }

// Serialize read/modify/write entry points with clears and migrations in this tab.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T,>(operation: () => Promise<T>): Promise<T> => {
  const next = queue.then(operation, operation);
  queue = next.then(() => undefined, () => undefined);
  return next;
};
const fresh = (ts: number, now: number) => Number.isFinite(ts) && ts <= now && now - ts < PREDICTION_CACHE_TTL;
const validDate = (date: string) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const cacheKey = (item: PredictionsCacheItem) => `${item.leagueId}:${item.season}:${item.from}:${item.to}:${[...item.optionIds].sort((a, b) => a - b).join(',')}`;
const prune = (raw: unknown, now = Date.now()): PredictionsCacheShape => {
  const input = raw as Partial<PredictionsCacheShape> | undefined;
  const unique = new Map<string, PredictionsCacheItem>();
  if (Array.isArray(input?.items)) input.items.forEach(item => {
    if (!item || !fresh(item.ts, now) || !Number.isFinite(item.leagueId) || !Number.isFinite(item.season) ||
      !validDate(item.from) || !validDate(item.to) || !Array.isArray(item.optionIds) || !item.optionIds.every(Number.isInteger) ||
      !Array.isArray(item.fixtures) || !Array.isArray(item.predicted) ||
      item.enginePredictions !== undefined && !Array.isArray(item.enginePredictions)) return;
    const previous = unique.get(cacheKey(item));
    if (!previous || previous.ts <= item.ts) unique.set(cacheKey(item), item);
  });
  const view = input?.view;
  const validView = view && fresh(view.ts, now) && validDate(view.from) && validDate(view.to) && view.from <= view.to &&
    Array.isArray(view.optionIds) && view.optionIds.every(Number.isInteger);
  return { items: Array.from(unique.values()), ...(validView ? { view } : {}) };
};

/** Canonicalize exact fixture copies throughout histories and forecasts. IndexedDB
 * structured cloning preserves shared references, unlike a repeated JSON string.
 * Different versions of the same match remain distinct, preserving each snapshot.
 */
const compact = (cache: PredictionsCacheShape): PredictionsCacheShape => {
  const fixtures = new Map<string, unknown>();
  const visited = new WeakMap<object, unknown>();
  const visit = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (visited.has(value)) return visited.get(value);
    if (value instanceof Date) return new Date(value.getTime());
    const record = value as Record<string, unknown>;
    const fixture = record.fixture as { id?: unknown } | undefined;
    const isFixture = fixture && Number.isFinite(fixture.id) && record.teams && record.league && record.goals;
    const signature = isFixture ? JSON.stringify(value) : undefined;
    if (signature && fixtures.has(signature)) return fixtures.get(signature);
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      visited.set(value, result);
      value.forEach(entry => result.push(visit(entry)));
      return result;
    }
    const result: Record<string, unknown> = Object.create(null);
    visited.set(value, result);
    Object.keys(record).forEach(key => { result[key] = visit(record[key]); });
    if (signature) fixtures.set(signature, result);
    return result;
  };
  return visit(cache) as PredictionsCacheShape;
};
const parse = (raw: string | null): unknown => {
  try { return raw ? JSON.parse(raw) : undefined; } catch { return undefined; }
};
const legacy = () => {
  try {
    const predictions = localStorage.getItem(LEGACY_PREDICTIONS_KEY);
    const view = localStorage.getItem(LEGACY_VIEW_KEY);
    const cached = parse(predictions) as Partial<PredictionsCacheShape> | undefined;
    return { present: predictions !== null || view !== null, cache: prune({ items: cached?.items, view: parse(view) }) };
  } catch { return { present: false, cache: { items: [] } as PredictionsCacheShape }; }
};
const removeLegacy = () => {
  try { localStorage.removeItem(LEGACY_PREDICTIONS_KEY); localStorage.removeItem(LEGACY_VIEW_KEY); } catch { /* Other storage may be blocked; IndexedDB remains usable. */ }
};

const pruneLocalAuxiliaryCaches = () => {
  try {
    const now = Date.now();
    const leagues = parse(localStorage.getItem('leaguesCache_v1')) as { ts?: number } | undefined;
    if (leagues && (!Number.isFinite(leagues.ts) || Number(leagues.ts) > now || now - Number(leagues.ts) >= 7 * 24 * 60 * 60 * 1000)) localStorage.removeItem('leaguesCache_v1');
    const standings = parse(localStorage.getItem('standingsCache_v2')) as { items?: { ts: number }[] } | undefined;
    if (Array.isArray(standings?.items)) {
      const items = standings.items.filter(item => item && fresh(item.ts, now));
      if (!items.length) localStorage.removeItem('standingsCache_v2');
      else if (items.length !== standings.items.length) localStorage.setItem('standingsCache_v2', JSON.stringify({ ...standings, items }));
    }
  } catch { /* Cache housekeeping must not turn a committed forecast save into a failure. */ }
};

export const readPredictionsCache = (): Promise<PredictionsCacheShape> => serial(async () => {
  const old = legacy();
  let raw: unknown;
  try { raw = await readBrowserCache(PREDICTION_CACHE_RECORD); }
  catch { return old.cache; }
  const current = prune(raw);
  const merged = prune({
    items: [...old.cache.items, ...current.items],
    view: (old.cache.view?.ts ?? 0) > (current.view?.ts ?? 0) ? old.cache.view : current.view,
  });
  const rawItems = (raw as PredictionsCacheShape | undefined)?.items;
  if (old.present || raw && (!Array.isArray(rawItems) || rawItems.length !== current.items.length || Boolean((raw as PredictionsCacheShape).view) !== Boolean(current.view))) {
    try {
      await writeBrowserCache(PREDICTION_CACHE_RECORD, compact(merged));
      removeLegacy(); // Free localStorage only after the replacement commits.
      pruneLocalAuxiliaryCaches();
    } catch { /* Still restore readable snapshots; keep the legacy copy until migration succeeds. */ }
  }
  return merged;
});

export const writePredictionsCache = (cache: PredictionsCacheShape): Promise<boolean> => serial(async () => {
  try {
    await writeBrowserCache(PREDICTION_CACHE_RECORD, compact(prune(cache)));
    removeLegacy();
    pruneLocalAuxiliaryCaches();
    return true;
  } catch { return false; }
});

export const clearPredictionsCache = (): Promise<boolean> => serial(async () => {
  try {
    await deleteBrowserCache(PREDICTION_CACHE_RECORD);
    removeLegacy();
    return true;
  } catch { removeLegacy(); return false; }
});
