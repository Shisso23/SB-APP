import { DEFAULT_PREDICTION_CONFIG } from '../../config/prediction-config';
import { predictFixture } from '../predict-fixture';
import { buildMarketValue } from '../odds';
import { MarketId, MarketOdds } from '../types';
import { makeFixture } from './fixture-builders';

export const makeForecastBetPrediction = ({
  now, id = 1, kickoff = now + 86_400_000, markets = { home_win: .8 }, odds = [],
}: {
  now: number;
  id?: number;
  kickoff?: number;
  markets?: Partial<Record<MarketId, number>>;
  odds?: MarketOdds[];
}) => {
  const base = makeFixture({ id, timestamp: kickoff, homeId: id * 2, awayId: id * 2 + 1, homeGoals: null, awayGoals: null, status: 'NS' });
  const fixture = { ...base, fixture: { ...base.fixture, timestamp: Math.floor(kickoff / 1000) } };
  const prediction = predictFixture({ fixture, allFixtures: [], leaguesStandings: [], now });
  prediction.homeTeam.overallSampleSize = 10;
  prediction.awayTeam.overallSampleSize = 10;
  prediction.probabilities.baseScorelines = undefined;
  prediction.markets = (Object.keys(markets) as MarketId[]).map(marketId => buildMarketValue({
    marketId, modelProbability: Number(markets[marketId]), now, config: DEFAULT_PREDICTION_CONFIG,
    odds: odds.find(quote => quote.marketId === marketId),
  }));
  return prediction;
};
