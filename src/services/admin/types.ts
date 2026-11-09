/**
 * Administrative API types.
 *
 * Every value here is server-owned. `isAdmin` in particular is decided by Django
 * staff status — the frontend never infers it, and hiding the UI is not the
 * access control.
 */

/** Per-league state for a selected date. Mirrors `CoverageStatus`. */
export type CoverageStatus =
  | 'not_generated'
  | 'queued'
  | 'running'
  | 'published'
  | 'refreshing'
  | 'failed'
  | 'no_eligible_fixtures';

export interface LeagueCoverage {
  leagueId: number;
  status: CoverageStatus;
  eligibleFixtures: number;
  predictions: number;
  lastPublishedAt: string | null;
  lastSuccessfulPredictions: number;
  error: string;
  latestJobId: number | null;
  /** A previous good publication still exists, even if the latest run failed. */
  previousVersionAvailable: boolean;
}

export interface AdminStatusResponse {
  isAdmin: boolean;
  /** Membership and admin rights are independent; neither implies the other. */
  isMember: boolean;
  configuredLeagues: number[];
}

/** Read-only publication state per league, for browse and admin views. */
export type FreshnessState = 'current' | 'stale' | 'empty';

export interface LeagueFreshness {
  lastGeneratedAt: string | null;
  predictions: number;
  state: FreshnessState;
  hasPublished: boolean;
}

export interface CoverageResponse {
  targetDate: string;
  season: number;
  summary: {
    publishedLeagues: number;
    eligibleLeagues: number;
    label: string;
  };
  leagues: LeagueCoverage[];
  requestedLeagues: number[];
  /** Keyed by league id. Reports stored state only; never triggers generation. */
  freshness?: Record<string, LeagueFreshness>;
}

export type AdminJobKind = 'generate' | 'refresh' | 'publish';
export type AdminJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AdminJob {
  jobId: number;
  kind: AdminJobKind;
  status: AdminJobState;
  targetDate: string;
  season: number;
  leagues: number[];
  trigger: string;
  requestedBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string;
  summary: Record<string, unknown>;
  leagueResults: Record<string, { status: string; error?: string }>;
}

export interface AdminRunResponse {
  jobId: number;
  kind: AdminJobKind;
  targetDate: string;
  season: number;
  leagues: number[];
  status: AdminJobState;
}

export interface AdminJobsResponse {
  jobs: AdminJob[];
}

export interface AdminJobDetail extends AdminJob {
  isTerminal: boolean;
}