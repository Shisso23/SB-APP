import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { applyMarketImplications } from '../markets';
import { buildMarketValue } from '../odds';
import { MarketId } from '../types';

const config = DEFAULT_PREDICTION_CONFIG;
const now = Date.UTC(2024, 0, 1);

// A fresh, favourably-priced quote so passedEdgeThreshold/qualifies can be reached
// once the probability gate is satisfied.
const priced = (marketId: MarketId, modelProbability: number) => buildMarketValue({
  marketId, modelProbability, config, now,
  odds: { marketId, decimalOdds: 2.5, timestamp: now - 1000 },
});

describe('applyMarketImplications', () => {
  it('qualifies BTTS via both teams independently passing their own over-0.5 threshold', () => {
    const markets = [
      priced('home_over_0_5', 0.9),
      priced('away_over_0_5', 0.9),
      priced('btts_yes', 0.5), // below its own 0.58 threshold
    ];
    expect(markets[2].passedProbabilityThreshold).toBe(false);
    applyMarketImplications(markets);
    const btts = markets[2];
    expect(btts.passedProbabilityThreshold).toBe(true);
    expect(btts.impliedBy).toEqual(['home_over_0_5', 'away_over_0_5']);
    expect(btts.qualifies).toBe(true);
  });

  it('does not imply BTTS when only one side independently passes its threshold', () => {
    const markets = [
      priced('home_over_0_5', 0.9),
      priced('away_over_0_5', 0.4), // below its own threshold
      priced('btts_yes', 0.5),
    ];
    applyMarketImplications(markets);
    expect(markets[2].passedProbabilityThreshold).toBe(false);
    expect(markets[2].impliedBy).toBeUndefined();
    expect(markets[2].qualifies).toBe(false);
  });

  it('chains the over/under goal markets directly (over_1_5 via over_2_5, home_dnb via home_win)', () => {
    const markets = [
      priced('over_2_5', 0.9),
      priced('over_1_5', 0.5),
      priced('home_win', 0.9),
      priced('home_dnb', 0.5),
    ];
    applyMarketImplications(markets);
    expect(markets[1].passedProbabilityThreshold).toBe(true);
    expect(markets[1].impliedBy).toEqual(['over_2_5']);
    expect(markets[3].passedProbabilityThreshold).toBe(true);
    expect(markets[3].impliedBy).toEqual(['home_win']);
  });

  it('never qualifies a market without odds, even when implied', () => {
    const noOdds = buildMarketValue({ marketId: 'btts_yes', modelProbability: 0.5, config, now });
    const markets = [priced('home_over_0_5', 0.9), priced('away_over_0_5', 0.9), noOdds];
    applyMarketImplications(markets);
    expect(markets[2].passedProbabilityThreshold).toBe(true);
    expect(markets[2].qualifies).toBe(false);
  });

  it('does not override a market that already passed its own threshold', () => {
    const markets = [priced('home_over_0_5', 0.9), priced('away_over_0_5', 0.9), priced('btts_yes', 0.7)];
    applyMarketImplications(markets);
    expect(markets[2].impliedBy).toBeUndefined();
  });
});
