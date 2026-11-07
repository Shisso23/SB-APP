import { FORECAST_HIGHLIGHTS, ForecastPreference, ForecastId, forecastProbability, highlightLevel, LEGACY_FORECAST_IDS, visibleForecastPrediction } from './forecast-highlights';
import { SUPPORTED_MARKETS } from '../prediction-engine/markets';
import { betOptions } from '../variables/variables';
import { FixturePrediction, ScorelineProbability } from '../prediction-engine/types';
import { buildPoissonGrid } from '../prediction-engine/poisson';
import { DEFAULT_PREDICTION_CONFIG } from './prediction-config';

const prediction = (grid?: ScorelineProbability[]): FixturePrediction => ({
  markets: [{ marketId: 'home_or_draw', modelProbability: .85 }],
  probabilities: { baseScorelines: grid, topScorelines: [{ home: 2, away: 1, probability: .1 }] },
} as FixturePrediction);

test('every statistical and active legacy option has a configuration', () => {
  SUPPORTED_MARKETS.filter(id => id !== 'btts_no').forEach(id => expect(FORECAST_HIGHLIGHTS[id]).toBeDefined());
  betOptions.forEach(option => expect(FORECAST_HIGHLIGHTS[LEGACY_FORECAST_IDS[option.id]]).toBeDefined());
  expect(Object.keys(FORECAST_HIGHLIGHTS)).toHaveLength(25);
});

test.each(Object.keys(FORECAST_HIGHLIGHTS) as ForecastId[])('%s uses inclusive raw probability boundaries and rejects missing/invalid data', id => {
  const pref = FORECAST_HIGHLIGHTS[id] as ForecastPreference;
  expect(highlightLevel(pref.suggest - .000001, pref)).toBe('none');
  expect(highlightLevel(pref.suggest, pref)).toBe('suggested');
  if (pref.strong !== undefined) {
    expect(pref.strong).toBeGreaterThan(pref.suggest);
    expect(highlightLevel(pref.strong - .000001, pref)).toBe('suggested');
    expect(highlightLevel(pref.strong, pref)).toBe('strong');
  }
  [undefined, null, NaN, Infinity, -1, 72, '0.8'].forEach(value => expect(highlightLevel(value, pref)).toBe('none'));
});

test('preserves user values without changing engine pick thresholds', () => {
  expect(FORECAST_HIGHLIGHTS.home_win).toMatchObject({ suggest: .60 });
  expect(FORECAST_HIGHLIGHTS.away_win).toMatchObject({ suggest: .60 });
  expect(FORECAST_HIGHLIGHTS.home_win).not.toHaveProperty('strong');
  expect(FORECAST_HIGHLIGHTS.away_win).not.toHaveProperty('strong');
  expect(FORECAST_HIGHLIGHTS.home_over_0_5.suggest).toBe(.82);
  expect(FORECAST_HIGHLIGHTS.away_over_0_5.suggest).toBe(.82);
  expect(FORECAST_HIGHLIGHTS.btts_yes.suggest).toBe(.72);
  expect(FORECAST_HIGHLIGHTS.over_3_5.suggest).toBe(.70);
  expect(DEFAULT_PREDICTION_CONFIG.selection.perMarket.home_win?.minProbability).toBe(.5);
  expect(DEFAULT_PREDICTION_CONFIG.selection.perMarket.over_3_5?.minProbability).toBe(.42);
  expect(FORECAST_HIGHLIGHTS).not.toHaveProperty('over_3_0');
});

test('ranges sum inclusive disjoint outcomes from a complete grid', () => {
  const p = prediction([
    { home: 1, away: 0, probability: .1 },
    { home: 1, away: 1, probability: .2 },
    { home: 2, away: 1, probability: .3 },
    { home: 2, away: 3, probability: .15 },
    { home: 3, away: 3, probability: .25 },
  ]);
  expect(forecastProbability(p, 'total_2_5')).toBeCloseTo(.65);
  expect(forecastProbability(p, 'total_3_6')).toBeCloseTo(.7);
  expect(forecastProbability(p, 'home_1_2')).toBeCloseTo(.75);
  expect(forecastProbability(p, 'home_over_1_5')).toBeCloseTo(.7);
  expect(forecastProbability(p, 'away_2_3')).toBeCloseTo(.4);
  expect(forecastProbability(p, 'home_or_draw')).toBe(.85);
});

test('does not invent probabilities from truncated top scorelines, malformed grids or missing markets', () => {
  expect(forecastProbability(prediction(), 'total_2_5')).toBeUndefined();
  expect(forecastProbability(prediction([{ home: 2, away: 1, probability: .1 }]), 'total_2_5')).toBeUndefined();
  expect(forecastProbability(prediction([{ home: -1, away: 1, probability: 1 }]), 'total_2_5')).toBeUndefined();
  expect(forecastProbability(prediction(), 'home_win')).toBeUndefined();
});

test('base grid leaves standard model probabilities and DNB semantics intact', () => {
  const grid = buildPoissonGrid({ homeLambda: 1.7, awayLambda: 1.1, config: DEFAULT_PREDICTION_CONFIG });
  expect(grid.baseScorelines.reduce((sum, line) => sum + line.probability, 0)).toBeCloseTo(1, 10);
  expect(grid.homeOrDraw).toBeCloseTo(grid.homeWin + grid.draw, 3);
  expect(grid.homeDrawNoBet).toBeCloseTo(grid.homeWin / (grid.homeWin + grid.awayWin), 3);
  expect(grid.over1_5).toBeCloseTo(grid.baseScorelines.filter(line => line.home + line.away >= 2).reduce((sum, line) => sum + line.probability, 0), 3);
});


test('BTTS No is hidden from forecasts, ranked candidates and leading headlines without changing engine data', () => {
  const original = {
    ...prediction(),
    markets: [{ marketId: 'btts_no', modelProbability: .9 }, { marketId: 'btts_yes', modelProbability: .1 }],
    selections: [{ marketId: 'btts_no', modelProbability: .9 }],
    headline: 'Leading: BTTS No',
  } as FixturePrediction;
  const visible = visibleForecastPrediction(original);
  expect(FORECAST_HIGHLIGHTS).not.toHaveProperty('btts_no');
  expect(FORECAST_HIGHLIGHTS.btts_yes.suggest).toBe(.72);
  expect(visible.markets.map(market => market.marketId)).toEqual(['btts_yes']);
  expect(visible.selections).toEqual([]);
  expect(visible.headline).toBe('');
  expect(original.markets).toHaveLength(2);
  expect(original.selections).toHaveLength(1);
});
