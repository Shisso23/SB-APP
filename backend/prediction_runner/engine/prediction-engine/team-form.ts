import { FixtureDataModel } from '../models/fixtures';
import { PredictionConfig } from '../config/prediction-config';
import { TeamVenueForm } from './types';
import {
  countOf,
  mean,
  percentageOf,
  recencyWeights,
  safeNumber,
  shrinkToward,
  sortFinishedFixturesDesc,
  sum,
  trendSlope,
  weightedAverage,
} from './math-utils';

/** Does the given team play this fixture at home? */
export const isHomeFor = (fixture: FixtureDataModel, teamId: number) =>
  safeNumber(fixture.teams?.home?.id) === teamId;

/** Goals the given team scored in a fixture (venue-aware). */
export const goalsForTeam = (fixture: FixtureDataModel, teamId: number) =>
  isHomeFor(fixture, teamId) ? safeNumber(fixture.goals?.home) : safeNumber(fixture.goals?.away);

/** Goals the opponent scored in a fixture (venue-aware). */
export const goalsAgainstTeam = (fixture: FixtureDataModel, teamId: number) =>
  isHomeFor(fixture, teamId) ? safeNumber(fixture.goals?.away) : safeNumber(fixture.goals?.home);

export interface TeamFormCollections {
  /** Venue-specific matches (home team at home / away team away), newest first. */
  venueMatches: FixtureDataModel[];
  /** All matches regardless of venue, newest first. */
  overallMatches: FixtureDataModel[];
}

/**
 * Collect finished matches for a team, optionally filtered to a season.
 *
 * When the current-season sample is too small we deliberately fall back to all-time
 * and record that fact via the returned sample sizes, rather than silently mixing
 * seasons without a signal.
 */
export const collectTeamMatches = ({
  teamId,
  allFixtures,
  venue,
  season,
  limit,
  venueFilter,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
  venue: 'home' | 'away';
  season?: number;
  limit: number;
  /** When true, only include matches at the team's own venue. */
  venueFilter: boolean;
}): TeamFormCollections => {
  const teamMatches = sortFinishedFixturesDesc(
    (allFixtures || []).filter(
      (fixture) =>
        safeNumber(fixture.teams?.home?.id) === teamId ||
        safeNumber(fixture.teams?.away?.id) === teamId
    )
  );

  const seasonMatches =
    typeof season === 'number'
      ? teamMatches.filter((fixture) => safeNumber(fixture.league?.season) === season)
      : teamMatches;

  const seasonSufficient = seasonMatches.length >= limit;
  const source = seasonSufficient ? seasonMatches : teamMatches;

  // Apply the venue filter BEFORE slicing to the window limit, otherwise a team with
  // many home matches would have its away matches pushed out of the window.
  const venuePool = venueFilter
    ? source.filter((fixture) => isHomeFor(fixture, teamId) === (venue === 'home'))
    : source;

  const venueMatches = venuePool.slice(0, limit);
  const overallMatches = source.slice(0, limit);

  return { venueMatches, overallMatches };
};

interface AggregateGoalInput {
  matches: FixtureDataModel[];
  teamId: number;
  config: PredictionConfig;
  /** Baseline average goals scored per team used for shrinkage. */
  baselineScored?: number;
  baselineConceded?: number;
}

/**
 * Build a TeamVenueForm from a list of (newest-first) matches for a team.
 *
 * Averages use configurable recency weighting (blended with the median). Percentage
 * fields are plain sample frequencies and must not be presented as calibrated
 * probabilities — the UI/engine labels them as observed frequency.
 */
