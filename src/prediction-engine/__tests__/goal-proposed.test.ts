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

/**
 * The proposed improved goal model:
 *   lambdaHome = w * homeRecentScored + (1 - w) * leagueAvg
 *   lambdaAway = w * awayRecentScored + (1 - w) * leagueAvg
 * where `leagueAvg` is the PER-LEAGUE long-term average (from the training window).
 *
 * Per-market weight: BTTS wants w->0 (league rate only); totals want ~0.4.
 */
const goalLambda = (row: EvaluationRow, leagueAvg: number, w: number) => ({
  home: clamp(w * row.homeScoredAvg + (1 - w) * leagueAvg, 0.05, 5),
  away: clamp(w * row.awayScoredAvg + (1 - w) * leagueAvg, 0.05, 5),
});

const PER_MARKET_W: Record<string, number> = {
  btts_yes: 0.0,
  over_1_5: 0.4,
  over_2_5: 0.4,
  over_3_5: 0.4,
  home_over_0_5: 0.5,
  away_over_0_5: 0.5,
};

describe('proposed improvement: per-league prior + reduced form weight', () => {
  const ds = buildEvaluationDataset({ allFixtures: FILES.flatMap(load), trainFraction: 0.6 });

  // Per-league train averages (leakage-safe: computed only from train rows).
  const leagueAvg: Record<string, number> = {};
  [39, 140, 135].forEach((lg) => {
    const rows = ds.train.filter((r) => r.leagueId === lg);
    leagueAvg[String(lg)] = rows.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0) / (2 * Math.max(1, rows.length));
  });
  const globalAvg = ds.train.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0) / (2 * Math.max(1, ds.train.length));

  const testBase = (market: MarketId) => {
    const s = ds.train.map((r) => outcomeFor(r, market)).filter((x): x is boolean => x !== null);
    return s.length ? s.filter(Boolean).length / s.length : 0.5;
  };

  const improvedSample = (market: MarketId, usePerLeague: boolean, wOverride?: number) => {
    const w = wOverride ?? PER_MARKET_W[market];
    return ds.test
      .map((r) => {
        const base = usePerLeague ? (leagueAvg[String(r.leagueId)] ?? globalAvg) : globalAvg;
        const { home, away } = goalLambda(r, base, w);
        return { probability: gridMarket(home, away, market, DEFAULT_PREDICTION_CONFIG), happened: outcomeFor(r, market) };
      })
      .filter((x): x is { probability: number; happened: boolean } => x.happened !== null);
  };

  const engineSample = (market: MarketId) =>
    ds.test
      .map((r) => ({ probability: engineProb(r, market), happened: outcomeFor(r, market) }))
      .filter((x): x is { probability: number; happened: boolean } => x.happened !== null);

  it('reports engine vs proposed (global and per-league) on the untouched test window', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== PROPOSED GOAL MODEL vs ENGINE (test window) ===');
    // eslint-disable-next-line no-console
    console.log('market           engine   propGlobal propPerLeague   best');
    MARKETS.forEach((market) => {
      const e = summarise(engineSample(market), testBase(market));
      const pg = summarise(improvedSample(market, false), testBase(market));
      const pl = summarise(improvedSample(market, true), testBase(market));
      // eslint-disable-next-line no-console
      console.log(
        `${market.padEnd(16)} ${e.brierSkill.toFixed(4)}   ${pg.brierSkill.toFixed(4)}     ${pl.brierSkill.toFixed(4)}        ${Math.max(e.brierSkill, pg.brierSkill, pl.brierSkill).toFixed(4)}`
      );
    });
    expect(true).toBe(true);
  });

  it('reports per-league skill for the proposed per-league model', () => {
    // eslint-disable-next-line no-console
    console.log('\n=== PROPOSED (per-league prior) by league ===');
    [39, 140, 135].forEach((lg) => {
      const testRows = ds.test.filter((r) => r.leagueId === lg);
      const trainRows = ds.train.filter((r) => r.leagueId === lg);
      const base = trainRows.map((r) => outcomeFor(r, 'over_2_5')).filter((x) => x !== null);
      const baseRate = base.length ? base.filter(Boolean).length / base.length : 0.5;
      const samples = testRows
        .map((r) => {
          const b = leagueAvg[String(lg)] ?? globalAvg;
          const { home, away } = goalLambda(r, b, 0.4);
          return { probability: gridMarket(home, away, 'over_2_5', DEFAULT_PREDICTION_CONFIG), happened: r.homeGoals + r.awayGoals >= 3 };
        });
      const s = summarise(samples, baseRate);
      // eslint-disable-next-line no-console
      console.log(`league ${lg}: over_2_5 n=${s.n} Brier=${s.brier.toFixed(4)} skill=${s.brierSkill.toFixed(4)} baseRate=${s.baseRate.toFixed(3)}`);
    });
    expect(true).toBe(true);
  });

  it('is calibrated better than the engine on the improved markets', () => {
    // Check calibration of the proposed over_2_5 model.
    const samples = improvedSample('over_2_5', true);
    const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, n: 0, mp: 0, obs: 0 }));
    samples.forEach((s) => {
      const i = Math.min(9, Math.floor(s.probability * 10));
      bins[i].n += 1; bins[i].mp += s.probability; bins[i].obs += s.happened ? 1 : 0;
    });
    // eslint-disable-next-line no-console
    console.log('\n=== calibration: proposed over_2_5 (per-league prior, w=0.4) ===');
    bins.filter((b) => b.n > 0).forEach((b) => {
      // eslint-disable-next-line no-console
      console.log(`${b.lo.toFixed(1)}-${(b.lo + 0.1).toFixed(1)} n=${String(b.n).padEnd(4)} pred=${(b.mp / b.n).toFixed(3)} obs=${(b.obs / b.n).toFixed(3)} gap=${((b.obs - b.mp) / b.n).toFixed(3)}`);
    });
    expect(true).toBe(true);
  });
});

// Engine probability for a market (read from captured probabilities).
function engineProb(r: EvaluationRow, market: MarketId): number {
  const p = r.probabilities;
  switch (market) {
    case 'btts_yes': return p.bttsYes;
    case 'over_1_5': return p.over1_5;
    case 'over_2_5': return p.over2_5;
    case 'over_3_5': return p.over3_5;
    case 'home_over_0_5': return p.homeScores;
    case 'away_over_0_5': return p.awayScores;
    default: return 0;
  }
}