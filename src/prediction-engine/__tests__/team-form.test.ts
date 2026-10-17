import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { aggregateTeamForm, collectTeamMatches, blendVenueAndOverall } from '../team-form';
import { makeFixture } from '../test-support/fixture-builders';

const config = DEFAULT_PREDICTION_CONFIG;

describe('team-form', () => {
  const teamId = 10;

  const homeMatches = [
    makeFixture({ id: 1, timestamp: 5000, homeId: teamId, awayId: 20, homeGoals: 2, awayGoals: 1 }),
    makeFixture({ id: 2, timestamp: 4000, homeId: teamId, awayId: 21, homeGoals: 0, awayGoals: 0 }),
    makeFixture({ id: 3, timestamp: 3000, homeId: teamId, awayId: 22, homeGoals: 3, awayGoals: 2 }),
    makeFixture({ id: 4, timestamp: 2000, homeId: teamId, awayId: 23, homeGoals: 1, awayGoals: 1 }),
  ];
  const awayMatches = [
    makeFixture({ id: 5, timestamp: 2500, homeId: 24, awayId: teamId, homeGoals: 2, awayGoals: 0 }),
    makeFixture({ id: 6, timestamp: 1500, homeId: 25, awayId: teamId, homeGoals: 3, awayGoals: 1 }),
  ];

  it('splits venue-specific matches correctly', () => {
    const all = [...homeMatches, ...awayMatches];
    const home = collectTeamMatches({
      teamId,
      allFixtures: all,
      venue: 'home',
      season: undefined,
      limit: 5,
      venueFilter: true,
    });
    const away = collectTeamMatches({
      teamId,
      allFixtures: all,
      venue: 'away',
      season: undefined,
      limit: 5,
      venueFilter: true,
    });

    expect(home.venueMatches).toHaveLength(4);
    expect(away.venueMatches).toHaveLength(2);
    // Venue-specific results must not leak the wrong venue.
    expect(home.venueMatches.every((f) => f.teams.home.id === teamId)).toBe(true);
    expect(away.venueMatches.every((f) => f.teams.away.id === teamId)).toBe(true);
  });

  it('computes percentages from the sample', () => {
    const form = aggregateTeamForm({ matches: homeMatches, teamId, config });

    // Scored in 3/4 home matches (0 in the 0-0).
    expect(form.scoredPct).toBe(75);
    expect(form.cleanSheetPct).toBe(25); // the 0-0
    expect(form.bttsPct).toBe(75); // 2-1, 3-2 and 1-1 all BTTS; only the 0-0 is not
    expect(form.over2_5Pct).toBe(50); // 2-1, 3-2 total >=3
    expect(form.winPct).toBe(50); // 2-1 and 3-2 wins
    expect(form.drawPct).toBe(50); // 0-0 and 1-1
  });

  it('keeps sample sizes and raw match records for explanations', () => {
    const form = aggregateTeamForm({ matches: homeMatches, teamId, config });
    expect(form.sampleSize).toBe(4);
    expect(form.matches).toBe(homeMatches);
  });

  it('blends venue form with overall form when the venue sample is small', () => {
    const venueForm = aggregateTeamForm({ matches: awayMatches, teamId, config });
    const overallForm = aggregateTeamForm({ matches: [...homeMatches, ...awayMatches], teamId, config });

    const smallBlend = blendVenueAndOverall({
      venueForm,
      overallForm,
      venueSufficient: false,
      config,
    });
    const largeBlend = blendVenueAndOverall({
      venueForm,
      overallForm,
      venueSufficient: true,
      config,
    });

    // When the venue sample is small we lean more on overall form, so the blended
    // average moves closer to the overall average than the "sufficient" blend.
    const overallAvg = overallForm.averageGoalsScored;
    expect(Math.abs(smallBlend.averageGoalsScored - overallAvg)).toBeLessThan(
      Math.abs(largeBlend.averageGoalsScored - overallAvg)
    );
  });

  it('detects an upward scoring trend', () => {
    const improving = [
      makeFixture({ id: 11, timestamp: 5000, homeId: teamId, awayId: 20, homeGoals: 3, awayGoals: 0 }),
      makeFixture({ id: 12, timestamp: 4000, homeId: teamId, awayId: 21, homeGoals: 2, awayGoals: 0 }),
      makeFixture({ id: 13, timestamp: 3000, homeId: teamId, awayId: 22, homeGoals: 1, awayGoals: 0 }),
      makeFixture({ id: 14, timestamp: 2000, homeId: teamId, awayId: 23, homeGoals: 0, awayGoals: 0 }),
    ];
    const form = aggregateTeamForm({ matches: improving, teamId, config });
    expect(form.scoringTrend).toBeGreaterThan(0);
  });

  it('does not over-react to a single outlier (median blend)', () => {
    const withOutlier = [
      makeFixture({ id: 21, timestamp: 5000, homeId: teamId, awayId: 20, homeGoals: 9, awayGoals: 0 }),
      makeFixture({ id: 22, timestamp: 4000, homeId: teamId, awayId: 21, homeGoals: 1, awayGoals: 0 }),
      makeFixture({ id: 23, timestamp: 3000, homeId: teamId, awayId: 22, homeGoals: 1, awayGoals: 0 }),
      makeFixture({ id: 24, timestamp: 2000, homeId: teamId, awayId: 23, homeGoals: 0, awayGoals: 0 }),
      makeFixture({ id: 25, timestamp: 1000, homeId: teamId, awayId: 24, homeGoals: 1, awayGoals: 0 }),
    ];
    const form = aggregateTeamForm({ matches: withOutlier, teamId, config });
    // Plain mean would be 12/5 = 2.4; heavy recency + median blending must damp the
    // 9-goal outlier so the shrunk estimate stays below the raw mean.
    expect(form.averageGoalsScored).toBeLessThan(2.4);
  });
});