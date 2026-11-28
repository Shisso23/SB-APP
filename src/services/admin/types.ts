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

export interface ManualForecast {
  id: number;
  providerFixtureId: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
}

export interface ManualPredictionResponse {
  date: string;
  leagueId: number;
  leagueName: string;
  season: number;
  predictionIds: number[];
  forecasts: ManualForecast[];
}

export type ManualTaskKind = 'catalog' | 'daily' | 'odds' | 'predict-settle' | 'settle' | 'update-results';

/** Settlement counts returned by an `update-results` pass. */
export interface ManualResultUpdateResponse {
  id: number;
  status: string;
  datesChecked: number;
  legsSettled: number;
  legsVoided: number;
  legsUnresolved: number;
  listsFinalised: number;
}

export interface ManualTaskProgress {
  leagueId: number;
  kind: ManualTaskKind | 'predict';
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string;
  checkpoint: Record<string, unknown>;
}

export interface ManualTasksResponse {
  date: string;
  today: string;
  counts: Record<ManualTaskKind | 'predict', number>;
  leagueCounts: Record<string, Partial<Record<ManualTaskKind | 'predict', number>>>;
  manualPublicationsToday: number;
  progress: ManualTaskProgress[];
}

export interface ManualBetListPreview {
  date: string;
  predictionIds: number[];
  requiredSize: number;
  /** Minimum distinct fixtures; omitted by older backends requiring a full list. */
  minimumSize?: number;
  canPublish: boolean;
  reason: string;
  selectionHash: string;
  suggestions: {
    predictionId: number;
    providerFixtureId: number;
    homeTeam: string;
    awayTeam: string;
    kickoff: string;
    marketId: string;
    marketLabel: string;
    probability: number;
    decimalOdds: string | null;
    bookmaker: string;
    oddsSource?: 'api-football' | 'model-fair';
  }[];
}

export interface AdminUserLatestPurchase {
  id: number;
  status: string;
  provider: string;
  productCode: string;
  productName: string;
  amountExpected: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserRecord {
  id: number;
  firebaseUid: string;
  /** Some accounts (e.g. anonymous or phone auth) have no email on record. */
  email: string | null;
  phoneNumber?: string | null;
  isActive: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  createdAt: string;
  membership: {
    active: boolean;
    startsAt: string | null;
    endsAt: string | null;
    revoked: boolean;
  };
  latestPurchase: AdminUserLatestPurchase | null;
}

export interface AdminUsersResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  users: AdminUserRecord[];
}

export interface AdminAccessProduct {
  code: string;
  name: string;
  price_amount: string;
  currency: string;
  duration_days: number;
  is_active: boolean;
}

export interface AdminAccessProductsResponse {
  products: AdminAccessProduct[];
  minimumPrice: string;
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
  leagueResults: Record<string, {
    status: string;
    error?: string;
    steps?: Record<string, 'completed' | 'skipped'>;
  }>;
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

