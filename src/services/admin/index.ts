/**
 * Administrative workflow client.
 *
 * These endpoints require Django staff status, which is enforced server-side on
 * every route. This module does not decide who is an admin: it asks, and the
 * server refuses anything the caller is not entitled to.
 *
 * Requests use the authenticated `apiClient`, so a signed-out visitor is told to
 * sign in rather than silently receiving an empty admin page.
 */
import { apiClient, apiGet } from '../api/client';
import type {
  AdminAccessProduct,
  AdminAccessProductsResponse,
  AdminJobDetail,
  AdminJobsResponse,
  AdminRunResponse,
  AdminStatusResponse,
  AdminScheduleResponse,
  AdminTrafficResponse,
  AdminUsersResponse,
  AdminAccessGrantResponse,
  CoverageResponse,
  ManualPredictionResponse,
  ManualBetListPreview,
  ManualResultUpdateResponse,
  ManualTaskKind,
  ManualTasksResponse,
} from './types';

const base = '/admin/';

export const getAdminAccessProducts = () => apiGet<AdminAccessProductsResponse>(`${base}access-products/`);

export const createAdminAccessProduct = (input: {
  code: string; name: string; price_amount: string; duration_days: number; confirm_activation: boolean;
}) => apiClient.post<AdminAccessProduct>(`${base}access-products/`, input);

export const setAdminAccessProductActive = (code: string, isActive: boolean) =>
  apiClient.patch<AdminAccessProduct>(`${base}access-products/${encodeURIComponent(code)}/`, { is_active: isActive });

/** Whether to render the Admin section, and the configured league list. */
export const getAdminStatus = () => apiGet<AdminStatusResponse>(`${base}status/`);

export const getAdminUsers = (page = 1, pageSize = 25, search = '') => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set('search', search.trim());
  return apiGet<AdminUsersResponse>(`${base}users/?${params.toString()}`);
};

export const grantAdminUserAccess = (userId: number, input: {
  requestId: string;
  durationDays: number;
  reason: string;
}) => apiClient.post<AdminAccessGrantResponse>(`${base}users/${userId}/grant-access/`, input);

export const predictAdminManualLeague = (date: string, leagueId: number) =>
  apiClient.post<ManualPredictionResponse>(`${base}manual/predictions/`, { date, leagueId }, { timeout: 110_000 });

export const getManualTasks = (date: string) =>
  apiGet<ManualTasksResponse>(`${base}manual/tasks/?${new URLSearchParams({ date }).toString()}`);

export const runManualTask = (date: string, leagueId: number, kind: ManualTaskKind) =>
  apiClient.post<Partial<ManualResultUpdateResponse> & { id: number; status: string }>(
    `${base}manual/tasks/`, { date, leagueId, kind }, { timeout: 110_000 },
  );

export const previewAdminManualList = (date: string, predictionIds: number[]) =>
  apiClient.post<ManualBetListPreview>(`${base}manual/bet-list/`, { date, predictionIds });

export const publishAdminManualList = (preview: ManualBetListPreview) =>
  apiClient.put<{ published: boolean; date: string; listId: number }>(`${base}manual/bet-list/`, {
    date: preview.date, predictionIds: preview.predictionIds, selectionHash: preview.selectionHash,
    confirm_publish: true,
  });

/**
 * Per-league coverage for a date.
 *
 * `leagues` narrows the report only. It never changes what a run would do,
 * because league selection is a filter over the fixture set, not a split.
 */
export const getAdminCoverage = (targetDate?: string, leagues?: number[]) => {
  const params = new URLSearchParams();
  if (targetDate) params.set('date', targetDate);
  if (leagues && leagues.length) params.set('leagues', leagues.join(','));
  const query = params.toString();
  return apiGet<CoverageResponse>(`${base}coverage/${query ? `?${query}` : ''}`);
};

/**
 * Legacy queue endpoint. The backend now rejects these requests with HTTP 410.
 */
export const startAdminRun = (input: {
  kind: 'generate' | 'refresh' | 'publish';
  date?: string;
  leagues: number[];
  season?: number;
}) =>
  apiClient.post<AdminRunResponse>(`${base}runs/`, {
    kind: input.kind,
    date: input.date,
    leagues: input.leagues,
    season: input.season,
  });

/** Recent runs, for the status panel. */
export const getAdminJobs = (targetDate?: string, limit = 25) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (targetDate) params.set('date', targetDate);
  return apiGet<AdminJobsResponse>(`${base}jobs/?${params.toString()}`);
};

/** One run's status, polled while it is not terminal. */
export const getAdminJob = (jobId: number) => apiGet<AdminJobDetail>(`${base}jobs/${jobId}/`);


export const getAdminSchedule = (date: string) =>
  apiGet<AdminScheduleResponse>(`${base}ingestion-schedule/?${new URLSearchParams({ date })}`);

export const saveAdminSchedule = (date: string, leagues: number[]) =>
  apiClient.put<Pick<AdminScheduleResponse, 'date' | 'selectedLeagues' | 'effectiveLeagues'>>(
    `${base}ingestion-schedule/`, { date, leagues },
  );

export const getAdminTraffic = (page: number) =>
  apiGet<AdminTrafficResponse>(`${base}visitors/?${new URLSearchParams({ page: String(page), pageSize: '25' })}`);
