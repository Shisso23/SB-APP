import { PredictionConfig } from '../config/prediction-config';
import { MarketId, MatchProbabilities, ScorelineProbability } from './types';

/**
 * Logical supporting-evidence validation for goal-total markets.
 *
 * The prior-blended goal model can move `over_1_5`/`over_2_5` away from the base
 * scoreline grid while the team-scoring probabilities (`homeScores`/`awayScores`) keep
 * their base-grid values, so a goal total can clear its own configured threshold even
 * though the underlying team-goal predictions do not logically support that many goals.
 *
 * This module provides a veto used wherever selections are filtered: a goal-total
 * market only remains eligible when the team-scoring evidence backs it. It never lowers
 * or bypasses any existing threshold, and missing or invalid supporting probabilities
 * are treated as a lack of support (safe rejection), never as implicit validity.
 */
export interface GoalTotalSupport {
  /** Whether this market has a supporting-evidence rule at all. */
  required: boolean;
  /** Whether the supporting evidence backs the market. Always true when not required. */
  supported: boolean;
  /** Human-readable reasons when the market is required but unsupported. */
  reasons: string[];
}

const SUPPORT_NOT_REQUIRED: GoalTotalSupport = { required: false, supported: true, reasons: [] };

const validProbability = (p: unknown): p is number =>
  typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;

const teamScoreMinProbability = (config: PredictionConfig, marketId: MarketId): number =>
  config.selection.perMarket[marketId]?.minProbability ?? config.selection.defaultMinProbability;

/**
 * Probability that one side scores 2+ goals, summed from the complete normalized base
 * scoreline grid. Returns undefined when the grid is missing, malformed or incomplete,
 * mirroring the strict validation used by `forecastProbability`.
 */
export const teamTwoPlusProbability = (
  grid: ScorelineProbability[] | undefined,
  side: 'home' | 'away'
): number | undefined => {
  if (
    !grid?.length ||
    grid.some(
      (line) =>
        !validProbability(line.probability) ||
        !Number.isInteger(line.home) ||
        line.home < 0 ||
        !Number.isInteger(line.away) ||
        line.away < 0
    )
  ) {
    return undefined;
  }
  const mass = grid.reduce((sum, line) => sum + line.probability, 0);
  if (Math.abs(mass - 1) > 1e-6) {
    return undefined;
  }
  return grid.reduce((sum, line) => sum + (line[side] >= 2 ? line.probability : 0), 0);
};

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * Evaluate whether the team-goal predictions support a goal-total market.
 *
 * Over 1.5 (2+ goals) is supported when:
 *  - both teams meet their configured team-to-score minimum probabilities, or
 *  - one team is strongly expected to score (>= `strongTeamScoreProbability`).
 *
 * Over 2.5 (3+ goals) requires stronger evidence:
 *  - both teams meet their scoring minimums AND one of them is strongly expected to
 *    score, or
 *  - one team is likely to score 2+ (>= `teamTwoPlusMinProbability`, from the complete
 *    base scoreline grid) AND the other team meets its scoring minimum ("2+1").
 */
export const evaluateGoalTotalSupport = ({
  marketId,
  probabilities,
  config,
}: {
  marketId: MarketId;
  probabilities: MatchProbabilities;
  config: PredictionConfig;
}): GoalTotalSupport => {
  if (!config.selection.goalSupport?.enabled) {
    return SUPPORT_NOT_REQUIRED;
  }
  if (marketId !== 'over_1_5' && marketId !== 'over_2_5') {
    return SUPPORT_NOT_REQUIRED;
  }

  const { strongTeamScoreProbability, teamTwoPlusMinProbability } = config.selection.goalSupport;
  const homeMin = teamScoreMinProbability(config, 'home_over_0_5');
  const awayMin = teamScoreMinProbability(config, 'away_over_0_5');
  const homeScores = probabilities?.homeScores;
  const awayScores = probabilities?.awayScores;

  if (!validProbability(homeScores) || !validProbability(awayScores)) {
    return {
      required: true,
      supported: false,
      reasons: [
        'Supporting team-scoring probabilities are missing or invalid, so this goal-total market cannot be validated.',
      ],
    };
  }

  const homeOk = homeScores >= homeMin;
  const awayOk = awayScores >= awayMin;
  const homeStrong = homeScores >= strongTeamScoreProbability;
  const awayStrong = awayScores >= strongTeamScoreProbability;

  if (marketId === 'over_1_5') {
    const supported = (homeOk && awayOk) || homeStrong || awayStrong;
    return {
      required: true,
      supported,
      reasons: supported
        ? []
        : [
            `Team-goal predictions do not support 2+ total goals: home scores ${pct(homeScores)} (needs ${pct(homeMin)}) and away scores ${pct(awayScores)} (needs ${pct(awayMin)}) are not both met, and neither reaches the ${pct(strongTeamScoreProbability)} strong-scorer threshold.`,
          ],
    };
  }

  // over_2_5: both-teams route also needs one strong scorer; otherwise a "2+1" pattern.
  const bothScoreWithStrongSide = homeOk && awayOk && (homeStrong || awayStrong);
  const homeTwoPlus = teamTwoPlusProbability(probabilities.baseScorelines, 'home');
  const awayTwoPlus = teamTwoPlusProbability(probabilities.baseScorelines, 'away');
  const twoPlusOne =
    (homeTwoPlus !== undefined && homeTwoPlus >= teamTwoPlusMinProbability && awayOk) ||
    (awayTwoPlus !== undefined && awayTwoPlus >= teamTwoPlusMinProbability && homeOk);
  const supported = bothScoreWithStrongSide || twoPlusOne;

  return {
    required: true,
    supported,
    reasons: supported
      ? []
      : [
          `Team-goal predictions do not support 3+ total goals: needs both teams to meet their scoring thresholds (home ${pct(homeScores)} vs ${pct(homeMin)}, away ${pct(awayScores)} vs ${pct(awayMin)}) with one side at the ${pct(strongTeamScoreProbability)} strong-scorer threshold, or one side at ${pct(teamTwoPlusMinProbability)}+ probability of scoring 2+ with the other side meeting its scoring threshold.`,
        ],
  };
};
