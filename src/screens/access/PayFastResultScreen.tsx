import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  accessStateOf,
  clearCheckoutAttempt,
  describeRemaining,
  formatExpiry,
  getMe,
  getPurchaseStatus,
  readCheckoutAttempt,
} from '../../services/access';
import { useAuth } from '../../services/auth/AuthProvider';
import type { MeResponse, PurchaseStatus, PurchaseStatusResponse } from '../../services/access/types';

/**
 * Payment result screen.
 *
 * THE RULE THIS SCREEN ENFORCES: a return URL is not proof of payment.
 *
 * PayFast sends the customer back to `/api/v1/payments/payfast/return/`, which
 * redirects here with `?status=success`. That parameter is a *hint* about where
 * the browser went, not evidence that money moved - anyone can type the URL.
 * The authoritative answer comes from two authenticated reads:
 *
 *   1. `GET /me/`              - is premium access actually active right now?
 *   2. `GET /access/purchases/{id}/` - what state is the attempt in?
 *
 * Until `/me/` reports active access, this screen never claims success.
 *
 * Pending is handled by *bounded* polling: a few attempts with a delay between
 * them. It never polls forever, and a network error is shown as "still
 * confirming", never as "payment failed".
 */

const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 3000;

type ResultKind = 'success' | 'pending' | 'failed' | 'cancelled';

const hintFromSearch = (search: string): ResultKind => {
  const status = new URLSearchParams(search).get('status');
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  if (status === 'pending') return 'pending';
  return 'success';
};

const isTerminalBad = (status: PurchaseStatus): boolean =>
  status === 'declined' || status === 'expired' || status === 'refunded';

