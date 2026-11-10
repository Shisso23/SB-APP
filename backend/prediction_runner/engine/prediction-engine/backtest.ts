import { PredictionConfig } from '../config/prediction-config';
import { FixtureDataModel } from '../models/fixtures';
import { StandingsModel } from '../models/standings-models';
import {
  BacktestMarketResult,
  BacktestResult,
  CalibrationBucket,
  FixtureOutcome,
  MarketId,
  MatchProbabilities,
} from './types';
import { predictFixture } from './predict-fixture';
import { safeNumber, round } from './math-utils';
import { parseSeason } from './standings-lookup';

const MARKET_OUTCOME_EVALUATORS: Record<
  MarketId,
  (outcome: FixtureOutcome) => boolean | null
> = {
  home_win: (o) => o.homeGoals > o.awayGoals,
  draw: (o) => o.homeGoals === o.awayGoals,
  away_win: (o) => o.homeGoals < o.awayGoals,
  home_over_0_5: (o) => o.homeGoals >= 1,
  away_over_0_5: (o) => o.awayGoals >= 1,
  btts_yes: (o) => o.homeGoals >= 1 && o.awayGoals >= 1,
  btts_no: (o) => !(o.homeGoals >= 1 && o.awayGoals >= 1),
  over_1_5: (o) => o.homeGoals + o.awayGoals >= 2,
  under_1_5: (o) => o.homeGoals + o.awayGoals < 2,
  over_2_5: (o) => o.homeGoals + o.awayGoals >= 3,
  under_2_5: (o) => o.homeGoals + o.awayGoals < 3,
  over_3_5: (o) => o.homeGoals + o.awayGoals >= 4,
  under_3_5: (o) => o.homeGoals + o.awayGoals < 4,
  home_or_draw: (o) => o.homeGoals >= o.awayGoals,
  away_or_draw: (o) => o.homeGoals <= o.awayGoals,
  home_dnb: (o) => (o.homeGoals === o.awayGoals ? null : o.homeGoals > o.awayGoals),
  away_dnb: (o) => (o.homeGoals === o.awayGoals ? null : o.homeGoals < o.awayGoals),
};

const probabilityForMarket = (probabilities: MatchProbabilities, marketId: MarketId): number => {
  switch (marketId) {
    case 'home_win':
      return probabilities.homeWin;
    case 'draw':
      return probabilities.draw;
    case 'away_win':
      return probabilities.awayWin;
    case 'home_over_0_5':
      return probabilities.homeScores;
    case 'away_over_0_5':
      return probabilities.awayScores;
    case 'btts_yes':
      return probabilities.bttsYes;
    case 'btts_no':
      return probabilities.bttsNo;
    case 'over_1_5':
      return probabilities.over1_5;
    case 'under_1_5':
      return probabilities.under1_5;
    case 'over_2_5':
      return probabilities.over2_5;
    case 'under_2_5':
      return probabilities.under2_5;
    case 'over_3_5':
      return probabilities.over3_5;
    case 'under_3_5':
      return probabilities.under3_5;
    case 'home_or_draw':
      return probabilities.homeOrDraw;
    case 'away_or_draw':
      return probabilities.awayOrDraw;
    case 'home_dnb':
      return probabilities.homeDrawNoBet;
    case 'away_dnb':
      return probabilities.awayDrawNoBet;
    default:
      return 0;
  }
};

/** Brier score for a single binary prediction. */
export const brierScore = (probability: number, happened: boolean): number =>
  (probability - (happened ? 1 : 0)) ** 2;

/** Binary log loss with clamping to avoid infinities. */
export const logLoss = (probability: number, happened: boolean): number => {
  const p = Math.min(1 - 1e-9, Math.max(1e-9, probability));
  return happened ? -Math.log(p) : -Math.log(1 - p);
};

