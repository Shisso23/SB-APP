import { PredictionConfig } from '../config/prediction-config';
import { TeamFormAnalysis } from './types';
import { clamp, round, safeNumber } from './math-utils';
import { opponentQualityMultiplier } from './opponent-strength';

/** Poisson probability mass function, computed in log-space for numerical stability. */
export const poissonPmf = (lambda: number, k: number): number => {
  if (lambda <= 0) {
    return k === 0 ? 1 : 0;
  }
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i += 1) {
    logP -= Math.log(i);
  }
  return Math.exp(logP);
};

export interface ExpectedGoalsResult {
  home: number;
  away: number;
  homeAttack: number;
  homeDefence: number;
  awayAttack: number;
  awayDefence: number;
  shrinkageApplied: number;
}

/**
 * Estimate expected goals for both sides from venue-aware attack/defence rates,
 * adjusted (never mechanically driven) by opponent strength and league scoring level.
 *
 * xG_home = leagueBaseline * attack_home * defence_away * strengthAdjustments
 */
export const estimateExpectedGoals = ({
  homeForm,
  awayForm,
  config,
  leagueAverageGoalsPerTeam,
}: {
  homeForm: TeamFormAnalysis;
  awayForm: TeamFormAnalysis;
  config: PredictionConfig;
  /** Average goals per team per match for this league (fallback when unknown). */
  leagueAverageGoalsPerTeam?: number;
}): ExpectedGoalsResult => {
  const baseline = leagueAverageGoalsPerTeam ?? config.goals.fallbackGoalsPerTeam;
  const safeBaseline = baseline > 0 ? baseline : config.goals.fallbackGoalsPerTeam;

  const homeScored = homeForm.blended.averageGoalsScored;
  const homeConceded = homeForm.blended.averageGoalsConceded;
  const awayScored = awayForm.blended.averageGoalsScored;
  const awayConceded = awayForm.blended.averageGoalsConceded;

  // Attack and defence ratios relative to the league baseline (1 = average).
  const homeAttack = clamp(homeScored / safeBaseline, 0.2, 2.6);
  const homeDefence = clamp(homeConceded / safeBaseline, 0.2, 2.6);
  const awayAttack = clamp(awayScored / safeBaseline, 0.2, 2.6);
  const awayDefence = clamp(awayConceded / safeBaseline, 0.2, 2.6);

  // Opponent-strength multipliers (tight bands; scaled by classification confidence).
  const homeQualityAdj = opponentQualityMultiplier({ form: homeForm.opponentStrength, config });
  const awayQualityAdj = opponentQualityMultiplier({ form: awayForm.opponentStrength, config });

  // NOTE ON SHRINKAGE: `aggregateTeamForm` already shrinks each per-match average toward
  // the league baseline for small samples. Shrinking the product again here would
  // over-regularise (national-shrink applied twice), so no additional sample shrink is
  // applied to the lambdas beyond the clamp.

  const homeLambdaRaw =
    safeBaseline *
    Math.pow(homeAttack, config.goals.attackWeight) *
    Math.pow(awayDefence, config.goals.defenceWeight) *
    homeQualityAdj;

  const awayLambdaRaw =
    safeBaseline *
    Math.pow(awayAttack, config.goals.attackWeight) *
    Math.pow(homeDefence, config.goals.defenceWeight) *
    awayQualityAdj;

  const homeLambda = clamp(homeLambdaRaw, 0.05, config.goals.maxExpectedGoals);
  const awayLambda = clamp(awayLambdaRaw, 0.05, config.goals.maxExpectedGoals);

  return {
    home: round(homeLambda, 4),
    away: round(awayLambda, 4),
    homeAttack,
    homeDefence,
    awayAttack,
    awayDefence,
    shrinkageApplied: 0,
  };
};

export interface PoissonGridResult {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeScores: number;
  awayScores: number;
  bttsYes: number;
  bttsNo: number;
  over1_5: number;
  under1_5: number;
  over2_5: number;
  under2_5: number;
  over3_5: number;
  under3_5: number;
  homeOrDraw: number;
  awayOrDraw: number;
  homeDrawNoBet: number;
  awayDrawNoBet: number;
  topScorelines: Array<{ home: number; away: number; probability: number }>;
}

/**
 * Independent Poisson scoreline grid with a Dixon-Coles-style low-score tilt.
 *
 * HONESTY NOTE - this is NOT a fitted Dixon-Coles model.
 * The canonical Dixon-Coles (1997) model estimates a dependence parameter `rho` by
 * maximum likelihood on historical scorelines. Here `rho` is a fixed configured
 * constant (`config.goals.lowScoreRho`, default 0.03) that tilts 0-0/1-1 down and
 * 1-0/0-1 up. The functional form of the tau correction matches the published one, but
 * because `rho` is neither fitted nor validated against data, this must be described as
 * an *approximation with a fixed low-score tilt*, not a validated Dixon-Coles model.
 *
 * All mutually exclusive market families (1X2, BTTS, totals, team-to-score) are now
 * derived from this single normalised grid, so they are internally coherent.
 */
