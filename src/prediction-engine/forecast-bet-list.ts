import { DEFAULT_PREDICTION_CONFIG } from '../config/prediction-config';
import { FORECAST_HIGHLIGHTS, ForecastId, ForecastPreference, forecastProbability, highlightLevel } from '../config/forecast-highlights';
import { FixturePrediction, MarketValue } from './types';
import { isStale } from './odds';

export const DEFAULT_BET_LIST_SIZE = 5;
export type ForecastPriceStatus = 'checked' | 'unqualified' | 'stale' | 'unpriced';
export interface ForecastBetSuggestion {
  key: string;
  prediction: FixturePrediction;
  forecastId: ForecastId;
  preference: ForecastPreference;
  probability: number;
  /** Sorting preference, never a calibrated probability or accuracy estimate. */
  relativeSurplus: number;
  level: 'suggested' | 'strong';
  market?: MarketValue;
  priceStatus: ForecastPriceStatus;
}

const compare = (a: ForecastBetSuggestion, b: ForecastBetSuggestion) =>
  b.relativeSurplus - a.relativeSurplus || b.probability - a.probability ||
  a.prediction.fixture.fixture.timestamp - b.prediction.fixture.fixture.timestamp ||
  a.prediction.fixture.fixture.id - b.prediction.fixture.fixture.id || a.forecastId.localeCompare(b.forecastId);

/** One outcome per upcoming fixture, using the exact probabilities and cutoffs in
 * the forecast view. Relative surplus = (p - cutoff)/(1 - cutoff), so a broad
 * outcome does not win simply because its usual probability is higher.
 * No cutoff is lowered to fill the list; odds never get fabricated from probability.
 */
export const buildForecastBetList = (predictions: FixturePrediction[], now: number): ForecastBetSuggestion[] => {
  const bestByFixture = new Map<number, ForecastBetSuggestion>();
  predictions.forEach(prediction => {
    const fixture = prediction.fixture.fixture;
    if (!Number.isFinite(fixture.timestamp) || fixture.timestamp * 1000 <= now || !['NS', 'TBD'].includes(fixture.status.short)) return;
    const homeSample = Math.max(prediction.dataQuality.homeSampleSize, prediction.homeTeam.overallSampleSize);
    const awaySample = Math.max(prediction.dataQuality.awaySampleSize, prediction.awayTeam.overallSampleSize);
    if (!Number.isFinite(homeSample) || !Number.isFinite(awaySample) ||
      homeSample < DEFAULT_PREDICTION_CONFIG.minTeamMatches || awaySample < DEFAULT_PREDICTION_CONFIG.minTeamMatches) return;

    (Object.keys(FORECAST_HIGHLIGHTS) as ForecastId[]).forEach(forecastId => {
      const preference: ForecastPreference = FORECAST_HIGHLIGHTS[forecastId];
      const probability = forecastProbability(prediction, forecastId);
      const level = highlightLevel(probability, preference);
      if (level === 'none' || probability === undefined) return;
      const market = prediction.markets.find(entry => entry.marketId === forecastId);
      const hasQuote = market?.decimalOdds !== undefined && Number.isFinite(market.decimalOdds) && market.decimalOdds > 1;
      const fresh = hasQuote && !market?.oddsStale && !isStale(market?.oddsTimestamp, now, DEFAULT_PREDICTION_CONFIG.odds.staleAfterMinutes);
      const checked = fresh && market?.qualifies && market.passedEdgeThreshold && market.passedProbabilityThreshold &&
        Number.isFinite(market.expectedValue) && Number(market.expectedValue) > 0;
      const candidate: ForecastBetSuggestion = {
        key: `${fixture.id}:${forecastId}`, prediction, forecastId, preference, probability,
        relativeSurplus: (probability - preference.suggest) / (1 - preference.suggest),
        level, market,
        priceStatus: !hasQuote ? 'unpriced' : !fresh ? 'stale' : checked ? 'checked' : 'unqualified',
      };
      const previous = bestByFixture.get(fixture.id);
      if (!previous || compare(candidate, previous) < 0) bestByFixture.set(fixture.id, candidate);
    });
  });
  return Array.from(bestByFixture.values()).sort(compare);
};

export const PRICE_STATUS_LABELS: Record<ForecastPriceStatus, string> = {
  checked: 'Price checks passed',
  unqualified: 'Priced · value checks not met',
  stale: 'Stale quote · refresh needed',
  unpriced: 'Forecast only · odds unavailable',
};

export const formatForecastBetList = (suggestions: ForecastBetSuggestion[]) => [
  'Suggested bet list — one market per match',
  'Forecast-based suggestions; outcomes and profit are not guaranteed. Review each entry individually.',
  ...suggestions.map((suggestion, index) => {
    const { prediction, preference, probability, market, priceStatus } = suggestion;
    const fixture = prediction.fixture;
    const quote = priceStatus === 'unpriced' ? 'No available odds' : `Odds ${market?.decimalOdds?.toFixed(2)}${market?.bookmaker ? ` (${market.bookmaker})` : ''}`;
    return `${index + 1}. ${fixture.teams.home.name} vs ${fixture.teams.away.name} | ${fixture.league.name} | ${fixture.fixture.date}\n${preference.label} | Forecast ${(probability * 100).toFixed(2)}% | Threshold ${(preference.suggest * 100).toFixed(0)}%\n${preference.meaning}\n${quote} | ${PRICE_STATUS_LABELS[priceStatus]}${preference.range ? '\nSource: base scoreline model, separate from prior-blended totals.' : ''}`;
  }),
].join('\n\n');
