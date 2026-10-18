/**
 * Odds reads from the PredictXI Django API.
 *
 * PREMIUM: these endpoints require an active entitlement. A missing entitlement
 * surfaces as `PremiumRequiredError` from the API client, so callers can show an
 * upgrade path instead of an empty list.
 *
 * Odds are stored canonical quotes selected by the server. The browser never sees
 * raw provider payloads and never requests API-Football directly.
 */
import { apiGet } from '../api/client';

const endpoint = '/odds';

export const getOddsByFixture = async (fixtureId: number) => {
  return apiGet(endpoint, { params: { fixture: fixtureId } });
};

export const getOddsByDate = async (date: string) => {
  return apiGet(endpoint, { params: { date } });
};

export const getOddsByLeagueSeason = async ({ leagueId, season }: { leagueId: number; season: number }) => {
  return apiGet(endpoint, { params: { league: leagueId, season } });
};

export const getBookmakers = async () => {
  return apiGet(`${endpoint}/bookmakers`);
};

export const getLiveOdds = async () => {
  return apiGet(`${endpoint}/live`);
};

/** Stored-quote envelope returned by Django, matching the previous shape. */
export interface ApiFootballOddsPayload {
  paging?: { current?: number; total?: number };
  results?: number;
  errors?: unknown;
  response?: ApiFootballOddsResponse[];
}

export interface ApiFootballOddsResponse {
  fixture?: { id?: number; date?: string; timestamp?: number };
  league?: { id?: number; season?: number };
  update?: string;
  bookmakers?: Array<{
    id?: number;
    name?: string;
    last_update?: string;
    bets?: Array<{
      id?: number;
      name?: string;
      values?: Array<{ value?: string; odd?: string }>;
    }>;
  }>;
}