export const buildCalibrationBuckets = (
  samples: Array<{ probability: number; happened: boolean }>,
  bucketCount = 10
): CalibrationBucket[] => {
  const buckets: CalibrationBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    lowerBound: round(index / bucketCount, 2),
    upperBound: round((index + 1) / bucketCount, 2),
    predictions: 0,
    meanPredicted: 0,
    observedFrequency: 0,
  }));

  samples.forEach(({ probability, happened }) => {
    const index = Math.min(bucketCount - 1, Math.floor(probability * bucketCount));
    const bucket = buckets[index];
    bucket.predictions += 1;
    bucket.meanPredicted += probability;
    bucket.observedFrequency += happened ? 1 : 0;
  });

  buckets.forEach((bucket) => {
    if (bucket.predictions > 0) {
      bucket.meanPredicted = round(bucket.meanPredicted / bucket.predictions, 4);
      bucket.observedFrequency = round(bucket.observedFrequency / bucket.predictions, 4);
    }
  });

  return buckets;
};

export interface BacktestOptions {
  /** All fixtures available (finished matches only are used as test rows). */
  allFixtures: FixtureDataModel[];
  standings: StandingsModel[];
  config: PredictionConfig;
  /** Fraction of the (chronological) fixtures reserved for training/calibration. */
  trainFraction?: number;
  /** Markets to evaluate. Defaults to 1X2, BTTS and totals. */
  markets?: MarketId[];
  /** Minimum fixtures below which the dataset is reported as insufficient. */
  minFixturesForMeaningfulResult?: number;
  /**
   * Whether the supplied standings are period-correct for each historical match.
   *
   * API-Football only exposes the *current* table, so for a backtest the supplied
   * standings are almost always the final/current table. Using them for an old match
   * leaks future information (hindsight bias) into the opponent-strength feature.
   *
   * Default is `false`, which disables standings-based opponent strength during
   * backtesting (matches are treated as having unknown opponent strength). Only set
   * this to `true` if you have genuinely period-correct snapshots.
   */
  standingsArePointInTime?: boolean;
}

/**
 * Chronological backtest with strict train/test separation.
 *
 * Fixtures are sorted by kickoff. The first `trainFraction` are used as the training
 * window (their results are legitimately in the past for the test window, and the
 * engine only uses matches *before* each kickoff), and metrics are reported only on the
 * held-out test window. No thresholds are tuned here.
 */
