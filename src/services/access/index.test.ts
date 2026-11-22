/**
 * Service-level tests for the access API module.
 *
 * Asserts the request shapes sent to Django and the entitlement helpers, with
 * no component rendering involved.
 */
jest.mock('../api/client', () => ({
  __esModule: true,
  apiGet: jest.fn(),
  apiClient: { post: jest.fn() },
}));

import { apiClient, apiGet } from '../api/client';
import {
  accessStateOf,
  describeBenefits,
  describeRemaining,
  formatPrice,
  isAccessActive,
  predictionHorizonOf,
  newIdempotencyKey,
  startCheckout,
} from './index';
import { MeResponse } from './types';

const get = apiGet as jest.Mock;
const post = (apiClient as unknown as { post: jest.Mock }).post;

beforeEach(() => {
  jest.clearAllMocks();
});

it('starts checkout with only the product code and an idempotency header', async () => {
  post.mockResolvedValue({ data: { attempt_id: 1 } });
  await startCheckout('pxi-30d', 'key-123');

  expect(post).toHaveBeenCalledTimes(1);
  const [url, body, config] = post.mock.calls[0];
  expect(url).toBe('/access/checkout/');
  // Only the product code is sent; no amount, currency, or user id.
  expect(body).toEqual({ product_code: 'pxi-30d' });
  expect(config.headers['Idempotency-Key']).toBe('key-123');
});

it('generates distinct idempotency keys', () => {
  expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
});

it('classifies entitlement states', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  expect(accessStateOf(null)).toBe('none');
  expect(accessStateOf({ has_prediction_access: false, prediction_access_ends_at: null } as never)).toBe('none');
  expect(accessStateOf({ has_prediction_access: false, prediction_access_ends_at: '2020-01-01' } as never)).toBe('expired');
  expect(accessStateOf({ has_prediction_access: true, prediction_access_ends_at: future } as never)).toBe('active');
});

it('requires both the flag and an end date to consider access active', () => {
  expect(isAccessActive(null)).toBe(false);
  expect(isAccessActive({ has_prediction_access: true, prediction_access_ends_at: null } as never)).toBe(false);
  expect(isAccessActive({ has_prediction_access: false, prediction_access_ends_at: '2099-01-01' } as never)).toBe(false);
});

const grantStart = Date.UTC(2026, 10, 22, 8);
const oneDayMe: MeResponse = {
  id: 1, firebase_uid: 'test-user', is_admin: false, has_prediction_access: true,
  prediction_access_starts_at: new Date(grantStart).toISOString(),
  prediction_access_ends_at: new Date(grantStart + 86_400_000).toISOString(),
  prediction_horizon_ends_at: new Date(grantStart + 86_400_000).toISOString(),
};

it('keeps a one-day pass anchored to activation and expires it without a fresh me request', () => {
  const later = grantStart + 12 * 3_600_000;
  expect(predictionHorizonOf(oneDayMe, later)).toBe(grantStart + 86_400_000);
  expect(isAccessActive(oneDayMe, later)).toBe(true);
  const expiry = grantStart + 86_400_000;
  expect(isAccessActive(oneDayMe, expiry)).toBe(false);
  expect(predictionHorizonOf(oneDayMe, expiry + 1)).toBe(expiry + 1);
});

it('caps longer memberships at seven days and honors an earlier server cutoff', () => {
  const longExpiry = new Date(grantStart + 30 * 86_400_000).toISOString();
  const longMe = { ...oneDayMe, prediction_access_ends_at: longExpiry, prediction_horizon_ends_at: longExpiry };
  expect(predictionHorizonOf(longMe, grantStart)).toBe(grantStart + 7 * 86_400_000);
  expect(predictionHorizonOf({ ...longMe, prediction_horizon_ends_at: oneDayMe.prediction_horizon_ends_at }, grantStart))
    .toBe(grantStart + 86_400_000);
  expect(predictionHorizonOf({ ...longMe, prediction_horizon_ends_at: 'invalid' }, grantStart)).toBe(grantStart);
  expect(predictionHorizonOf(null, grantStart)).toBe(grantStart);
});

it('reserves unlimited prediction dates for server-confirmed admins', () => {
  expect(predictionHorizonOf({ ...oneDayMe, is_admin: true, prediction_horizon_ends_at: null }, grantStart)).toBeNull();
  expect(predictionHorizonOf({ ...oneDayMe, prediction_horizon_ends_at: null }, grantStart)).toBe(grantStart + 86_400_000);
});

it('describes remaining time only when active', () => {
  const inDays = new Date(Date.now() + 5 * 86_400_000).toISOString();
  expect(describeRemaining(null)).toBeNull();
  expect(describeRemaining({ has_prediction_access: true, prediction_access_ends_at: inDays } as never)).toMatch(/days remaining/);
});

it('formats a server price without recomputing the amount', () => {
  expect(formatPrice('99.00', 'ZAR')).toBe('R99.00');
  expect(formatPrice('99.00', 'USD')).toBe('99.00 USD');
});

it('derives benefits from duration without making performance claims', () => {
  const benefits = describeBenefits({ duration_days: 30 });
  expect(benefits[0]).toBe('Full access for 30 days');
  expect(benefits.join(' ')).not.toMatch(/guarantee|win|profit/i);
});