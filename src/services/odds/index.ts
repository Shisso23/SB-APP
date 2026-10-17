import authNetworkService from '../auth-network-service/auth-network.service';

const endpoint = 'odds';

/**
 * API-Football pre-match odds.
 *
 * IMPORTANT (verified 2026-10-17):
 *  - The current API key is on the **Free** plan, which returns odds ONLY for upcoming
 *    fixtures (today / near-future). Historical odds queries (by date, league+season, or
 *    old fixture id) return 0 results.
 *  - Therefore this service can power a *prospective* paper-tracking workflow, not a
 *    historical profitability backtest.
 */
export const getOddsByFixture = async (fixtureId: number) => {
  return authNetworkService.get(endpoint, {
    params: { fixture: fixtureId },
  });
};

export const getOddsByDate = async (date: string) => {
  return authNetworkService.get(endpoint, {
    params: { date },
  });
};

export const getOddsByLeagueSeason = async ({ leagueId, season }: { leagueId: number; season: number }) => {
  return authNetworkService.get(endpoint, {
    params: { league: leagueId, season },
  });
};

export const getBookmakers = async () => {
  return authNetworkService.get(`${endpoint}/bookmakers`);
};

export const getLiveOdds = async () => {
  return authNetworkService.get(`${endpoint}/live`);
};

/** Raw payload shape (loosely typed; only the fields we read are named). */
export interface ApiFootballOddsPayload {
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