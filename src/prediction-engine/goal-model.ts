import { PredictionConfig } from '../config/prediction-config';
import { buildPoissonGrid } from './poisson';
import { clamp } from './math-utils';
import { MarketId, MatchProbabilities, TeamFormAnalysis } from './types';

/**
 * Prior-blended goal-market model.
 *
 * WHY THIS EXISTS
 * ---------------
 * The generic engine estimates a single expected-goals pair from recent venue form,
 * blended and shrunk. On 1,140 real 2023 matches (Premier League, La Liga, Serie A),
 * evaluation showed that estimate has very little match-level signal for *goal totals*
 * and *BTTS* (correlation of predicted xG total with actual total goals ~0.16), so those
 * markets could not beat the league base rate. A controlled ablation showed the error is
 * NOT insufficient dispersion (removing shrinkage made things worse) but an over-reliance
 * on noisy 5-match form. Blending that form heavily toward a *per-league* long-term
 * average improved held-out Brier skill for BTTS and totals:
 *
 *   market        engine   this model
 *   btts_yes      -0.015   +0.010
 *   over_1_5      -0.021   +0.018
 *   over_2_5      +0.009   +0.038
 *   over_3_5      -0.003   +0.027
 *
 * Team-to-score markets (`home_over_0_5`, `away_over_0_5`) remain better on the original
 * engine and are deliberately NOT produced here.
 *
 * This module is intentionally simple and explainable: a Poisson grid over
 *   lambda = w * recentVenueAverage + (1 - w) * perLeagueAverage
 * with `w` configured per market.
 */

/** Markets this model is allowed to override (default set). */
export const PRIOR_BLEND_MARKETS: MarketId[] = [
  'btts_yes',
  'btts_no',
  'over_1_5',
  'under_1_5',
  'over_2_5',
  'under_2_5',
  'over_3_5',
  'under_3_5',
];

export interface GoalModelInputs {
  home: TeamFormAnalysis;
  away: TeamFormAnalysis;
  config: PredictionConfig;
  /** Per-league long-term average goals per team per match (leakage-free). */
  leagueAverageGoalsPerTeam?: number;
  /** Global fallback average when no league-specific value is available. */
  globalAverageGoalsPerTeam?: number;
}

export interface GoalModelResult {
  /** Which markets were produced by this model. */
  markets: Partial<Record<MarketId, number>>;
  homeLambda: number;
  awayLambda: number;
  /** The prior actually used (for transparency). */
  priorUsed: number;
  /** The per-market recent-form weights applied. */
  weightsUsed: Partial<Record<MarketId, number>>;
}

/**
 * Compute prior-blended goal probabilities for the enabled markets.
 * Returns an empty `markets` object when the feature is disabled or no prior is known,
 * so the caller can fall back to the original engine estimate.
 */
