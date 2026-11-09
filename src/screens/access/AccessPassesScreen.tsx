import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { classifyFailure, describeFailure } from '../../services/api/failures';
import {
  accessStateOf,
  describeBenefits,
  describeRemaining,
  formatExpiry,
  formatPrice,
  getAccessProducts,
  getMe,
  newIdempotencyKey,
  startCheckout,
} from '../../services/access';
import type { AccessProduct, AccessState, MeResponse } from '../../services/access/types';

/**
 * Access-pass selection screen.
 *
 * Presents whatever the backend is currently selling. No price, duration or
 * benefit is authored here - all of it is server-owned, so changing a product
 * is a data change, not a frontend release.
 *
 * This screen never grants access. Selecting a pass only starts a server-side
 * checkout; entitlement is decided later by the verified PayFast notification
 * and read back from `/me/`.
 */
const AccessPassesScreen: React.FC = () => {
  const navigate = useNavigate();

  const [products, setProducts] = useState<AccessProduct[] | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [startingCode, setStartingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Entitlement is read alongside the catalogue so the screen can show
      // "you already have access" instead of pushing another purchase.
      const [productsResponse, meResponse] = await Promise.all([getAccessProducts(), getMe()]);
      setProducts(productsResponse.data.products ?? []);
      setMe(meResponse.data);
    } catch (error) {
      setLoadError(describeFailure(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelect = useCallback(
    async (product: AccessProduct) => {
      setCheckoutError(null);
      setStartingCode(product.code);
      try {
        const response = await startCheckout(product.code, newIdempotencyKey());
        // Hand the SERVER's payload to the redirect screen. Nothing is
        // recomputed or added client-side.
        navigate('/access/checkout', {
          state: { checkout: response.data, productName: product.name },
        });
      } catch (error) {
        // 403 here means the session lost premium entitlement context; both
        // are recoverable by signing in / retrying, so never claim payment
        // failed on a network or auth error.
        const kind = classifyFailure(error);
        setCheckoutError(
          kind === 'sign-in' || kind === 'session-expired'
            ? describeFailure(error)
            : 'We could not start checkout. Please try again.',
        );
        setStartingCode(null);
      }
    },
    [navigate],
  );

  const accessState: AccessState = accessStateOf(me);
  const remaining = describeRemaining(me);
  const expiry = formatExpiry(me?.prediction_access_ends_at);

  return (
    <div className="flex flex-grow flex-col items-center justify-start bg-slate-50 px-4 pb-16 pt-10 text-slate-900">
      <div className="w-full max-w-4xl">
        <header className="mb-8 text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
            Membership
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
            Premium access
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Premium predictions are unlocked with a time-limited access pass.
            Passes are sold and priced by PredictXI and are not a bet or a
            guarantee of results.
          </p>
        </header>

        {accessState === 'active' && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-teal-300 bg-teal-50 px-5 py-4"
          >
            <p className="font-semibold text-teal-900">
              Your premium access is active.
            </p>
            {remaining && <p className="text-sm text-teal-800">{remaining}</p>}
            {expiry && (
              <p className="text-sm text-teal-800">Access ends on {expiry}.</p>
            )}
          </div>
        )}

        {accessState === 'expired' && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4"
          >
            <p className="font-semibold text-amber-900">
              Your premium access has expired.
            </p>
            {expiry && (
              <p className="text-sm text-amber-800">
                It ended on {expiry}. Choose a pass below to continue.
              </p>
            )}
          </div>
        )}

        {checkoutError && (
          <p
            role="alert"
            className="mb-4 rounded-xl bg-red-50 px-5 py-4 text-red-800"
          >
            {checkoutError}
          </p>
        )}

        {loading && (
          <p role="status" className="text-center text-slate-600">
            Loading available passes…
          </p>
        )}

        {!loading && loadError && (
          <div className="text-center">
            <p role="alert" className="mb-4 text-red-700">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-slate-900 px-5 py-2 font-semibold text-white transition hover:bg-slate-800"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && products && products.length === 0 && (
          <div role="status" className="mx-auto max-w-xl text-center text-slate-600">
            <p className="mb-1 font-semibold text-slate-800">
              No passes are on sale right now.
            </p>
            <p className="text-sm">Please check back later.</p>
          </div>
        )}

        {!loading && !loadError && products && products.length > 0 && (
          <ul className="mx-auto grid w-full max-w-3xl list-none grid-cols-1 gap-5 sm:grid-cols-2">
            {products.map((product) => (
              <li
                key={product.code}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {product.name}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {product.duration_days}{" "}
                      {product.duration_days === 1 ? "day" : "days"} of access
                    </p>
                  </div>
                  {/* Price comes straight from the server; only the symbol is applied. */}
                  <p className="whitespace-nowrap text-2xl font-extrabold tracking-tight text-slate-900">
                    {formatPrice(product.price_amount, product.currency)}
                  </p>
                </div>

                <ul className="flex-1 space-y-2.5 text-sm text-slate-700">
                  {describeBenefits(product).map((benefit) => (
                    <li key={benefit} className="flex gap-3">
                      <span className="mt-0.5 text-teal-600">✓</span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={startingCode !== null}
                  onClick={() => void handleSelect(product)}
                  className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {startingCode === product.code
                    ? "Starting checkout…"
                    : "Get this pass"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* How passes work — always shown, including when signed out, when the
            catalogue is empty, or when loading failed. Understanding the terms
            should not depend on a successful API call. */}
        <section className="mx-auto mt-12 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-bold text-slate-900">
            How passes work
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="mt-0.5 text-teal-600">✓</span>
              <span>
                Access begins the moment your payment is confirmed, not when
                you next sign in.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 text-teal-600">✓</span>
              <span>
                Passes do <strong className="font-semibold">not</strong>{" "}
                auto-renew. A pass ends at the end of its term and nothing
                further is charged.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 text-teal-600">✓</span>
              <span>
                Buying another pass while yours is still active extends it —
                your remaining time is not lost.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 text-teal-600">✓</span>
              <span>
                Payment is handled by PayFast. PredictXI never sees or stores
                your card details.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default AccessPassesScreen;