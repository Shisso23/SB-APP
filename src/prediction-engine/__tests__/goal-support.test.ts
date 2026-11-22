import { DEFAULT_PREDICTION_CONFIG, mergePredictionConfig } from '../../config/prediction-config';
import { evaluateGoalTotalSupport, teamTwoPlusProbability } from '../goal-support';
import { buildMarkets } from '../markets';
import { MatchProbabilities, MarketOdds, ScorelineProbability } from '../types';
import { makeForecastBetPrediction } from '../test-support/forecast-bet-builders';

const config = DEFAULT_PREDICTION_CONFIG;
const NOW = Date.UTC(2024, 0, 1);

// Configured values this suite exercises (not redefined, read from config).
const HOME_MIN = config.selection.perMarket.home_over_0_5.minProbability!; // 0.72
const AWAY_MIN = config.selection.perMarket.away_over_0_5.minProbability!; // 0.62
const STRONG = config.selection.goalSupport.strongTeamScoreProbability; // 0.85
const TWO_PLUS = config.selection.goalSupport.teamTwoPlusMinProbability; // 0.70

const probabilities = (overrides: Partial<MatchProbabilities>): MatchProbabilities =>
  ({ homeScores: 0.5, awayScores: 0.5, baseScorelines: undefined, ...overrides } as MatchProbabilities);

const support = (marketId: 'over_1_5' | 'over_2_5', overrides: Partial<MatchProbabilities>, cfg = config) =>
  evaluateGoalTotalSupport({ marketId, probabilities: probabilities(overrides), config: cfg });

const gridHomeTwoPlus = (p: number): ScorelineProbability[] => [
  { home: 2, away: 0, probability: p },
  { home: 0, away: 0, probability: 1 - p },
];
const gridAwayTwoPlus = (p: number): ScorelineProbability[] => [
  { home: 0, away: 2, probability: p },
  { home: 0, away: 0, probability: 1 - p },
];

describe('over 1.5 supporting-evidence validation', () => {
  it('is supported when both teams meet their configured scoring thresholds (inclusive boundary)', () => {
    expect(support('over_1_5', { homeScores: HOME_MIN, awayScores: AWAY_MIN }).supported).toBe(true);
  });

  it('is supported when only one team is strongly expected to score (inclusive boundary)', () => {
    expect(support('over_1_5', { homeScores: STRONG, awayScores: 0.3 }).supported).toBe(true);
    expect(support('over_1_5', { homeScores: 0.3, awayScores: STRONG }).supported).toBe(true);
    expect(support('over_1_5', { homeScores: STRONG - 0.0001, awayScores: 0.3 }).supported).toBe(false);
    expect(support('over_1_5', { homeScores: 0.3, awayScores: STRONG - 0.0001 }).supported).toBe(false);
  });

  it('is rejected with reasons when neither team has sufficient supporting probability', () => {
    const result = support('over_1_5', { homeScores: HOME_MIN - 0.0001, awayScores: AWAY_MIN - 0.0001 });
    expect(result).toMatchObject({ required: true, supported: false });
    expect(result.reasons.join(' ')).toMatch(/do not support 2\+ total goals/);
  });

  it('safely rejects missing or invalid supporting probabilities', () => {
    [undefined, NaN, -0.1, 1.2].forEach((bad) => {
      const result = support('over_1_5', { homeScores: bad as number, awayScores: AWAY_MIN });
      expect(result.supported).toBe(false);
      expect(result.reasons.join(' ')).toMatch(/missing or invalid/);
    });
    expect(support('over_1_5', { homeScores: HOME_MIN, awayScores: undefined as unknown as number }).supported).toBe(false);
  });
});

