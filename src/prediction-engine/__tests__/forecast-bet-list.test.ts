import { buildForecastBetList, formatForecastBetList } from '../forecast-bet-list';
import { makeForecastBetPrediction } from '../test-support/forecast-bet-builders';
import { MarketId } from '../types';
const now = Date.UTC(2026, 10, 7, 10);

test.each<[MarketId, number]>([['home_win', .6], ['away_win', .6], ['home_over_0_5', .82], ['away_over_0_5', .82], ['btts_yes', .72], ['over_3_5', .7]])('%s enters only at its inclusive user threshold', (marketId, threshold) => {
  expect(buildForecastBetList([makeForecastBetPrediction({ now, markets: { [marketId]: threshold - .001 } })], now)).toHaveLength(0);
  expect(buildForecastBetList([makeForecastBetPrediction({ now, markets: { [marketId]: threshold } })], now)[0].forecastId).toBe(marketId);
});

test('compares relative surplus instead of simply choosing the highest raw probability', () => {
  const prediction = makeForecastBetPrediction({ now, markets: { home_win: .8, home_or_draw: .85, away_win: .65 } });
  const list = buildForecastBetList([prediction], now);
  expect(list).toHaveLength(1);
  expect(list[0].forecastId).toBe('home_win');
  expect(list[0].relativeSurplus).toBeCloseTo(.5);
});

test('excludes started, finished and postponed matches while keeping threshold qualifiers with limited history', () => {
  const started = makeForecastBetPrediction({ now, id: 1, kickoff: now });
  const finished = makeForecastBetPrediction({ now, id: 2 });
  finished.fixture.fixture.status.short = 'FT';
  const postponed = makeForecastBetPrediction({ now, id: 3 });
  postponed.fixture.fixture.status.short = 'PST';
  const insufficient = makeForecastBetPrediction({ now, id: 4 });
  insufficient.homeTeam.overallSampleSize = 2;
  const eligible = makeForecastBetPrediction({ now, id: 5 });
  expect(buildForecastBetList([started, finished, postponed, insufficient, eligible], now).map(entry => entry.prediction.fixture.fixture.id)).toEqual([4, 5]);
  expect(buildForecastBetList([insufficient], now)[0].historyLimited).toBe(true);
});

test('never includes BTTS No, missing markets, invalid probabilities or incomplete grids', () => {
  const prediction = makeForecastBetPrediction({ now, markets: { btts_no: .99, btts_yes: .75 } });
  expect(buildForecastBetList([prediction], now)[0].forecastId).toBe('btts_yes');
  prediction.markets = [];
  expect(buildForecastBetList([prediction], now)).toHaveLength(0);
  prediction.probabilities.baseScorelines = [{ home: 2, away: 1, probability: .2 }];
  expect(buildForecastBetList([prediction], now)).toHaveLength(0);
  prediction.markets = makeForecastBetPrediction({ now }).markets;
  prediction.markets[0].modelProbability = 80;
  expect(buildForecastBetList([prediction], now)).toHaveLength(0);
  prediction.markets[0].modelProbability = NaN;
  expect(buildForecastBetList([prediction], now)).toHaveLength(0);
});

test('includes supported derived ranges without inventing bookmaker quotes', () => {
  const prediction = makeForecastBetPrediction({ now, markets: {} });
  prediction.probabilities.baseScorelines = [{ home: 2, away: 1, probability: 1 }];
  const [suggestion] = buildForecastBetList([prediction], now);
  expect(suggestion.preference.range).toBeDefined();
  expect(suggestion.probability).toBe(1);
  expect(suggestion.market).toBeUndefined();
  expect(suggestion.priceStatus).toBe('unpriced');
  expect(formatForecastBetList([suggestion])).toContain('No available odds');
  expect(formatForecastBetList([suggestion])).toContain('Source: base scoreline model');
});

test('distinguishes checked prices, negative EV, unavailable quotes and stale or missing timestamps', () => {
  const checked = makeForecastBetPrediction({ now, id: 1, odds: [{ marketId: 'home_win', decimalOdds: 2, timestamp: now - 1000 }] });
  const negativeEv = makeForecastBetPrediction({ now, id: 2, odds: [{ marketId: 'home_win', decimalOdds: 1.1, timestamp: now - 1000 }] });
  const noQuote = makeForecastBetPrediction({ now, id: 3 });
  const stale = makeForecastBetPrediction({ now, id: 4, odds: [{ marketId: 'home_win', decimalOdds: 2, timestamp: now - 13 * 3_600_000 }] });
  stale.markets[0].oddsStale = false; // Re-check the timestamp instead of trusting a cached flag.
  const unknown = makeForecastBetPrediction({ now, id: 5, odds: [{ marketId: 'home_win', decimalOdds: 2 }] });
  const list = buildForecastBetList([checked, negativeEv, noQuote, stale, unknown], now);
  expect(list.map(suggestion => suggestion.priceStatus)).toEqual(['checked', 'unqualified', 'unpriced', 'stale', 'stale']);
  expect(formatForecastBetList([list[0]])).toContain('Price checks passed');
  expect(formatForecastBetList([list[0]])).toContain('Odds 2.00');
});

