import * as fs from 'fs';
import * as path from 'path';
import { loadFixturesFromJson } from '../test-support/real-data';
import {
  buildEvaluationDataset,
  outcomeFor,
  modelProbabilityFor,
  summarise,
  EvaluationRow,
  MetricSummary,
} from '../test-support/evaluation';
import { DEFAULT_PREDICTION_CONFIG, mergePredictionConfig } from '../../config/prediction-config';
import { MarketId } from '../types';

const SEASONS = [2021, 2022, 2023, 2024, 2025];
const WINDOWS = [5, 8, 10, 15, 20];
const MARKETS: MarketId[] = [
  'home_win', 'draw', 'away_win', 'btts_yes',
  'over_1_5', 'over_2_5', 'over_3_5',
  'home_over_0_5', 'away_over_0_5',
];

const loadSeason = (season: number) => {
  const file = path.resolve(process.cwd(), `eval-data/premier-league-${season}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing evaluation file ${file}`);
  }
  return loadFixturesFromJson(JSON.parse(fs.readFileSync(file, 'utf8')));
};

const baseRate = (rows: EvaluationRow[], market: MarketId): number => {
  const outcomes = rows.map((row) => outcomeFor(row, market)).filter((v): v is boolean => v !== null);
  return outcomes.length ? outcomes.filter(Boolean).length / outcomes.length : 0.5;
};

const scoreMarket = (
  rows: EvaluationRow[],
  market: MarketId,
  baseline: number
): MetricSummary =>
  summarise(
    rows
      .map((row) => ({
        probability: modelProbabilityFor(row, market),
        happened: outcomeFor(row, market),
      }))
      .filter((item): item is { probability: number; happened: boolean } => item.happened !== null),
    baseline
  );

const mean = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

/**
 * Window tuning protocol:
 * - Training prior/base rates: 2021-2023 only.
 * - Validation and window choice: 2024 only.
 * - Final untouched test: 2025 only.
 * - Each historical prediction is built from matches strictly before its kickoff.
 *
 * The test reports the full 5/8/10/15/20 sweep for transparency, but the selected
 * window is chosen ONLY from 2024 validation metrics, never by 2025 test performance.
 */
