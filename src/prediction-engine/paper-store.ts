import {
  PaperRecord,
  PaperSelection,
  createEmptyPaperRecord,
  settleSelection,
} from './paper-tracking';

export { createEmptyPaperRecord };
export type { PaperRecord, PaperSelection };

/**
 * Persistence for the prospective paper-tracking record.
 *
 * The app has no backend, so the record is stored in `localStorage` under the same
 * conventions as the existing caches. All functions are defensive: an unreadable or
 * corrupt record yields an empty one rather than throwing.
 */
export const PAPER_TRACKING_KEY = 'paperTracking_v1';

const canUseStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const readPaperRecord = (): PaperRecord => {
  if (!canUseStorage()) {
    return createEmptyPaperRecord();
  }
  try {
    const raw = window.localStorage.getItem(PAPER_TRACKING_KEY);
    if (!raw) {
      return createEmptyPaperRecord();
    }
    const parsed = JSON.parse(raw) as PaperRecord;
    if (!parsed || !Array.isArray(parsed.selections)) {
      return createEmptyPaperRecord();
    }
    return parsed;
  } catch {
    return createEmptyPaperRecord();
  }
};

export const writePaperRecord = (record: PaperRecord): void => {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(
      PAPER_TRACKING_KEY,
      JSON.stringify({ ...record, updatedAt: Date.now() })
    );
  } catch {
    /* storage full or unavailable; ignore */
  }
};

/**
 * Append selections, de-duplicating on (fixtureId, marketId) so re-running the same
 * fixture does not create duplicate entries. Unsettled selections are updated; settled
 * ones are left untouched to preserve the record.
 */
export const appendPaperSelections = (
  record: PaperRecord,
  incoming: PaperSelection[]
): PaperRecord => {
  const key = (s: Pick<PaperSelection, 'fixtureId' | 'marketId'>) => `${s.fixtureId}:${s.marketId}`;
  const existing = new Map(record.selections.map((s) => [key(s), s]));

  incoming.forEach((selection) => {
    const current = existing.get(key(selection));
    if (current?.settled) {
      return; // never overwrite a settled record
    }
    existing.set(key(selection), selection);
  });

  return {
    ...record,
    selections: Array.from(existing.values()),
    updatedAt: Date.now(),
  };
};

/**
 * Settle any unsettled selections whose fixture results are now known. `results` maps
 * fixtureId -> final score. Returns a new record plus how many were settled.
 */
export const settlePaperRecord = (
  record: PaperRecord,
  results: Map<number, { homeGoals: number; awayGoals: number }>
): { record: PaperRecord; settledCount: number } => {
  let settledCount = 0;
  const selections = record.selections.map((selection) => {
    if (selection.settled) {
      return selection;
    }
    const result = results.get(selection.fixtureId);
    if (!result) {
      return selection;
    }
    settledCount += 1;
    return settleSelection(selection, {
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
    });
  });

  return {
    record: { ...record, selections, updatedAt: Date.now() },
    settledCount,
  };
};

/** Counts for quick UI display. */
export const paperRecordCounts = (record: PaperRecord) => ({
  total: record.selections.length,
  settled: record.selections.filter((s) => s.settled).length,
  pending: record.selections.filter((s) => !s.settled).length,
  qualified: record.selections.filter((s) => s.qualified).length,
});