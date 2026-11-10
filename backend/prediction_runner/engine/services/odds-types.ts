/**
 * Vendored type-only extract from the frontend's `src/services/odds/index.ts`.
 *
 * Only the response shape is needed here (for `mapApiFootballOdds`'s input type);
 * the frontend's actual HTTP client/auth code is deliberately NOT vendored, since
 * the backend never calls itself over HTTP. Keep this in sync manually if the
 * frontend's `ApiFootballOddsPayload`/`ApiFootballOddsResponse` shapes change.
 */

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
