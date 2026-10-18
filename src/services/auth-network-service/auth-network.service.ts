/**
 * @deprecated Use `services/api/client.ts`.
 *
 * This module is kept only so existing imports keep resolving during the Phase 4
 * cutover. It now points at the PredictXI Django API and attaches no provider
 * credential. Remove it (and its importers) once every call site is migrated.
 */
import { apiClient } from '../api/client';

const authNetworkService = apiClient;

export default authNetworkService;
