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
