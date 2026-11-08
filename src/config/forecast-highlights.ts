import { FixturePrediction, MARKET_IMPLICATIONS, MARKET_LABELS, MarketId } from '../prediction-engine/types';

export interface ForecastPreference {
  label: string;
  suggest: number;
  strong?: number;
  meaning: string;
  source: 'user-specified' | 'initial-preference';
  range?: { side: 'total' | 'home' | 'away'; min: number; max: number };
}
const preference = (label: string, suggest: number, strong: number, meaning: string): ForecastPreference =>
  ({ label, suggest, strong, meaning, source: 'initial-preference' });
const range = (label: string, suggest: number, strong: number, side: 'total' | 'home' | 'away', min: number, max: number): ForecastPreference =>
  ({ ...preference(label, suggest, strong, (max === Infinity ? `At least ${min} ${side} goals; no push.` : `${min}–${max} ${side} goals, both endpoints inclusive; no push.`)), range: { side, min, max } });

/** Display preferences only: independent of EV/odds eligibility; not accuracy claims.
 * User-specified display thresholds never change the model selection policy.
 * Other starting preferences are anchored to the user's selectivity: broader
 * totals/DC require higher percentages, narrower exact ranges lower percentages.
 * Home/away use equal cutoffs; no unvalidated venue-specific preference is assumed.
 * These are configurable inspection preferences, not calibrated accuracy targets.
 */
export const FORECAST_HIGHLIGHTS = {
  home_win: { label: MARKET_LABELS.home_win, suggest: .60, meaning: 'Home wins in regular time.', source: 'user-specified' as const },
  draw: preference(MARKET_LABELS.draw, .45, .60, 'Scores level in regular time.'),
  away_win: { label: MARKET_LABELS.away_win, suggest: .60, meaning: 'Away wins in regular time.', source: 'user-specified' as const },
  home_over_0_5: { label: MARKET_LABELS.home_over_0_5, suggest: .82, meaning: 'Home scores at least 1; no push.', source: 'user-specified' as const },
  away_over_0_5: { label: MARKET_LABELS.away_over_0_5, suggest: .82, meaning: 'Away scores at least 1; no push.', source: 'user-specified' as const },
  btts_yes: { label: MARKET_LABELS.btts_yes, suggest: .72, meaning: 'Both teams score at least 1; no push.', source: 'user-specified' as const },
  over_1_5: preference(MARKET_LABELS.over_1_5, .80, .90, '2 goals or more means at least 2 total goals; no push.'),
  under_1_5: preference(MARKET_LABELS.under_1_5, .65, .80, '0–1 total goals; no push.'),
  over_2_5: preference(MARKET_LABELS.over_2_5, .75, .85, 'At least 3 total goals; no push. Not an Asian over 3 line.'),
  under_2_5: preference(MARKET_LABELS.under_2_5, .72, .85, '0–2 total goals; no push.'),
  over_3_5: { label: MARKET_LABELS.over_3_5, suggest: .70, meaning: 'At least 4 total goals; no push.', source: 'user-specified' as const },
  under_3_5: preference(MARKET_LABELS.under_3_5, .80, .90, '0–3 total goals; no push.'),
  home_or_draw: preference(MARKET_LABELS.home_or_draw, .80, .90, 'Home win or draw; existing double-chance probability.'),
  away_or_draw: preference(MARKET_LABELS.away_or_draw, .80, .90, 'Away win or draw; existing double-chance probability.'),
  home_dnb: preference(MARKET_LABELS.home_dnb, .70, .85, 'Home win conditional on a non-draw; draw refunded. Not outright win probability.'),
  away_dnb: preference(MARKET_LABELS.away_dnb, .70, .85, 'Away win conditional on a non-draw; draw refunded. Not outright win probability.'),
  total_2_5: range('2–5 total goals', .78, .88, 'total', 2, 5),
  total_3_6: range('3–6 total goals', .72, .85, 'total', 3, 6),
  total_0_3: range('0–3 total goals', .80, .90, 'total', 0, 3),
  home_over_1_5: range('Home over 1.5', .70, .85, 'home', 2, Infinity),
  away_over_1_5: range('Away over 1.5', .70, .85, 'away', 2, Infinity),
  home_1_2: range('Home 1–2 goals', .60, .75, 'home', 1, 2),
  home_2_3: range('Home 2–3 goals', .55, .70, 'home', 2, 3),
  away_1_2: range('Away 1–2 goals', .60, .75, 'away', 1, 2),
  away_2_3: range('Away 2–3 goals', .55, .70, 'away', 2, 3),
};
export type ForecastId = keyof typeof FORECAST_HIGHLIGHTS;

