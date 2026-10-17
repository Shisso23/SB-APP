import { MarketOdds, MarketValue, MarketId } from './types';
import { impliedProbability, expectedValue } from './odds';
import { round } from './math-utils';

/**
 * Prospective paper-tracking.
 *
 * WHY PROSPECTIVE (not a historical backtest)
 * -------------------------------------------
 * API-Football's Free plan returns pre-match odds ONLY for upcoming fixtures; every
 * historical odds query (date / league+season / old fixture id) returns 0 results. There
 * is therefore no way to reconstruct the prices that were available before the 2023
 * evaluation matches, and we must NOT fabricate them.
 *
 * So instead we capture TODAY's model predictions and TODAY's odds BEFORE kickoff, record
 * them, and settle them automatically once results exist. Over time this accumulates a
 * genuinely leakage-free, out-of-sample record of how the model compares with the market.
 */

export interface PaperSelection {
  fixtureId: number;
  kickoff: number;
  capturedAt: number;
  leagueId?: number;
  leagueName?: string;
  homeTeam: string;
  awayTeam: string;
  marketId: MarketId;
  label: string;
  /** Model probability at capture time. */
  modelProbability: number;
  /** Best available decimal odds at capture time. */
  decimalOdds: number;
  /** 1 / decimalOdds. */
  rawImpliedProbability: number;
  /** Margin-adjusted market probability when the market had both sides. */
  marginAdjustedProbability?: number;
  /** modelProbability - marginAdjustedProbability (or raw when margin unknown). */
  edge: number;
  /** modelProbability * decimalOdds - 1. */
  expectedValue: number;
  bookmaker?: string;
  oddsTimestamp?: number;
  /** Whether the selection passed both configured gates at capture time. */
  qualified: boolean;
  /** Settlement (undefined until the result is known). */
  settled?: PaperSettlement;
}

export interface PaperSettlement {
  settledAt: number;
  homeGoals: number;
  awayGoals: number;
  /** Did the selection win? (null for pushes, e.g. draw-no-bet) */
  won: boolean | null;
  /** Realised profit per unit stake: decimalOdds - 1 if won, -1 if lost, 0 if push. */
  profit: number;
}

export interface PaperRecord {
  selections: PaperSelection[];
  createdAt: number;
  updatedAt: number;
}

