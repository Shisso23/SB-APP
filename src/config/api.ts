/**
 * PredictXI frontend API configuration.
 *
 * The browser talks to the Django REST API only. There is no API-Football base URL,
 * provider key, or provider header anywhere in the frontend. Django owns provider
 * access and storage.
 *
 * `apiBaseUrl` is a non-secret service address. Configure it per environment.
 */
const normaliseBaseUrl = (value?: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const apiBaseUrl = normaliseBaseUrl(process.env.REACT_APP_PREDICTXI_API_URL);

export const apiConfig = {
  /** Django API origin, e.g. https://api.example.com. Empty means same-origin. */
  baseUrl: apiBaseUrl,
  /** Versioned API prefix. */
  apiPrefix: '/api/v1',
  /** Request timeout in milliseconds. */
  timeoutMs: 30_000,
} as const;

export const apiUrl = (path: string) => `${apiConfig.baseUrl}${apiConfig.apiPrefix}${path}`;