test('keeps order deterministic, removes duplicate fixtures and drops entries at kickoff', () => {
  const early = makeForecastBetPrediction({ now, id: 1, kickoff: now + 10_000 });
  const later = makeForecastBetPrediction({ now, id: 2, kickoff: now + 20_000 });
  expect(buildForecastBetList([later, early, early], now).map(entry => entry.key)).toEqual(['1:home_win', '2:home_win']);
  expect(buildForecastBetList([later, early], now + 10_000).map(entry => entry.key)).toEqual(['2:home_win']);
});


test('threshold membership is independent of model selections and price qualification', () => {
  const prediction = makeForecastBetPrediction({ now, markets: { home_win: .6 } });
  prediction.selections = [];
  prediction.markets[0].qualifies = false;
  prediction.markets[0].passedProbabilityThreshold = false;
  prediction.markets[0].passedEdgeThreshold = false;
  prediction.markets[0].rejectReasons = ['Rejected by the separate model-pick policy'];
  const list = buildForecastBetList([prediction], now);
  expect(list).toHaveLength(1);
  expect(list[0].forecastId).toBe('home_win');
  expect(list[0].priceStatus).toBe('unpriced');
  prediction.markets[0].modelProbability = .59999;
  expect(buildForecastBetList([prediction], now)).toHaveLength(0);
});

const variedMarkets = { home_win: .8, btts_yes: .75, over_2_5: .8 };

test('diversifies across qualifying market families while keeping one outcome per match', () => {
  const predictions = [1, 2, 3].map(id => makeForecastBetPrediction({ now, id, markets: variedMarkets }));
  const list = buildForecastBetList(predictions, now);
  expect(list).toHaveLength(3);
  expect(new Set(list.map(entry => entry.family)).size).toBe(3);
  expect(new Set(list.map(entry => entry.prediction.fixture.fixture.id)).size).toBe(3);
  expect(new Set(list.map(entry => entry.forecastId))).toEqual(new Set(['home_win', 'btts_yes', 'over_2_5']));
  expect(list.filter(entry => entry.diversityAlternative)).toHaveLength(2);
  list.filter(entry => entry.diversityAlternative).forEach(entry => {
    expect(entry.diversityAlternative).toEqual({ label: 'Home win', probability: .8 });
    expect(entry.probability).toBeGreaterThanOrEqual(entry.preference.suggest);
  });
  expect(formatForecastBetList(list)).toContain('Chosen for variety; strongest qualifying option');
});

test('spreads individual options evenly when only one market family qualifies', () => {
  const predictions = [1, 2, 3, 4].map(id => makeForecastBetPrediction({ now, id, markets: { over_1_5: .9, under_3_5: .85 } }));
  const list = buildForecastBetList(predictions, now);
  expect(list.filter(entry => entry.forecastId === 'over_1_5')).toHaveLength(2);
  expect(list.filter(entry => entry.forecastId === 'under_3_5')).toHaveLength(2);
});

test('does not force variety with below-threshold alternatives or discard qualifying repeat-only matches', () => {
  const predictions = [1, 2, 3].map(id => makeForecastBetPrediction({ now, id, markets: { home_over_0_5: .9, btts_yes: .7199, over_3_5: .6999 } }));
  const list = buildForecastBetList(predictions, now);
  expect(list).toHaveLength(3);
  expect(list.every(entry => entry.forecastId === 'home_over_0_5')).toBe(true);
  expect(list.some(entry => entry.diversityAlternative)).toBe(false);
});

test('reassigns a flexible match to leave room for matches with only one qualifying option', () => {
  const flexible = makeForecastBetPrediction({ now, id: 1, markets: { home_win: .9, btts_yes: .72 } });
  const restricted = makeForecastBetPrediction({ now, id: 2, markets: { home_win: .6 } });
  const list = buildForecastBetList([flexible, restricted], now);
  expect(list.map(entry => entry.key).sort()).toEqual(['1:btts_yes', '2:home_win']);
});

test('keeps the strongest selected matches instead of replacing one just to introduce another market type', () => {
  const sameOption = [1, 2, 3, 4, 5].map(id => makeForecastBetPrediction({ now, id, markets: { home_win: .9 } }));
  const alternative = makeForecastBetPrediction({ now, id: 6, markets: { btts_yes: .72 } });
  const list = buildForecastBetList([...sameOption, alternative], now, { limit: 3 });
  expect(list).toHaveLength(3);
  expect(list.map(entry => entry.prediction.fixture.fixture.id)).toEqual([1, 2, 3]);
  expect(list.every(entry => entry.forecastId === 'home_win')).toBe(true);
});