export const FORECAST_FAMILY_LABELS = {
  result: 'Match result',
  team_scoring: 'Team to score',
  btts: 'Both teams to score',
  totals: 'Goal totals',
  total_ranges: 'Total goal ranges',
  team_goals: 'Team goal totals and ranges',
};
export type ForecastFamily = keyof typeof FORECAST_FAMILY_LABELS;
/** Variety preferences only; these groups never change qualification thresholds. */
export const FORECAST_FAMILIES: Record<ForecastId, ForecastFamily> = {
  home_win: 'result', draw: 'result', away_win: 'result',
  home_over_0_5: 'team_scoring', away_over_0_5: 'team_scoring', btts_yes: 'btts',
  over_1_5: 'totals', under_1_5: 'totals', over_2_5: 'totals', under_2_5: 'totals',
  over_3_5: 'totals', under_3_5: 'totals', total_0_3: 'totals',
  home_or_draw: 'result', away_or_draw: 'result', home_dnb: 'result', away_dnb: 'result',
  total_2_5: 'total_ranges', total_3_6: 'total_ranges',
  home_over_1_5: 'team_goals', away_over_1_5: 'team_goals',
  home_1_2: 'team_goals', home_2_3: 'team_goals', away_1_2: 'team_goals', away_2_3: 'team_goals',
};

export const validProbability = (p: unknown): p is number => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;
export const highlightLevel = (p: unknown, preference: ForecastPreference): 'strong' | 'suggested' | 'none' => {
  if (!validProbability(p)) return 'none';
  if (preference.strong !== undefined && p >= preference.strong) return 'strong';
  return p >= preference.suggest ? 'suggested' : 'none';
};
export const forecastProbability = (prediction: FixturePrediction, id: ForecastId): number | undefined => {
  const config: ForecastPreference = FORECAST_HIGHLIGHTS[id];
  if (!config.range) {
    const p = prediction.markets.find(m => m.marketId === id)?.modelProbability;
    return validProbability(p) ? p : undefined;
  }
  // Top five scorelines are incomplete and must never be used for this sum.
  const grid = prediction.probabilities.baseScorelines;
  if (!grid?.length || grid.some(line => !validProbability(line.probability) || !Number.isInteger(line.home) || line.home < 0 || !Number.isInteger(line.away) || line.away < 0)) return undefined;
  const mass = grid.reduce((sum, line) => sum + line.probability, 0);
  if (Math.abs(mass - 1) > 1e-6) return undefined;
  const { side, min, max } = config.range;
  return grid.reduce((sum, line) => {
    const goals = side === 'total' ? line.home + line.away : line[side];
    return sum + (goals >= min && goals <= max ? line.probability : 0);
  }, 0);
};

export interface ImpliedHighlightResult {
  level: 'strong' | 'suggested' | 'none';
  /** Set when this forecast's own probability missed its threshold but every
   * forecast in one of its MARKET_IMPLICATIONS groups independently passed. */
  impliedBy?: ForecastId[];
}
/**
 * Falls back to a logical implication when a forecast's own number misses its own
 * threshold: if every forecast in one of its implying groups has already passed its
 * own threshold, this forecast's event is logically guaranteed too, so it is
 * suggested on that basis. Never relaxes a forecast's own threshold; only adds
 * another way to satisfy it.
 */
export const impliedHighlightResult = (prediction: FixturePrediction, id: ForecastId): ImpliedHighlightResult => {
  const own = highlightLevel(forecastProbability(prediction, id), FORECAST_HIGHLIGHTS[id]);
  if (own !== 'none') return { level: own };
  const groups = MARKET_IMPLICATIONS[id as MarketId];
  const impliedBy = groups?.find(group =>
    group.every(impliedId => highlightLevel(forecastProbability(prediction, impliedId), FORECAST_HIGHLIGHTS[impliedId]) !== 'none'));
  return impliedBy ? { level: 'suggested', impliedBy: impliedBy as ForecastId[] } : { level: 'none' };
};

// Only active legacy registry options; commented-out options are not supported UI.
export const LEGACY_FORECAST_IDS: Record<number, ForecastId> = {
  0: 'btts_yes', 1: 'home_win', 2: 'home_over_1_5', 3: 'over_1_5', 4: 'over_2_5',
  6: 'total_2_5', 7: 'total_3_6', 12: 'away_win', 13: 'away_over_1_5',
  15: 'home_over_0_5', 16: 'away_over_0_5', 19: 'total_0_3', 20: 'home_1_2',
  22: 'home_2_3', 23: 'away_1_2', 24: 'away_2_3', 26: 'home_or_draw',
};

/** User-visible forecasts exclude the unwanted BTTS No outcome. Keep the engine's
 * complementary probability intact for calculations, without displaying it as a pick.
 */
export const visibleForecastPrediction = (prediction: FixturePrediction): FixturePrediction => ({
  ...prediction,
  markets: prediction.markets.filter(market => market.marketId !== 'btts_no'),
  selections: prediction.selections.filter(market => market.marketId !== 'btts_no'),
  headline: prediction.selections[0]?.marketId === 'btts_no' ? '' : prediction.headline,
});
