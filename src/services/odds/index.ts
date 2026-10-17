import authNetworkService from '../auth-network-service/auth-network.service';

const endpoint = 'odds';

const getAllOddsPages = async (params: Record<string, string | number>) => {
  const first = await authNetworkService.get<ApiFootballOddsPayload>(endpoint, { params });
  const entries: ApiFootballOddsResponse[] = [];
  const append = (payload: ApiFootballOddsPayload) => {
    const errors = payload.errors;
    const messages = typeof errors === 'string' ? [errors]
      : errors && typeof errors === 'object' ? Object.values(errors).map(String) : [];
    if (messages.some(Boolean)) throw new Error(`Odds provider: ${messages.filter(Boolean).join(' ')}`);
    entries.push(...(payload.response ?? []));
  };
  append(first.data);
  const totalPages = first.data.paging?.total ?? 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await authNetworkService.get<ApiFootballOddsPayload>(endpoint, { params: { ...params, page } });
    append(next.data);
  }
  return { ...first, data: { ...first.data, response: entries, results: entries.length } };
};

export const getOddsByFixture = async (fixtureId: number) => {
  return getAllOddsPages({ fixture: fixtureId });
};

export const getOddsByDate = async (date: string) => {
  return getAllOddsPages({ date });
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