import { MarketOdds, MarketValue, MarketId, MARKET_LABELS } from './types';
import { PredictionConfig } from '../config/prediction-config';
import { clamp, round } from './math-utils';

/** Raw implied probability from decimal odds (still includes the bookmaker margin). */
export const impliedProbability = (decimalOdds: number): number => {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    return 0;
  }
  return 1 / decimalOdds;
};

/** Break-even probability equals the implied probability for a fair unit stake. */
export const breakEvenProbability = (decimalOdds: number): number => impliedProbability(decimalOdds);

/**
 * Expected value per unit stake:
 *   EV = modelProb * decimalOdds - 1
 * This is an estimate and depends entirely on model calibration.
 */
export const expectedValue = (modelProbability: number, decimalOdds: number): number =>
  modelProbability * decimalOdds - 1;

/** Pairs of opposing markets used for margin removal. */
const OVER_UNDER_PAIRS: Array<[MarketId, MarketId]> = [
  ['over_1_5', 'under_1_5'],
  ['over_2_5', 'under_2_5'],
  ['over_3_5', 'under_3_5'],
];

const isStale = (timestamp: number | undefined, now: number, staleAfterMinutes: number): boolean => {
  if (!timestamp) {
    return false;
  }
  const ageMs = now - timestamp;
  return ageMs > staleAfterMinutes * 60_000;
};

export interface BuildMarketValueOptions {
  marketId: MarketId;
  modelProbability: number;
  odds?: MarketOdds;
  config: PredictionConfig;
  /** Margin-adjusted probability already derived for this market, when known. */
  marginAdjustedProbability?: number;
  now: number;
  evidence?: string[];
}

/**
 * Build a MarketValue for a selection, computing edge/EV/break-even and applying the
 * configured probability + minimum-edge gates. Selections are never marked as
 * guaranteed: `qualifies` only means "passed both configured thresholds".
 */
export const buildMarketValue = ({
  marketId,
  modelProbability,
  odds,
  config,
  marginAdjustedProbability,
  now,
  evidence = [],
}: BuildMarketValueOptions): MarketValue => {
  const thresholds = config.selection.perMarket[marketId] ?? {};
  const minProbability = thresholds.minProbability ?? config.selection.defaultMinProbability;
  const minEdge = thresholds.minEdge ?? config.selection.defaultMinEdge;

  const model = clamp(modelProbability, 0, 1);
  const rejectReasons: string[] = [];

  if (!odds) {
    const passedProbabilityThreshold = model >= minProbability;
    if (!passedProbabilityThreshold) {
      rejectReasons.push(
        `Model probability ${(model * 100).toFixed(1)}% is below the ${(minProbability * 100).toFixed(0)}% threshold for this market.`
      );
    }
    rejectReasons.push('No bookmaker odds available, so no verified betting value can be assessed.');

    return {
      marketId,
      label: MARKET_LABELS[marketId],
      modelProbability: round(model, 4),
      rawImpliedProbability: 0,
      edge: 0,
      oddsStale: false,
      passedProbabilityThreshold,
      passedEdgeThreshold: false,
      qualifies: false,
      rejectReasons,
      evidence,
    };
  }

  const rawImplied = impliedProbability(odds.decimalOdds);
  const adjusted = marginAdjustedProbability ?? rawImplied;
  const edge = model - adjusted;
  const ev = expectedValue(model, odds.decimalOdds);
  const stale = isStale(odds.timestamp, now, config.odds.staleAfterMinutes);

  const passedProbabilityThreshold = model >= minProbability;
  const passedEdgeThreshold = edge >= minEdge;

  if (!passedProbabilityThreshold) {
    rejectReasons.push(
      `Model probability ${(model * 100).toFixed(1)}% is below the ${(minProbability * 100).toFixed(0)}% threshold for this market.`
    );
  }
  if (!passedEdgeThreshold) {
    rejectReasons.push(
      `Estimated edge ${(edge * 100).toFixed(1)}pp is below the ${(minEdge * 100).toFixed(1)}pp minimum.`
    );
  }
  if (stale) {
    rejectReasons.push('Odds are older than the configured freshness window.');
  }

  return {
    marketId,
    label: MARKET_LABELS[marketId],
    modelProbability: round(model, 4),
    rawImpliedProbability: round(rawImplied, 4),
    marginAdjustedProbability: round(adjusted, 4),
    edge: round(edge, 4),
    expectedValue: round(ev, 4),
    breakEvenProbability: round(breakEvenProbability(odds.decimalOdds), 4),
    decimalOdds: odds.decimalOdds,
    oddsTimestamp: odds.timestamp,
    oddsStale: stale,
    passedProbabilityThreshold,
    passedEdgeThreshold,
    qualifies: passedProbabilityThreshold && passedEdgeThreshold && !stale,
    rejectReasons,
    evidence,
  };
};

/**
 * Remove the bookmaker margin for each over/under pair using proportional
 * normalisation: adjusted_i = implied_i / (implied_over + implied_under).
 */
export const computeMarginAdjustedOverUnder = (
  odds: MarketOdds[]
): Partial<Record<MarketId, number>> => {
  const byId = new Map<MarketId, MarketOdds>();
  odds.forEach((entry) => byId.set(entry.marketId, entry));

  const adjusted: Partial<Record<MarketId, number>> = {};
  odds.forEach((entry) => {
    if (typeof entry.marginAdjustedProbability === 'number') {
      adjusted[entry.marketId] = entry.marginAdjustedProbability;
    }
  });

  OVER_UNDER_PAIRS.forEach(([overId, underId]) => {
    const over = byId.get(overId);
    const under = byId.get(underId);
    if (!over || !under) {
      return;
    }
    const overImplied = impliedProbability(over.decimalOdds);
    const underImplied = impliedProbability(under.decimalOdds);
    const totalImplied = overImplied + underImplied;
    if (totalImplied <= 0) {
      return;
    }
    if (adjusted[overId] === undefined) adjusted[overId] = overImplied / totalImplied;
    if (adjusted[underId] === undefined) adjusted[underId] = underImplied / totalImplied;
  });

  // 1X2: normalise the three outcomes together.
  const homeWin = byId.get('home_win');
  const draw = byId.get('draw');
  const awayWin = byId.get('away_win');
  if (homeWin && draw && awayWin) {
    const totalImplied =
      impliedProbability(homeWin.decimalOdds) +
      impliedProbability(draw.decimalOdds) +
      impliedProbability(awayWin.decimalOdds);
    if (totalImplied > 0) {
      if (adjusted.home_win === undefined) adjusted.home_win = impliedProbability(homeWin.decimalOdds) / totalImplied;
      if (adjusted.draw === undefined) adjusted.draw = impliedProbability(draw.decimalOdds) / totalImplied;
      if (adjusted.away_win === undefined) adjusted.away_win = impliedProbability(awayWin.decimalOdds) / totalImplied;
    }
  }

  // BTTS: normalise yes/no.
  const bttsYes = byId.get('btts_yes');
  const bttsNo = byId.get('btts_no');
  if (bttsYes && bttsNo) {
    const totalImplied =
      impliedProbability(bttsYes.decimalOdds) + impliedProbability(bttsNo.decimalOdds);
    if (totalImplied > 0) {
      if (adjusted.btts_yes === undefined) adjusted.btts_yes = impliedProbability(bttsYes.decimalOdds) / totalImplied;
      if (adjusted.btts_no === undefined) adjusted.btts_no = impliedProbability(bttsNo.decimalOdds) / totalImplied;
    }
  }

  return adjusted;
};