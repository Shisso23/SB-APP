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
import { ReferralPrompt } from '../referrals/ReferralPrompt';

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
 * The authenticated attempt confirms payment, independently of current access.
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
    let latestPurchase: PurchaseStatusResponse | null = null;
    try {
      if (typeof attemptId === 'number') {
        const purchaseResponse = await getPurchaseStatus(attemptId);
        latestPurchase = purchaseResponse.data;
      }
    } finally {
      // Read access after the purchase so a grant confirmed during this check is reflected.
      const meResponse = await getMe();
      setMe(meResponse.data);
      if (latestPurchase) setPurchase(latestPurchase);
    }
    return latestPurchase;
  }, [attemptId]);

  useEffect(() => {
    if (initialising) return;
    cancelledRef.current = false;

    const run = async () => {
      try {
        const first = await refresh();
        if (cancelledRef.current) return;
        setNetworkTrouble(false);

        if (first && (first.status === 'granted' || isTerminalBad(first.status))) {
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
            if (polled && (polled.status === 'granted' || isTerminalBad(polled.status))) break;
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
  const confirmed = purchase?.status === 'granted';
  const finished = confirmed || hint === 'cancelled' || (purchase ? isTerminalBad(purchase.status) : false);
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

  const canGenerate = accessState === 'active';
  const noAttemptWithAccess = canGenerate && attemptId === undefined && hint === 'success';
  if (confirmed || noAttemptWithAccess) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-teal-300 mb-2">{confirmed ? 'Payment confirmed' : 'Premium access is active'}</h1>
        <p className="text-gray-200">{noAttemptWithAccess ? 'We couldn’t verify a payment for this visit.'
          : canGenerate ? 'Your premium access is active.' : 'Your premium access is currently inactive.'}</p>
        {remaining && <p className="mt-1 text-sm text-teal-100">{remaining}</p>}
        {expiry && <p className="text-sm text-teal-100">Access ends on {expiry}.</p>}
        <PrimaryButton onClick={() => navigate(canGenerate ? '/BetAndFixturesScreen' : '/access')}>
          {canGenerate ? 'Generate Predictions' : 'View access passes'}
        </PrimaryButton>
        {confirmed && <ReferralPrompt />}
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
        {canGenerate && <CurrentAccessButton onClick={() => navigate('/BetAndFixturesScreen')} />}
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
          ? 'You can start checkout again whenever you are ready.'
          : 'If you were charged for this purchase, check its status again before starting another checkout.'}
      </p>
      {networkTrouble && (
        <p role="alert" className="mt-3 text-sm text-yellow-200">
          We could not reach the service just now. This does not mean the payment failed -
          please retry.
        </p>
      )}
      <PrimaryButton onClick={() => navigate('/access')}>Back to access passes</PrimaryButton>
      {canGenerate && <CurrentAccessButton onClick={() => navigate('/BetAndFixturesScreen')} />}
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

const CurrentAccessButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="mt-3 block w-full text-sm underline text-teal-300">
    Use your current premium access
  </button>
);

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
