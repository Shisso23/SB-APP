import { FixtureDataModel } from '../../models/fixtures';
import { safeNumber } from '../math-utils';
import { predictFixture } from '../predict-fixture';
import { DEFAULT_PREDICTION_CONFIG, PredictionConfig } from '../../config/prediction-config';
import { MarketId, MatchProbabilities } from '../types';

/**
 * A single evaluated prediction row. Captures the model probability, the actual
 * outcome, and the diagnostic inputs so alternatives can be compared on the *exact*
 * same chronological split and leakage constraints.
 */
export interface EvaluationRow {
  fixtureId: number;
  leagueId: number;
  season: number;
  kickoff: number;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  /** The engine's full market probabilities for this fixture (leakage-safe). */
  probabilities: MatchProbabilities;
  /** Model expected goals (pre-rounding shown). */
  xgHome: number;
  xgAway: number;
  /** Sample sizes actually used. */
  homeVenueSample: number;
  awayVenueSample: number;
  homeOverallSample: number;
  awayOverallSample: number;
  /** League baseline derived from standings at prediction time (may be undefined). */
  leagueBaseline?: number;
  /** Blended recent form averages used by the model. */
  homeScoredAvg: number;
  homeConcededAvg: number;
  awayScoredAvg: number;
  awayConcededAvg: number;
}

export interface EvaluationDataset {
  /** Training window (chronologically first). */
  train: EvaluationRow[];
  /** Test window (chronologically last) - the untouched evaluation period. */
  test: EvaluationRow[];
  /** All rows in chronological order. */
  all: EvaluationRow[];
  splitTimestamp: number;
}

export interface BuildEvaluationOptions {
  allFixtures: FixtureDataModel[];
  config?: PredictionConfig;
  trainFraction?: number;
}

/**
 * Build a leakage-safe evaluation dataset.
 *
 * For each fixture (in chronological order) the model is invoked with ONLY the matches
 * strictly before that fixture's kickoff. Rows are then split chronologically into
 * train/test by `trainFraction`, so any calibration is fit on train and scored on test.
 */
export const buildEvaluationDataset = ({
  allFixtures,
  config = DEFAULT_PREDICTION_CONFIG,
  trainFraction = 0.6,
}: BuildEvaluationOptions): EvaluationDataset => {
  const finished = (allFixtures || [])
    .filter(
      (f) =>
        f.fixture?.status?.short === 'FT' &&
        Number.isFinite(f.goals?.home) &&
        Number.isFinite(f.goals?.away)
    )
    .sort((a, b) => safeNumber(a.fixture.timestamp) - safeNumber(b.fixture.timestamp));

  const rows: EvaluationRow[] = [];

  finished.forEach((fixture) => {
    const kickoff = safeNumber(fixture.fixture.timestamp);
    const prior = finished.filter((c) => safeNumber(c.fixture.timestamp) < kickoff);
    if (prior.length === 0) {
      return;
    }

    const prediction = predictFixture(
      {
        fixture,
        allFixtures: prior,
        leaguesStandings: [],
        standingsAreCurrent: false,
        now: kickoff,
      },
      config as any
    );

    rows.push({
      fixtureId: safeNumber(fixture.fixture.id),
      leagueId: safeNumber(fixture.league?.id),
      season: safeNumber(fixture.league?.season),
      kickoff,
      homeTeamId: safeNumber(fixture.teams?.home?.id),
      awayTeamId: safeNumber(fixture.teams?.away?.id),
      homeGoals: safeNumber(fixture.goals.home),
      awayGoals: safeNumber(fixture.goals.away),
      probabilities: prediction.probabilities,
      xgHome: prediction.probabilities.expectedGoals.home,
      xgAway: prediction.probabilities.expectedGoals.away,
      homeVenueSample: prediction.dataQuality.homeSampleSize,
      awayVenueSample: prediction.dataQuality.awaySampleSize,
      homeOverallSample: prediction.homeTeam.overallSampleSize,
      awayOverallSample: prediction.awayTeam.overallSampleSize,
      leagueBaseline: undefined,
      homeScoredAvg: prediction.homeTeam.blended.averageGoalsScored,
      homeConcededAvg: prediction.homeTeam.blended.averageGoalsConceded,
      awayScoredAvg: prediction.awayTeam.blended.averageGoalsScored,
      awayConcededAvg: prediction.awayTeam.blended.averageGoalsConceded,
    });
  });

  const splitIndex = Math.max(0, Math.floor(rows.length * trainFraction));
  const train = rows.slice(0, splitIndex);
  const test = rows.slice(splitIndex);

  return {
    train,
    test,
    all: rows,
    splitTimestamp: test[0]?.kickoff ?? 0,
  };
};

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

export const brier = (probability: number, happened: boolean): number =>
  (probability - (happened ? 1 : 0)) ** 2;

export const logloss = (probability: number, happened: boolean): number => {
  const p = Math.min(1 - 1e-9, Math.max(1e-9, probability));
  return happened ? -Math.log(p) : -Math.log(1 - p);
};

