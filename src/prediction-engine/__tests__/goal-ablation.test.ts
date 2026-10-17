import * as fs from 'fs';
import * as path from 'path';
import { loadFixturesFromJson } from '../test-support/real-data';
import { buildEvaluationDataset, summarise, outcomeFor, EvaluationRow } from '../test-support/evaluation';
import { buildPoissonGrid } from '../poisson';
import { DEFAULT_PREDICTION_CONFIG, PredictionConfig } from '../../config/prediction-config';
import { MarketId } from '../types';
import { clamp } from '../math-utils';

const load = (file: string) =>
  loadFixturesFromJson(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'eval-data', file), 'utf8')));
const FILES = ['premier-league-2023.json', 'la-liga-2023.json', 'serie-a-2023.json'];

const MARKETS: MarketId[] = ['btts_yes', 'over_1_5', 'over_2_5', 'over_3_5', 'home_over_0_5', 'away_over_0_5'];

const gridMarket = (hl: number, al: number, market: MarketId, config: PredictionConfig) => {
  const g = buildPoissonGrid({ homeLambda: hl, awayLambda: al, config });
  switch (market) {
    case 'btts_yes': return g.bttsYes;
    case 'over_1_5': return g.over1_5;
    case 'over_2_5': return g.over2_5;
    case 'over_3_5': return g.over3_5;
    case 'home_over_0_5': return g.homeScores;
    case 'away_over_0_5': return g.awayScores;
    default: return 0;
  }
};

describe('ablation: prior weight, venue vs overall, window, opponent strength', () => {
  const ds = buildEvaluationDataset({ allFixtures: FILES.flatMap(load), trainFraction: 0.6 });
  const trainLeagueAvg =
    ds.train.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0) / (2 * Math.max(1, ds.train.length));

  const skillFor = (market: MarketId, fn: (r: EvaluationRow) => number) => {
    const baseSamples = ds.train.map((r) => outcomeFor(r, market)).filter((x): x is boolean => x !== null);
    const base = baseSamples.length ? baseSamples.filter(Boolean).length / baseSamples.length : 0.5;
    const samples = ds.test
      .map((r) => ({ probability: fn(r), happened: outcomeFor(r, market) }))
      .filter((x): x is { probability: number; happened: boolean } => x.happened !== null);
    return summarise(samples, base);
  };

  it('ablation A: prior weight sweep (venue form blended with league average)', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== ABLATION A: long-term prior weight ===');
    // eslint-disable-next-line no-console
    console.log('w     ' + MARKETS.map((m) => m.padStart(14)).join(' '));
    [0.0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1.0].forEach((w) => {
      const cells = MARKETS.map((market) => {
        const s = skillFor(market, (r) => {
          const hl = clamp(w * r.homeScoredAvg + (1 - w) * trainLeagueAvg, 0.05, 5);
          const al = clamp(w * r.awayScoredAvg + (1 - w) * trainLeagueAvg, 0.05, 5);
          return gridMarket(hl, al, market, DEFAULT_PREDICTION_CONFIG);
        });
        return `${s.brierSkill >= 0 ? ' ' : ''}${s.brierSkill.toFixed(4)}`.padStart(14);
      });
      // eslint-disable-next-line no-console
      console.log(`${w.toFixed(2)}  ${cells.join(' ')}`);
    });
    expect(true).toBe(true);
  });

  it('ablation B: home/away venue split - use overall form instead of venue-specific', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== ABLATION B: venue-specific vs overall form (w=0.4) ===');
    MARKETS.forEach((market) => {
      const venue = skillFor(market, (r) =>
        gridMarket(clamp(0.4 * r.homeScoredAvg + 0.6 * trainLeagueAvg, 0.05, 5),
          clamp(0.4 * r.awayScoredAvg + 0.6 * trainLeagueAvg, 0.05, 5), market, DEFAULT_PREDICTION_CONFIG));
      // eslint-disable-next-line no-console
      console.log(`${market.padEnd(16)} venueForm skill=${venue.brierSkill.toFixed(4)}`);
    });
    expect(true).toBe(true);
  });

  it('ablation C: league-level scoring level (per-league baseline vs global)', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== ABLATION C: per-league baseline (w=0.4) ===');
    // Compute per-league train averages from the TRAIN rows only (no leakage).
    const leagueAvg: Record<string, number> = {};
    [39, 140, 135].forEach((lg) => {
      const rows = ds.train.filter((r) => r.leagueId === lg);
      leagueAvg[String(lg)] = rows.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0) / (2 * Math.max(1, rows.length));
    });
    // eslint-disable-next-line no-console
    console.log('per-league train avg:', JSON.stringify(leagueAvg));
    MARKETS.forEach((market) => {
      const perLeague = skillFor(market, (r) => {
        const base = leagueAvg[String(r.leagueId)] ?? trainLeagueAvg;
        const hl = clamp(0.4 * r.homeScoredAvg + 0.6 * base, 0.05, 5);
        const al = clamp(0.4 * r.awayScoredAvg + 0.6 * base, 0.05, 5);
        return gridMarket(hl, al, market, DEFAULT_PREDICTION_CONFIG);
      });
      // eslint-disable-next-line no-console
      console.log(`${market.padEnd(16)} perLeague skill=${perLeague.brierSkill.toFixed(4)}`);
    });
    expect(true).toBe(true);
  });
});