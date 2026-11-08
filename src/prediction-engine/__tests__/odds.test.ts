import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import {
  impliedProbability,
  expectedValue,
  breakEvenProbability,
  buildMarketValue,
  computeMarginAdjustedOverUnder,
  isStale,
} from '../odds';

const config = DEFAULT_PREDICTION_CONFIG;
const now = Date.UTC(2024, 0, 1);

describe('odds', () => {
  it.each([undefined, NaN, Infinity, 0, -1, now + 1])('refuses unverifiable quote timestamp %s', (timestamp) => {
    const value = buildMarketValue({
      marketId: 'over_2_5', modelProbability: 0.8,
      odds: { marketId: 'over_2_5', decimalOdds: 2.2, timestamp },
      marginAdjustedProbability: 0.45, config, now,
    });
    expect(value.passedProbabilityThreshold).toBe(true);
    expect(value.passedEdgeThreshold).toBe(true);
    expect(value.oddsStale).toBe(true);
    expect(value.qualifies).toBe(false);
    expect(value.rejectReasons.join(' ')).toMatch(/update time|freshness/);
  });

  it('preserves the configured freshness boundary', () => {
    const boundary = now - config.odds.staleAfterMinutes * 60_000;
    expect(isStale(boundary, now, config.odds.staleAfterMinutes)).toBe(false);
    expect(isStale(boundary - 1, now, config.odds.staleAfterMinutes)).toBe(true);
    expect(isStale(now, now, config.odds.staleAfterMinutes)).toBe(false);
  });

  it('converts decimal odds to implied probability', () => {
    expect(impliedProbability(2.0)).toBeCloseTo(0.5, 6);
    expect(impliedProbability(4.0)).toBeCloseTo(0.25, 6);
    expect(impliedProbability(1.0)).toBe(0);
    expect(impliedProbability(0.5)).toBe(0);
  });

  it('computes expected value and break-even probability', () => {
    // model 60% at 2.00 decimal => EV = 0.6*2 - 1 = 0.2
    expect(expectedValue(0.6, 2.0)).toBeCloseTo(0.2, 6);
    expect(breakEvenProbability(2.5)).toBeCloseTo(0.4, 6);
  });

  it('removes the bookmaker margin from an over/under pair', () => {
    const adjusted = computeMarginAdjustedOverUnder([
      { marketId: 'over_2_5', decimalOdds: 1.8 }, // implied .5556
      { marketId: 'under_2_5', decimalOdds: 2.1 }, // implied .4762
    ]);
    const over = adjusted.over_2_5!;
    const under = adjusted.under_2_5!;
    expect(over + under).toBeCloseTo(1, 6);
    // Margin was ~3.2%; normalised probabilities are below the raw implied.
    expect(over).toBeLessThan(impliedProbability(1.8));
    expect(over).toBeGreaterThan(under);
  });

  it('gates a selection on probability alone; edge is informational only', () => {
    // Model 80% (passes over_2_5's 75% threshold), odds 1.75, margin-adjusted 0.52 => edge +28pp.
    const value = buildMarketValue({
      marketId: 'over_2_5',
      modelProbability: 0.8,
      odds: { marketId: 'over_2_5', decimalOdds: 1.75, timestamp: now },
      marginAdjustedProbability: 0.52,
      config,
      now,
    });
    expect(value.passedProbabilityThreshold).toBe(true);
    expect(value.passedEdgeThreshold).toBe(true);
    expect(value.qualifies).toBe(true);
    expect(value.edge).toBeCloseTo(0.28, 4);
  });

  it('still qualifies a high-probability selection even when its edge is negative', () => {
    const value = buildMarketValue({
      marketId: 'over_2_5',
      modelProbability: 0.8,
      odds: { marketId: 'over_2_5', decimalOdds: 1.5, timestamp: now }, // implied .667
      marginAdjustedProbability: 0.85,
      config,
      now,
    });
    expect(value.passedProbabilityThreshold).toBe(true);
    expect(value.passedEdgeThreshold).toBe(false);
    expect(value.edge).toBeCloseTo(-0.05, 4);
    expect(value.qualifies).toBe(true);
  });

  it('flags stale odds and refuses to qualify them', () => {
    const staleTimestamp = now - (config.odds.staleAfterMinutes + 60) * 60_000;
    const value = buildMarketValue({
      marketId: 'over_2_5',
      modelProbability: 0.8,
      odds: { marketId: 'over_2_5', decimalOdds: 2.2, timestamp: staleTimestamp },
      marginAdjustedProbability: 0.45,
      config,
      now,
    });
    expect(value.oddsStale).toBe(true);
    expect(value.qualifies).toBe(false);
  });

  it('still qualifies a positive no-vig edge even when the offered price has non-positive EV', () => {
    const value = buildMarketValue({
      marketId: 'over_2_5', modelProbability: 0.8,
      odds: { marketId: 'over_2_5', decimalOdds: 1.1, timestamp: now },
      marginAdjustedProbability: 0.7, config, now,
    });
    expect(value.passedProbabilityThreshold).toBe(true);
    expect(value.passedEdgeThreshold).toBe(true);
    expect(value.expectedValue).toBeLessThan(0);
    expect(value.qualifies).toBe(true);
  });

  it('qualifies a market without odds once its probability passes, odds remain unverifiable', () => {
    const value = buildMarketValue({
      marketId: 'btts_yes',
      modelProbability: 0.8,
      config,
      now,
      evidence: ['both teams scoring'],
    });
    expect(value.qualifies).toBe(true);
    expect(value.passedEdgeThreshold).toBe(false);
    expect(value.rejectReasons.join(' ')).toMatch(/no bookmaker odds/i);
    expect(value.evidence).toContain('both teams scoring');
  });
});