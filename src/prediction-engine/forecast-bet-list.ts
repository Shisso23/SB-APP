import { DEFAULT_PREDICTION_CONFIG } from '../config/prediction-config';
import { FORECAST_HIGHLIGHTS, FORECAST_FAMILIES, ForecastFamily, ForecastId, ForecastPreference, forecastProbability, impliedHighlightResult } from '../config/forecast-highlights';
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
  historyLimited: boolean;
  family: ForecastFamily;
  /** Set when this forecast only qualified via another group of forecasts that
   * independently passed their own thresholds (see MARKET_IMPLICATIONS). */
  impliedBy?: ForecastId[];
}

const compare = (a: ForecastBetSuggestion, b: ForecastBetSuggestion) =>
  b.relativeSurplus - a.relativeSurplus || b.probability - a.probability ||
  a.prediction.fixture.fixture.timestamp - b.prediction.fixture.fixture.timestamp ||
  a.prediction.fixture.fixture.id - b.prediction.fixture.fixture.id || a.forecastId.localeCompare(b.forecastId);

/** Always returns the single strongest qualifying forecast for each match: the
 * highest relative surplus above its own threshold, never a weaker option swapped
 * in merely for market-type variety.
 */
export const buildForecastBetList = (
  predictions: FixturePrediction[], now: number,
  { limit = DEFAULT_BET_LIST_SIZE }: { limit?: number } = {}
): ForecastBetSuggestion[] => {
  const candidatesByKey = new Map<string, ForecastBetSuggestion>();
  predictions.forEach(prediction => {
    const fixture = prediction.fixture.fixture;
    if (!Number.isFinite(fixture.timestamp) || fixture.timestamp * 1000 <= now || !['NS', 'TBD'].includes(fixture.status.short)) return;
    const homeSample = Math.max(prediction.dataQuality.homeSampleSize, prediction.homeTeam.overallSampleSize);
    const awaySample = Math.max(prediction.dataQuality.awaySampleSize, prediction.awayTeam.overallSampleSize);
    // History is context, not a second qualification gate: use the exact displayed thresholds.
    const historyLimited = !Number.isFinite(homeSample) || !Number.isFinite(awaySample) ||
      homeSample < DEFAULT_PREDICTION_CONFIG.minTeamMatches || awaySample < DEFAULT_PREDICTION_CONFIG.minTeamMatches;

    (Object.keys(FORECAST_HIGHLIGHTS) as ForecastId[]).forEach(forecastId => {
      const preference: ForecastPreference = FORECAST_HIGHLIGHTS[forecastId];
      const probability = forecastProbability(prediction, forecastId);
      const { level, impliedBy } = impliedHighlightResult(prediction, forecastId);
      if (level === 'none' || probability === undefined) return;
      const market = prediction.markets.find(entry => entry.marketId === forecastId);
      const hasQuote = market?.decimalOdds !== undefined && Number.isFinite(market.decimalOdds) && market.decimalOdds > 1;
      const fresh = hasQuote && !market?.oddsStale && !isStale(market?.oddsTimestamp, now, DEFAULT_PREDICTION_CONFIG.odds.staleAfterMinutes);
      const checked = fresh && market?.qualifies && market.passedEdgeThreshold && market.passedProbabilityThreshold &&
        Number.isFinite(market.expectedValue) && Number(market.expectedValue) > 0;
      const candidate: ForecastBetSuggestion = {
        key: `${fixture.id}:${forecastId}`, prediction, forecastId, preference, probability,
        relativeSurplus: (probability - preference.suggest) / (1 - preference.suggest),
        level, market, historyLimited, family: FORECAST_FAMILIES[forecastId], impliedBy,
        priceStatus: !hasQuote ? 'unpriced' : !fresh ? 'stale' : checked ? 'checked' : 'unqualified',
      };
      const previous = candidatesByKey.get(candidate.key);
      if (!previous || compare(candidate, previous) < 0) candidatesByKey.set(candidate.key, candidate);
    });
  });
  const candidates = Array.from(candidatesByKey.values()).sort(compare);
  const bestByFixture = new Map<number, ForecastBetSuggestion>();
  candidates.forEach(candidate => {
    const id = candidate.prediction.fixture.fixture.id;
    if (!bestByFixture.has(id)) bestByFixture.set(id, candidate);
  });
  const count = Number.isFinite(limit) ? Math.min(Math.max(0, Math.floor(limit)), bestByFixture.size) : 0;
  return Array.from(bestByFixture.values()).slice(0, count);
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
    return `${index + 1}. ${fixture.teams.home.name} vs ${fixture.teams.away.name} | ${fixture.league.name} | ${fixture.fixture.date}\n${preference.label} | Forecast ${(probability * 100).toFixed(2)}% | Threshold ${(preference.suggest * 100).toFixed(0)}%\n${preference.meaning}\n${quote} | ${PRICE_STATUS_LABELS[priceStatus]}${preference.range ? '\nSource: base scoreline model, separate from prior-blended totals.' : ''}${suggestion.historyLimited ? '\nLimited team history; inspect the statistics.' : ''}${suggestion.impliedBy ? `\nQualifies via combined markets: ${suggestion.impliedBy.map(id => FORECAST_HIGHLIGHTS[id].label).join(' and ')}.` : ''}`;
  }),
].join('\n\n');
