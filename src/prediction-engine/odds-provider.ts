import { MarketId, MarketOdds } from './types';
import { ApiFootballOddsResponse } from '../services/odds';

/**
 * API-Football bet/market ids we map onto the engine's markets.
 *
 * Verified against the live payload (2026-10-17):
 *   1 = Match Winner           (Home / Draw / Away)
 *   8 = Both Teams Score       (Yes / No)
 *   5 = Goals Over/Under       (inline values "Over 2.5", "Under 1.5", ...)
 */
export const API_FOOTBALL_MARKET_IDS = {
  MATCH_WINNER: 1,
  BOTH_TEAMS_SCORE: 8,
  GOALS_OVER_UNDER: 5,
} as const;

const parseOdd = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 1 ? n : undefined;
};

const parseTimestamp = (iso: string | undefined): number | undefined => {
  if (!iso) {
    return undefined;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
};

/** Normalise a value label like "Home", "Yes", "Over 2.5" to a lowercase key. */
const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase();

export interface MappedFixtureOdds {
  fixtureId?: number;
  markets: MarketOdds[];
  /** Bookmakers that contributed at least one mapped market. */
  bookmakers: string[];
  /** ISO timestamp of the fixture-level odds update, when present. */
  updatedAt?: string;
  /** Count of raw markets seen but not mapped (for diagnostics). */
  unmappedMarketNames: string[];
}

/**
 * Convert one API-Football odds response (a single fixture) into engine `MarketOdds[]`.
 *
 * When several bookmakers quote the same market we take the **best (highest) decimal
 * odds** for each selection, which is the most favourable available price and keeps the
 * evaluation honest about what was on offer.
 */
export const mapApiFootballOdds = (
  response: ApiFootballOddsResponse | undefined
): MappedFixtureOdds => {
  const result: MappedFixtureOdds = {
    fixtureId: response?.fixture?.id,
    markets: [],
    bookmakers: [],
    updatedAt: response?.update,
    unmappedMarketNames: [],
  };

  const bookmakers = response?.bookmakers ?? [];
  if (bookmakers.length === 0) {
    return result;
  }

  const fixtureTimestamp = parseTimestamp(response?.update) ?? parseTimestamp(response?.fixture?.date);
  const best = new Map<MarketId, { odd: number; bookmaker: string; marginAdjustedProbability?: number }>();
  const seenBookmakers = new Set<string>();

  bookmakers.forEach((bookmaker) => {
    const bookmakerName = bookmaker.name ?? `Bookmaker ${bookmaker.id ?? '?'}`;
    let contributed = false;
    const localOdds = new Map<MarketId, number>();
    const addLocal = (marketId: MarketId, odd: number | undefined) => {
      if (odd === undefined) return;
      const current = localOdds.get(marketId);
      if (current === undefined || odd > current) localOdds.set(marketId, odd);
    };

    (bookmaker.bets ?? []).forEach((bet) => {
      const marketId = bet.id;
      const values = bet.values ?? [];

      if (marketId === API_FOOTBALL_MARKET_IDS.MATCH_WINNER) {
        values.forEach((v) => {
          const key = norm(v.value);
          const odd = parseOdd(v.odd);
          if (key === 'home') { addLocal('home_win', odd); contributed = true; }
          else if (key === 'draw') { addLocal('draw', odd); contributed = true; }
          else if (key === 'away') { addLocal('away_win', odd); contributed = true; }
        });
      } else if (marketId === API_FOOTBALL_MARKET_IDS.BOTH_TEAMS_SCORE) {
        values.forEach((v) => {
          const key = norm(v.value);
          const odd = parseOdd(v.odd);
          if (key === 'yes') { addLocal('btts_yes', odd); contributed = true; }
          else if (key === 'no') { addLocal('btts_no', odd); contributed = true; }
        });
      } else if (marketId === API_FOOTBALL_MARKET_IDS.GOALS_OVER_UNDER) {
        values.forEach((v) => {
          const key = norm(v.value);
          const odd = parseOdd(v.odd);
          const match = key.match(/^(over|under)\s+([0-9]+(?:\.[0-9]+)?)$/);
          if (!match || odd === undefined) {
            return;
          }
          const side = match[1];
          const line = match[2];
          const marketKey = `${side}_${line.replace('.', '_')}` as MarketId;
          if (
            marketKey === 'over_1_5' || marketKey === 'under_1_5' ||
            marketKey === 'over_2_5' || marketKey === 'under_2_5' ||
            marketKey === 'over_3_5' || marketKey === 'under_3_5'
          ) {
            addLocal(marketKey, odd);
            contributed = true;
          }
        });
      } else if (bet.name) {
        result.unmappedMarketNames.push(bet.name);
      }
    });

    if (contributed) {
      seenBookmakers.add(bookmakerName);
    }

    // Remove overround within this single bookmaker/market, never across prices from
    // different bookmakers. The best executable price may come from another book, but
    // its own normalized probability travels with it for the market comparison.
    const adjusted = new Map<MarketId, number>();
    const normalizeGroup = (ids: MarketId[]) => {
      const values = ids.map((id) => localOdds.get(id));
      if (values.some((value) => value === undefined)) return;
      const implied = values.map((value) => 1 / (value as number));
      const total = implied.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return;
      ids.forEach((id, index) => adjusted.set(id, implied[index] / total));
    };

    normalizeGroup(['home_win', 'draw', 'away_win']);
    normalizeGroup(['btts_yes', 'btts_no']);
    (['1_5', '2_5', '3_5'] as const).forEach((line) => {
      normalizeGroup([`over_${line}` as MarketId, `under_${line}` as MarketId]);
    });

    localOdds.forEach((odd, marketId) => {
      const current = best.get(marketId);
      if (!current || odd > current.odd) {
        best.set(marketId, {
          odd,
          bookmaker: bookmakerName,
          marginAdjustedProbability: adjusted.get(marketId),
        });
      }
    });
  });

  result.markets = Array.from(best.entries()).map(([marketId, quote]) => ({
    marketId,
    decimalOdds: quote.odd,
    marginAdjustedProbability: quote.marginAdjustedProbability,
    timestamp: fixtureTimestamp,
    bookmaker: quote.bookmaker,
  }));

  result.bookmakers = Array.from(seenBookmakers);
  return result;
};

/** Convenience: map a full payload, returning the first fixture's odds. */
export const mapApiFootballOddsPayload = (payload: {
  response?: ApiFootballOddsResponse[];
}): MappedFixtureOdds => mapApiFootballOdds(payload?.response?.[0]);