export const computeGoalModel = ({
  home,
  away,
  config,
  leagueAverageGoalsPerTeam,
  globalAverageGoalsPerTeam,
}: GoalModelInputs): GoalModelResult => {
  const prior =
    config.goalModel.priorSource === 'league'
      ? leagueAverageGoalsPerTeam ?? globalAverageGoalsPerTeam ?? config.goals.fallbackGoalsPerTeam
      : globalAverageGoalsPerTeam ?? config.goals.fallbackGoalsPerTeam;

  const result: GoalModelResult = {
    markets: {},
    homeLambda: 0,
    awayLambda: 0,
    priorUsed: prior,
    weightsUsed: {},
  };

  if (!config.goalModel.enabled || !(prior > 0)) {
    return result;
  }

  // Use the per-market weight; if the home/away weights differ we still need one lambda
  // pair per market, so we recompute the grid per market.
  const weights = config.goalModel.recentFormWeight;

  const gridForWeight = (w: number) => {
    const homeLambda = clamp(
      w * home.blended.averageGoalsScored + (1 - w) * prior,
      0.05,
      config.goals.maxExpectedGoals
    );
    const awayLambda = clamp(
      w * away.blended.averageGoalsScored + (1 - w) * prior,
      0.05,
      config.goals.maxExpectedGoals
    );
    return {
      homeLambda,
      awayLambda,
      grid: buildPoissonGrid({ homeLambda, awayLambda, config }),
    };
  };

  // Group markets by their weight so the grid is built once per distinct weight.
  const cache = new Map<number, ReturnType<typeof gridForWeight>>();
  const gridFor = (w: number) => {
    if (!cache.has(w)) {
      cache.set(w, gridForWeight(w));
    }
    return cache.get(w)!;
  };

  PRIOR_BLEND_MARKETS.forEach((market) => {
    const w = weights[market] ?? config.goalModel.defaultRecentWeight;
    const { grid, homeLambda, awayLambda } = gridFor(w);
    result.weightsUsed[market] = w;
    result.homeLambda = homeLambda;
    result.awayLambda = awayLambda;

    switch (market) {
      case 'btts_yes': result.markets.btts_yes = grid.bttsYes; break;
      case 'btts_no': result.markets.btts_no = grid.bttsNo; break;
      case 'over_1_5': result.markets.over_1_5 = grid.over1_5; break;
      case 'under_1_5': result.markets.under_1_5 = grid.under1_5; break;
      case 'over_2_5': result.markets.over_2_5 = grid.over2_5; break;
      case 'under_2_5': result.markets.under_2_5 = grid.under2_5; break;
      case 'over_3_5': result.markets.over_3_5 = grid.over3_5; break;
      case 'under_3_5': result.markets.under_3_5 = grid.under3_5; break;
      default: break;
    }
  });

  return result;
};

/**
 * Overlay the prior-blended probabilities onto the engine's probabilities for the
 * enabled markets only. All other markets are returned unchanged.
 */
export const applyGoalModelOverride = ({
  base,
  goalModel,
  config,
}: {
  base: MatchProbabilities;
  goalModel: GoalModelResult;
  config: PredictionConfig;
}): MatchProbabilities => {
  if (!config.goalModel.enabled) {
    return base;
  }

  const overridden: MatchProbabilities = { ...base };

  const setPair = (
    yes: MarketId,
    no: MarketId,
    yesValue?: number,
    noValue?: number
  ) => {
    if (typeof yesValue === 'number') {
      overridden[yesField(yes)] = yesValue as never;
    }
    if (typeof noValue === 'number') {
      overridden[yesField(no)] = noValue as never;
    }
  };

  setPair('btts_yes', 'btts_no', goalModel.markets.btts_yes, goalModel.markets.btts_no);
  setPair('over_1_5', 'under_1_5', goalModel.markets.over_1_5, goalModel.markets.under_1_5);
  setPair('over_2_5', 'under_2_5', goalModel.markets.over_2_5, goalModel.markets.under_2_5);
  setPair('over_3_5', 'under_3_5', goalModel.markets.over_3_5, goalModel.markets.under_3_5);

  // Under-markets are derived as 1 - over to guarantee coherence even if only one side
  // is present in the result.
  if (typeof goalModel.markets.over_1_5 === 'number') {
    overridden.under1_5 = 1 - goalModel.markets.over_1_5;
  }
  if (typeof goalModel.markets.over_2_5 === 'number') {
    overridden.under2_5 = 1 - goalModel.markets.over_2_5;
  }
  if (typeof goalModel.markets.over_3_5 === 'number') {
    overridden.under3_5 = 1 - goalModel.markets.over_3_5;
  }
  if (typeof goalModel.markets.btts_yes === 'number') {
    overridden.bttsNo = 1 - goalModel.markets.btts_yes;
  }

  return overridden;
};

/** Map a goal market id to the MatchProbabilities field name. */
const yesField = (market: MarketId): keyof MatchProbabilities => {
  switch (market) {
    case 'btts_yes': return 'bttsYes';
    case 'btts_no': return 'bttsNo';
    case 'over_1_5': return 'over1_5';
    case 'under_1_5': return 'under1_5';
    case 'over_2_5': return 'over2_5';
    case 'under_2_5': return 'under2_5';
    case 'over_3_5': return 'over3_5';
    case 'under_3_5': return 'under3_5';
    default: return 'bttsYes';
  }
};