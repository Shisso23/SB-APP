/**
 * Official daily list + public history types.
 *
 * Every value here is server-owned. The frontend never computes a probability,
 * settlement outcome, or monetary figure: it only renders what the public API
 * returns. Notably `hypothetical.*` may be null, and that null is meaningful —
 * it means the original odds were incomplete, NOT that the return was zero.
 */

/** Aggregated state of a whole published list. Mirrors `OfficialListStatus`. */
export type OfficialListStatus = 'pending' | 'won' | 'lost' | 'void' | 'unresolved';

/** State of one selection. Mirrors `LegStatus`. */
export type OfficialLegStatus = 'pending' | 'won' | 'lost' | 'void' | 'unresolved';

/** Frozen pre-kickoff odds for one leg, or null when none were available. */
export interface OfficialLegOdds {
  /** Decimal string, e.g. "1.85". Never parsed to a float for authority. */
  decimalOdds: string;
  bookmaker: string;
  source: string;
  capturedAt: string | null;
}

export interface OfficialListLeg {
  providerFixtureId: number;
  leagueId: number;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  marketId: string;
  marketLabel: string;
  marketLine: string;
  /** Model probability as a decimal string, e.g. "0.72000". */
  probability: string;
  explanation: string;
  engineVersion: string;
  status: OfficialLegStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  settledAt: string | null;
  resolutionNote: string;
  odds: OfficialLegOdds | null;
}

/**
 * Hypothetical R1,000 illustration.
 *
 * `available === false` means the monetary figure is *unavailable*, not zero.
 * `isPotential === true` means the list is not fully settled yet, so any figure
 * is a potential return rather than a realised result.
 */
export interface HypotheticalResult {
  stake: string;
  available: boolean;
  reason: string;
  settledFully: boolean;
  combinedOdds: string | null;
  totalReturn: string | null;
  net: string | null;
  isPotential: boolean;
  disclosure: string;
}

export interface OfficialList {
  businessDate: string;
  published: boolean;
  publishedAt?: string;
  status?: OfficialListStatus;
  leagues?: number[];
  engineVersion?: string;
  lastCheckedAt?: string | null;
  lastCheckError?: string;
  legCount?: number;
  legs: OfficialListLeg[];
  hypothetical?: HypotheticalResult;
  /** Present when `published` is false: why nothing was published. */
  message?: string;
}

export interface OfficialHistoryResponse {
  /** The most recent business dates, including dates with no publication. */
  recent: OfficialList[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalLists: number;
  results: OfficialList[];
}

export interface MetricBlock {
  won: number;
  lost: number;
  void: number;
  pending: number;
  unresolved: number;
  denominator: number;
  /** Null when the denominator is zero — never coerced to 0. */
  win_rate?: string | null;
  hit_rate?: string | null;
}

export interface OfficialSummaryResponse {
  metrics: {
    lists: MetricBlock;
    selections: MetricBlock;
  };
  definitions: {
    fullListWinRate: string;
    selectionHitRate: string;
    note: string;
  };
  scope: {
    listsConsidered: number;
    period: { from: string | null; to: string | null };
  };
}

/** The featured free-preview match and the forecast explainer. */
export interface OfficialPreviewResponse {
  businessDate: string;
  available: boolean;
  message?: string;
  explainer: {
    summary: string;
    limitations: string[];
    how_the_list_is_made: string;
  };
  featured?: {
    providerFixtureId: number | null;
    leagueName: string;
    homeTeam: string;
    awayTeam: string;
    kickoff: string | null;
    marketId: string;
    marketLabel: string;
    marketLine: string;
    probability: string;
    explanation: string;
    engineVersion: string;
    markets: Array<{
      marketId: string;
      label: string;
      probability: number | null;
      decimalOdds: number | null;
      qualifies: boolean | null;
    }>;
    dataQuality?: {
      homeSampleSize: number | null;
      awaySampleSize: number | null;
      standingsAvailable: boolean | null;
    };
  };
}