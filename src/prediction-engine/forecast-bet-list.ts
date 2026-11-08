import { DEFAULT_PREDICTION_CONFIG } from '../config/prediction-config';
import { FORECAST_HIGHLIGHTS, FORECAST_FAMILIES, ForecastFamily, ForecastId, ForecastPreference, derivedThresholdSupport, forecastProbability, highlightLevel } from '../config/forecast-highlights';
import { FixturePrediction, MarketValue } from './types';
import { isStale } from './odds';

// Core/mainstream markets (1X2, BTTS, over 2.5) are preferred over narrower markets
// (ranges, DNB, double chance, etc.) when both qualify for the same match.
const CORE_FORECAST_IDS = new Set<ForecastId>(['home_win', 'draw', 'away_win', 'btts_yes', 'over_2_5']);
const priorityTier = (id: ForecastId) => CORE_FORECAST_IDS.has(id) ? 0 : 1;

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
  /** True when this market only qualifies via `derivedThresholdSupport`, not its own threshold. */
  derivedQualification: boolean;
  diversityAlternative?: { label: string; probability: number };
}

const compare = (a: ForecastBetSuggestion, b: ForecastBetSuggestion) =>
  priorityTier(a.forecastId) - priorityTier(b.forecastId) ||
  b.relativeSurplus - a.relativeSurplus || b.probability - a.probability ||
  a.prediction.fixture.fixture.timestamp - b.prediction.fixture.fixture.timestamp ||
  a.prediction.fixture.fixture.id - b.prediction.fixture.fixture.id || a.forecastId.localeCompare(b.forecastId);

/** All choices retain their own displayed probability and threshold. Variety is a
 * selection preference, never a reason to admit a below-threshold outcome.
 */
export const buildForecastBetList = (
  predictions: FixturePrediction[], now: number,
  { limit = DEFAULT_BET_LIST_SIZE, diversify = true }: { limit?: number; diversify?: boolean } = {}
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
      if (probability === undefined) return;
      const ownLevel = highlightLevel(probability, preference);
      // Additive: a market that misses its own threshold can still qualify when
      // every market in a support group (e.g. both teams scoring 1+) independently
      // clears its own threshold. This never lowers or bypasses the market's own cutoff.
      const derivedQualification = ownLevel === 'none' && derivedThresholdSupport(prediction, forecastId);
      const level = ownLevel !== 'none' ? ownLevel : derivedQualification ? 'suggested' : 'none';
      if (level === 'none') return;
      const market = prediction.markets.find(entry => entry.marketId === forecastId);
      const hasQuote = market?.decimalOdds !== undefined && Number.isFinite(market.decimalOdds) && market.decimalOdds > 1;
      const fresh = hasQuote && !market?.oddsStale && !isStale(market?.oddsTimestamp, now, DEFAULT_PREDICTION_CONFIG.odds.staleAfterMinutes);
      const checked = fresh && market?.qualifies && market.passedEdgeThreshold && market.passedProbabilityThreshold &&
        Number.isFinite(market.expectedValue) && Number(market.expectedValue) > 0;
      const candidate: ForecastBetSuggestion = {
        key: `${fixture.id}:${forecastId}`, prediction, forecastId, preference, probability,
        relativeSurplus: (probability - preference.suggest) / (1 - preference.suggest),
        level, market, historyLimited, family: FORECAST_FAMILIES[forecastId], derivedQualification,
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
  const selectedMatches = Array.from(bestByFixture.values()).slice(0, count);
  if (!diversify || count <= 1) return selectedMatches;
  // Fill the requested list from the strongest eligible matches first. Variety
  // changes only their qualifying options, never drops a repeat-only match or
  // swaps it for a weaker match merely to introduce another market type.
  const selectedIds = new Set(selectedMatches.map(candidate => candidate.prediction.fixture.fixture.id));
  return diversifyCandidates(candidates.filter(candidate => selectedIds.has(candidate.prediction.fixture.fixture.id)), count).map(candidate => {
    const strongest = bestByFixture.get(candidate.prediction.fixture.fixture.id);
    return strongest && strongest.forecastId !== candidate.forecastId ? {
      ...candidate, diversityAlternative: { label: strongest.preference.label, probability: strongest.probability },
    } : candidate;
  }).sort(compare);
};

// Lexicographic costs avoid arbitrary probability penalties or invented cutoffs.
// Prefer: distinct families, balanced families, distinct outcomes, balanced outcomes,
// then the original forecast-strength ordering. Reverse edges allow a flexible
// match to be reassigned so a match with only one qualifying option is not crowded out.
type VarietyCost = number[];
interface VarietyEdge { to: number; reverse: number; capacity: number; cost: VarietyCost }
const costCompare = (first: VarietyCost, second: VarietyCost) => {
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return first[index] - second[index];
  }
  return 0;
};
const diversityOutcome = (id: ForecastId) => id === 'total_0_3' ? 'under_3_5' : id;

