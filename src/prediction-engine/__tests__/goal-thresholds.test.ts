import * as fs from 'fs';
import * as path from 'path';
import { loadFixturesFromJson } from '../test-support/real-data';
import { buildEvaluationDataset, outcomeFor, EvaluationRow } from '../test-support/evaluation';
import { buildPoissonGrid } from '../poisson';
import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { MarketId } from '../types';
import { clamp } from '../math-utils';

const load = (file: string) =>
  loadFixturesFromJson(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'eval-data', file), 'utf8')));
const FILES = ['premier-league-2023.json', 'la-liga-2023.json', 'serie-a-2023.json'];
const MARKETS: MarketId[] = ['btts_yes', 'over_1_5', 'over_2_5', 'over_3_5'];

const gridMarket = (hl: number, al: number, market: MarketId) => {
  const g = buildPoissonGrid({ homeLambda: hl, awayLambda: al, config: DEFAULT_PREDICTION_CONFIG });
  switch (market) {
    case 'btts_yes': return g.bttsYes;
    case 'over_1_5': return g.over1_5;
    case 'over_2_5': return g.over2_5;
    case 'over_3_5': return g.over3_5;
    default: return 0;
  }
};

const PER_MARKET_W: Record<string, number> = { btts_yes: 0.0, over_1_5: 0.4, over_2_5: 0.4, over_3_5: 0.4 };

describe('calibration and selection thresholds (proposed goal model)', () => {
  const ds = buildEvaluationDataset({ allFixtures: FILES.flatMap(load), trainFraction: 0.6 });
  const leagueAvg: Record<string, number> = {};
  [39, 140, 135].forEach((lg) => {
    const rows = ds.train.filter((r) => r.leagueId === lg);
    leagueAvg[String(lg)] = rows.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0) / (2 * Math.max(1, rows.length));
  });
  const globalAvg = ds.train.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0) / (2 * Math.max(1, ds.train.length));

  const samplesFor = (market: MarketId) => {
    const w = PER_MARKET_W[market];
    return ds.test.map((r: EvaluationRow) => {
      const base = leagueAvg[String(r.leagueId)] ?? globalAvg;
      const hl = clamp(w * r.homeScoredAvg + (1 - w) * base, 0.05, 5);
      const al = clamp(w * r.awayScoredAvg + (1 - w) * base, 0.05, 5);
      return { probability: gridMarket(hl, al, market), happened: outcomeFor(r, market) as boolean };
    });
  };

  it('reports observed frequency at 55/60/65/70/75% probability bands', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== CALIBRATION at threshold bands (proposed model) ===');
    // eslint-disable-next-line no-console
    console.log('market           threshold   n     meanPred  observed  gap');
    MARKETS.forEach((market) => {
      const samples = samplesFor(market);
      [0.55, 0.6, 0.65, 0.7, 0.75].forEach((t) => {
        const band = samples.filter((s) => s.probability >= t);
        if (band.length < 5) return;
        const meanPred = band.reduce((a, s) => a + s.probability, 0) / band.length;
        const obs = band.filter((s) => s.happened).length / band.length;
        // eslint-disable-next-line no-console
        console.log(
          `${market.padEnd(16)} >=${(t * 100).toFixed(0)}%      ${String(band.length).padEnd(5)} ${meanPred.toFixed(3)}     ${obs.toFixed(3)}     ${(obs - meanPred >= 0 ? '+' : '')}${(obs - meanPred).toFixed(3)}`
        );
      });
    });
    expect(true).toBe(true);
  });

  it('reports how many predictions survive each probability threshold', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== SELECTION: predictions surviving each threshold ===');
    // eslint-disable-next-line no-console
    console.log('market           >=55%  >=60%  >=65%  >=70%');
    MARKETS.forEach((market) => {
      const samples = samplesFor(market);
      const counts = [0.55, 0.6, 0.65, 0.7].map((t) => samples.filter((s) => s.probability >= t).length);
      // eslint-disable-next-line no-console
      console.log(`${market.padEnd(16)} ${counts.map((c) => String(c).padStart(5)).join('  ')}`);
    });
    // eslint-disable-next-line no-console
    console.log(`(total test fixtures per market = ${ds.test.length})`);
    expect(true).toBe(true);
  });
});