describe('over 2.5 supporting-evidence validation (stronger than over 1.5)', () => {
  it('is supported when both teams meet their thresholds and one is a strong scorer', () => {
    expect(support('over_2_5', { homeScores: STRONG, awayScores: AWAY_MIN }).supported).toBe(true);
    expect(support('over_2_5', { homeScores: HOME_MIN, awayScores: STRONG }).supported).toBe(true);
  });

  it('is supported via the 2+1 route: one team likely to score 2+ plus the other meeting its scoring threshold', () => {
    expect(support('over_2_5', { homeScores: 0.5, awayScores: AWAY_MIN, baseScorelines: gridHomeTwoPlus(TWO_PLUS) }).supported).toBe(true);
    expect(support('over_2_5', { homeScores: HOME_MIN, awayScores: 0.4, baseScorelines: gridAwayTwoPlus(TWO_PLUS) }).supported).toBe(true);
    // 2+ probability below the configured minimum does not count.
    expect(support('over_2_5', { homeScores: 0.5, awayScores: AWAY_MIN, baseScorelines: gridHomeTwoPlus(TWO_PLUS - 0.001) }).supported).toBe(false);
    // The other side must still meet its own scoring threshold.
    expect(support('over_2_5', { homeScores: 0.5, awayScores: AWAY_MIN - 0.0001, baseScorelines: gridHomeTwoPlus(0.9) }).supported).toBe(false);
  });

  it('rejects an over 1.5-style pass: both teams merely meeting their thresholds is not enough for 3+ goals', () => {
    const result = support('over_2_5', { homeScores: STRONG - 0.0001, awayScores: STRONG - 0.0001 });
    expect(result.supported).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/do not support 3\+ total goals/);
  });

  it('safely rejects when supporting probabilities are missing and ignores malformed scoreline grids', () => {
    expect(support('over_2_5', { homeScores: undefined as unknown as number, awayScores: undefined as unknown as number }).supported).toBe(false);
    // Incomplete grid (mass != 1) cannot prove the 2+1 route.
    expect(
      support('over_2_5', {
        homeScores: 0.5, awayScores: AWAY_MIN,
        baseScorelines: [{ home: 2, away: 0, probability: 0.75 }],
      }).supported
    ).toBe(false);
    // Malformed lines are rejected outright.
    expect(
      support('over_2_5', {
        homeScores: 0.5, awayScores: AWAY_MIN,
        baseScorelines: [{ home: -2, away: 0, probability: 0.75 }, { home: 0, away: 0, probability: 0.25 }],
      }).supported
    ).toBe(false);
  });
});

describe('teamTwoPlusProbability', () => {
  it('sums 2+ goals for the requested side from a complete grid only', () => {
    expect(teamTwoPlusProbability(gridHomeTwoPlus(0.75), 'home')).toBeCloseTo(0.75);
    expect(teamTwoPlusProbability(gridHomeTwoPlus(0.75), 'away')).toBeCloseTo(0);
    expect(teamTwoPlusProbability(undefined, 'home')).toBeUndefined();
    expect(teamTwoPlusProbability([], 'home')).toBeUndefined();
    expect(teamTwoPlusProbability([{ home: 2, away: 0, probability: 0.75 }], 'home')).toBeUndefined();
  });
});

describe('scope and configuration', () => {
  it('never applies to other markets and can be disabled by configuration', () => {
    (['btts_yes', 'home_over_0_5', 'away_over_0_5', 'over_3_5', 'under_2_5', 'home_win'] as const).forEach((marketId) => {
      expect(
        evaluateGoalTotalSupport({ marketId, probabilities: probabilities({ homeScores: 0.1, awayScores: 0.1 }), config })
      ).toEqual({ required: false, supported: true, reasons: [] });
    });
    const disabled = mergePredictionConfig({ selection: { goalSupport: { enabled: false } } });
    expect(support('over_1_5', { homeScores: 0.1, awayScores: 0.1 }, disabled)).toEqual({ required: false, supported: true, reasons: [] });
  });
});

