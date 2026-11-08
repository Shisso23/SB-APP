import { DEFAULT_PREDICTION_CONFIG } from '../config/prediction-config';
import {
  backtest,
  candidateSelections,
  fixture,
  history,
  NOW,
  odds,
  standings,
} from '../prediction-engine/test-support/prediction-engine-demo.data';

/**
 * This file is intentionally runnable as a Jest test so it doubles as an executable
 * example (`npm test -- prediction-engine-example`) and as living documentation.
 *
 * It does NOT hit the network and uses a small deterministic dataset. Its purpose is
 * to demonstrate how to call the engine and what its output looks like. The numbers
 * below are illustrative of the model's mechanics, not real-world performance claims.
 */
describe('prediction engine — runnable example', () => {
  it('produces an explainable prediction for a single fixture', () => {
    const prediction = fixture();

    // --- Explainable output, exactly as the UI consumes it -------------------
    console.log('\n=== Single-fixture example ===');
    console.log(prediction.headline);
    console.log('Expected goals:', prediction.probabilities.expectedGoals);
    console.log('Top scorelines:', prediction.probabilities.topScorelines);
    console.log(
      'Markets:',
      prediction.markets.map((market) => ({
        market: market.label,
        modelProbability: market.modelProbability,
        decimalOdds: market.decimalOdds,
        edge: market.edge,
        qualifies: market.qualifies,
      }))
    );

    expect(prediction.markets.length).toBeGreaterThan(0);
    expect(prediction.probabilities.homeWin + prediction.probabilities.draw + prediction.probabilities.awayWin).toBeCloseTo(1, 2);
  });

  it('ranks candidate selections and shows rejected candidates with reasons', () => {
    const { candidates, rejected } = candidateSelections();
    console.log('\n=== Candidate selections (with odds) ===');
    candidates.forEach((candidate) => {
      console.log(
        `${candidate.matchLabel} — ${candidate.market.label}: model ${candidate.market.modelProbability}, ` +
          `market-implied ${candidate.market.marginAdjustedProbability}, edge ${candidate.market.edge}, ` +
          `EV ${candidate.market.expectedValue}`
      );
    });

    console.log('\n=== Rejected examples ===');
    rejected.slice(0, 3).forEach((entry) => {
      console.log(`${entry.matchLabel} — ${entry.market.label}: ${entry.reasons.join(' ')}`);
    });

    expect(candidates.length).toBeGreaterThan(0);
  });

  it('runs a chronological backtest and reports honesty about sample size', () => {
    const result = backtest();
    console.log('\n=== Backtest ===');
    console.log('Total finished fixtures:', result.totalFixtures, '| sufficientData:', result.sufficientData);
    console.log('Notes:', result.notes);
    result.markets.forEach((market) => {
      console.log(
        `${market.marketId}: n=${market.predictions}, accuracy=${market.accuracy}, Brier=${market.brierScore}, logLoss=${market.logLoss}`
      );
    });

    expect(result.markets.length).toBeGreaterThan(0);
  });

  it('documents the configuration surface that controls thresholds', () => {
    // Thresholds live in one place and are overridable without touching engine code.
    expect(DEFAULT_PREDICTION_CONFIG.selection.defaultMinEdge).toBeGreaterThan(0);
    expect(DEFAULT_PREDICTION_CONFIG.recentWindow).toBe(20);
    expect(DEFAULT_PREDICTION_CONFIG.historySeasons).toBe(3);
    expect(standings.length).toBeGreaterThan(0);
    expect(history.length).toBeGreaterThan(0);
    expect(odds.length).toBeGreaterThan(0);
    expect(NOW).toBeGreaterThan(0);
  });
});