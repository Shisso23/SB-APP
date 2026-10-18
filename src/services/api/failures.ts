/**
 * User-facing messages for API failures.
 *
 * The UI must never present an auth or entitlement failure as "no fixtures" — that
 * would look like a quiet empty result while the user is actually signed out or
 * unsubscribed. Each case gets an explicit message.
 */
import {
  ApiRequestError,
  PremiumRequiredError,
  SessionExpiredError,
  SignInRequiredError,
} from './client';

export type FailureKind = 'sign-in' | 'session-expired' | 'premium' | 'validation' | 'unavailable' | 'unknown';

export const classifyFailure = (error: unknown): FailureKind => {
  if (error instanceof SignInRequiredError) return 'sign-in';
  if (error instanceof SessionExpiredError) return 'session-expired';
  if (error instanceof PremiumRequiredError) return 'premium';
  if (error instanceof ApiRequestError) {
    if (error.status === 400) return 'validation';
    return 'unavailable';
  }
  return 'unknown';
};

const MESSAGES: Record<FailureKind, string> = {
  'sign-in': 'Sign in to load predictions.',
  'session-expired': 'Your session has expired. Please sign in again.',
  premium: 'An active prediction subscription is required to view this data.',
  validation: 'The selected filters were rejected. Adjust the leagues or date range and try again.',
  unavailable: 'The prediction service is temporarily unavailable. Please try again shortly.',
  unknown: 'Something went wrong while loading data. Please try again.',
};

/** Describe a failure for display, never echoing server or provider detail. */
export const describeFailure = (error: unknown): string =>
  error instanceof Error && error.message && MESSAGES[classifyFailure(error)] === undefined
    ? error.message
    : MESSAGES[classifyFailure(error)];

/** True when retrying the same request cannot help without user action. */
export const requiresUserAction = (error: unknown) => {
  const kind = classifyFailure(error);
  return kind === 'sign-in' || kind === 'session-expired' || kind === 'premium';
};