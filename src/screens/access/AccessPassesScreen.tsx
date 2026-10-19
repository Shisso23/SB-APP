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
    <div className="flex flex-grow flex-col items-center justify-start px-4 pb-16 pt-28 bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-2">Premium access</h1>
      <p className="text-gray-300 mb-6 text-center max-w-xl">
        Premium predictions are unlocked with a time-limited access pass. Passes are sold
        and priced by PredictXI and are not a bet or a guarantee of results.
      </p>

      {accessState === 'active' && (
        <div
          role="status"
          className="w-full max-w-xl mb-6 rounded-md border border-teal-500 bg-teal-900/40 px-4 py-3"
        >
          <p className="font-semibold text-teal-200">Your premium access is active.</p>
          {remaining && <p className="text-sm text-teal-100">{remaining}</p>}
          {expiry && (
            <p className="text-sm text-teal-100">Access ends on {expiry}.</p>
          )}
        </div>
      )}

      {accessState === 'expired' && (
        <div
          role="status"
          className="w-full max-w-xl mb-6 rounded-md border border-ui-gold bg-yellow-900/30 px-4 py-3"
        >
          <p className="font-semibold text-ui-gold">Your premium access has expired.</p>
          {expiry && (
            <p className="text-sm text-yellow-100">
              It ended on {expiry}. Choose a pass below to continue.
            </p>
          )}
        </div>
      )}

      {checkoutError && (
        <p role="alert" className="w-full max-w-xl mb-4 rounded-md bg-red-900/40 px-4 py-3 text-red-100">
          {checkoutError}
        </p>
      )}

      {loading && (
        <p role="status" className="text-gray-300">
          Loading available passes…
        </p>
      )}

      {!loading && loadError && (
        <div className="text-center">
          <p role="alert" className="mb-4 text-red-200">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2 font-semibold text-white"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !loadError && products && products.length === 0 && (
        <div role="status" className="max-w-xl text-center text-gray-300">
          <p className="font-semibold mb-1">No passes are on sale right now.</p>
          <p className="text-sm">Please check back later.</p>
        </div>
      )}

      {!loading && !loadError && products && products.length > 0 && (
        <ul className="w-full max-w-xl flex flex-col gap-4">
          {products.map((product) => (
            <li
              key={product.code}
              className="rounded-lg bg-gray-800 px-5 py-4 shadow-md flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{product.name}</h2>
                  <p className="text-sm text-gray-300">
                    {product.duration_days} {product.duration_days === 1 ? 'day' : 'days'} of access
                  </p>
                </div>
                {/* Price comes straight from the server; only the symbol is applied. */}
                <p className="text-xl font-bold text-ui-gold whitespace-nowrap">
                  {formatPrice(product.price_amount, product.currency)}
                </p>
              </div>

              <ul className="list-disc list-inside text-sm text-gray-300">
                {describeBenefits(product).map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>

              <button
                type="button"
                disabled={startingCode !== null}
                onClick={() => void handleSelect(product)}
                className="self-start rounded bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2 font-semibold text-white disabled:opacity-60"
              >
                {startingCode === product.code ? 'Starting checkout…' : 'Buy this pass'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AccessPassesScreen;