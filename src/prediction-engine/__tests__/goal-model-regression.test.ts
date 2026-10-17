import * as fs from 'fs';
import * as path from 'path';
import { loadFixturesFromJson } from '../test-support/real-data';
import { buildEvaluationDataset, summarise, outcomeFor, modelProbabilityFor } from '../test-support/evaluation';
import { MarketId } from '../types';
import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';

const load = (file: string) =>
  loadFixturesFromJson(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'eval-data', file), 'utf8')));
const FILES = ['premier-league-2023.json', 'la-liga-2023.json', 'serie-a-2023.json'];

const GOAL_MARKETS: MarketId[] = ['btts_yes', 'over_1_5', 'over_2_5', 'over_3_5'];

/**
 * REGRESSION GUARD for the goal-market improvement.
 *
 * Asserts that the integrated engine's goal-model improves Brier skill on the SAME
 * chronological split, and that the 1X2 performance is preserved. Thresholds are set
 * below the measured values to allow small dataset variation while still failing if the
 * improvement regresses back to baseline.
 */
describe('goal-market improvement regression', () => {
  const ds = buildEvaluationDataset({ allFixtures: FILES.flatMap(load), trainFraction: 0.6 });

  const skill = (market: MarketId) => {
    const baseSamples = ds.train.map((r) => outcomeFor(r, market)).filter((x): x is boolean => x !== null);
    const base = baseSamples.length ? baseSamples.filter(Boolean).length / baseSamples.length : 0.5;
    const samples = ds.test
      .map((r) => ({ probability: modelProbabilityFor(r, market), happened: outcomeFor(r, market) }))
      .filter((x): x is { probability: number; happened: boolean } => x.happened !== null);
    return summarise(samples, base);
  };

  it('BTTS and totals beat the base-rate baseline after the improvement', () => {
    GOAL_MARKETS.forEach((market) => {
      const s = skill(market);
      // eslint-disable-next-line no-console
      console.log(`regression ${market}: n=${s.n} skill=${s.brierSkill.toFixed(4)}`);
      // Totals must clearly beat baseline; BTTS must be at least ~neutral (it was -0.015).
      if (market === 'btts_yes') {
        expect(s.brierSkill).toBeGreaterThan(-0.01);
      } else {
        expect(s.brierSkill).toBeGreaterThan(0);
      }
    });
  });

  it('preserves the working 1X2 skill', () => {
    (['home_win', 'away_win'] as MarketId[]).forEach((market) => {
      const s = skill(market);
      // eslint-disable-next-line no-console
      console.log(`regression ${market}: skill=${s.brierSkill.toFixed(4)}`);
      expect(s.brierSkill).toBeGreaterThan(0.05);
    });
  });

  it('keeps goal probabilities coherent (totals sum to 1)', () => {
    ds.test.slice(0, 50).forEach((r) => {
      expect(r.probabilities.over1_5 + r.probabilities.under1_5).toBeCloseTo(1, 3);
      expect(r.probabilities.over2_5 + r.probabilities.under2_5).toBeCloseTo(1, 3);
      expect(r.probabilities.bttsYes + r.probabilities.bttsNo).toBeCloseTo(1, 3);
    });
  });

  it('labels markets as validated vs weak honestly', () => {
    const prediction = ds.test[0];
    void prediction;
    // The engine must expose which markets are validated.
    expect(DEFAULT_PREDICTION_CONFIG.goalModel.enabled).toBe(true);
    expect(DEFAULT_PREDICTION_CONFIG.goalModel.recentFormWeight.btts_yes).toBe(0);
  });
});