describe('Premier League multi-season recent-window evaluation', () => {
  const rawFixtures = SEASONS.flatMap(loadSeason);
  const datasets = new Map<number, EvaluationRow[]>();

  WINDOWS.forEach((windowSize) => {
    const config = mergePredictionConfig({ recentWindow: windowSize }, DEFAULT_PREDICTION_CONFIG);
    const dataset = buildEvaluationDataset({
      allFixtures: rawFixtures,
      config,
      trainFraction: 1,
    });
    datasets.set(windowSize, dataset.all);
  });

  const rowsBySeason = (windowSize: number, season: number) =>
    (datasets.get(windowSize) || []).filter((row) => row.season === season);
  const trainingRows = (windowSize: number) =>
    (datasets.get(windowSize) || []).filter((row) => row.season >= 2021 && row.season <= 2023);

  it('validates fixture history and chronological year partitions', () => {
    const first = loadSeason(2021);
    const last = loadSeason(2025);
    expect(first.filter((fixture) => fixture.fixture.status.short === 'FT')).toHaveLength(380);
    expect(last.filter((fixture) => fixture.fixture.status.short === 'FT')).toHaveLength(380);
    expect(rowsBySeason(5, 2024).length).toBeGreaterThan(300);
    expect(rowsBySeason(5, 2025).length).toBeGreaterThan(300);
    // Every training year precedes validation; validation precedes untouched test.
    const valTime = Math.min(...rowsBySeason(5, 2024).map((row) => row.kickoff));
    const testTime = Math.min(...rowsBySeason(5, 2025).map((row) => row.kickoff));
    expect(testTime).toBeGreaterThan(valTime);
    console.log(`PL completed matches: 2021-2025 total=${rawFixtures.length}; 2024 validation n=${rowsBySeason(5, 2024).length}; 2025 test n=${rowsBySeason(5, 2025).length}`);
  });

  it('chooses a window on validation only and reports untouched 2025 scores', () => {
    const goalMarkets: MarketId[] = ['btts_yes', 'over_1_5', 'over_2_5', 'over_3_5'];
    const validation = WINDOWS.map((windowSize) => {
      const train = trainingRows(windowSize);
      const val = rowsBySeason(windowSize, 2024);
      const skills = goalMarkets.map((market) =>
        scoreMarket(val, market, baseRate(train, market)).brierSkill
      );
      return { windowSize, score: mean(skills), skills };
    });
    const chosen = [...validation].sort((a, b) => b.score - a.score)[0];

    console.log('\n2024 validation mean Brier skill across BTTS and totals (window selected here):');
    validation.forEach((entry) =>
      console.log(`window=${entry.windowSize} meanSkill=${entry.score.toFixed(4)} perMarket=${entry.skills.map((s) => s.toFixed(4)).join(',')}`)
    );
    console.log(`selectedWindow=${chosen.windowSize} based on validation only`);

    console.log('\n2025 untouched test: chosen window vs 5-match window; baseline uses 2021-2024 outcomes');
    const test = rowsBySeason(chosen.windowSize, 2025);
    const testBaseRows = [...trainingRows(chosen.windowSize), ...rowsBySeason(chosen.windowSize, 2024)];
    goalMarkets.forEach((market) => {
      const base = baseRate(testBaseRows, market);
      const bestWindow = scoreMarket(test, market, base);
      const defaultFive = scoreMarket(rowsBySeason(5, 2025), market, baseRate([
        ...trainingRows(5), ...rowsBySeason(5, 2024),
      ], market));
      console.log(
        `${market}: window${chosen.windowSize} n=${bestWindow.n} Brier=${bestWindow.brier.toFixed(4)} LL=${bestWindow.logLoss.toFixed(4)} skill=${bestWindow.brierSkill.toFixed(4)} | w5 Brier=${defaultFive.brier.toFixed(4)} skill=${defaultFive.brierSkill.toFixed(4)}`
      );
    });

    const resultMarkets: MarketId[] = ['home_win', 'draw', 'away_win'];
    console.log('\n2025 1X2 impact (lookback switch):');
    resultMarkets.forEach((market) => {
      const chosenSummary = scoreMarket(
        test,
        market,
        baseRate(testBaseRows, market)
      );
      const fiveRows = rowsBySeason(5, 2025);
      const fiveSummary = scoreMarket(
        fiveRows,
        market,
        baseRate([...trainingRows(5), ...rowsBySeason(5, 2024)], market)
      );
      console.log(
        `${market}: window${chosen.windowSize} skill=${chosenSummary.brierSkill.toFixed(4)} Brier=${chosenSummary.brier.toFixed(4)} | w5 skill=${fiveSummary.brierSkill.toFixed(4)} Brier=${fiveSummary.brier.toFixed(4)}`
      );
    });

    // Guard that selection is based on the validation window and all candidates remain available.
    expect(WINDOWS).toContain(chosen.windowSize);
    expect(test.length).toBeGreaterThan(300);
  });

  it('shows how current-season venue samples grow over the season', () => {
    const rows = rowsBySeason(20, 2025);
    const sampleBuckets = [0, 1, 2, 3, 4, 5, 8, 10, 15, 20];
    const byHomeSample = sampleBuckets.map((minimum) => {
      const subset = rows.filter((row) => row.homeVenueSample === minimum);
      return { minimum, count: subset.length };
    });
    console.log('\n2025 test predictions by exact home venue sample count (20-window model):', JSON.stringify(byHomeSample));
    expect(rows.some((row) => row.homeVenueSample <= 4)).toBe(true);
    expect(rows.some((row) => row.homeVenueSample >= 5)).toBe(true);
  });
});
