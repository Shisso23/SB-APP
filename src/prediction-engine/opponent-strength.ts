import { FixtureDataModel } from '../models/fixtures';
import { PredictionConfig } from '../config/prediction-config';
import { goalsAgainstTeam, goalsForTeam, isHomeFor } from './team-form';
import {
  findStandingRow,
  findStandingsTable,
  parseSeason,
  pointsPerGame,
  StandingsLookup,
} from './standings-lookup';
import { clamp, safeNumber } from './math-utils';
import {
  OpponentAdjustedForm,
  OpponentStrengthBand,
  OpponentStrengthSummary,
  StandingsModel,
} from './types';

/**
 * Classify an opponent's strength using the standings for the correct league/season.
 *
 * Thresholds adapt to league size: "strong" is the top fraction of the table rather
 * than a fixed top-3, which is meaningful in a 20-team league but not in a 10-team one.
 *
 * Data-integrity rules:
 *  - wrong-season / missing tables -> `unknown` (never invented);
 *  - current-only standings carry hindsight bias, reflected in reduced confidence;
 *  - teams with too few matches played are marked unknown.
 */
export const classifyOpponentStrength = ({
  opponentTeamId,
  leagueId,
  season,
  standings,
  config,
  standingsAreCurrent,
}: {
  opponentTeamId: number;
  leagueId: number;
  season?: number;
  standings: StandingsModel[];
  config: PredictionConfig;
  /** True when the provided table is the current table (hindsight for past matches). */
  standingsAreCurrent?: boolean;
}): OpponentStrengthSummary => {
  const lookup: StandingsLookup | undefined = findStandingsTable({
    standings,
    leagueId,
    season,
  });

  if (!lookup) {
    return {
      band: 'unknown',
      confidence: 0,
      reason: `No ${season ? `${season} ` : ''}standings available for league ${leagueId}.`,
    };
  }

  const row = findStandingRow(lookup, opponentTeamId);
  if (!row) {
    return {
      band: 'unknown',
      confidence: 0,
      reason: 'Team not present in the standings table (possible promoted team or incomplete table).',
    };
  }

  const played = safeNumber(row.all?.played);
  if (played < config.opponentStrength.minOpponentPlayed) {
    return {
      band: 'unknown',
      rank: safeNumber(row.rank, undefined as unknown as number) || undefined,
      confidence: 0,
      reason: `Opponent has played only ${played} match(es); strength is unreliable.`,
    };
  }

  const rank = safeNumber(row.rank);
  const size = lookup.leagueSize || 1;

  const strongCut = Math.max(1, Math.round(size * config.opponentStrength.strongTopFraction));
  const upperCut = Math.max(strongCut + 1, Math.round(size * config.opponentStrength.upperTopFraction));
  const lowerStart = Math.max(upperCut + 1, size - Math.round(size * config.opponentStrength.lowerBottomFraction) + 1);

  let band: OpponentStrengthBand;
  if (rank <= strongCut) {
    band = 'strong';
  } else if (rank <= upperCut) {
    band = 'upper';
  } else if (rank >= lowerStart) {
    band = 'lower';
  } else {
    band = 'mid';
  }

  const confidence = standingsAreCurrent === false
    ? 1
    : config.opponentStrength.currentStandingsConfidence;

  const ppg = pointsPerGame(row);
  const goalDifference = safeNumber(row.goalsDiff);

  return {
    band,
    rank,
    pointsPerGame: ppg,
    goalDifference,
    confidence,
    reason:
      `Rank ${rank}/${size} (${band}) with ${ppg.toFixed(2)} points per game` +
      (standingsAreCurrent === false ? '' : '; classified from current standings (hindsight bias).'),
  };
};

/**
 * Summarise recent form split by the strength of the opponents faced, using the
 * correct competition's standings for the right season.
 */
