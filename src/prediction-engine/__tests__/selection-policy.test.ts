import { DEFAULT_PREDICTION_CONFIG, mergePredictionConfig } from '../../config/prediction-config';
import { predictFixture } from '../predict-fixture';
import { buildCandidateSelections, reliabilityScore } from '../selection';
import { buildMarketValue } from '../odds';
import { rankSelections, groupCorrelatedMarkets } from '../markets';
import { makeFixture, makeStandingRow, makeStandings } from '../test-support/fixture-builders';

const config = DEFAULT_PREDICTION_CONFIG;
const NOW = Date.UTC(2023, 9, 1);

const rows = Array.from({ length: 20 }, (_, i) =>
  makeStandingRow({
    teamId: i + 1, rank: i + 1, played: 12, win: 12 - Math.floor(i / 2), draw: i % 3,
    lose: Math.floor(i / 4), goalsFor: 30 - i, goalsAgainst: i, points: (12 - Math.floor(i / 2)) * 3,
  })
);
const standings = [makeStandings({ leagueId: 1, season: 2023, rows })];

const history = () => {
  const out = [];
  for (let i = 0; i < 8; i += 1) {
    out.push(makeFixture({ id: 100 + i, timestamp: Date.UTC(2023, 7, 1 + i), homeId: 1, awayId: 800 + i, homeGoals: 2, awayGoals: i % 2, season: 2023 }));
    out.push(makeFixture({ id: 200 + i, timestamp: Date.UTC(2023, 7, 1 + i), homeId: 700 + i, awayId: 2, homeGoals: i % 3, awayGoals: 1, season: 2023 }));
  }
  return out;
};
const upcoming = makeFixture({ id: 9999, timestamp: NOW, homeId: 1, awayId: 2, homeGoals: null, awayGoals: null, season: 2023, status: 'NS' });