export const createEmptyPaperRecord = (): PaperRecord => ({
  selections: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/**
 * Build paper selections from a fixture prediction and its captured odds. Only markets
 * that have BOTH a model probability and a mapped price are recorded, so the record is
 * always comparable.
 */
export const buildPaperSelections = ({
  fixtureId,
  kickoff,
  leagueId,
  leagueName,
  homeTeam,
  awayTeam,
  markets,
  odds,
  capturedAt = Date.now(),
}: {
  fixtureId: number;
  kickoff: number;
  leagueId?: number;
  leagueName?: string;
  homeTeam: string;
  awayTeam: string;
  markets: MarketValue[];
  odds: MarketOdds[];
  capturedAt?: number;
}): PaperSelection[] => {
  const oddsById = new Map(odds.map((o) => [o.marketId, o]));
  const selections: PaperSelection[] = [];

  markets.forEach((market) => {
    const price = oddsById.get(market.marketId);
    if (!price) {
      return;
    }
    selections.push({
      fixtureId,
      kickoff,
      capturedAt,
      leagueId,
      leagueName,
      homeTeam,
      awayTeam,
      marketId: market.marketId,
      label: market.label,
      modelProbability: market.modelProbability,
      decimalOdds: price.decimalOdds,
      rawImpliedProbability: round(impliedProbability(price.decimalOdds), 4),
      marginAdjustedProbability: market.marginAdjustedProbability,
      edge: market.edge,
      expectedValue: round(expectedValue(market.modelProbability, price.decimalOdds), 4),
      bookmaker: price.bookmaker,
      oddsTimestamp: price.timestamp,
      qualified: market.qualifies,
    });
  });

  return selections;
};

/** Settle a selection given the final score. Pure; used by the tracking store and tests. */
export const settleSelection = (
  selection: PaperSelection,
  { homeGoals, awayGoals, settledAt = Date.now() }: { homeGoals: number; awayGoals: number; settledAt?: number }
): PaperSelection => {
  const won = evaluateMarket(selection.marketId, homeGoals, awayGoals);
  const profit = won === null ? 0 : won ? selection.decimalOdds - 1 : -1;
  return {
    ...selection,
    settled: { settledAt, homeGoals, awayGoals, won, profit: round(profit, 4) },
  };
};

/** Outcome of a market for a final score (null = push/unsupported). */
export const evaluateMarket = (marketId: MarketId, homeGoals: number, awayGoals: number): boolean | null => {
  const total = homeGoals + awayGoals;
  switch (marketId) {
    case 'home_win': return homeGoals > awayGoals;
    case 'draw': return homeGoals === awayGoals;
    case 'away_win': return homeGoals < awayGoals;
    case 'home_over_0_5': return homeGoals >= 1;
    case 'away_over_0_5': return awayGoals >= 1;
    case 'btts_yes': return homeGoals >= 1 && awayGoals >= 1;
    case 'btts_no': return !(homeGoals >= 1 && awayGoals >= 1);
    case 'over_1_5': return total >= 2;
    case 'under_1_5': return total < 2;
    case 'over_2_5': return total >= 3;
    case 'under_2_5': return total < 3;
    case 'over_3_5': return total >= 4;
    case 'under_3_5': return total < 4;
    case 'home_or_draw': return homeGoals >= awayGoals;
    case 'away_or_draw': return homeGoals <= awayGoals;
    case 'home_dnb': return homeGoals === awayGoals ? null : homeGoals > awayGoals;
    case 'away_dnb': return homeGoals === awayGoals ? null : homeGoals < awayGoals;
    default: return null;
  }
};

export interface PaperSummary {
  scope: string;
  n: number;
  wins: number;
  pushes: number;
  hitRate: number;
  /** Mean model probability of settled selections. */
  meanModelProbability: number;
  /** Mean realised outcome rate (should track mean model probability if calibrated). */
  observedRate: number;
  meanDecimalOdds: number;
  meanExpectedValue: number;
  /** Flat-stake return per unit staked. */
  roi: number;
  /** Sample standard deviation of per-selection profit. */
  profitStdev: number;
  /** 95% CI half-width for the mean profit (roi). */
  roiConfidence95: number;
  brierScore: number;
  logLoss: number;
  bookmakerImpliedBrier: number;
}

const logLossTerm = (p: number, happened: boolean) => {
  const c = Math.min(1 - 1e-9, Math.max(1e-9, p));
  return happened ? -Math.log(c) : -Math.log(1 - c);
};

/** Summarise a set of SETTLED selections (unsettled and pushes excluded from rates). */
export const summarisePaperSelections = (
  selections: PaperSelection[],
  scope = 'all'
): PaperSummary => {
  const settled = selections.filter((s) => s.settled);
  const decidable = settled.filter((s) => s.settled!.won !== null);

  const n = decidable.length;
  if (n === 0) {
    return {
      scope, n: 0, wins: 0, pushes: settled.length, hitRate: 0,
      meanModelProbability: 0, observedRate: 0, meanDecimalOdds: 0, meanExpectedValue: 0,
      roi: 0, profitStdev: 0, roiConfidence95: 0, brierScore: 0, logLoss: 0, bookmakerImpliedBrier: 0,
    };
  }

  const wins = decidable.filter((s) => s.settled!.won === true).length;
  const profits = decidable.map((s) => s.settled!.profit);
  const meanProfit = profits.reduce((a, b) => a + b, 0) / n;
  const variance = profits.reduce((a, p) => a + (p - meanProfit) ** 2, 0) / Math.max(1, n - 1);
  const stdev = Math.sqrt(variance);

  const meanModelProbability = decidable.reduce((a, s) => a + s.modelProbability, 0) / n;
  const meanDecimalOdds = decidable.reduce((a, s) => a + s.decimalOdds, 0) / n;
  const meanExpectedValue = decidable.reduce((a, s) => a + s.expectedValue, 0) / n;

  const brierScore = decidable.reduce((a, s) => a + (s.modelProbability - (s.settled!.won ? 1 : 0)) ** 2, 0) / n;
  const logLossScore = decidable.reduce((a, s) => a + logLossTerm(s.modelProbability, s.settled!.won === true), 0) / n;
  const marketProb = decidable.map((s) => s.marginAdjustedProbability ?? s.rawImpliedProbability);
  const bookmakerImpliedBrier = decidable.reduce(
    (a, s, i) => a + (marketProb[i] - (s.settled!.won ? 1 : 0)) ** 2,
    0
  ) / n;

  return {
    scope,
    n,
    wins,
    pushes: settled.length - n,
    hitRate: wins / n,
    meanModelProbability: round(meanModelProbability, 4),
    observedRate: wins / n,
    meanDecimalOdds: round(meanDecimalOdds, 4),
    meanExpectedValue: round(meanExpectedValue, 4),
    roi: round(meanProfit, 4),
    profitStdev: round(stdev, 4),
    roiConfidence95: round(1.96 * stdev / Math.sqrt(n), 4),
    brierScore: round(brierScore, 4),
    logLoss: round(logLossScore, 4),
    bookmakerImpliedBrier: round(bookmakerImpliedBrier, 4),
  };
};

/** Group summaries by an arbitrary key (market, league, probability band, odds range). */
export const summariseBy = <K extends string>(
  selections: PaperSelection[],
  keyFn: (s: PaperSelection) => K
): Record<K, PaperSummary> => {
  const groups = new Map<K, PaperSelection[]>();
  selections.forEach((s) => {
    const key = keyFn(s);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(s);
  });
  const out = {} as Record<K, PaperSummary>;
  groups.forEach((rows, key) => {
    out[key] = summarisePaperSelections(rows, String(key));
  });
  return out;
};

/** Probability band key, e.g. "0.50-0.60". */
export const probabilityBand = (s: PaperSelection): string => {
  const lower = Math.floor(s.modelProbability * 10) / 10;
  return `${lower.toFixed(2)}-${(lower + 0.1).toFixed(2)}`;
};

/** Odds range key, e.g. "1.50-2.00". */
export const oddsRange = (s: PaperSelection): string => {
  const step = 0.5;
  const lower = Math.floor(s.decimalOdds / step) * step;
  return `${lower.toFixed(2)}-${(lower + step).toFixed(2)}`;
};