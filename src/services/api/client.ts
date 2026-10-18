/**
 * Django REST API client.
 *
 * This is the ONLY HTTP client in the frontend. It:
 *  - targets the PredictXI Django API (never API-Football),
 *  - attaches a Firebase ID token from `session.ts`,
 *  - maps 401/403 to explicit session/premium errors instead of silently
 *    showing stale data.
 *
 * It deliberately does NOT hold, read, or forward any provider credential.
 */
import axios, { AxiosError, AxiosRequestConfig } from 'axios';

import { apiConfig } from '../../config/api';
import { EnvelopeResponse } from './types';
import { notifySessionExpired, requireIdToken, SessionExpiredError, SignInRequiredError } from './session';

/** Caller lacks an active entitlement for premium data. */
export class PremiumRequiredError extends Error {
  constructor(message = 'An active prediction subscription is required.') {
    super(message);
    this.name = 'PremiumRequiredError';
  }
}

/** Request failed for a non-auth reason (network, 5xx, validation). */
export class ApiRequestError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

/** Signed in, but the requested provider write path is not permitted. */
export class ProviderAccessError extends Error {
  constructor(message = 'Provider access is handled by the server.') {
    super(message);
    this.name = 'ProviderAccessError';
  }
}

export const apiClient = axios.create({
  baseURL: `${apiConfig.baseUrl}${apiConfig.apiPrefix}`,
  timeout: apiConfig.timeoutMs,
  responseType: 'json',
});

/** Attach a fresh ID token to every request. */
apiClient.interceptors.request.use(async (request) => {
  const token = await requireIdToken();
  request.headers = request.headers ?? {};
  request.headers.Authorization = `Bearer ${token}`;
  return request;
});

/** Translate failures into typed errors. Never echo provider or server details. */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Our own typed errors (thrown from the request interceptor or callers) must keep
    // their meaning: an auth failure is not a generic service failure.
    if (error instanceof SessionExpiredError || error instanceof SignInRequiredError
        || error instanceof PremiumRequiredError || error instanceof ApiRequestError) {
      return Promise.reject(error);
    }
    const status = error.response?.status;
    if (status === 401) {
      notifySessionExpired();
      return Promise.reject(new SessionExpiredError());
    }
    if (status === 403) {
      return Promise.reject(new PremiumRequiredError());
    }
    if (status === 400) {
      return Promise.reject(new ApiRequestError('The request was rejected. Check the selected filters.', status));
    }
    if (status && status >= 500) {
      return Promise.reject(new ApiRequestError('The prediction service is temporarily unavailable.', status));
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new ApiRequestError('The request timed out. Please try again.'));
    }
    return Promise.reject(new ApiRequestError('Could not reach the prediction service.'));
  },
);

/** GET a Django endpoint. Defaults to the provider-shaped list envelope. */
export const apiGet = <T = EnvelopeResponse<unknown>>(path: string, config?: AxiosRequestConfig) =>
  apiClient.get<T>(path, config);

export { SignInRequiredError, SessionExpiredError };