export interface MetricSummary {
  n: number;
  accuracy: number;
  brier: number;
  logLoss: number;
  brierSkill: number;
  baseRate: number;
  baselineBrier: number;
  baselineLogLoss: number;
}

export const summarise = (
  rows: Array<{ probability: number; happened: boolean }>,
  baselineProbability: number
): MetricSummary => {
  const n = rows.length;
  if (n === 0) {
    return { n: 0, accuracy: 0, brier: 0, logLoss: 0, brierSkill: 0, baseRate: 0, baselineBrier: 0, baselineLogLoss: 0 };
  }
  const accuracy =
    rows.filter((r) => (r.probability >= 0.5) === r.happened).length / n;
  const brierScore = rows.reduce((a, r) => a + brier(r.probability, r.happened), 0) / n;
  const logLossScore = rows.reduce((a, r) => a + logloss(r.probability, r.happened), 0) / n;
  const baselineBrier =
    rows.reduce((a, r) => a + brier(baselineProbability, r.happened), 0) / n;
  const baselineLogLoss =
    rows.reduce((a, r) => a + logloss(baselineProbability, r.happened), 0) / n;
  return {
    n,
    accuracy,
    brier: brierScore,
    logLoss: logLossScore,
    brierSkill: baselineBrier > 0 ? 1 - brierScore / baselineBrier : 0,
    baseRate: rows.filter((r) => r.happened).length / n,
    baselineBrier,
    baselineLogLoss,
  };
};

export interface CalibrationBin {
  lower: number;
  upper: number;
  n: number;
  meanPredicted: number;
  observed: number;
}

export const calibration = (
  rows: Array<{ probability: number; happened: boolean }>,
  bins = 10
): CalibrationBin[] => {
  const out: CalibrationBin[] = Array.from({ length: bins }, (_, i) => ({
    lower: i / bins,
    upper: (i + 1) / bins,
    n: 0,
    meanPredicted: 0,
    observed: 0,
  }));
  rows.forEach((r) => {
    const idx = Math.min(bins - 1, Math.floor(r.probability * bins));
    out[idx].n += 1;
    out[idx].meanPredicted += r.probability;
    out[idx].observed += r.happened ? 1 : 0;
  });
  out.forEach((b) => {
    if (b.n > 0) {
      b.meanPredicted /= b.n;
      b.observed /= b.n;
    }
  });
  return out;
};

/** Integer +1/+2 correction: (k + α) / (n + 2α). */
export const additiveSmoothedRate = (successes: number, n: number, alpha = 1): number =>
  (successes + alpha) / (n + 2 * alpha);

/** Model probability for a given market, read from the engine's own output. */
export const modelProbabilityFor = (row: EvaluationRow, marketId: MarketId): number => {
  const p = row.probabilities;
  switch (marketId) {
    case 'home_win': return p.homeWin;
    case 'draw': return p.draw;
    case 'away_win': return p.awayWin;
    case 'home_over_0_5': return p.homeScores;
    case 'away_over_0_5': return p.awayScores;
    case 'btts_yes': return p.bttsYes;
    case 'btts_no': return p.bttsNo;
    case 'over_1_5': return p.over1_5;
    case 'under_1_5': return p.under1_5;
    case 'over_2_5': return p.over2_5;
    case 'under_2_5': return p.under2_5;
    case 'over_3_5': return p.over3_5;
    case 'under_3_5': return p.under3_5;
    case 'home_or_draw': return p.homeOrDraw;
    case 'away_or_draw': return p.awayOrDraw;
    case 'home_dnb': return p.homeDrawNoBet;
    case 'away_dnb': return p.awayDrawNoBet;
    default: return 0;
  }
};

/** Actual outcome for a market (null for pushes / non-binary markets). */
export const outcomeFor = (row: EvaluationRow, marketId: MarketId): boolean | null => {
  const h = row.homeGoals;
  const a = row.awayGoals;
  switch (marketId) {
    case 'home_win': return h > a;
    case 'draw': return h === a;
    case 'away_win': return h < a;
    case 'home_over_0_5': return h >= 1;
    case 'away_over_0_5': return a >= 1;
    case 'btts_yes': return h >= 1 && a >= 1;
    case 'btts_no': return !(h >= 1 && a >= 1);
    case 'over_1_5': return h + a >= 2;
    case 'under_1_5': return h + a < 2;
    case 'over_2_5': return h + a >= 3;
    case 'under_2_5': return h + a < 3;
    case 'over_3_5': return h + a >= 4;
    case 'under_3_5': return h + a < 4;
    case 'home_or_draw': return h >= a;
    case 'away_or_draw': return h <= a;
    case 'home_dnb': return h === a ? null : h > a;
    case 'away_dnb': return h === a ? null : h < a;
    default: return null;
  }
};

/** Build {probability, happened} samples for a market over a set of rows. */
export const samplesFor = (rows: EvaluationRow[], marketId: MarketId) =>
  rows
    .map((row) => ({ probability: modelProbabilityFor(row, marketId), happened: outcomeFor(row, marketId) }))
    .filter((s): s is { probability: number; happened: boolean } => s.happened !== null);

export { predictFixture };
export type { FixtureDataModel };