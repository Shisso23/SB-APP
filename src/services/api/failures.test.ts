/**
 * Failure-message tests: auth and entitlement failures must never be presented as
 * empty results, and messages must not echo server detail.
 */
import { ApiRequestError, PremiumRequiredError, SessionExpiredError, SignInRequiredError } from './client';
import { classifyFailure, describeFailure, requiresUserAction } from './failures';

it('classifies each failure kind', () => {
  expect(classifyFailure(new SignInRequiredError())).toBe('sign-in');
  expect(classifyFailure(new SessionExpiredError())).toBe('session-expired');
  expect(classifyFailure(new PremiumRequiredError())).toBe('premium');
  expect(classifyFailure(new ApiRequestError('nope', 400))).toBe('validation');
  expect(classifyFailure(new ApiRequestError('nope', 503))).toBe('unavailable');
  expect(classifyFailure(new Error('unmapped'))).toBe('unknown');
});

it('returns an explicit message for auth and premium failures', () => {
  expect(describeFailure(new SignInRequiredError())).toMatch(/sign in/i);
  expect(describeFailure(new SessionExpiredError())).toMatch(/expired/i);
  expect(describeFailure(new PremiumRequiredError())).toMatch(/subscription/i);
  expect(describeFailure(new ApiRequestError('boom', 400))).toMatch(/filters/i);
  expect(describeFailure(new ApiRequestError('boom', 502))).toMatch(/unavailable/i);
});

it('never echoes internal detail from an unknown error', () => {
  const message = describeFailure(new Error('internal-host-and-stack'));
  expect(message).not.toMatch(/internal-host-and-stack/);
});

it('flags failures that need user action rather than a retry', () => {
  expect(requiresUserAction(new SignInRequiredError())).toBe(true);
  expect(requiresUserAction(new SessionExpiredError())).toBe(true);
  expect(requiresUserAction(new PremiumRequiredError())).toBe(true);
  expect(requiresUserAction(new ApiRequestError('x', 503))).toBe(false);
});

it('distinguishes auth failures from empty results (no silent empty state)', () => {
  // An empty success is not a failure, and a failure must not read as "no fixtures".
  expect(describeFailure(new PremiumRequiredError())).not.toMatch(/no fixtures/i);
  expect(describeFailure(new SignInRequiredError())).not.toMatch(/no fixtures/i);
});