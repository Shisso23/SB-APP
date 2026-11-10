import { FixtureDataModel } from '../models/fixtures';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const safeNumber = (value: unknown, fallback = 0): number =>
  isFiniteNumber(value) ? value : fallback;

/** A finished match: full-time, or a completed status where goals are known. */
export const isFinishedFixture = (fixture: FixtureDataModel): boolean => {
  if (!fixture?.fixture?.status) {
    return false;
  }
  const short = fixture.fixture.status.short;
  const finishedStatuses = ['FT', 'AET', 'PEN'];
  const goalsKnown =
    isFiniteNumber(fixture?.goals?.home) && isFiniteNumber(fixture?.goals?.away);
  return goalsKnown && finishedStatuses.includes(short);
};

/** Sort finished fixtures newest first. */
export const sortFinishedFixturesDesc = (fixtures: FixtureDataModel[]) =>
  fixtures
    .filter(isFinishedFixture)
    .sort((a, b) => safeNumber(b.fixture.timestamp) - safeNumber(a.fixture.timestamp));

export const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export const mean = (values: number[]) => (values.length ? sum(values) / values.length : 0);

export const median = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * Exponential-decay recency weighting.
 *
 * `orderedNewestFirst` is expected to be newest-first: the first entry receives the
 * largest weight. `decayPerMatch` of 0.85 means each older match carries 85% of the
 * weight of the match more recent than it.
 */
export const recencyWeights = (count: number, decayPerMatch: number): number[] => {
  const decay = clamp(decayPerMatch, 0.01, 1);
  return Array.from({ length: count }, (_, index) => Math.pow(decay, index));
};

export interface WeightedAverageOptions {
  /** Values ordered newest-first. */
  values: number[];
  enabled: boolean;
  decayPerMatch: number;
  /** 1 = fully weighted mean, 0 = fully median. */
  weightedMeanBlend: number;
}

/**
 * Recency-weighted average blended with the median so a single exceptional result
 * cannot dominate the estimate.
 */
export const weightedAverage = ({
  values,
  enabled,
  decayPerMatch,
  weightedMeanBlend,
}: WeightedAverageOptions): number => {
  if (values.length === 0) {
    return 0;
  }

  if (!enabled) {
    return mean(values);
  }

  const weights = recencyWeights(values.length, decayPerMatch);
  const totalWeight = sum(weights);
  const weightedMean = totalWeight
    ? sum(values.map((value, index) => value * weights[index])) / totalWeight
    : mean(values);

  const blend = clamp(weightedMeanBlend, 0, 1);
  const med = median(values);

  return blend * weightedMean + (1 - blend) * med;
};

/** Percentage (0..100) of values passing a predicate; 0 when the sample is empty. */
export const percentageOf = <T,>(items: T[], predicate: (item: T) => boolean): number => {
  if (items.length === 0) {
    return 0;
  }
  return (items.filter(predicate).length / items.length) * 100;
};

export const countOf = <T,>(items: T[], predicate: (item: T) => boolean): number =>
  items.filter(predicate).length;

/**
 * Linear-regression slope over values ordered oldest -> newest, normalised by the
 * mean. Positive means the metric is trending upward. Returns 0 for tiny samples.
 */
export const trendSlope = (valuesOldestFirst: number[]): number => {
  const n = valuesOldestFirst.length;
  if (n < 3) {
    return 0;
  }

  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = mean(xs);
  const meanY = mean(valuesOldestFirst);
  const numerator = sum(xs.map((x, i) => (x - meanX) * (valuesOldestFirst[i] - meanY)));
  const denominator = sum(xs.map((x) => (x - meanX) ** 2));

  if (denominator === 0) {
    return 0;
  }

  const slope = numerator / denominator;
  const scale = Math.abs(meanY) > 0.25 ? Math.abs(meanY) : 1;
  return slope / scale;
};

/** Shrink a small-sample estimate toward a baseline. `sampleSize` = 0 returns baseline. */
export const shrinkToward = ({
  estimate,
  baseline,
  sampleSize,
  strength,
}: {
  estimate: number;
  baseline: number;
  sampleSize: number;
  strength: number;
}): number => {
  if (sampleSize <= 0) {
    return baseline;
  }
  const k = clamp(strength, 0, 1) * 4; // matches of "borrowed" evidence weight
  const weight = sampleSize / (sampleSize + k);
  return weight * estimate + (1 - weight) * baseline;
};

/** Round to a fixed number of decimals for stable output/tests. */
export const round = (value: number, decimals = 4): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Format a probability as a whole percentage string, e.g. 0.6417 -> "64%". */
export const formatPercent = (probability: number, decimals = 0): string =>
  `${(probability * 100).toFixed(decimals)}%`;