describe('selection policy: configurable thresholds are enforced', () => {
  it('honours a raised minimum edge (configurable)', () => {
    const strict = mergePredictionConfig({ selection: { defaultMinEdge: 0.25 } });
    const odds = { marketId: 'over_2_5' as const, decimalOdds: 2.2, timestamp: NOW };
    const lenientValue = buildMarketValue({ marketId: 'over_2_5', modelProbability: 0.6, odds, marginAdjustedProbability: 0.45, config, now: NOW });
    const strictValue = buildMarketValue({ marketId: 'over_2_5', modelProbability: 0.6, odds, marginAdjustedProbability: 0.45, config: strict, now: NOW });
    expect(lenientValue.qualifies).toBe(true);   // edge 0.15 >= 0.03
    expect(strictValue.qualifies).toBe(false);   // edge 0.15 < 0.25
  });

  it('honours a raised minimum probability (configurable)', () => {
    const strict = mergePredictionConfig({ selection: { perMarket: { btts_yes: { minProbability: 0.95 } } } });
    const value = buildMarketValue({ marketId: 'btts_yes', modelProbability: 0.6, odds: { marketId: 'btts_yes', decimalOdds: 3, timestamp: NOW }, marginAdjustedProbability: 0.3, config: strict, now: NOW });
    expect(value.passedProbabilityThreshold).toBe(false);
    expect(value.qualifies).toBe(false);
  });

  it('handles high probability but poor odds (probability gate passes, edge fails)', () => {
    const value = buildMarketValue({
      marketId: 'over_1_5', modelProbability: 0.8,
      odds: { marketId: 'over_1_5', decimalOdds: 1.05, timestamp: NOW }, // implied 0.952
      marginAdjustedProbability: 0.94, config, now: NOW,
    });
    expect(value.passedProbabilityThreshold).toBe(true);
    expect(value.passedEdgeThreshold).toBe(false);
    expect(value.qualifies).toBe(false);
    expect(value.expectedValue!).toBeLessThan(0); // 0.8*1.05 - 1 = -0.16
  });

  it('handles positive EV but weak data by abstaining via the quality gate', () => {
    const weak = predictFixture({
      fixture: upcoming,
      allFixtures: [makeFixture({ id: 1, timestamp: 100, homeId: 1, awayId: 900, homeGoals: 1, awayGoals: 0, season: 2023 })],
      leaguesStandings: [],
      now: NOW,
      odds: [{ marketId: 'over_2_5', decimalOdds: 5, timestamp: NOW }],
    });
    // Even with attractive odds, the sample is too small -> nothing is recommended.
    expect(weak.selections).toHaveLength(0);
    expect(reliabilityScore(weak)).toBeLessThan(0.75);
  });

  it('can abstain entirely (no qualifying market)', () => {
    const noOdds = predictFixture({ fixture: upcoming, allFixtures: history(), leaguesStandings: standings, now: NOW, standingsAreCurrent: false });
    expect(noOdds.selections).toHaveLength(0);
  });

  it('flags correlated selections so they are not treated as independent', () => {
    const prediction = predictFixture({
      fixture: upcoming, allFixtures: history(), leaguesStandings: standings, now: NOW, standingsAreCurrent: false,
      odds: [
        { marketId: 'home_win', decimalOdds: 3.0, timestamp: NOW },
        { marketId: 'draw', decimalOdds: 3.2, timestamp: NOW },
        { marketId: 'away_win', decimalOdds: 3.2, timestamp: NOW },
        { marketId: 'over_2_5', decimalOdds: 3.0, timestamp: NOW },
        { marketId: 'under_2_5', decimalOdds: 1.4, timestamp: NOW },
      ],
    });
    const groups = groupCorrelatedMarkets(prediction.markets);
    expect(groups['1X2']).toBeDefined();
    expect(groups['1X2']).toEqual(expect.arrayContaining(['home_win', 'draw', 'away_win']));
    // Correlated markets are grouped, and only one should be surfaced as "leading".
    expect(prediction.selections.length).toBeLessThanOrEqual(config.selection.maxSelections);
  });

  it('uses current standings as an explicitly flagged proxy for historical strength', () => {
    const withCurrent = predictFixture({
      fixture: upcoming, allFixtures: history(), leaguesStandings: standings, now: NOW, standingsAreCurrent: true,
    });
    expect(withCurrent.dataQuality.opponentStrengthHindsightBias).toBe(true);
    const withHistorical = predictFixture({
      fixture: upcoming, allFixtures: history(), leaguesStandings: standings, now: NOW, standingsAreCurrent: false,
    });
    expect(withHistorical.dataQuality.opponentStrengthHindsightBias).toBe(false);
  });

  it('ranks multiple qualifying odds-backed selections by EV', () => {
    // home_over_0_5 ~0.78 and home_win ~0.48 in this fixture; give both generous odds
    // so both clear probability+edge, then check the EV ordering.
    const prediction = predictFixture({
      fixture: upcoming, allFixtures: history(), leaguesStandings: standings, now: NOW, standingsAreCurrent: false,
      odds: [
        { marketId: 'home_over_0_5', decimalOdds: 1.6, timestamp: NOW },
        { marketId: 'home_win', decimalOdds: 2.6, timestamp: NOW },
      ],
    });
    const ranked = rankSelections(prediction.markets, config);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i += 1) {
      expect((ranked[i - 1].expectedValue ?? -Infinity)).toBeGreaterThanOrEqual(ranked[i].expectedValue ?? -Infinity);
    }
  });

  it('reports candidates and rejected markets with reasons', () => {
    const prediction = predictFixture({
      fixture: upcoming, allFixtures: history(), leaguesStandings: standings, now: NOW, standingsAreCurrent: false,
      odds: [{ marketId: 'home_over_0_5', decimalOdds: 1.6, timestamp: NOW }, { marketId: 'under_2_5', decimalOdds: 1.2, timestamp: NOW }],
    });
    const { candidates, rejected } = buildCandidateSelections({ predictions: [prediction], config });
    expect(candidates.length).toBeGreaterThan(0);
    expect(rejected.length).toBeGreaterThan(0);
    candidates.forEach((entry) => expect(entry.market.qualifies).toBe(true));
    rejected.forEach((entry) => expect(entry.reasons.length).toBeGreaterThan(0));
  });
});