export const buildOpponentAdjustedForm = ({
  teamId,
  matches,
  standings,
  config,
  standingsAreCurrent,
  leagueId,
  season,
}: {
  teamId: number;
  /** Venue-blended recent matches, newest first. */
  matches: FixtureDataModel[];
  standings: StandingsModel[];
  config: PredictionConfig;
  standingsAreCurrent?: boolean;
  /** Fallback league/season when a fixture lacks them (rare). */
  leagueId?: number;
  season?: number;
}): OpponentAdjustedForm => {
  const entries: OpponentAdjustedForm['entries'] = [];

  matches.forEach((fixture) => {
    const opponentIsHome = isHomeFor(fixture, teamId);
    const opponentId = opponentIsHome
      ? safeNumber(fixture.teams?.away?.id)
      : safeNumber(fixture.teams?.home?.id);
    const opponentName = opponentIsHome
      ? fixture.teams?.away?.name
      : fixture.teams?.home?.name;

    const fixtureSeason = parseSeason(fixture.league?.season) ?? season;
    const fixtureLeagueId = safeNumber(fixture.league?.id, leagueId ?? 0);

    const strength = classifyOpponentStrength({
      opponentTeamId: opponentId,
      leagueId: fixtureLeagueId,
      season: fixtureSeason,
      standings,
      config,
      standingsAreCurrent,
    });

    entries.push({
      fixtureId: safeNumber(fixture.fixture?.id),
      opponentId,
      opponentName: opponentName ?? `Team ${opponentId}`,
      strength,
      goalsScored: goalsForTeam(fixture, teamId),
      goalsConceded: goalsAgainstTeam(fixture, teamId),
    });
  });

  const countBand = (band: OpponentStrengthBand) =>
    entries.filter((entry) => entry.strength.band === band).length;

  return {
    vsStrong: countBand('strong'),
    vsUpper: countBand('upper'),
    vsMid: countBand('mid'),
    vsLower: countBand('lower'),
    entries,
  };
};

/**
 * A multiplier used to nudge (never mechanically determine) expected goals based on the
 * quality of opposition faced. The tilt is scaled by the average classification
 * confidence: when opponent strength is uncertain (e.g. current-only standings, or
 * unclassifiable teams) the multiplier collapses toward 1 so it cannot distort xG.
 */
export const opponentQualityMultiplier = ({
  form,
  config,
}: {
  form: OpponentAdjustedForm;
  config: PredictionConfig;
}): number => {
  const totalClassified =
    form.vsStrong + form.vsUpper + form.vsMid + form.vsLower;

  if (totalClassified === 0) {
    return 1;
  }

  const weightedScore =
    form.vsStrong * 1.0 + form.vsUpper * 0.85 + form.vsMid * 0.65 + form.vsLower * 0.45;

  const averageQuality = weightedScore / totalClassified;
  // Raw tilt in [-0.05, +0.08] around 1.0.
  const rawTilt = (clamp((averageQuality - 0.45) / 0.55, 0, 1) * 0.13) - 0.05;

  // Scale the tilt by how confident we are in the classifications. With no confidence
  // information the classification is treated as neutral (multiplier = 1).
  const confidence = confidenceAverage(form);
  const multiplier = 1 + rawTilt * clamp(confidence, 0, 1);

  return clamp(multiplier, 0.9, 1.1);
};

const confidenceAverage = (form: OpponentAdjustedForm): number => {
  if (form.entries.length === 0) {
    return 0;
  }
  const sum = form.entries.reduce((acc, entry) => acc + entry.strength.confidence, 0);
  return sum / form.entries.length;
};

/** Human-readable opponent-strength evidence, e.g. "scored in 2/3 vs upper-table". */
export const opponentStrengthEvidence = (form: OpponentAdjustedForm): string[] => {
  const lines: string[] = [];
  const buckets: Array<{ band: OpponentStrengthBand; label: string; entries: typeof form.entries }> = [
    { band: 'strong', label: 'top/strong', entries: form.entries.filter((e) => e.strength.band === 'strong') },
    { band: 'upper', label: 'upper-table', entries: form.entries.filter((e) => e.strength.band === 'upper') },
    { band: 'mid', label: 'mid-table', entries: form.entries.filter((e) => e.strength.band === 'mid') },
    { band: 'lower', label: 'lower-table', entries: form.entries.filter((e) => e.strength.band === 'lower') },
  ];

  buckets.forEach((bucket) => {
    if (bucket.entries.length === 0) {
      return;
    }
    const scored = bucket.entries.filter((e) => e.goalsScored > 0).length;
    lines.push(
      `Scored in ${scored}/${bucket.entries.length} recent matches vs ${bucket.label} opponents.`
    );
  });

  const unknown = form.entries.filter((e) => e.strength.band === 'unknown').length;
  if (unknown > 0) {
    lines.push(`${unknown} recent opponent(s) could not be classified (standings unavailable).`);
  }

  return lines;
};