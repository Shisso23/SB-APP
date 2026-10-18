/**
 * Access-token provider for the PredictXI API client.
 *
 * STATUS: temporary. Firebase sign-in is NOT yet wired in the frontend, so no ID
 * token source exists yet. The provider below reads a token from a single,
 * deliberately obvious integration point and fails closed when it is absent.
 *
 * Security notes:
 *  - No provider credential is stored or read here.
 *  - Never hard-code a token, and never commit one.
 *  - When Firebase sign-in lands, replace `resolveIdToken()` with an SDK call
 *    (e.g. `getIdToken()` on the signed-in user). Everything else keeps working.
 */
export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class SignInRequiredError extends Error {
  constructor(message = 'Sign in is not configured yet.') {
    super(message);
    this.name = 'SignInRequiredError';
  }
}

declare global {
  interface Window {
    /** Temporary integration point until Firebase sign-in is wired up. */
    __PREDICTXI_ID_TOKEN_PROVIDER__?: () => Promise<string | null> | string | null;
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

/**
 * Resolve the current Firebase ID token, or null when not signed in.
 *
 * Replace this implementation with the Firebase SDK once sign-in is available.
 */
const resolveIdToken = async (): Promise<string | null> => {
  const provider = typeof window !== 'undefined' ? window.__PREDICTXI_ID_TOKEN_PROVIDER__ : undefined;
  if (typeof provider !== 'function') return null;
  const token = await provider();
  return typeof token === 'string' && token.trim() ? token.trim() : null;
};

/** Get a token or fail closed. Callers must not fall back to unauthenticated reads. */
export const requireIdToken = async (): Promise<string> => {
  const token = await resolveIdToken();
  if (!token) {
    throw new SignInRequiredError();
  }
  return token;
};