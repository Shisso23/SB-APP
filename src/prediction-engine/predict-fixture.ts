import {
  PredictionConfig,
  DeepPartial,
  DEFAULT_PREDICTION_CONFIG,
  mergePredictionConfig,
} from '../config/prediction-config';
import {
  DataQuality,
  FixturePrediction,
  MarketId,
  MarketOdds,
  MarketValue,
  MatchProbabilities,
  PredictionInput,
  TeamFormAnalysis,
} from './types';
import { collectTeamMatches, aggregateTeamForm, blendVenueAndOverall } from './team-form';
import { buildOpponentAdjustedForm } from './opponent-strength';
import { modelMatch } from './poisson';
import { computeGoalModel, applyGoalModelOverride } from './goal-model';
import { buildMarkets } from './markets';
import { isStale } from './odds';
import { findStandingsTable } from './standings-lookup';
import { formatPercent, round, safeNumber } from './math-utils';
import { parseSeason } from './standings-lookup';
import { FixtureDataModel } from '../models/fixtures';

/**
 * Analyse a single fixture end-to-end and return explainable, calibrated-by-model
 * probabilities for every supported market.
 *
 * The function is pure: it depends only on its inputs (fixtures, standings, odds) and
 * an injectable clock, which makes it safe to reuse inside the backtester where a
 * prediction must only see information available before kickoff.
 */
