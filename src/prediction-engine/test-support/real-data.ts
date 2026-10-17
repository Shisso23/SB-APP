import { FixtureDataModel } from '../../models/fixtures';

/**
 * Convert an API-Football fixtures REST payload (as returned by
 * `GET /fixtures?league=..&season=..`, exactly the shape the app's `services/fixtures`
 * returns) into the engine's `FixtureDataModel` shape.
 *
 * This is the real-data bridge for evaluation: the same JSON the application fetches is
 * loaded here, so evaluation uses the actual available data rather than synthetic rows.
 */
export const parseApiFootballFixtures = (payload: any): FixtureDataModel[] => {
  const response = payload?.response ?? payload;
  if (!Array.isArray(response)) {
    return [];
  }

  return response
    .filter((row) => row?.fixture && row?.teams && row?.goals)
    .map(
      (row) =>
        new FixtureDataModel({
          fixture: {
            id: row.fixture.id,
            timezone: row.fixture.timezone ?? 'UTC',
            date: row.fixture.date,
            timestamp: row.fixture.timestamp,
            status: {
              long: row.fixture.status?.long ?? '',
              short: row.fixture.status?.short ?? '',
              elapsed: row.fixture.status?.elapsed ?? null,
            },
          },
          league: {
            id: row.league?.id,
            name: row.league?.name,
            country: row.league?.country,
            logo: row.league?.logo ?? '',
            season: row.league?.season,
          },
          teams: {
            home: { id: row.teams.home.id, name: row.teams.home.name, logo: row.teams.home.logo ?? '', winner: row.teams.home.winner },
            away: { id: row.teams.away.id, name: row.teams.away.name, logo: row.teams.away.logo ?? '', winner: row.teams.away.winner },
          },
          goals: { home: row.goals.home, away: row.goals.away },
          score: {
            halftime: row.score?.halftime ?? { home: null, away: null },
            fulltime: row.score?.fulltime ?? row.goals,
            extratime: row.score?.extratime ?? { home: null, away: null },
          },
        } as any)
    );
};

/** Loader for the JSON files captured under `eval-data/`. */
export const loadFixturesFromJson = (json: any): FixtureDataModel[] =>
  parseApiFootballFixtures(json);

/**
 * Simple, deliberately naive baselines used to sanity-check the model.
 *
 * 1. `leagueBaseRates` - the observed base rate of each market over the training window.
 *    This is the "always predict the historical frequency" baseline and is the bar any
 *    model must beat on Brier/log-loss.
 *
 * 2. `constant` - a fixed probability (e.g. 0.5) which is the no-information baseline.
 */
export interface BaseRates {
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  over1_5: number;
  over2_5: number;
  over3_5: number;
  homeScores: number;
  awayScores: number;
  sampleSize: number;
}

export const computeBaseRates = (fixtures: FixtureDataModel[]): BaseRates => {
  const finished = fixtures.filter(
    (fixture) =>
      fixture.fixture?.status?.short === 'FT' &&
      Number.isFinite(fixture.goals?.home) &&
      Number.isFinite(fixture.goals?.away)
  );

  const n = finished.length || 1;
  const rate = (predicate: (home: number, away: number) => boolean) =>
    finished.filter((fixture) => predicate(Number(fixture.goals.home), Number(fixture.goals.away))).length / n;

  return {
    homeWin: rate((h, a) => h > a),
    draw: rate((h, a) => h === a),
    awayWin: rate((h, a) => h < a),
    bttsYes: rate((h, a) => h > 0 && a > 0),
    over1_5: rate((h, a) => h + a >= 2),
    over2_5: rate((h, a) => h + a >= 3),
    over3_5: rate((h, a) => h + a >= 4),
    homeScores: rate((h) => h >= 1),
    awayScores: rate((_, a) => a >= 1),
    sampleSize: finished.length,
  };
};