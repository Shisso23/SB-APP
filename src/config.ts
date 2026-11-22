/**
 * PredictXI frontend settings.
 *
 * SECURITY: this module must never contain an API-Football (or any other provider)
 * credential. Provider access happens server-side in Django. Do not reintroduce a
 * key here and do not add a `REACT_APP_*` key variable: anything bundled is public.
 */
import { apiConfig } from './config/api';

export default {
    /** Django API origin used by the frontend. Non-secret. */
    apiUrl: apiConfig.baseUrl,
};