const PayFastResultScreen: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { initialising } = useAuth();

  const hint = hintFromSearch(location.search);
  // The attempt comes from router state, or from this tab's session after the
  // full-page PayFast redirect. It is optional: `/me/` alone decides access.
  const initialState = location.state as { attemptId?: number } | null;
  const [attemptId] = useState(() => initialState?.attemptId ?? readCheckoutAttempt() ?? undefined);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [purchase, setPurchase] = useState<PurchaseStatusResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [polling, setPolling] = useState(false);
  const [networkTrouble, setNetworkTrouble] = useState(false);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    // Entitlement is the authority and is always read.
    const meResponse = await getMe();
    setMe(meResponse.data);
    let latestPurchase: PurchaseStatusResponse | null = null;
    if (typeof attemptId === 'number') {
      const purchaseResponse = await getPurchaseStatus(attemptId);
      latestPurchase = purchaseResponse.data;
      setPurchase(purchaseResponse.data);
    }
    return { me: meResponse.data, purchase: latestPurchase };
  }, [attemptId]);

  useEffect(() => {
    if (initialising) return;
    cancelledRef.current = false;

    const run = async () => {
      try {
        const first = await refresh();
        if (cancelledRef.current) return;
        setNetworkTrouble(false);

        if (accessStateOf(first.me) === 'active') {
          setChecking(false);
          return;
        }

        // Not active yet. If the server already says the attempt is
        // definitively bad, stop immediately - do not poll for a payment that
        // will not arrive.
        if (first.purchase && isTerminalBad(first.purchase.status)) {
          setChecking(false);
          return;
        }

        if (hint === 'cancelled' || hint === 'failed') {
          setChecking(false);
          return;
        }

        // Only poll when a payment could still be settling: an attempt exists
        // and is not in a terminal-bad state. Without an attempt id there is
        // nothing to poll, so show the unconfirmed state.
        if (typeof attemptId !== 'number') {
          setChecking(false);
          return;
        }

        setChecking(false);
        setPolling(true);
        for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          if (cancelledRef.current) return;
          try {
            const polled = await refresh();
            if (cancelledRef.current) return;
            setNetworkTrouble(false);
            if (accessStateOf(polled.me) === 'active') break;
            if (polled.purchase && isTerminalBad(polled.purchase.status)) break;
          } catch {
            // A transient error is NOT a failed payment. Keep the last known
            // state and let the customer retry manually.
            setNetworkTrouble(true);
          }
        }
        if (!cancelledRef.current) setPolling(false);
      } catch {
        if (!cancelledRef.current) {
          setNetworkTrouble(true);
          setChecking(false);
        }
      }
    };

    void run();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh, hint, initialising]);

  const accessState = accessStateOf(me);
  const finished = accessState === 'active' || hint === 'cancelled' || (purchase ? isTerminalBad(purchase.status) : false);
  useEffect(() => {
    if (finished) clearCheckoutAttempt();
  }, [finished]);
  const remaining = describeRemaining(me);
  const expiry = formatExpiry(me?.prediction_access_ends_at);

  const retry = useCallback(async () => {
    setNetworkTrouble(false);
    setPolling(true);
    try {
      await refresh();
      setNetworkTrouble(false);
    } catch {
      setNetworkTrouble(true);
    } finally {
      setPolling(false);
    }
  }, [refresh]);

  if (checking) {
    return (
      <Shell>
        <p role="status" className="text-gray-300">
          Confirming your payment…
        </p>
      </Shell>
    );
  }

  // Access is active: the ONLY condition under which we say so.
  if (accessState === 'active') {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-teal-300 mb-2">Payment confirmed</h1>
        <p className="text-gray-200">Your premium access is now active.</p>
        {remaining && <p className="mt-1 text-sm text-teal-100">{remaining}</p>}
        {expiry && <p className="text-sm text-teal-100">Access ends on {expiry}.</p>}
        <PrimaryButton onClick={() => navigate('/BetAndFixturesScreen')}>Generate Predictions</PrimaryButton>
      </Shell>
    );
  }

  if (polling) {
    return (
      <Shell>
        <h1 className="text-xl font-bold mb-2">Still confirming your payment…</h1>
        <p className="text-gray-300">
          PayFast is finalising the transaction. This can take a moment.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          You can safely leave this page - access activates as soon as the payment is verified.
        </p>
        <PrimaryButton onClick={() => void retry()}>Refresh status</PrimaryButton>
        <button
          type="button"
          onClick={() => navigate('/history')}
          className="mt-3 block w-full text-sm underline text-gray-300"
        >
          Explore free results
        </button>
      </Shell>
    );
  }

  // Cancelled, failed, or not-active-after-polling.
  const badStatus = purchase ? isTerminalBad(purchase.status) : false;
  const heading =
    hint === 'cancelled'
      ? 'Checkout cancelled'
      : badStatus || hint === 'failed'
        ? 'Payment was not completed'
        : 'We could not confirm your payment';

  return (
    <Shell>
      <h1 className="text-xl font-bold mb-2">{heading}</h1>
      <p className="text-gray-300">
        {hint === 'cancelled'
          ? 'No payment was taken. You can start again whenever you are ready.'
          : 'Your access is not active. If money left your account, it will be reconciled and access granted automatically.'}
      </p>
      {networkTrouble && (
        <p role="alert" className="mt-3 text-sm text-yellow-200">
          We could not reach the service just now. This does not mean the payment failed -
          please retry.
        </p>
      )}
      <PrimaryButton onClick={() => navigate('/access')}>Back to access passes</PrimaryButton>
      <button
        type="button"
        onClick={() => void retry()}
        className="mt-3 text-sm underline text-teal-300"
      >
        Check again
      </button>
      <button
        type="button"
        onClick={() => navigate('/history')}
        className="mt-3 block w-full text-sm underline text-gray-300"
      >
        Explore free results
      </button>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="flex min-h-screen items-start justify-center bg-[#0d1626] px-4 py-12 text-white sm:py-20">
    <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#152136] px-6 py-8 text-center">
      {children}
    </div>
  </main>
);

const PrimaryButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-5 min-h-[44px] rounded-lg bg-emerald-300 px-5 py-2 font-bold text-slate-900 hover:bg-emerald-200"
  >
    {children}
  </button>
);

export default PayFastResultScreen;