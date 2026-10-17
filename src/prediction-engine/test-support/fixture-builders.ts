import { FixtureDataModel } from '../../models/fixtures';
import { StandingsModel } from '../../models/standings-models';

/**
 * Minimal fixture factory so tests can build deterministic data without hitting the
 * network. Only the fields the engine reads are populated.
 */
export const makeFixture = ({
  id,
  timestamp,
  homeId,
  awayId,
  homeGoals,
  awayGoals,
  leagueId = 1,
  season = 2023,
  homeName,
  awayName,
  status = 'FT',
}: {
  id: number;
  timestamp: number;
  homeId: number;
  awayId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  leagueId?: number;
  season?: number;
  homeName?: string;
  awayName?: string;
  status?: string;
}): FixtureDataModel =>
  new FixtureDataModel({
    fixture: {
      id,
      timestamp,
      timezone: 'UTC',
      date: new Date(timestamp).toISOString(),
      status: { long: 'Match Finished', short: status, elapsed: 90 },
    },
    league: {
      id: leagueId,
      name: `League ${leagueId}`,
      country: 'Testland',
      logo: '',
      season,
    },
    teams: {
      home: { id: homeId, name: homeName ?? `Team ${homeId}`, logo: '', winner: null as any },
      away: { id: awayId, name: awayName ?? `Team ${awayId}`, logo: '', winner: null as any },
    },
    goals: { home: homeGoals as any, away: awayGoals as any },
    score: {
      halftime: { home: 0, away: 0 },
      fulltime: { home: homeGoals as any, away: awayGoals as any },
      extratime: { home: null as any, away: null as any },
    },
  } as any);

export const makeStandingRow = ({
  teamId,
  rank,
  played,
  win,
  draw,
  lose,
  goalsFor,
  goalsAgainst,
  points,
}: {
  teamId: number;
  rank: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}) => ({
  rank,
  team: { id: teamId, name: `Team ${teamId}`, logo: '' },
  points,
  goalsDiff: goalsFor - goalsAgainst,
  season: 2023,
  group: '',
  form: '',
  status: 'same',
  description: null as any,
  all: {
    played,
    win,
    draw,
    lose,
    goals: { for: goalsFor, against: goalsAgainst },
  },
});

export const makeStandings = ({
  leagueId = 1,
  season = 2023,
  rows,
}: {
  leagueId?: number;
  season?: number;
  rows: ReturnType<typeof makeStandingRow>[];
}): StandingsModel =>
  new StandingsModel({
    errors: [],
    results: 1,
    response: [
      {
        league: {
          id: leagueId,
          name: `League ${leagueId}`,
          country: 'Testland',
          logo: '',
          season,
          flag: '',
          standings: [rows],
        },
      },
    ],
  } as any);

/** Build a balanced round-robin-ish set of finished fixtures for a league. */
export const makeSeasonFixture = (
  index: number,
  homeId: number,
  awayId: number,
  homeGoals: number,
  awayGoals: number,
  baseTimestamp = Date.UTC(2023, 7, 1),
  leagueId = 1,
  season = 2023
) =>
  makeFixture({
    id: index + 1,
    timestamp: baseTimestamp + index * 86_400_000,
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    leagueId,
    season,
  });