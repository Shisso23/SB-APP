/**
 * Prediction reads from the PredictXI Django API.
 *
 * PREMIUM: this endpoint requires an active entitlement. A missing entitlement
 * surfaces as `PremiumRequiredError` from the API client, so callers can show an
 * upgrade path instead of an empty forecast list.
 *
 * Forecasts are generated server-side by the private prediction engine ahead of
 * kickoff (within a bounded pre-match window) and stored in Postgres. When no
 * fresh forecast exists, a league read can generate and persist it inline. The browser
 * never computes a forecast itself; it only reads what the server has already
 * published for a fixture.
 */
import { apiClient, apiGet, ApiRequestError } from '../api/client';
import type { AxiosResponse } from 'axios';
import { FixturePrediction } from '../../prediction-engine/types';
import type { FixtureDataModel } from '../../models/fixtures';

const endpoint = '/predictions/';

export const getPredictionsByLeagueSeason = async ({ leagueId, season }: { leagueId: number; season: number }) => {
  return readPredictionPages<PredictionsPayload>(endpoint, { league: leagueId, season });
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
  fixture?: Pick<FixtureDataModel, 'fixture' | 'goals' | 'score'>;
  /** Same shape as `FixturePrediction` (src/prediction-engine/types.ts) - produced by the same engine source. */
  output: Record<string, unknown>;
}

export interface PredictionsPayload {
  paging?: { current?: number; total?: number };
  results?: number;
  errors?: unknown;
  response?: PredictionEnvelopeRow[];
}

const readPredictionPages = async <T extends PredictionsPayload>(
  path: string, params: Record<string, string | number> = {}, initial?: AxiosResponse<T>,
) => {
  const first = initial ?? await apiGet<T>(path, { params: { ...params, page_size: 200 } });
  if (!Array.isArray(first.data.response)) throw new ApiRequestError('The saved prediction response was incomplete.');
  const rows = [...first.data.response];
  const pages = first.data.paging?.total ?? 1;
  for (let page = 2; page <= pages; page += 1) {
    const next = await apiGet<T>(path, { params: { ...params, page_size: 200, page } });
    if (!Array.isArray(next.data.response)) throw new ApiRequestError('The saved prediction response was incomplete.');
    rows.push(...next.data.response);
  }
  return { ...first, data: { ...first.data, response: rows, results: rows.length } };
};

export interface SavedPredictionLeague {
  leagueId: number;
  season: number;
  predictions: number;
}

export interface PredictionWorkspacePayload extends PredictionsPayload {
  leagues: SavedPredictionLeague[];
  lastBatch?: Pick<SavedPredictionLeague, 'leagueId' | 'season'>[];
  from: string | null;
  to: string | null;
}

export const getPredictionWorkspace = (range?: { from: string; to: string }) =>
  readPredictionPages<PredictionWorkspacePayload>(`${endpoint}workspace/`, { ...range, include_saved: 'true' });

/** Latest eligible versions, independently of the snapshots pinned for review. */
export const getCurrentPredictionWorkspace = (range: { from: string; to: string }) =>
  readPredictionPages<PredictionWorkspacePayload>(`${endpoint}workspace/`, range);

export const savePredictionWorkspace = async (workspace: {
  leagues: { leagueId: number; season: number }[]; from: string; to: string;
}) => readPredictionPages<PredictionWorkspacePayload>(
  `${endpoint}workspace/`, { from: workspace.from, to: workspace.to, include_saved: 'true' },
  await apiClient.post<PredictionWorkspacePayload>(`${endpoint}workspace/`, workspace, { params: { page_size: 200, include_saved: 'true' } }),
);

export const clearPredictionWorkspace = () => apiClient.delete(`${endpoint}workspace/`);

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
  /** Set when this market was chosen for variety; names the match's strongest qualifying option. */
  diversityAlternative?: { label: string; probability: number };
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

// Both runner operations consume this subset of an already-published forecast.
// Keeping the complete scoreline grid preserves range probabilities; omitting
// match analysis and other snapshots keeps consolidated requests within bounds.
const selectionInputs = (predictions: FixturePrediction[]) => predictions.map((prediction) => {
  const { id, timestamp, status } = prediction.fixture.fixture;
  const { homeSampleSize, awaySampleSize } = prediction.dataQuality;
  return {
    fixture: { fixture: { id, timestamp, status: { short: status.short } } },
    dataQuality: { homeSampleSize, awaySampleSize },
    homeTeam: { overallSampleSize: prediction.homeTeam.overallSampleSize },
    awayTeam: { overallSampleSize: prediction.awayTeam.overallSampleSize },
    probabilities: { baseScorelines: prediction.probabilities.baseScorelines },
    markets: prediction.markets.map(({
      marketId, modelProbability, decimalOdds, oddsStale, oddsTimestamp, qualifies,
      passedEdgeThreshold, passedProbabilityThreshold, expectedValue, bookmaker,
    }) => ({
      marketId, modelProbability, decimalOdds, oddsStale, oddsTimestamp, qualifies,
      passedEdgeThreshold, passedProbabilityThreshold, expectedValue, bookmaker,
    })),
  };
});

/**
 * Server-computed "Suggested bet list": the SAME ranked selection the public
 * Official Daily List uses. Pass the caller's own already-fetched predictions
 * directly; nothing is re-fetched or recomputed from a database lookup.
 */
export const getSuggestedBetList = async ({ predictions, limit }: { predictions: FixturePrediction[]; limit?: number }) => {
  return apiClient.post<BetListResponse>(`${endpoint}bet-list/`, { predictions: selectionInputs(predictions), limit });
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
  return apiClient.post<HighlightLevelsResponse>(`${endpoint}highlights/`, { predictions: selectionInputs(predictions) });
};