export const predictFixture = (
  input: PredictionInput,
  configOverrides?: DeepPartial<PredictionConfig>
): FixturePrediction => {
  const config = mergePredictionConfig(configOverrides, DEFAULT_PREDICTION_CONFIG);
  const now = input.now ?? Date.now();
  const { fixture, allFixtures, leaguesStandings } = input;

  const homeTeamId = safeNumber(fixture.teams?.home?.id);
  const awayTeamId = safeNumber(fixture.teams?.away?.id);
  const leagueId = safeNumber(fixture.league?.id);
  const season = parseSeason(fixture.league?.season);

  const warnings: string[] = [];

  // --- Collect matches, ensuring a prediction never sees this fixture or the future.
  const cutoff = safeNumber(fixture.fixture?.timestamp) || now;
  const eligibleFixtures = (allFixtures || []).filter(
    (candidate) =>
      safeNumber(candidate.fixture?.id) !== safeNumber(fixture.fixture?.id) &&
      safeNumber(candidate.fixture?.timestamp) < cutoff
  );

  const homeCollections = collectTeamMatches({
    teamId: homeTeamId,
    allFixtures: eligibleFixtures,
    venue: 'home',
    season,
    limit: config.recentWindow,
    venueFilter: true,
  });
  const awayCollections = collectTeamMatches({
    teamId: awayTeamId,
    allFixtures: eligibleFixtures,
    venue: 'away',
    season,
    limit: config.recentWindow,
    venueFilter: true,
  });

  // League scoring baseline from the standings (goals for / matches played).
  const standingsTable = findStandingsTable({ standings: leaguesStandings, leagueId, season });
  const leagueAverageGoalsPerTeam =
    estimateLeagueAverage(standingsTable) ??
    estimateLeagueAverageFromFixtures(eligibleFixtures, leagueId);

  const homeVenueForm = aggregateTeamForm({
    matches: homeCollections.venueMatches,
    teamId: homeTeamId,
    config,
    baselineScored: leagueAverageGoalsPerTeam,
    baselineConceded: leagueAverageGoalsPerTeam,
  });
  const homeOverallForm = aggregateTeamForm({
    matches: homeCollections.overallMatches,
    teamId: homeTeamId,
    config,
    baselineScored: leagueAverageGoalsPerTeam,
    baselineConceded: leagueAverageGoalsPerTeam,
  });
  const awayVenueForm = aggregateTeamForm({
    matches: awayCollections.venueMatches,
    teamId: awayTeamId,
    config,
    baselineScored: leagueAverageGoalsPerTeam,
    baselineConceded: leagueAverageGoalsPerTeam,
  });
  const awayOverallForm = aggregateTeamForm({
    matches: awayCollections.overallMatches,
    teamId: awayTeamId,
    config,
    baselineScored: leagueAverageGoalsPerTeam,
    baselineConceded: leagueAverageGoalsPerTeam,
  });

  const homeVenueSufficient = homeVenueForm.sampleSize >= config.minVenueMatches;
  const awayVenueSufficient = awayVenueForm.sampleSize >= config.minVenueMatches;

  if (!homeVenueSufficient) {
    warnings.push(
      `Home team venue sample is small (${homeVenueForm.sampleSize} match(es)); overall form is used as supplementary evidence.`
    );
  }
  if (!awayVenueSufficient) {
    warnings.push(
      `Away team venue sample is small (${awayVenueForm.sampleSize} match(es)); overall form is used as supplementary evidence.`
    );
  }

  const homeBlended = blendVenueAndOverall({
    venueForm: homeVenueForm,
    overallForm: homeOverallForm,
    venueSufficient: homeVenueSufficient,
    config,
  });
  const awayBlended = blendVenueAndOverall({
    venueForm: awayVenueForm,
    overallForm: awayOverallForm,
    venueSufficient: awayVenueSufficient,
    config,
  });

  const standingsAreCurrent = input.standingsAreCurrent ?? true;
  const homeOpponentStrength = buildOpponentAdjustedForm({
    teamId: homeTeamId,
    matches: homeCollections.overallMatches,
    standings: leaguesStandings,
    config,
    standingsAreCurrent,
    leagueId,
    season,
  });
  const awayOpponentStrength = buildOpponentAdjustedForm({
    teamId: awayTeamId,
    matches: awayCollections.overallMatches,
    standings: leaguesStandings,
    config,
    standingsAreCurrent,
    leagueId,
    season,
  });

  const homeTeam: TeamFormAnalysis = {
    teamId: homeTeamId,
    teamName: fixture.teams?.home?.name ?? `Team ${homeTeamId}`,
    venue: 'home',
    venueForm: homeVenueForm,
    overallForm: homeOverallForm,
    blended: homeBlended,
    venueSampleSize: homeVenueForm.sampleSize,
    overallSampleSize: homeOverallForm.sampleSize,
    opponentStrength: homeOpponentStrength,
    notes: [],
  };
  const awayTeam: TeamFormAnalysis = {
    teamId: awayTeamId,
    teamName: fixture.teams?.away?.name ?? `Team ${awayTeamId}`,
    venue: 'away',
    venueForm: awayVenueForm,
    overallForm: awayOverallForm,
    blended: awayBlended,
    venueSampleSize: awayVenueForm.sampleSize,
    overallSampleSize: awayOverallForm.sampleSize,
    opponentStrength: awayOpponentStrength,
    notes: [],
  };

  // --- Model the matchup.
  const h2hAll = eligibleFixtures.filter(
    (candidate) =>
      ((safeNumber(candidate.teams?.home?.id) === homeTeamId &&
        safeNumber(candidate.teams?.away?.id) === awayTeamId) ||
        (safeNumber(candidate.teams?.home?.id) === awayTeamId &&
          safeNumber(candidate.teams?.away?.id) === homeTeamId)) &&
      candidate.fixture?.status?.short === 'FT'
  );

  const { expectedGoals, grid } = modelMatch({
    homeForm: homeTeam,
    awayForm: awayTeam,
    config,
    leagueAverageGoalsPerTeam,
  });

  const probabilities: MatchProbabilities = {
    expectedGoals,
    homeWin: grid.homeWin,
    draw: grid.draw,
    awayWin: grid.awayWin,
    homeScores: grid.homeScores,
    awayScores: grid.awayScores,
    bttsYes: grid.bttsYes,
    bttsNo: grid.bttsNo,
    over1_5: grid.over1_5,
    under1_5: grid.under1_5,
    over2_5: grid.over2_5,
    under2_5: grid.under2_5,
    over3_5: grid.over3_5,
    under3_5: grid.under3_5,
    homeOrDraw: grid.homeOrDraw,
    awayOrDraw: grid.awayOrDraw,
    homeDrawNoBet: grid.homeDrawNoBet,
    awayDrawNoBet: grid.awayDrawNoBet,
    topScorelines: grid.topScorelines,
  };

  // --- Goal-market model (validated improvement for BTTS/totals only). -----------
  // Blends recent venue form toward a per-league long-term average. Team-to-score
  // markets deliberately keep the original engine estimate (measured better).
  const globalBaseline = estimateGlobalBaseline(eligibleFixtures);
  const goalModel = computeGoalModel({
    home: homeTeam,
    away: awayTeam,
    config,
    leagueAverageGoalsPerTeam,
    globalAverageGoalsPerTeam: globalBaseline,
  });
  const finalProbabilities = applyGoalModelOverride({
    base: probabilities,
    goalModel,
    config,
  });
  const goalModelApplied = config.goalModel.enabled && Object.keys(goalModel.markets).length > 0;

  // --- Odds & data quality.
  const odds: MarketOdds[] | undefined = input.odds;
  const oddsAvailable = Boolean(odds && odds.length > 0);
  const oddsStale = Boolean(odds?.some((entry) => isStale(entry.timestamp, now, config.odds.staleAfterMinutes)));

  if (!oddsAvailable) {
    warnings.push('No bookmaker odds supplied: this is a statistical prediction with no verified betting-value assessment.');
  }
  if (oddsStale) {
    warnings.push('Supplied odds have an unverifiable update time or are outside the configured freshness window.');
  }

  const dataQuality: DataQuality = {
    homeSampleSize: homeVenueForm.sampleSize,
    awaySampleSize: awayVenueForm.sampleSize,
    homeVenueSufficient,
    awayVenueSufficient,
    h2hSampleSize: h2hAll.length,
    standingsAvailable: Boolean(standingsTable),
    opponentStrengthHindsightBias: standingsAreCurrent && Boolean(standingsTable),
    oddsAvailable,
    oddsStale,
    fullTimeResultsOnly: true,
    warnings,
    validatedMarkets: [
      'home_win',
      'away_win',
      'home_over_0_5',
      'away_over_0_5',
      ...(goalModelApplied ? ['over_1_5', 'over_2_5', 'over_3_5'] : []),
    ] as MarketId[],
    weakMarkets: [
      'draw',
      'btts_yes',
      ...(goalModelApplied ? [] : ['over_1_5', 'over_2_5', 'over_3_5']),
    ] as MarketId[],
    goalModel: goalModelApplied ? 'prior-blended' : 'engine',
  };

  if (!standingsTable) {
    warnings.push('Standings for the correct league/season were unavailable; opponent strength is marked unknown.');
  }

  const { markets, selections } = buildMarkets({
    probabilities: finalProbabilities,
    odds,
    config,
    home: homeTeam,
    away: awayTeam,
    now,
    dataQualityWarnings: warnings,
    goalModelApplied,
    quality: {
      homeSampleSize: homeVenueForm.sampleSize,
      awaySampleSize: awayVenueForm.sampleSize,
      homeOverallSampleSize: homeOverallForm.sampleSize,
      awayOverallSampleSize: awayOverallForm.sampleSize,
      minSampleSize: config.minTeamMatches,
    },
  });

  const headline = buildHeadline({
    fixture,
    probabilities: finalProbabilities,
    selections,
    dataQuality,
  });

  return {
    fixture,
    homeTeam,
    awayTeam,
    probabilities: finalProbabilities,
    markets,
    selections,
    dataQuality,
    headline,
  };
};

