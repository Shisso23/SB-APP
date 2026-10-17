import { EvaluationRow } from '../test-support/evaluation';
import { buildPoissonGrid } from '../poisson';
import { DEFAULT_PREDICTION_CONFIG, PredictionConfig } from '../../config/prediction-config';
import { MarketId } from '../types';
import { clamp } from '../math-utils';

/**
 * Candidate models for the goal markets, each a pure function of an `EvaluationRow`.
 *
 * Every candidate consumes ONLY information captured at prediction time (pre-kickoff),
 * so they can all be scored on the identical chronological test window.
 *
 * None of these use odds or lineups (unavailable). All are simple and explainable.
 */

export type Candidate = {
  name: string;
  probability: (row: EvaluationRow, market: MarketId) => number;
};

/** Read a market probability from a Poisson grid built on given lambdas. */
const gridMarket = (
  homeLambda: number,
  awayLambda: number,
  market: MarketId,
  config: PredictionConfig
): number => {
  const g = buildPoissonGrid({ homeLambda, awayLambda, config });
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

// --- 1. Engine reference -----------------------------------------------------
export const engineCandidate: Candidate = {
  name: 'engine (current)',
  probability: (row, market) => {
    const p = row.probabilities;
    switch (market) {
      case 'btts_yes': return p.bttsYes;
      case 'over_1_5': return p.over1_5;
      case 'over_2_5': return p.over2_5;
      case 'over_3_5': return p.over3_5;
      case 'home_over_0_5': return p.homeScores;
      case 'away_over_0_5': return p.awayScores;
      default: return 0;
    }
  },
};

/**
 * 2. Home/away scoring-rate model.
 * Uses the blended recent form rates directly as Poisson lambdas with NO further
 * shrinkage and NO opponent adjustment - i.e. the raw attack/defence signal at full
 * strength. Tests whether removing the conservative flattening helps.
 */
export const rawRateCandidate: Candidate = {
  name: 'raw venue rates (no extra shrink)',
  probability: (row, market) =>
    gridMarket(
      clamp(row.homeScoredAvg, 0.05, 5),
      clamp(row.awayScoredAvg, 0.05, 5),
      market,
      DEFAULT_PREDICTION_CONFIG
    ),
};

/** 3. Attack-vs-defence: home attack × away defence, away attack × home defence. */
export const attackDefenceCandidate: Candidate = {
  name: 'attack x defence (raw)',
  probability: (row, market) => {
    const leagueAvg = standardLeagueAvg;
    const homeLambda = clamp(Math.sqrt(row.homeScoredAvg * row.awayConcededAvg) , 0.05, 5);
    const awayLambda = clamp(Math.sqrt(row.awayScoredAvg * row.homeConcededAvg), 0.05, 5);
    void leagueAvg;
    return gridMarket(homeLambda, awayLambda, market, DEFAULT_PREDICTION_CONFIG);
  },
};

/** 4. Same as engine but with shrinkage disabled (higher dispersion). */
export const lowShrinkageCandidate: Candidate = {
  name: 'low shrinkage',
  probability: (row, market) => {
    const cfg: PredictionConfig = {
      ...DEFAULT_PREDICTION_CONFIG,
      goals: { ...DEFAULT_PREDICTION_CONFIG.goals, shrinkage: 0 },
    };
    const homeLambda = clamp(row.homeScoredAvg, 0.05, 5);
    const awayLambda = clamp(row.awayScoredAvg, 0.05, 5);
    return gridMarket(homeLambda, awayLambda, market, cfg);
  },
};

/**
 * 5. Long-term prior blended with recent form.
 * `recentWeight` controls how much recent venue form vs the league baseline is used.
 */
export const priorBlendCandidate = (recentWeight: number, leagueAvg: number): Candidate => ({
  name: `prior blend (w=${recentWeight})`,
  probability: (row, market) => {
    const homeLambda = clamp(recentWeight * row.homeScoredAvg + (1 - recentWeight) * leagueAvg, 0.05, 5);
    const awayLambda = clamp(recentWeight * row.awayScoredAvg + (1 - recentWeight) * leagueAvg, 0.05, 5);
    return gridMarket(homeLambda, awayLambda, market, DEFAULT_PREDICTION_CONFIG);
  },
});

/** A rough league average (goals per team per match) from the whole dataset. */
export let standardLeagueAvg = 1.45;
export const setStandardLeagueAvg = (value: number) => {
  standardLeagueAvg = value;
};

export const GOAL_MARKETS_EVAL: MarketId[] = [
  'btts_yes',
  'over_1_5',
  'over_2_5',
  'over_3_5',
  'home_over_0_5',
  'away_over_0_5',
];