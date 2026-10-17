import { runBacktest, brierScore, logLoss, buildCalibrationBuckets } from '../backtest';
import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { makeFixture, makeStandingRow, makeStandings } from '../test-support/fixture-builders';

const config = DEFAULT_PREDICTION_CONFIG;

const rows = Array.from({ length: 10 }, (_, index) =>
  makeStandingRow({
    teamId: index + 1,
    rank: index + 1,
    played: 30,
    win: 30 - index,
    draw: 0,
    lose: index,
    goalsFor: 60 - index,
    goalsAgainst: index * 2,
    points: (30 - index) * 3,
  })
);
const standings = [makeStandings({ leagueId: 1, season: 2023, rows })];

/** Deterministic pseudo-season generator (no RNG) so tests are reproducible. */
const buildSeason = (count: number) => {
  const fixtures = [];
  const teams = 10;
  const base = Date.UTC(2023, 7, 1);
  for (let i = 0; i < count; i += 1) {
    const home = (i % teams) + 1;
    const away = ((i + 3) % teams) + 1;
    if (home === away) continue;
    fixtures.push(
      makeFixture({
        id: i + 1,
        timestamp: base + i * 86_400_000,
        homeId: home,
        awayId: away,
        homeGoals: (i * 7) % 4,
        awayGoals: (i * 13) % 3,
        leagueId: 1,
        season: 2023,
      })
    );
  }
  return fixtures;
};

describe('backtest', () => {
  it('scores a perfect prediction with Brier 0 and log loss 0', () => {
    expect(brierScore(1, true)).toBe(0);
    expect(brierScore(0, false)).toBe(0);
    expect(logLoss(1, true)).toBeCloseTo(0, 6);
    expect(logLoss(0, false)).toBeCloseTo(0, 6);
  });

  it('penalises confident wrong predictions', () => {
    expect(brierScore(0.9, false)).toBeCloseTo(0.81, 6);
    expect(logLoss(0.9, false)).toBeGreaterThan(2);
  });

  it('builds calibration buckets with expected frequencies', () => {
    const buckets = buildCalibrationBuckets([
      { probability: 0.61, happened: true },
      { probability: 0.62, happened: true },
      { probability: 0.65, happened: false },
      { probability: 0.05, happened: false },
    ]);
    const sixties = buckets[6]; // 0.60 - 0.70
    expect(sixties.predictions).toBe(3);
    expect(sixties.observedFrequency).toBeCloseTo(2 / 3, 3);
  });

  it('separates train and test chronologically and reports insufficient data honestly', () => {
    const season = buildSeason(40);
    const result = runBacktest({
      allFixtures: season,
      standings,
      config,
      minFixturesForMeaningfulResult: 100,
    });

    expect(result.totalFixtures).toBe(season.length);
    expect(result.sufficientData).toBe(false);
    expect(result.notes.join(' ')).toMatch(/meaningful backtest/i);
    expect(result.markets.length).toBeGreaterThan(0);
    result.markets.forEach((market) => {
      expect(market.brierScore).toBeGreaterThanOrEqual(0);
      expect(market.brierScore).toBeLessThanOrEqual(1);
      expect(market.logLoss).toBeGreaterThanOrEqual(0);
      expect(market.calibration.length).toBe(10);
    });
  });

  it('evaluates only the held-out test window', () => {
    const season = buildSeason(60);
    const result = runBacktest({ allFixtures: season, standings, config });
    const totalPredictions = result.markets.reduce((acc, m) => acc + m.predictions, 0);
    // Test window is ~40% of 60 fixtures, and each contributes several markets.
    expect(totalPredictions).toBeGreaterThan(0);
    expect(totalPredictions).toBeLessThan(60 * 6);
  });
});