/**
 * A global goals-per-team-per-match baseline from the matches visible before kickoff.
 * Used only as the fallback prior when no per-league standings baseline exists.
 */
export const estimateGlobalBaseline = (fixtures: FixtureDataModel[]): number | undefined => {
  const finished = fixtures.filter(
    (f) =>
      f.fixture?.status?.short === 'FT' &&
      Number.isFinite(f.goals?.home) &&
      Number.isFinite(f.goals?.away)
  );
  if (finished.length === 0) {
    return undefined;
  }
  const totalGoals = finished.reduce(
    (acc, f) => acc + safeNumber(f.goals.home) + safeNumber(f.goals.away),
    0
  );
  return round(totalGoals / (2 * finished.length), 4);
};

/**
 * Per-league fallback prior from completed fixtures available before the target kickoff.
 * This avoids borrowing a scoring rate from another competition when standings are missing.
 */
export const estimateLeagueAverageFromFixtures = (
  fixtures: FixtureDataModel[],
  leagueId: number
): number | undefined => {
  const finished = (fixtures || []).filter(
    (fixture) =>
      safeNumber(fixture.league?.id) === leagueId &&
      fixture.fixture?.status?.short === 'FT' &&
      Number.isFinite(fixture.goals?.home) &&
      Number.isFinite(fixture.goals?.away)
  );
  if (finished.length === 0) {
    return undefined;
  }
  const totalGoals = finished.reduce(
    (total, fixture) => total + safeNumber(fixture.goals.home) + safeNumber(fixture.goals.away),
    0
  );
  return round(totalGoals / (2 * finished.length), 4);
};

