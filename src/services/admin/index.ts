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
  AdminJobDetail,
  AdminJobsResponse,
  AdminRunResponse,
  AdminStatusResponse,
  CoverageResponse,
} from './types';

const base = '/admin/';

/** Whether to render the Admin section, and the configured league list. */
export const getAdminStatus = () => apiGet<AdminStatusResponse>(`${base}status/`);

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
 * Request a run.
 *
 * Returns immediately with a QUEUED job; the work happens off-request, so the UI
 * polls `getAdminJob` instead of holding a connection open.
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