import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import {
  buildOpponentAdjustedForm,
  classifyOpponentStrength,
  opponentQualityMultiplier,
} from '../opponent-strength';
import { findStandingsTable } from '../standings-lookup';
import { makeFixture, makeStandingRow, makeStandings } from '../test-support/fixture-builders';

const config = DEFAULT_PREDICTION_CONFIG;

const league20Rows = Array.from({ length: 20 }, (_, index) =>
  makeStandingRow({
    teamId: index + 1,
    rank: index + 1,
    played: 20,
    win: 20 - index,
    draw: 0,
    lose: index,
    goalsFor: 40 - index,
    goalsAgainst: index * 2,
    points: (20 - index) * 3,
  })
);

const table = makeStandings({ leagueId: 1, season: 2023, rows: league20Rows });

describe('opponent-strength', () => {
  it('classifies a top-of-table opponent as strong in a 20-team league', () => {
    const summary = classifyOpponentStrength({
      opponentTeamId: 1,
      leagueId: 1,
      season: 2023,
      standings: [table],
      config,
      standingsAreCurrent: false,
    });
    expect(summary.band).toBe('strong');
    expect(summary.confidence).toBe(1);
  });

  it('classifies a mid-table opponent as mid', () => {
    const summary = classifyOpponentStrength({
      opponentTeamId: 10,
      leagueId: 1,
      season: 2023,
      standings: [table],
      config,
      standingsAreCurrent: false,
    });
    expect(summary.band).toBe('mid');
  });

  it('classifies a bottom-of-table opponent as lower', () => {
    const summary = classifyOpponentStrength({
      opponentTeamId: 20,
      leagueId: 1,
      season: 2023,
      standings: [table],
      config,
      standingsAreCurrent: false,
    });
    expect(summary.band).toBe('lower');
  });

  it('adapts the strong band to a small league (top 3 of 10 is still strong)', () => {
    const smallLeagueRows = Array.from({ length: 10 }, (_, index) =>
      makeStandingRow({
        teamId: 100 + index,
        rank: index + 1,
        played: 10,
        win: 10 - index,
        draw: 0,
        lose: index,
        goalsFor: 20 - index,
        goalsAgainst: index,
        points: (10 - index) * 3,
      })
    );
    const smallTable = makeStandings({ leagueId: 7, season: 2023, rows: smallLeagueRows });
    const summary = classifyOpponentStrength({
      opponentTeamId: 102,
      leagueId: 7,
      season: 2023,
      standings: [smallTable],
      config,
      standingsAreCurrent: false,
    });
    // top 20% of 10 = top 2 -> rank 3 is "upper", not "strong" (no hardcoded top-4).
    expect(summary.band).toBe('upper');
  });

  it('returns unknown (never invents) when standings are missing', () => {
    const summary = classifyOpponentStrength({
      opponentTeamId: 1,
      leagueId: 1,
      season: 2999,
      standings: [table],
      config,
      standingsAreCurrent: false,
    });
    expect(summary.band).toBe('unknown');
    expect(summary.confidence).toBe(0);
  });

  it('marks strength unknown for opponents with too few matches played', () => {
    const rows = [
      makeStandingRow({
        teamId: 5,
        rank: 1,
        played: 1,
        win: 1,
        draw: 0,
        lose: 0,
        goalsFor: 2,
        goalsAgainst: 0,
        points: 3,
      }),
      ...league20Rows.slice(1),
    ];
    const sparseTable = makeStandings({ leagueId: 1, season: 2023, rows });
    const summary = classifyOpponentStrength({
      opponentTeamId: 5,
      leagueId: 1,
      season: 2023,
      standings: [sparseTable],
      config,
      standingsAreCurrent: true,
    });
    expect(summary.band).toBe('unknown');
  });

  it('reduces confidence when using current-only standings (hindsight)', () => {
    const current = classifyOpponentStrength({
      opponentTeamId: 1,
      leagueId: 1,
      season: 2023,
      standings: [table],
      config,
      standingsAreCurrent: true,
    });
    expect(current.confidence).toBeLessThan(1);
  });

  it('aggregates recent opponents into strength buckets', () => {
    const teamId = 30;
    const matches = [
      makeFixture({ id: 1, timestamp: 5000, homeId: teamId, awayId: 1, homeGoals: 1, awayGoals: 0, season: 2023 }),
      makeFixture({ id: 2, timestamp: 4000, homeId: teamId, awayId: 10, homeGoals: 2, awayGoals: 1, season: 2023 }),
      makeFixture({ id: 3, timestamp: 3000, homeId: teamId, awayId: 20, homeGoals: 3, awayGoals: 0, season: 2023 }),
    ];
    const form = buildOpponentAdjustedForm({
      teamId,
      matches,
      standings: [table],
      config,
      standingsAreCurrent: false,
      leagueId: 1,
      season: 2023,
    });
    expect(form.vsStrong).toBe(1);
    expect(form.vsMid).toBe(1);
    expect(form.vsLower).toBe(1);
    expect(form.entries).toHaveLength(3);
  });

  it('returns a neutral multiplier when nothing can be classified', () => {
    const empty = { vsStrong: 0, vsUpper: 0, vsMid: 0, vsLower: 0, entries: [] };
    expect(opponentQualityMultiplier({ form: empty, config })).toBe(1);
  });

  it('does not match a standings table from the wrong season', () => {
    const other = makeStandings({ leagueId: 1, season: 2022, rows: league20Rows });
    const lookup = findStandingsTable({ standings: [other], leagueId: 1, season: 2023 });
    expect(lookup).toBeUndefined();
  });
});