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
import { apiGet } from '../api/client';

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
