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
  newIdempotencyKey,
  startCheckout,
} from './index';

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