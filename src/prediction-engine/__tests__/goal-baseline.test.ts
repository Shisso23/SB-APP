import * as fs from 'fs';
import * as path from 'path';
import { loadFixturesFromJson } from '../test-support/real-data';
import {
  buildEvaluationDataset,
  summarise,
  calibration,
  samplesFor,
  EvaluationRow,
} from '../test-support/evaluation';
import { MarketId } from '../types';

const load = (file: string) => {
  const full = path.resolve(process.cwd(), 'eval-data', file);
  return loadFixturesFromJson(JSON.parse(fs.readFileSync(full, 'utf8')));
};

const FILES = ['premier-league-2023.json', 'la-liga-2023.json', 'serie-a-2023.json'];
const GOAL_MARKETS: MarketId[] = [
  'btts_yes',
  'over_1_5',
  'over_2_5',
  'over_3_5',
  'home_over_0_5',
  'away_over_0_5',
];

const trainBaseRate = (train: EvaluationRow[], market: MarketId) => {
  const s = samplesFor(train, market);
  return s.length ? s.filter((x) => x.happened).length / s.length : 0.5;
};

/**
 * Reproducible baseline for the goal markets on real 2023 data.
 * This is the reference the improvement work is measured against; the chronological
 * split here MUST stay unchanged when comparing candidate improvements.
 */
describe('goal-market baseline (real 2023 data)', () => {
  const allFixtures = FILES.flatMap(load);
  const ds = buildEvaluationDataset({ allFixtures, trainFraction: 0.6 });

  it('confirms split + leakage safety', () => {
    // eslint-disable-next-line no-console
    console.log(
      `\nrows=${ds.all.length} train=${ds.train.length} test=${ds.test.length} splitTs=${ds.splitTimestamp}`
    );
    expect(ds.all.length).toBeGreaterThan(900);
    const maxTrain = Math.max(...ds.train.map((r) => r.kickoff));
    const minTest = Math.min(...ds.test.map((r) => r.kickoff));
    expect(minTest).toBeGreaterThanOrEqual(maxTrain);
  });

  it('reports per-market metrics vs base-rate baseline (test window)', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== GOAL MARKETS: model vs base-rate baseline (test window) ===');
    // eslint-disable-next-line no-console
    console.log('market           n     acc    Brier   baseBrier  skill     logLoss  baseLL   baseRate  modelMean');

    GOAL_MARKETS.forEach((market) => {
      const samples = samplesFor(ds.test, market);
      const base = trainBaseRate(ds.train, market);
      const s = summarise(samples, base);
      const modelMean = samples.reduce((a, x) => a + x.probability, 0) / Math.max(1, samples.length);
      // eslint-disable-next-line no-console
      console.log(
        `${market.padEnd(16)} ${String(s.n).padEnd(5)} ${s.accuracy.toFixed(3)}  ${s.brier.toFixed(4)}  ` +
          `${s.baselineBrier.toFixed(4)}    ${s.brierSkill.toFixed(4)}   ${s.logLoss.toFixed(4)}  ` +
          `${s.baselineLogLoss.toFixed(4)}  ${s.baseRate.toFixed(3)}     ${modelMean.toFixed(3)}`
      );
      expect(Number.isFinite(s.brier)).toBe(true);
    });
  });

  it('reports calibration by probability bucket for each goal market', () => {
    GOAL_MARKETS.forEach((market) => {
      const bins = calibration(samplesFor(ds.test, market)).filter((b) => b.n > 0);
      // eslint-disable-next-line no-console
      console.log(`\n-- calibration: ${market} --`);
      // eslint-disable-next-line no-console
      console.log('bucket        n   meanPred  observed  gap');
      bins.forEach((b) => {
        // eslint-disable-next-line no-console
        console.log(
          `${b.lower.toFixed(1)}-${b.upper.toFixed(1)}  ${String(b.n).padEnd(4)} ` +
            `${b.meanPredicted.toFixed(3)}     ${b.observed.toFixed(3)}     ` +
            `${(b.observed - b.meanPredicted >= 0 ? '+' : '')}${(b.observed - b.meanPredicted).toFixed(3)}`
        );
      });
    });
    expect(true).toBe(true);
  });

  it('reports home vs away team-scoring and per-league breakdown', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== TEAM-TO-SCORE: home vs away ===');
    (['home_over_0_5', 'away_over_0_5'] as MarketId[]).forEach((market) => {
      const s = summarise(samplesFor(ds.test, market), trainBaseRate(ds.train, market));
      // eslint-disable-next-line no-console
      console.log(`${market.padEnd(16)} n=${s.n} Brier=${s.brier.toFixed(4)} skill=${s.brierSkill.toFixed(4)} baseRate=${s.baseRate.toFixed(3)}`);
    });

    // eslint-disable-next-line no-console
    console.log('\n=== PER LEAGUE (btts_yes / over_2_5) ===');
    [39, 140, 135].forEach((leagueId) => {
      (['btts_yes', 'over_2_5'] as MarketId[]).forEach((market) => {
        const testRows = ds.test.filter((r) => r.leagueId === leagueId);
        const trainRows = ds.train.filter((r) => r.leagueId === leagueId);
        const s = summarise(samplesFor(testRows, market), trainBaseRate(trainRows, market));
        // eslint-disable-next-line no-console
        console.log(`league ${String(leagueId).padEnd(4)} ${market.padEnd(9)} n=${String(s.n).padEnd(4)} Brier=${s.brier.toFixed(4)} skill=${s.brierSkill.toFixed(4)} baseRate=${s.baseRate.toFixed(3)}`);
      });
    });
    expect(true).toBe(true);
  });
});