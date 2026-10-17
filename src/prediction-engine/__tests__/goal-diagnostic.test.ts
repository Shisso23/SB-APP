import * as fs from 'fs';
import * as path from 'path';
import { loadFixturesFromJson } from '../test-support/real-data';
import { buildEvaluationDataset } from '../test-support/evaluation';

const load = (file: string) =>
  loadFixturesFromJson(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'eval-data', file), 'utf8')));

const FILES = ['premier-league-2023.json', 'la-liga-2023.json', 'serie-a-2023.json'];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const variance = (xs: number[]) => {
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
};

/**
 * Diagnostic: is the model's expected-goals estimate biased / too tight?
 * Compares sum of xG against actual total goals, and the variance of match totals.
 */
describe('diagnostic: xG bias and dispersion', () => {
  const ds = buildEvaluationDataset({ allFixtures: FILES.flatMap(load), trainFraction: 0.6 });

  it('reports xG vs actual goals (bias) and dispersion', () => {
    const test = ds.test;
    const xgTotal = test.map((r) => r.xgHome + r.xgAway);
    const actualTotal = test.map((r) => r.homeGoals + r.awayGoals);

    // eslint-disable-next-line no-console
    console.log('\n=== xG vs actual total goals (test window) ===');
    // eslint-disable-next-line no-console
    console.log(`n=${test.length}`);
    // eslint-disable-next-line no-console
    console.log(`mean predicted xG total : ${mean(xgTotal).toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`mean actual total goals : ${mean(actualTotal).toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`bias (actual - xG)      : ${(mean(actualTotal) - mean(xgTotal)).toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`sd predicted xG total   : ${Math.sqrt(variance(xgTotal)).toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`sd actual total goals   : ${Math.sqrt(variance(actualTotal)).toFixed(4)}`);

    // Home / away separately
    // eslint-disable-next-line no-console
    console.log('\nHome: mean xG', mean(test.map((r) => r.xgHome)).toFixed(4),
      '| mean actual', mean(test.map((r) => r.homeGoals)).toFixed(4));
    // eslint-disable-next-line no-console
    console.log('Away: mean xG', mean(test.map((r) => r.xgAway)).toFixed(4),
      '| mean actual', mean(test.map((r) => r.awayGoals)).toFixed(4));

    // Correlation between predicted total and actual total (rank-free Pearson).
    const mx = mean(xgTotal);
    const my = mean(actualTotal);
    const cov = mean(xgTotal.map((x, i) => (x - mx) * (actualTotal[i] - my)));
    const corr = cov / Math.sqrt(variance(xgTotal) * variance(actualTotal));
    // eslint-disable-next-line no-console
    console.log(`corr(predicted xG total, actual total) = ${corr.toFixed(4)}`);

    // Per-league bias
    // eslint-disable-next-line no-console
    console.log('\nPer-league bias (actual - xG):');
    [39, 140, 135].forEach((lg) => {
      const rows = test.filter((r) => r.leagueId === lg);
      const x = mean(rows.map((r) => r.xgHome + r.xgAway));
      const a = mean(rows.map((r) => r.homeGoals + r.awayGoals));
      // eslint-disable-next-line no-console
      console.log(`  league ${lg}: n=${rows.length} xG=${x.toFixed(3)} actual=${a.toFixed(3)} bias=${(a - x).toFixed(3)}`);
    });

    expect(true).toBe(true);
  });
});