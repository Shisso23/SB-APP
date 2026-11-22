/**
 * Access-token provider for the PredictXI API client.
 *
 * Tokens come from Firebase Authentication. The API client calls
 * `requireIdToken()` before every request and fails closed when signed out.
 *
 * Security notes:
 *  - No provider credential is stored or read here.
 *  - The Firebase web config is public; server-side verification is authoritative.
 *  - Never hard-code a token, and never commit one.
 */
import { currentIdToken, refreshIdToken } from '../auth/firebase';

export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class SignInRequiredError extends Error {
  constructor(message = 'Please sign in to continue.') {
    super(message);
    this.name = 'SignInRequiredError';
  }
}

let sessionExpiredHandler: (() => void) | null = null;

/** Register a UI callback invoked when the API reports an expired session. */
export const onSessionExpired = (handler: (() => void) | null) => {
  sessionExpiredHandler = handler;
};

export const notifySessionExpired = () => {
  if (sessionExpiredHandler) sessionExpiredHandler();
};

/** Resolve the current Firebase ID token, or null when not signed in. */
const resolveIdToken = async (): Promise<string | null> => currentIdToken();

/** Get a token or fail closed. Callers must not fall back to unauthenticated reads. */
export const requireIdToken = async (): Promise<string> => {
  const token = await resolveIdToken();
  if (!token) {
    throw new SignInRequiredError();
  }
  return token;
};

/**
 * Force a token refresh. Used after a 401 so a stale cached token is not reused.
 */
export const forceRefreshIdToken = async (): Promise<string | null> => refreshIdToken();