describe('integration with market qualification (buildMarkets)', () => {
  const oddsFor = (marketIds: string[]): MarketOdds[] =>
    marketIds.map((marketId) => ({ marketId: marketId as MarketOdds['marketId'], decimalOdds: 1.8, timestamp: NOW }));

  const marketsFor = (probOverrides: Partial<MatchProbabilities>, odds?: MarketOdds[], cfg = config) => {
    const base = makeForecastBetPrediction({ now: NOW });
    return buildMarkets({
      probabilities: { ...base.probabilities, ...probOverrides },
      odds,
      config: cfg,
      home: base.homeTeam,
      away: base.awayTeam,
      now: NOW,
      dataQualityWarnings: [],
      goalModelApplied: true,
    });
  };

  it('disqualifies a goal total that passes its own thresholds when team-goal support contradicts it', () => {
    const { markets, selections } = marketsFor(
      { over1_5: 0.8, over2_5: 0.62, over3_5: 0.1, homeScores: 0.5, awayScores: 0.5 },
      oddsFor(['over_1_5', 'over_2_5'])
    );
    const over15 = markets.find((m) => m.marketId === 'over_1_5')!;
    const over25 = markets.find((m) => m.marketId === 'over_2_5')!;
    // Own thresholds still pass; only the supporting-evidence veto rejects.
    expect(over15.passedProbabilityThreshold).toBe(true);
    expect(over15.qualifies).toBe(false);
    expect(over15.rejectReasons).toEqual(expect.arrayContaining([expect.stringMatching(/2\+ total goals/)]));
    expect(over25.qualifies).toBe(false);
    expect(over25.rejectReasons).toEqual(expect.arrayContaining([expect.stringMatching(/3\+ total goals/)]));
    expect(selections.map((m) => m.marketId)).not.toEqual(expect.arrayContaining(['over_1_5', 'over_2_5']));
  });

  it('keeps qualification and ranking unchanged when the supporting evidence backs the total', () => {
    const supported = marketsFor(
      { over1_5: 0.8, over2_5: 0.62, over3_5: 0.1, homeScores: 0.9, awayScores: 0.65 },
      oddsFor(['over_1_5', 'over_2_5'])
    );
    const over15 = supported.markets.find((m) => m.marketId === 'over_1_5')!;
    const over25 = supported.markets.find((m) => m.marketId === 'over_2_5')!;
    expect(over15.qualifies).toBe(true);
    expect(over15.rejectReasons).toEqual([]);
    expect(over25.qualifies).toBe(true);
    expect(supported.selections.map((m) => m.marketId)).toEqual(expect.arrayContaining(['over_1_5', 'over_2_5']));
  });

  it('also vetoes an over_1_5 qualification implied via over_2_5/over_3_5 when support is missing', () => {
    // over_1_5 itself is below its own threshold but MARKET_IMPLICATIONS would imply
    // it via over_2_5 passing; the goal-support veto must still apply to that implied path.
    const { markets } = marketsFor(
      { over1_5: 0.3, over2_5: 0.9, over3_5: 0.1, homeScores: 0.3, awayScores: 0.3 },
      oddsFor(['over_1_5', 'over_2_5'])
    );
    const over15 = markets.find((m) => m.marketId === 'over_1_5')!;
    const over25 = markets.find((m) => m.marketId === 'over_2_5')!;
    // over_2_5 itself is vetoed for lack of support, so it cannot imply over_1_5 either.
    expect(over25.qualifies).toBe(false);
    expect(over15.qualifies).toBe(false);
  });

  it('preserves BTTS and team-to-score behaviour regardless of the goal-support veto', () => {
    const weakSupports = { bttsYes: 0.7, homeScores: 0.5, awayScores: 0.5 };
    const disabled = mergePredictionConfig({ selection: { goalSupport: { enabled: false } } });
    const withVeto = marketsFor(weakSupports, oddsFor(['btts_yes', 'home_over_0_5', 'away_over_0_5']));
    const withoutVeto = marketsFor(weakSupports, oddsFor(['btts_yes', 'home_over_0_5', 'away_over_0_5']), disabled);
    (['btts_yes', 'home_over_0_5', 'away_over_0_5'] as const).forEach((marketId) => {
      const gated = withVeto.markets.find((m) => m.marketId === marketId)!;
      const ungated = withoutVeto.markets.find((m) => m.marketId === marketId)!;
      expect(gated.qualifies).toBe(ungated.qualifies);
      expect(gated.rejectReasons).toEqual(ungated.rejectReasons);
    });
    // BTTS with both teams meeting their requirements still qualifies on its own thresholds.
    const strongBtts = marketsFor({ bttsYes: 0.7, homeScores: 0.8, awayScores: 0.7 }, oddsFor(['btts_yes']));
    expect(strongBtts.markets.find((m) => m.marketId === 'btts_yes')!.qualifies).toBe(true);
    // BTTS with one team below its requirement keeps its existing own-threshold behaviour.
    const oneSided = marketsFor({ bttsYes: 0.7, homeScores: 0.8, awayScores: 0.3 }, oddsFor(['btts_yes']));
    expect(oneSided.markets.find((m) => m.marketId === 'btts_yes')!.qualifies).toBe(true);
  });
});
