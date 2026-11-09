/**
 * Read-only client for the public official-list API.
 *
 * These endpoints require no authentication: they are the free experience. The
 * server decides what is public, so nothing here needs to filter or hide
 * premium data — it simply is not returned.
 *
 * All four calls are safe to make before sign-in.
 */
import { publicGet } from '../api/client';
import type {
  OfficialHistoryResponse,
  OfficialList,
  OfficialPreviewResponse,
  OfficialSummaryResponse,
} from './types';

const base = '/public/official/';

/** Today's published list, or an explicit "nothing was published" response. */
export const getOfficialToday = () => publicGet<OfficialList>(`${base}today/`);

/**
 * Paginated history.
 *
 * `recent` always contains the latest business dates, including ones with no
 * publication, so gaps are visible rather than silently missing.
 */
export const getOfficialHistory = (page = 1) =>
  publicGet<OfficialHistoryResponse>(`${base}history/?page=${encodeURIComponent(String(page))}`);

/** Labelled summary metrics with their denominators. */
export const getOfficialSummary = () => publicGet<OfficialSummaryResponse>(`${base}summary/`);

/** The cached daily featured match plus the forecast explainer. */
export const getOfficialPreview = () => publicGet<OfficialPreviewResponse>(`${base}preview/`);