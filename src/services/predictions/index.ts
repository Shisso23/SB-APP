/**
 * Prediction reads from the PredictXI Django API.
 *
 * PREMIUM: this endpoint requires an active entitlement. A missing entitlement
 * surfaces as `PremiumRequiredError` from the API client, so callers can show an
 * upgrade path instead of an empty forecast list.
 *
 * Forecasts are generated server-side by the private prediction engine ahead of
 * kickoff (within a bounded pre-match window) and stored in Postgres. The browser
 * never computes a forecast itself; it only reads what the server has already
 * published for a fixture.
 */
import { apiClient, apiGet } from '../api/client';
import { FixturePrediction } from '../../prediction-engine/types';

const endpoint = '/predictions/';

export const getPredictionsByLeagueSeason = async ({ leagueId, season }: { leagueId: number; season: number }) => {
  return apiGet(endpoint, { params: { league: leagueId, season } });
};

export const getPredictionsByFixture = async (fixtureId: number) => {
  return apiGet(endpoint, { params: { fixture: fixtureId } });
};

/** A stored prediction envelope row, matching `PredictionSerializer` on Django. */
export interface PredictionEnvelopeRow {
  id: number;
  engine_version: string;
  config_hash: string;
  generated_at: string;
  as_of: string;
  valid_until: string | null;
  is_actionable: boolean;
  /** Same shape as `FixturePrediction` (src/prediction-engine/types.ts) - produced by the same engine source. */
  output: Record<string, unknown>;
}

export interface PredictionsPayload {
  paging?: { current?: number; total?: number };
  results?: number;
  errors?: unknown;
  response?: PredictionEnvelopeRow[];
}

/**
 * Server-computed display preference for a market: the SAME label/meaning/
 * threshold wording `FORECAST_HIGHLIGHTS` always showed, just sourced from the
 * server instead of a local copy. `isRange` is a boolean (not the structured
 * range) because every renderer only ever checked it for truthiness.
 */
export interface MarketPreference {
  label: string;
  meaning: string;
  suggest: number;
  strong: number | null;
  isRange: boolean;
}

export type HighlightLevel = 'strong' | 'suggested' | 'none';
export type BetListPriceStatus = 'checked' | 'unqualified' | 'stale' | 'unpriced';

/** One ranked entry from `POST /predictions/bet-list/`. */
export interface BetListSuggestion {
  providerFixtureId: number;
  marketId: string;
  marketLabel: string;
  marketLine: string;
  probability: number;
  explanation: string;
  level: HighlightLevel;
  preference: MarketPreference;
  family: string;
  historyLimited: boolean;
  impliedBy?: string[];
  priceStatus: BetListPriceStatus;
  decimalOdds: number | null;
  bookmaker: string;
  oddsTimestamp: number | null;
}

interface BetListResponse {
  errors: unknown[];
  results: number;
  response: BetListSuggestion[];
}

/**
 * Server-computed "Suggested bet list": the SAME ranked selection the public
 * Official Daily List uses. Pass the caller's own already-fetched predictions
 * directly; nothing is re-fetched or recomputed from a database lookup.
 */
export const getSuggestedBetList = async ({ predictions, limit }: { predictions: FixturePrediction[]; limit?: number }) => {
  return apiClient.post<BetListResponse>(`${endpoint}bet-list/`, { predictions, limit });
};

/** Per-market suggested/strong/none display level for one fixture. */
export interface MarketHighlight {
  level: HighlightLevel;
  probability: number | null;
  preference: MarketPreference;
  impliedBy?: string[];
}

export interface HighlightLevelsRow {
  providerFixtureId: number;
  markets: Record<string, MarketHighlight>;
}

interface HighlightLevelsResponse {
  errors: unknown[];
  results: number;
  response: HighlightLevelsRow[];
}

/**
 * Server-computed per-market highlight levels for the caller's own already-
 * fetched predictions, via the SAME canonical thresholds the Official Daily
 * List and Suggested Bet List both use.
 */
export const getHighlightLevels = async ({ predictions }: { predictions: FixturePrediction[] }) => {
  return apiClient.post<HighlightLevelsResponse>(`${endpoint}highlights/`, { predictions });
};
