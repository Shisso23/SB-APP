import * as fs from 'fs';
import * as path from 'path';
import { runBacktest } from '../backtest';
import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { loadFixturesFromJson, computeBaseRates } from '../test-support/real-data';
import { MarketId } from '../types';

/**
 * REAL-DATA EVALUATION (reproducible).
 *
 * Loads the actual API-Football fixtures captured under `eval-data/` (the same JSON the
 * application fetches via `services/fixtures`). These are real completed matches.
 *
 * Data provenance:
 *   GET https://v3.football.api-sports.io/fixtures?league=<id>&season=2023
 *   league 39  = Premier League  (380 matches)
 *   league 140 = La Liga         (380 matches)
 *   league 135 = Serie A         (380 matches)
 *
 * Methodology:
 *   - Chronological train/test split (60/40) per league.
 *   - Only matches strictly before each kickoff are visible to the model (leakage guard).
 *   - Opponent strength from standings is DISABLED (API-Football has no historical
 *     snapshots), so no future table information leaks in.
 *   - Baselines are the training-window base rate applied to the test window.
 *
 * This test asserts only structural correctness and that metrics are finite/plausible.
 * It does NOT assert "the model is profitable" - no historical odds exist.
 */

const EVAL_FILES = [
  'premier-league-2023.json',
  'la-liga-2023.json',
  'serie-a-2023.json',
];

const MARKETS: MarketId[] = [
  'home_win',
  'draw',
  'away_win',
  'btts_yes',
  'over_1_5',
  'over_2_5',
  'over_3_5',
  'home_over_0_5',
  'away_over_0_5',
];

const loadAll = () => {
  const dir = path.resolve(process.cwd(), 'eval-data');
  const perLeague: Array<{ name: string; fixtures: ReturnType<typeof loadFixturesFromJson> }> = [];

  EVAL_FILES.forEach((file) => {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      return;
    }
    const json = JSON.parse(fs.readFileSync(full, 'utf8'));
    perLeague.push({ name: file.replace('.json', ''), fixtures: loadFixturesFromJson(json) });
  });

  return perLeague;
};

describe('real-data evaluation (API-Football, 2023)', () => {
  const perLeague = loadAll();

  it('has real evaluation data available', () => {
    expect(perLeague.length).toBeGreaterThan(0);
    perLeague.forEach((league) => {
      const finished = league.fixtures.filter((f) => f.fixture.status.short === 'FT');
      // eslint-disable-next-line no-console
      console.log(`${league.name}: ${league.fixtures.length} fixtures, ${finished.length} finished`);
      expect(finished.length).toBeGreaterThan(100);
    });
  });

  it('reports Brier/log-loss and calibration per market, versus a base-rate baseline', () => {
    const combined = perLeague.flatMap((league) => league.fixtures);
    const baseRates = computeBaseRates(combined);

    // eslint-disable-next-line no-console
    console.log(
      `\nCombined base rates (finished matches): homeWin=${baseRates.homeWin.toFixed(3)} ` +
        `draw=${baseRates.draw.toFixed(3)} awayWin=${baseRates.awayWin.toFixed(3)} ` +
        `bttsYes=${baseRates.bttsYes.toFixed(3)} over2_5=${baseRates.over2_5.toFixed(3)} (n=${baseRates.sampleSize})`
    );

    const result = runBacktest({
      allFixtures: combined,
      standings: [],
      config: DEFAULT_PREDICTION_CONFIG,
      markets: MARKETS,
      trainFraction: 0.6,
      minFixturesForMeaningfulResult: 200,
      standingsArePointInTime: false,
    });

    // eslint-disable-next-line no-console
    console.log(`sufficientData=${result.sufficientData} skipped=${result.skippedFixtures}`);
    // eslint-disable-next-line no-console
    console.log('notes:', result.notes.join(' | '));

    // eslint-disable-next-line no-console
    console.log('\nmarket        n     acc     Brier   baseBrier  skill    logLoss  baseLL');
    result.markets.forEach((market) => {
      // eslint-disable-next-line no-console
      console.log(
        `${market.marketId.padEnd(14)} ${String(market.predictions).padEnd(5)} ` +
          `${market.accuracy.toFixed(3)}  ${market.brierScore.toFixed(4)}  ` +
          `${(market.baselineBrierScore ?? 0).toFixed(4)}    ` +
          `${(market.brierSkillScore ?? 0).toFixed(4)}  ` +
          `${market.logLoss.toFixed(4)}  ${(market.baselineLogLoss ?? 0).toFixed(4)}`
      );
    });

    expect(result.markets.length).toBeGreaterThan(0);
    result.markets.forEach((market) => {
      expect(Number.isFinite(market.brierScore)).toBe(true);
      expect(Number.isFinite(market.logLoss)).toBe(true);
      expect(market.brierScore).toBeGreaterThanOrEqual(0);
      expect(market.brierScore).toBeLessThanOrEqual(1);
      expect(market.calibration.length).toBe(10);
      expect(market.baselineProbability).toBeGreaterThanOrEqual(0);
      expect(market.baselineProbability).toBeLessThanOrEqual(1);
      expect(market.predictions).toBeGreaterThan(0);
    });
  });

  it('runs a per-league evaluation to show cross-competition behaviour', () => {
    perLeague.forEach((league) => {
      const result = runBacktest({
        allFixtures: league.fixtures,
        standings: [],
        config: DEFAULT_PREDICTION_CONFIG,
        markets: ['home_win', 'btts_yes', 'over_2_5'],
        trainFraction: 0.6,
        minFixturesForMeaningfulResult: 200,
        standingsArePointInTime: false,
      });

      // eslint-disable-next-line no-console
      console.log(
        `\n[${league.name}] n=${result.totalFixtures} | ` +
          result.markets
            .map(
              (m) =>
                `${m.marketId}: Brier ${m.brierScore} (skill ${m.brierSkillScore})`
            )
            .join(' | ')
      );

      expect(result.markets.length).toBeGreaterThan(0);
    });
  });
});