const diversifyCandidates = (candidates: ForecastBetSuggestion[], count: number): ForecastBetSuggestion[] => {
  if (!count) return [];
  const graph: VarietyEdge[][] = [[], []];
  const source = 0;
  const sink = 1;
  const node = () => { graph.push([]); return graph.length - 1; };
  const edge = (from: number, to: number, cost: VarietyCost): VarietyEdge => {
    const forward = { to, reverse: graph[to].length, capacity: 1, cost };
    const reverse = { to: from, reverse: graph[from].length, capacity: 0, cost: cost.map(value => -value) };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  };
  const fixtures = new Map<number, number>();
  const outcomes = new Map<string, number>();
  const families = new Map<ForecastFamily, number>();
  const choices: { candidate: ForecastBetSuggestion; edge: VarietyEdge }[] = [];
  candidates.forEach((candidate, rank) => {
    const fixtureId = candidate.prediction.fixture.fixture.id;
    let fixtureNode = fixtures.get(fixtureId);
    if (fixtureNode === undefined) {
      fixtureNode = node(); fixtures.set(fixtureId, fixtureNode);
      edge(source, fixtureNode, [0, 0, 0, 0, 0]);
    }
    let familyNode = families.get(candidate.family);
    if (familyNode === undefined) {
      familyNode = node(); families.set(candidate.family, familyNode);
      for (let slot = 0; slot < count; slot += 1) edge(familyNode, sink, [slot ? 1 : 0, slot, 0, 0, 0]);
    }
    const outcome = diversityOutcome(candidate.forecastId);
    let outcomeNode = outcomes.get(outcome);
    if (outcomeNode === undefined) {
      outcomeNode = node(); outcomes.set(outcome, outcomeNode);
      for (let slot = 0; slot < count; slot += 1) edge(outcomeNode, familyNode, [0, 0, slot ? 1 : 0, slot, 0]);
    }
    choices.push({ candidate, edge: edge(fixtureNode, outcomeNode, [0, 0, 0, 0, rank]) });
  });

  for (let flow = 0; flow < count; flow += 1) {
    const distances: (VarietyCost | undefined)[] = Array(graph.length).fill(undefined);
    const previous: { from: number; edge: VarietyEdge }[] = [];
    distances[source] = [0, 0, 0, 0, 0];
    for (let pass = 0; pass < graph.length - 1; pass += 1) {
      let changed = false;
      graph.forEach((edges, from) => {
        const distance = distances[from];
        if (!distance) return;
        edges.forEach(entry => {
          if (!entry.capacity) return;
          const cost = distance.map((value, index) => value + entry.cost[index]);
          const current = distances[entry.to];
          if (!current || costCompare(cost, current) < 0) {
            distances[entry.to] = cost;
            previous[entry.to] = { from, edge: entry };
            changed = true;
          }
        });
      });
      if (!changed) break;
    }
    if (!distances[sink]) break;
    let to = sink;
    while (to !== source) {
      const step = previous[to];
      step.edge.capacity -= 1;
      graph[to][step.edge.reverse].capacity += 1;
      to = step.from;
    }
  }
  return choices.filter(choice => choice.edge.capacity === 0).map(choice => choice.candidate);
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
    return `${index + 1}. ${fixture.teams.home.name} vs ${fixture.teams.away.name} | ${fixture.league.name} | ${fixture.fixture.date}\n${preference.label} | Forecast ${(probability * 100).toFixed(2)}% | Threshold ${(preference.suggest * 100).toFixed(0)}%\n${preference.meaning}\n${quote} | ${PRICE_STATUS_LABELS[priceStatus]}${preference.range ? '\nSource: base scoreline model, separate from prior-blended totals.' : ''}${suggestion.derivedQualification ? '\nQualifies via combined home/away scoring thresholds rather than its own percentage alone.' : ''}${suggestion.historyLimited ? '\nLimited team history; inspect the statistics.' : ''}${suggestion.diversityAlternative ? `\nChosen for variety; strongest qualifying option for this match: ${suggestion.diversityAlternative.label} (${(suggestion.diversityAlternative.probability * 100).toFixed(2)}%).` : ''}`;
  }),
].join('\n\n');
