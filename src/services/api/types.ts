/**
 * Shared response envelope returned by the PredictXI Django read endpoints.
 *
 * The shape intentionally mirrors the provider's list envelope so existing screens
 * and models keep working after the cutover. Django builds this from stored
 * canonical data; no provider payload is forwarded.
 */
export interface EnvelopeResponse<T> {
  errors: string[];
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

/** Stored odds quote row returned by `/odds`. */
export interface StoredOddsQuote {
  fixture_id: number;
  bookmaker?: string | null;
  market_id: string;
  decimal_odds: string | number;
  provider_updated_at?: string | null;
  captured_at?: string | null;
  margin_adjusted_probability?: string | number | null;
}