test('does not count identical 0–3 and under-3.5 outcomes as artificial variety', () => {
  const predictions = [1, 2, 3].map(id => {
    const prediction = makeForecastBetPrediction({ now, id, markets: { under_3_5: .9, over_1_5: .81 } });
    prediction.probabilities.baseScorelines = [
      { home: 0, away: 0, probability: .6 }, { home: 0, away: 1, probability: .3 }, { home: 7, away: 0, probability: .1 },
    ];
    return prediction;
  });
  const list = buildForecastBetList(predictions, now);
  expect(list).toHaveLength(3);
  expect(new Set(list.map(entry => entry.forecastId)).size).toBe(2);
  expect(list.some(entry => entry.forecastId === 'over_1_5')).toBe(true);
});

test('supports strongest-only selection and is deterministic across input order and repeated calls', () => {
  const predictions = [1, 2, 3, 4].map(id => makeForecastBetPrediction({ now, id, markets: variedMarkets }));
  const strongest = buildForecastBetList(predictions, now, { limit: 3, diversify: false });
  expect(strongest.every(entry => entry.forecastId === 'home_win')).toBe(true);
  expect(strongest.some(entry => entry.diversityAlternative)).toBe(false);
  const keys = buildForecastBetList(predictions, now, { limit: 3 }).map(entry => entry.key);
  expect(buildForecastBetList([...predictions].reverse(), now, { limit: 3 }).map(entry => entry.key)).toEqual(keys);
  expect(buildForecastBetList(predictions, now, { limit: 3 }).map(entry => entry.key)).toEqual(keys);
});


test('fills a requested ten-match list even when every match only qualifies for the same option', () => {
  const predictions = Array.from({ length: 12 }, (_, index) => makeForecastBetPrediction({ now, id: index + 1, markets: { home_win: .8, btts_yes: .7199 } }));
  const list = buildForecastBetList(predictions, now, { limit: 10 });
  expect(list).toHaveLength(10);
  expect(new Set(list.map(entry => entry.prediction.fixture.fixture.id)).size).toBe(10);
  expect(list.every(entry => entry.forecastId === 'home_win')).toBe(true);
});

test('uses qualifying alternatives within ten selected matches and repeats for matches without alternatives', () => {
  const predictions = Array.from({ length: 10 }, (_, index) => makeForecastBetPrediction({
    now, id: index + 1, markets: index < 2 ? { home_win: .8, btts_yes: .75 } : { home_win: .8 },
  }));
  const list = buildForecastBetList(predictions, now, { limit: 10 });
  expect(list).toHaveLength(10);
  expect(new Set(list.map(entry => entry.prediction.fixture.fixture.id)).size).toBe(10);
  expect(list.some(entry => entry.forecastId === 'btts_yes')).toBe(true);
  expect(list.filter(entry => entry.prediction.fixture.fixture.id > 2).every(entry => entry.forecastId === 'home_win')).toBe(true);
  expect(list.every(entry => entry.probability >= entry.preference.suggest)).toBe(true);
});

test('does not invent matches or lower thresholds when fewer than ten matches qualify', () => {
  const predictions = Array.from({ length: 10 }, (_, index) => makeForecastBetPrediction({ now, id: index + 1, markets: { home_win: index < 7 ? .6 : .5999 } }));
  const list = buildForecastBetList(predictions, now, { limit: 10 });
  expect(list).toHaveLength(7);
  expect(list.every(entry => entry.forecastId === 'home_win')).toBe(true);
});

test('derives BTTS and over 2.5 qualification from component markets independently clearing their own thresholds', () => {
  const btts = makeForecastBetPrediction({ now, markets: { home_over_0_5: .82, away_over_0_5: .82, btts_yes: .71 } });
  expect(buildForecastBetList([btts], now)).toEqual(expect.arrayContaining([expect.objectContaining({ forecastId: 'btts_yes', derivedQualification: true })]));

  // home_over_1_5 is a base-grid range (home scores 2+), so its own threshold is cleared via the grid.
  const over25 = makeForecastBetPrediction({ now, markets: { away_over_0_5: .82, over_2_5: .74 } });
  over25.probabilities.baseScorelines = [{ home: 2, away: 0, probability: .75 }, { home: 0, away: 0, probability: .25 }];
  expect(buildForecastBetList([over25], now).some(entry => entry.forecastId === 'over_2_5' && entry.derivedQualification)).toBe(true);

  // Does not derive when only one side of the support group clears its own threshold.
  const incomplete = makeForecastBetPrediction({ now, markets: { home_over_0_5: .82, btts_yes: .71 } });
  expect(buildForecastBetList([incomplete], now).some(entry => entry.forecastId === 'btts_yes')).toBe(false);

  // Never downgrades a market that already clears its own threshold.
  const ownThreshold = makeForecastBetPrediction({ now, markets: { btts_yes: .9 } });
  expect(buildForecastBetList([ownThreshold], now)[0].derivedQualification).toBe(false);
});



test('prefers core markets (home/draw/away, BTTS, over 2.5) over narrower markets when both qualify', () => {
  // home_or_draw has much higher relative surplus but is not a core market; over_2_5 wins on tier.
  const prediction = makeForecastBetPrediction({ now, markets: { over_2_5: .76, home_or_draw: .95 } });
  const list = buildForecastBetList([prediction], now);
  expect(list).toHaveLength(1);
  expect(list[0].forecastId).toBe('over_2_5');
});

