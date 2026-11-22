/**
 * Access-pass types for the PredictXI Django API.
 *
 * Every value here comes from the server. Prices, durations and currency are
 * NEVER authored in the frontend: this file only describes their shape.
 */

/** One purchasable pass, as configured server-side in `AccessProduct`. */
export interface AccessProduct {
  code: string;
  name: string;
  /** Decimal string, e.g. "99.00". Never parsed into a float for authority. */
  price_amount: string;
  currency: string;
  duration_days: number;
}

export interface AccessProductsResponse {
  products: AccessProduct[];
}

/**
 * The signed PayFast checkout payload, exactly as the backend builds it.
 *
 * The browser only *submits* these fields. It never computes or verifies the
 * signature, and it never sees the merchant passphrase - that stays server-side.
 * `merchant_key` identifies the account but cannot authorise a payment alone.
 */
export interface PayFastCheckoutFields {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  name_first: string;
  name_last: string;
  email_address: string;
  m_payment_id: string;
  amount: string;
  item_name: string;
  item_description: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_int1?: number;
  signature: string;
  [key: string]: string | number | undefined;
}

export interface CheckoutResponse {
  attempt_id: number;
  status: string;
  amount: string;
  currency: string;
  process_url: string;
  payfast_data: PayFastCheckoutFields;
}

/** Server-side purchase states. Mirrors `PurchaseAttempt.Status`. */
export type PurchaseStatus =
  | 'created'
  | 'pending'
  | 'provider_confirmed'
  | 'granted'
  | 'declined'
  | 'expired'
  | 'refunded'
  | 'needs_review';

/** Owner-scoped purchase status; another user's attempt is simply absent. */
export interface PurchaseStatusResponse {
  id: number;
  product_code: string;
  provider: string;
  status: PurchaseStatus;
  amount_expected: string;
  amount_confirmed: string | null;
  currency: string;
  provider_reference: string | null;
  failure_code: string;
  created_at: string;
  updated_at: string;
  access_starts_at: string | null;
  access_ends_at: string | null;
}

/** Entitlement truth from `GET /me/`. The only source of "access is active". */
export interface MeResponse {
  id: number;
  firebase_uid: string;
  has_prediction_access: boolean;
  prediction_access_starts_at: string | null;
  prediction_access_ends_at: string | null;
}

/** How the result screen should present an entitlement. */
export type AccessState = 'active' | 'expired' | 'none';