export const runBacktest = ({
  allFixtures,
  standings,
  config,
  trainFraction = 0.6,
  markets = ['home_win', 'draw', 'away_win', 'btts_yes', 'over_2_5', 'over_1_5'],
  minFixturesForMeaningfulResult = 100,
  standingsArePointInTime = false,
}: BacktestOptions): BacktestResult => {
  const finished = (allFixtures || [])
    .filter(
      (fixture) =>
        fixture.fixture?.status?.short === 'FT' &&
        Number.isFinite(fixture.goals?.home) &&
        Number.isFinite(fixture.goals?.away)
    )
    .sort((a, b) => safeNumber(a.fixture.timestamp) - safeNumber(b.fixture.timestamp));

  const notes: string[] = [];
  const sufficientData = finished.length >= minFixturesForMeaningfulResult;

  if (!standingsArePointInTime) {
    notes.push(
      'Standings-based opponent strength was DISABLED for this backtest because API-Football exposes only the current table (no period-correct snapshots). Using it would leak future information.'
    );
  }

  if (!sufficientData) {
    notes.push(
      `Only ${finished.length} finished fixtures available; ${minFixturesForMeaningfulResult}+ are needed for a meaningful backtest. Results below are illustrative only.`
    );
  }

  const splitIndex = Math.max(0, Math.floor(finished.length * trainFraction));
  const trainFixtures = finished.slice(0, splitIndex);
  const testFixtures = finished.slice(splitIndex);

  // Baseline base rates are computed ONLY from the training window, then applied to the
  // held-out test window. This mirrors the model's own train/test separation.
  const baselineProbabilityFor = (marketId: MarketId): number => {
    const n = trainFixtures.length;
    if (n === 0) {
      return 0.5;
    }
    const evaluator = MARKET_OUTCOME_EVALUATORS[marketId];
    const hits = trainFixtures.filter((fixture) => {
      const outcome: FixtureOutcome = {
        fixtureId: safeNumber(fixture.fixture.id),
        homeGoals: safeNumber(fixture.goals.home),
        awayGoals: safeNumber(fixture.goals.away),
        kickoffTimestamp: safeNumber(fixture.fixture.timestamp),
      };
      return evaluator(outcome) === true;
    }).length;
    return hits / n;
  };

  const samplesByMarket: Record<string, Array<{ probability: number; happened: boolean }>> = {};
  let skipped = 0;

  testFixtures.forEach((fixture, indexInTest) => {
    // Strict leakage guard: only matches strictly before this kickoff are visible.
    const kickoff = safeNumber(fixture.fixture.timestamp);
    const priorFixtures = finished.filter(
      (candidate) => safeNumber(candidate.fixture.timestamp) < kickoff
    );

    if (priorFixtures.length === 0) {
      skipped += 1;
      return;
    }

    const season = parseSeason(fixture.league?.season);

    // Leakage guard: only pass standings when they are genuinely period-correct.
    // API-Football has no historical snapshots, so by default opponent strength is
    // disabled during backtesting rather than using today's table for an old match.
    const effectiveStandings = standingsArePointInTime ? standings : [];

    const prediction = predictFixture(
      {
        fixture,
        allFixtures: priorFixtures,
        leaguesStandings: effectiveStandings,
        standingsAreCurrent: !standingsArePointInTime,
        now: kickoff,
      },
      config as any
    );

    const outcome: FixtureOutcome = {
      fixtureId: safeNumber(fixture.fixture.id),
      homeGoals: safeNumber(fixture.goals.home),
      awayGoals: safeNumber(fixture.goals.away),
      kickoffTimestamp: kickoff,
    };
    void indexInTest;
    void season;

    markets.forEach((marketId) => {
      const evaluator = MARKET_OUTCOME_EVALUATORS[marketId];
      const happened = evaluator(outcome);
      if (happened === null) {
        return; // pushes (DNB) are excluded from binary scoring
      }
      const probability = probabilityForMarket(prediction.probabilities, marketId);
      if (!samplesByMarket[marketId]) {
        samplesByMarket[marketId] = [];
      }
      samplesByMarket[marketId].push({ probability, happened });
    });
  });

  const marketResults: BacktestMarketResult[] = markets
    .filter((marketId) => samplesByMarket[marketId]?.length)
    .map((marketId) => {
      const samples = samplesByMarket[marketId];
      const hits = samples.filter((s) => (s.probability >= 0.5) === s.happened).length;
      const accuracy = samples.length ? hits / samples.length : 0;
      const brier = samples.length
        ? samples.reduce((acc, s) => acc + brierScore(s.probability, s.happened), 0) / samples.length
        : 0;
      const ll = samples.length
        ? samples.reduce((acc, s) => acc + logLoss(s.probability, s.happened), 0) / samples.length
        : 0;

      const baselineProbability = baselineProbabilityFor(marketId);
      const baselineBrier = samples.length
        ? samples.reduce((acc, s) => acc + brierScore(baselineProbability, s.happened), 0) / samples.length
        : 0;
      const baselineLl = samples.length
        ? samples.reduce((acc, s) => acc + logLoss(baselineProbability, s.happened), 0) / samples.length
        : 0;
      const brierSkill = baselineBrier > 0 ? 1 - brier / baselineBrier : 0;

      return {
        marketId,
        predictions: samples.length,
        hits,
        accuracy: round(accuracy, 4),
        brierScore: round(brier, 4),
        logLoss: round(ll, 4),
        calibration: buildCalibrationBuckets(samples),
        baselineProbability: round(baselineProbability, 4),
        baselineBrierScore: round(baselineBrier, 4),
        baselineLogLoss: round(baselineLl, 4),
        brierSkillScore: round(brierSkill, 4),
      };
    });

  if (marketResults.length === 0) {
    notes.push('No market produced enough samples in the test window.');
  }

  return {
    totalFixtures: finished.length,
    skippedFixtures: skipped,
    markets: marketResults,
    sufficientData,
    notes,
  };
};