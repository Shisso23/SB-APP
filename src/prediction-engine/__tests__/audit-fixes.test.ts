import { opponentQualityMultiplier } from '../opponent-strength';
import { estimateExpectedGoals, buildPoissonGrid } from '../poisson';
import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { TeamFormAnalysis } from '../types';
import { aggregateTeamForm } from '../team-form';
import { makeFixture } from '../test-support/fixture-builders';

const config = DEFAULT_PREDICTION_CONFIG;

const mkForm = (over: Partial<TeamFormAnalysis> = {}): TeamFormAnalysis => ({
  teamId: 1,
  teamName: 'T',
  venue: 'home',
  venueForm: {} as any,
  overallForm: {} as any,
  blended: {
    sampleSize: 10, matches: [], goalsScored: 15, goalsConceded: 10,
    averageGoalsScored: 1.5, averageGoalsConceded: 1.0, scoredPct: 80, concededPct: 70,
    bttsPct: 60, over1_5Pct: 70, over2_5Pct: 50, over3_5Pct: 30, cleanSheetPct: 30,
    winPct: 50, drawPct: 20, lossPct: 30, scoringTrend: 0, defenceTrend: 0,
  },
  venueSampleSize: 10,
  overallSampleSize: 10,
  opponentStrength: { vsStrong: 0, vsUpper: 0, vsMid: 0, vsLower: 0, entries: [] },
  notes: [],
  ...over,
});

const entry = (confidence: number) => ({
  fixtureId: 1,
  opponentId: 1,
  opponentName: 'Opp',
  strength: { band: 'strong' as const, confidence, reason: 'test' },
  goalsScored: 1,
  goalsConceded: 0,
});

describe('regression: opponent-strength confidence now matters', () => {
  it('reduces the multiplier toward 1 as classification confidence falls', () => {
    const base = { vsStrong: 3, vsUpper: 0, vsMid: 0, vsLower: 0 };
    const highConf = { ...base, entries: [entry(1), entry(1), entry(1)] };
    const lowConf = { ...base, entries: [entry(0.2), entry(0.2), entry(0.2)] };

    const high = opponentQualityMultiplier({ form: highConf, config });
    const low = opponentQualityMultiplier({ form: lowConf, config });

    // Facing strong opponents should elevate xG slightly; low confidence flattens it.
    expect(high).toBeGreaterThan(1);
    expect(Math.abs(low - 1)).toBeLessThan(Math.abs(high - 1));
  });

  it('returns exactly 1 when there is no confidence information', () => {
    const zeroConf = { vsStrong: 3, vsUpper: 0, vsMid: 0, vsLower: 0, entries: [entry(0)] };
    expect(opponentQualityMultiplier({ form: zeroConf, config })).toBeCloseTo(1, 6);
  });
});

describe('regression: shrinkage is applied exactly once', () => {
  it('does not shrink the lambda a second time in estimateExpectedGoals', () => {
    const matches = [
      makeFixture({ id: 1, timestamp: 3000, homeId: 1, awayId: 9, homeGoals: 4, awayGoals: 0 }),
      makeFixture({ id: 2, timestamp: 2000, homeId: 1, awayId: 8, homeGoals: 4, awayGoals: 0 }),
    ];
    const form = aggregateTeamForm({ matches, teamId: 1, config, baselineScored: 1.35, baselineConceded: 1.35 });

    const home = mkForm({
      blended: { ...mkForm().blended, averageGoalsScored: form.averageGoalsScored, averageGoalsConceded: form.averageGoalsConceded },
      venueSampleSize: 2, overallSampleSize: 2,
    });
    const away = mkForm();
    const xg = estimateExpectedGoals({ homeForm: home, awayForm: away, config, leagueAverageGoalsPerTeam: 1.35 });

    const raw = 1.35 * Math.pow(form.averageGoalsScored / 1.35, 0.6) * Math.pow(1.0 / 1.35, 0.4);
    // No second shrink: the lambda equals the raw product (within rounding).
    expect(xg.home).toBeCloseTo(raw, 3);
  });
});

describe('regression: single coherent distribution', () => {
  it('reports a draw probability equal to the grid draw share (no separate rescale)', () => {
    const grid = buildPoissonGrid({ homeLambda: 1.5, awayLambda: 1.3, config });
    // With one normaliser, 1X2 sums to exactly 1 and draw is the grid draw share.
    expect(grid.homeWin + grid.draw + grid.awayWin).toBeCloseTo(1, 4);
    expect(grid.bttsYes + grid.bttsNo).toBeCloseTo(1, 4);
    // Team-scoring + BTTS consistency holds because all come from the same grid.
    expect(grid.bttsYes).toBeGreaterThanOrEqual(grid.homeScores + grid.awayScores - 1 - 1e-6);
    expect(grid.bttsYes).toBeLessThanOrEqual(Math.min(grid.homeScores, grid.awayScores) + 1e-6);
  });
});