/** League average goals per team, derived from the standings table when available. */
export const estimateLeagueAverage = (
  table: ReturnType<typeof findStandingsTable>
): number | undefined => {
  if (!table || table.rows.length === 0) {
    return undefined;
  }
  const totals = table.rows.reduce(
    (acc, row) => {
      const played = safeNumber(row.all?.played);
      const goalsFor = safeNumber(row.all?.goals?.for);
      return { goals: acc.goals + goalsFor, matches: acc.matches + played };
    },
    { goals: 0, matches: 0 }
  );
  if (totals.matches === 0) {
    return undefined;
  }
  // goals per team per match = total goals / (team-matches)
  return round(totals.goals / totals.matches, 4);
};

const buildHeadline = ({
  fixture,
  probabilities,
  selections,
  dataQuality,
}: {
  fixture: FixturePrediction['fixture'];
  probabilities: MatchProbabilities;
  selections: MarketValue[];
  dataQuality: DataQuality;
}): string => {
  const home = fixture.teams?.home?.name ?? 'Home';
  const away = fixture.teams?.away?.name ?? 'Away';
  const scoreline = probabilities.topScorelines[0];
  const best = selections[0];

  const base = `${home} vs ${away}: model xG ${probabilities.expectedGoals.home.toFixed(2)}–${probabilities.expectedGoals.away.toFixed(2)}` +
    (scoreline ? `, most likely scoreline ${scoreline.home}-${scoreline.away} (${formatPercent(scoreline.probability)})` : '') +
    `. 1X2: ${formatPercent(probabilities.homeWin)} / ${formatPercent(probabilities.draw)} / ${formatPercent(probabilities.awayWin)}.`;

  if (!best) {
    return `${base} No market passed the configured thresholds.`;
  }

  const edgeText = best.edge ? `, estimated edge ${formatPercent(best.edge, 1)}` : '';
  const oddsText = best.decimalOdds ? ` at ${best.decimalOdds.toFixed(2)}` : '';

  return `${base} Leading selection: ${best.label} — model probability ${formatPercent(best.modelProbability)}${oddsText}${edgeText}.` +
    (dataQuality.warnings.length ? ` Notes: ${dataQuality.warnings[0]}` : '');
};

export default predictFixture;