import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { buildPoissonGrid, poissonPmf, estimateExpectedGoals } from '../poisson';
import { TeamFormAnalysis } from '../types';

const config = DEFAULT_PREDICTION_CONFIG;

const makeForm = (overrides: Partial<TeamFormAnalysis> = {}): TeamFormAnalysis => ({
  teamId: 1,
  teamName: 'Test',
  venue: 'home',
  venueForm: {
    sampleSize: 10,
    matches: [],
    goalsScored: 15,
    goalsConceded: 10,
    averageGoalsScored: 1.5,
    averageGoalsConceded: 1.0,
    scoredPct: 80,
    concededPct: 70,
    bttsPct: 60,
    over1_5Pct: 70,
    over2_5Pct: 50,
    over3_5Pct: 30,
    cleanSheetPct: 30,
    winPct: 50,
    drawPct: 20,
    lossPct: 30,
    scoringTrend: 0,
    defenceTrend: 0,
  },
  overallForm: {
    sampleSize: 10,
    matches: [],
    goalsScored: 15,
    goalsConceded: 10,
    averageGoalsScored: 1.5,
    averageGoalsConceded: 1.0,
    scoredPct: 80,
    concededPct: 70,
    bttsPct: 60,
    over1_5Pct: 70,
    over2_5Pct: 50,
    over3_5Pct: 30,
    cleanSheetPct: 30,
    winPct: 50,
    drawPct: 20,
    lossPct: 30,
    scoringTrend: 0,
    defenceTrend: 0,
  },
  blended: {
    sampleSize: 10,
    matches: [],
    goalsScored: 15,
    goalsConceded: 10,
    averageGoalsScored: 1.5,
    averageGoalsConceded: 1.0,
    scoredPct: 80,
    concededPct: 70,
    bttsPct: 60,
    over1_5Pct: 70,
    over2_5Pct: 50,
    over3_5Pct: 30,
    cleanSheetPct: 30,
    winPct: 50,
    drawPct: 20,
    lossPct: 30,
    scoringTrend: 0,
    defenceTrend: 0,
  },
  venueSampleSize: 10,
  overallSampleSize: 10,
  opponentStrength: { vsStrong: 0, vsUpper: 0, vsMid: 0, vsLower: 0, entries: [] },
  notes: [],
  ...overrides,
});

describe('poisson', () => {
  it('computes a valid Poisson PMF that sums to ~1', () => {
    const lambda = 1.6;
    let total = 0;
    for (let k = 0; k <= 30; k += 1) {
      total += poissonPmf(lambda, k);
    }
    expect(total).toBeCloseTo(1, 5);
    expect(poissonPmf(lambda, 0)).toBeCloseTo(Math.exp(-lambda), 6);
  });

  it('produces coherent mutually exclusive market probabilities', () => {
    const grid = buildPoissonGrid({ homeLambda: 1.6, awayLambda: 1.1, config });

    expect(grid.homeWin + grid.draw + grid.awayWin).toBeCloseTo(1, 3);
    expect(grid.bttsYes + grid.bttsNo).toBeCloseTo(1, 3);
    expect(grid.over1_5 + grid.under1_5).toBeCloseTo(1, 3);
    expect(grid.over2_5 + grid.under2_5).toBeCloseTo(1, 3);
    expect(grid.over3_5 + grid.under3_5).toBeCloseTo(1, 3);
  });

  it('orders total-goals probabilities correctly', () => {
    const grid = buildPoissonGrid({ homeLambda: 1.6, awayLambda: 1.1, config });
    expect(grid.over1_5).toBeGreaterThan(grid.over2_5);
    expect(grid.over2_5).toBeGreaterThan(grid.over3_5);
  });

  it('derives team-scoring probabilities consistent with BTTS', () => {
    const grid = buildPoissonGrid({ homeLambda: 1.4, awayLambda: 1.2, config });
    // BTTS yes must be <= min(both score) and >= homeScores + awayScores - 1.
    expect(grid.bttsYes).toBeLessThanOrEqual(Math.min(grid.homeScores, grid.awayScores) + 1e-6);
    expect(grid.bttsYes).toBeGreaterThanOrEqual(grid.homeScores + grid.awayScores - 1 - 1e-6);
  });

  it('makes a stronger home side more likely to win', () => {
    const strong = buildPoissonGrid({ homeLambda: 2.4, awayLambda: 0.7, config });
    const weak = buildPoissonGrid({ homeLambda: 0.7, awayLambda: 2.4, config });
    expect(strong.homeWin).toBeGreaterThan(strong.awayWin);
    expect(weak.awayWin).toBeGreaterThan(weak.homeWin);
  });

  it('estimates higher xG for a stronger attack vs weaker defence', () => {
    const strongHome = makeForm({
      blended: { ...makeForm().blended, averageGoalsScored: 2.4, averageGoalsConceded: 0.7 },
    });
    const weakAway = makeForm({
      blended: { ...makeForm().blended, averageGoalsScored: 0.6, averageGoalsConceded: 2.2 },
    });

    const { home, away } = estimateExpectedGoals({
      homeForm: strongHome,
      awayForm: weakAway,
      config,
      leagueAverageGoalsPerTeam: 1.4,
    });

    expect(home).toBeGreaterThan(away);
    expect(home).toBeGreaterThan(1.4);
    expect(away).toBeLessThan(1.4);
  });
});