export const buildPoissonGrid = ({
  homeLambda,
  awayLambda,
  config,
}: {
  homeLambda: number;
  awayLambda: number;
  config: PredictionConfig;
}): PoissonGridResult => {
  const size = Math.max(3, Math.floor(config.goals.gridSize));
  const rho = clamp(config.goals.lowScoreRho, 0, 0.2);
  // Draw tilt is applied *inside* the grid (before normalisation) so every derived
  // market family - 1X2, BTTS and totals - comes from one coherent distribution.
  const drawMultiplier = config.goals.drawInflation > 0 ? config.goals.drawInflation : 1;

  const homeProbs = Array.from({ length: size + 1 }, (_, k) => poissonPmf(homeLambda, k));
  const awayProbs = Array.from({ length: size + 1 }, (_, k) => poissonPmf(awayLambda, k));

  const scorelines: Array<{ home: number; away: number; probability: number }> = [];

  let total = 0;
  for (let home = 0; home <= size; home += 1) {
    for (let away = 0; away <= size; away += 1) {
      let p = homeProbs[home] * awayProbs[away];

      // Dixon-Coles-style low-score dependency tilt (see module note: rho is a fixed
      // configured constant here, not an estimated parameter).
      if (rho > 0) {
        if (home === 0 && away === 0) p *= 1 - homeLambda * awayLambda * rho;
        else if (home === 0 && away === 1) p *= 1 + homeLambda * rho;
        else if (home === 1 && away === 0) p *= 1 + awayLambda * rho;
        else if (home === 1 && away === 1) p *= 1 - rho;
      }

      // Draw tilt folded into the same distribution.
      if (home === away) {
        p *= drawMultiplier;
      }

      scorelines.push({ home, away, probability: p });
      total += p;
    }
  }

  // Normalise (grid truncation + DC/draw tilts leave the sum slightly off 1). After this
  // every derived market shares exactly the same normalising constant.
  if (total > 0) {
    scorelines.forEach((line) => {
      line.probability /= total;
    });
  }

  const sumWhere = (predicate: (line: { home: number; away: number }) => boolean) =>
    scorelines.reduce((acc, line) => (predicate(line) ? acc + line.probability : acc), 0);

  const homeWin = sumWhere((line) => line.home > line.away);
  const draw = sumWhere((line) => line.home === line.away);
  const awayWin = sumWhere((line) => line.home < line.away);

  const homeScores = sumWhere((line) => line.home >= 1);
  const awayScores = sumWhere((line) => line.away >= 1);

  const bttsYes = sumWhere((line) => line.home >= 1 && line.away >= 1);
  const over1_5 = sumWhere((line) => line.home + line.away >= 2);
  const over2_5 = sumWhere((line) => line.home + line.away >= 3);
  const over3_5 = sumWhere((line) => line.home + line.away >= 4);

  const topScorelines = [...scorelines]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5)
    .map((line) => ({
      home: line.home,
      away: line.away,
      probability: round(line.probability, 4),
    }));

  const homeOrDraw = homeWin + draw;
  const awayOrDraw = awayWin + draw;
  const nonDraw = homeWin + awayWin;
  const homeDrawNoBet = nonDraw > 0 ? homeWin / nonDraw : 0.5;
  const awayDrawNoBet = nonDraw > 0 ? awayWin / nonDraw : 0.5;

  return {
    homeWin: round(homeWin, 4),
    draw: round(draw, 4),
    awayWin: round(awayWin, 4),
    homeScores: round(homeScores, 4),
    awayScores: round(awayScores, 4),
    bttsYes: round(bttsYes, 4),
    bttsNo: round(1 - bttsYes, 4),
    over1_5: round(over1_5, 4),
    under1_5: round(1 - over1_5, 4),
    over2_5: round(over2_5, 4),
    under2_5: round(1 - over2_5, 4),
    over3_5: round(over3_5, 4),
    under3_5: round(1 - over3_5, 4),
    homeOrDraw: round(homeOrDraw, 4),
    awayOrDraw: round(awayOrDraw, 4),
    homeDrawNoBet: round(homeDrawNoBet, 4),
    awayDrawNoBet: round(awayDrawNoBet, 4),
    topScorelines,
  };
};

/** Convenience: estimate xG and build the grid in one call. */
export const modelMatch = (params: {
  homeForm: TeamFormAnalysis;
  awayForm: TeamFormAnalysis;
  config: PredictionConfig;
  leagueAverageGoalsPerTeam?: number;
}): { expectedGoals: ExpectedGoalsResult; grid: PoissonGridResult } => {
  const expectedGoals = estimateExpectedGoals(params);
  const grid = buildPoissonGrid({
    homeLambda: safeNumber(expectedGoals.home),
    awayLambda: safeNumber(expectedGoals.away),
    config: params.config,
  });
  return { expectedGoals, grid };
};