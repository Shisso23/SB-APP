/**
 * Access-pass purchase flow against the PredictXI Django API.
 *
 * Security rules enforced by this module (and asserted in its tests):
 *  - Checkout sends ONLY a product code. The amount, currency, user id and
 *    every PayFast parameter are built server-side. Nothing trusted is
 *    computed or supplied by the browser.
 *  - `process_url` and `payfast_data` are used verbatim from the server
 *    response. The frontend never invents a PayFast URL or a signature.
 *  - Access is only ever read from `GET /me/` (entitlement truth). A return
 *    redirect is not proof of payment.
 */
import { apiClient, apiGet } from '../api/client';
import type {
  AccessProductsResponse,
  CheckoutResponse,
  MeResponse,
  PurchaseStatusResponse,
} from './types';

const productsEndpoint = '/access/products/';
const checkoutEndpoint = '/access/checkout/';
const purchaseEndpoint = (attemptId: number) => `/access/purchases/${attemptId}/`;
const meEndpoint = '/me/';

/** List the passes the server is currently selling. */
export const getAccessProducts = () => apiGet<AccessProductsResponse>(productsEndpoint);

/**
 * Start a PayFast checkout for one server-priced product.
 *
 * `productCode` is the only input. The `Idempotency-Key` makes a retry of the
 * same click safe: the server returns the SAME attempt and reference rather
 * than creating a second payment.
 */
export const startCheckout = (productCode: string, idempotencyKey: string) =>
  apiClient.post<CheckoutResponse>(
    checkoutEndpoint,
    { product_code: productCode },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );

/** Owner-scoped purchase status. Used for pending/success confirmation. */
export const getPurchaseStatus = (attemptId: number) =>
  apiGet<PurchaseStatusResponse>(purchaseEndpoint(attemptId));

/**
 * Current entitlement, including the access window.
 *
 * This is the ONLY thing that may mark premium access as active. It is read
 * fresh (never cached) after any payment interaction.
 */
export const getMe = () => apiGet<MeResponse>(meEndpoint);

/**
 * Generate a client-side idempotency key.
 *
 * This is not a secret and confers no authority; it only lets the server
 * collapse a double click into one attempt.
 */
export const newIdempotencyKey = (): string => {
  const random = Math.random().toString(36).slice(2);
  return `pxi-${Date.now().toString(36)}-${random}`;
};

/** True when the current entitlement window has a future end date. */
export const isAccessActive = (me: MeResponse | null): boolean =>
  Boolean(me?.has_prediction_access && me.prediction_access_ends_at);

/** Classify entitlement state for the UI. */
export const accessStateOf = (me: MeResponse | null): 'active' | 'expired' | 'none' => {
  if (!me) return 'none';
  if (isAccessActive(me)) return 'active';
  // An end date in the past means the customer did have access and it lapsed,
  // which is a different message from "never purchased".
  if (me.prediction_access_ends_at) return 'expired';
  return 'none';
};

/** Human-readable remaining time, or null when there is no active access. */
export const describeRemaining = (me: MeResponse | null, now: Date = new Date()): string | null => {
  if (!isAccessActive(me) || !me?.prediction_access_ends_at) return null;
  const endsAt = new Date(me.prediction_access_ends_at).getTime();
  const ms = endsAt - now.getTime();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return days === 1 ? '1 day remaining' : `${days} days remaining`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return hours === 1 ? '1 hour remaining' : `${hours} hours remaining`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return minutes === 1 ? '1 minute remaining' : `${minutes} minutes remaining`;
};

/** Format an ISO timestamp for display, or null when absent/invalid. */
export const formatExpiry = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

/**
 * Format a server price for display without inventing or recomputing it.
 *
 * The amount string comes straight from the server; only the currency symbol
 * is applied here. Falls back to the raw string for an unknown currency.
 */
export const formatPrice = (price: string, currency: string): string => {
  const symbols: Record<string, string> = { ZAR: 'R' };
  const symbol = symbols[currency.toUpperCase()];
  return symbol ? `${symbol}${price}` : `${price} ${currency.toUpperCase()}`;
};

/**
 * Derive benefit lines from server-provided product facts only.
 *
 * Deliberately makes no marketing or performance claims - it restates the
 * duration and scope that the backend already declared.
 */
export const describeBenefits = (product: { duration_days: number }): string[] => {
  const days = product.duration_days;
  return [
    `Full access for ${days} ${days === 1 ? 'day' : 'days'}`,
    'All premium predictions and markets',
    'Access ends automatically when the pass expires',
  ];
};