export const aggregateTeamForm = ({
  matches,
  teamId,
  config,
  baselineScored,
  baselineConceded,
}: AggregateGoalInput): TeamVenueForm => {
  const scoringOrderedNewestFirst = matches.map((fixture) => goalsForTeam(fixture, teamId));
  const concedingOrderedNewestFirst = matches.map((fixture) => goalsAgainstTeam(fixture, teamId));

  const rawAverageScored = weightedAverage({
    values: scoringOrderedNewestFirst,
    enabled: config.recency.enabled,
    decayPerMatch: config.recency.decayPerMatch,
    weightedMeanBlend: config.recency.weightedMeanBlend,
  });
  const rawAverageConceded = weightedAverage({
    values: concedingOrderedNewestFirst,
    enabled: config.recency.enabled,
    decayPerMatch: config.recency.decayPerMatch,
    weightedMeanBlend: config.recency.weightedMeanBlend,
  });

  // Shrink small samples toward the baseline so 1-match samples cannot dominate.
  const averageGoalsScored = shrinkToward({
    estimate: rawAverageScored,
    baseline: baselineScored ?? config.goals.fallbackGoalsPerTeam,
    sampleSize: matches.length,
    strength: config.goals.shrinkage,
  });
  const averageGoalsConceded = shrinkToward({
    estimate: rawAverageConceded,
    baseline: baselineConceded ?? config.goals.fallbackGoalsPerTeam,
    sampleSize: matches.length,
    strength: config.goals.shrinkage,
  });

  const totalGoalsOrdered = matches.map(
    (fixture) => goalsForTeam(fixture, teamId) + goalsAgainstTeam(fixture, teamId)
  );

  // Oldest -> newest for trend analysis.
  const scoringOldestFirst = [...scoringOrderedNewestFirst].reverse();
  const concedingOldestFirst = [...concedingOrderedNewestFirst].reverse();

  return {
    sampleSize: matches.length,
    matches,
    goalsScored: sum(scoringOrderedNewestFirst),
    goalsConceded: sum(concedingOrderedNewestFirst),
    averageGoalsScored,
    averageGoalsConceded,
    scoredPct: percentageOf(scoringOrderedNewestFirst, (goals) => goals >= 1),
    concededPct: percentageOf(concedingOrderedNewestFirst, (goals) => goals >= 1),
    bttsPct: percentageOf(matches, (fixture) => {
      const forGoals = goalsForTeam(fixture, teamId);
      const againstGoals = goalsAgainstTeam(fixture, teamId);
      return forGoals > 0 && againstGoals > 0;
    }),
    over1_5Pct: percentageOf(totalGoalsOrdered, (goals) => goals >= 2),
    over2_5Pct: percentageOf(totalGoalsOrdered, (goals) => goals >= 3),
    over3_5Pct: percentageOf(totalGoalsOrdered, (goals) => goals >= 4),
    cleanSheetPct: percentageOf(concedingOrderedNewestFirst, (goals) => goals === 0),
    winPct: percentageOf(matches, (fixture) => {
      const forGoals = goalsForTeam(fixture, teamId);
      const againstGoals = goalsAgainstTeam(fixture, teamId);
      return forGoals > againstGoals;
    }),
    drawPct: percentageOf(matches, (fixture) => {
      const forGoals = goalsForTeam(fixture, teamId);
      const againstGoals = goalsAgainstTeam(fixture, teamId);
      return forGoals === againstGoals;
    }),
    lossPct: percentageOf(matches, (fixture) => {
      const forGoals = goalsForTeam(fixture, teamId);
      const againstGoals = goalsAgainstTeam(fixture, teamId);
      return forGoals < againstGoals;
    }),
    scoringTrend: trendSlope(scoringOldestFirst),
    defenceTrend: trendSlope(concedingOldestFirst),
  };
};

/**
 * Blend a venue-specific aggregate with the overall aggregate. When the venue sample
 * is small we lean more heavily on overall form (supplementary evidence) and the
 * caller surfaces that via the returned sample sizes.
 */
export const blendVenueAndOverall = ({
  venueForm,
  overallForm,
  venueSufficient,
  config,
}: {
  venueForm: TeamVenueForm;
  overallForm: TeamVenueForm;
  venueSufficient: boolean;
  config: PredictionConfig;
}): TeamVenueForm => {
  const venueWeight = venueSufficient
    ? config.venueWeightWhenSufficient
    : config.venueWeightWhenSmall;
  const overallWeight = 1 - venueWeight;

  const blend = (a: number, b: number) => a * venueWeight + b * overallWeight;

  return {
    // Sample size reported is the venue sample; overall is surfaced separately.
    sampleSize: venueForm.sampleSize,
    matches: venueForm.matches,
    goalsScored: venueForm.goalsScored,
    goalsConceded: venueForm.goalsConceded,
    averageGoalsScored: blend(venueForm.averageGoalsScored, overallForm.averageGoalsScored),
    averageGoalsConceded: blend(
      venueForm.averageGoalsConceded,
      overallForm.averageGoalsConceded
    ),
    scoredPct: blend(venueForm.scoredPct, overallForm.scoredPct),
    concededPct: blend(venueForm.concededPct, overallForm.concededPct),
    bttsPct: blend(venueForm.bttsPct, overallForm.bttsPct),
    over1_5Pct: blend(venueForm.over1_5Pct, overallForm.over1_5Pct),
    over2_5Pct: blend(venueForm.over2_5Pct, overallForm.over2_5Pct),
    over3_5Pct: blend(venueForm.over3_5Pct, overallForm.over3_5Pct),
    cleanSheetPct: blend(venueForm.cleanSheetPct, overallForm.cleanSheetPct),
    winPct: blend(venueForm.winPct, overallForm.winPct),
    drawPct: blend(venueForm.drawPct, overallForm.drawPct),
    lossPct: blend(venueForm.lossPct, overallForm.lossPct),
    scoringTrend: blend(venueForm.scoringTrend, overallForm.scoringTrend),
    defenceTrend: blend(venueForm.defenceTrend, overallForm.defenceTrend),
  };
};

/** Convenience: recency weights exposed for tests. */
export const formRecencyWeights = (count: number, decay: number) => recencyWeights(count, decay);

/** Convenience: simple average helpers reused by the backtester. */
export const averageOf = mean;
export const countMatching = countOf;