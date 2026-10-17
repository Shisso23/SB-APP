import { StandingsDataStandingModel, StandingsModel } from '../models/standings-models';
import { safeNumber } from './math-utils';

export interface StandingsLookup {
  /** League id the table belongs to. */
  leagueId: number;
  /** Season the table belongs to (year). */
  season: number;
  /** Flattened table rows. */
  rows: StandingsDataStandingModel[];
  /** Total number of teams in the table (used to size strength bands). */
  leagueSize: number;
}

/** Parse a season value that may arrive as a number or numeric string (e.g. "2023"). */
export const parseSeason = (season: unknown): number | undefined => {
  if (typeof season === 'number' && Number.isFinite(season)) {
    return season;
  }
  if (typeof season === 'string') {
    const parsed = Number(season);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const flattenStandingsRows = (
  standings: StandingsModel
): StandingsDataStandingModel[] => {
  const response = standings?.response?.[0];
  if (!response?.league?.standings) {
    return [];
  }
  // standings is an array of groups (some competitions have multiple groups/rounds).
  return response.league.standings.flat().filter(Boolean);
};

/**
 * Resolve the standings table for the requested league AND season.
 *
 * Season matching is intentional: a table for the wrong season must never be used,
 * otherwise opponent classification becomes invalid. When the requested season is
 * unavailable the caller receives `undefined` and should treat strength as unknown.
 */
export const findStandingsTable = ({
  standings,
  leagueId,
  season,
}: {
  standings: StandingsModel[];
  leagueId: number;
  season?: number;
}): StandingsLookup | undefined => {
  if (!Array.isArray(standings)) {
    return undefined;
  }

  for (const candidate of standings) {
    const league = candidate?.response?.[0]?.league;
    if (!league) {
      continue;
    }
    if (safeNumber(league.id) !== leagueId) {
      continue;
    }

    const candidateSeason = parseSeason(league.season);

    // If a season is required, enforce an exact match.
    if (typeof season === 'number') {
      if (candidateSeason !== season) {
        continue;
      }
    }

    const rows = flattenStandingsRows(candidate);
    if (rows.length === 0) {
      continue;
    }

    return {
      leagueId,
      season: candidateSeason ?? (season as number),
      rows,
      leagueSize: rows.length,
    };
  }

  return undefined;
};

/** Find a single team's row inside a lookup, guarding against badge/placeholder rows. */
export const findStandingRow = (
  lookup: StandingsLookup | undefined,
  teamId: number
): StandingsDataStandingModel | undefined =>
  lookup?.rows.find((row) => safeNumber(row?.team?.id) === teamId);

/** Points per game for a table row (0 when the team has not played). */
export const pointsPerGame = (row: StandingsDataStandingModel | undefined): number => {
  const played = safeNumber(row?.all?.played);
  if (played <= 0) {
    return 0;
  }
  return safeNumber(row?.points) / played;
};