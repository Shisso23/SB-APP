import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { classifyFailure, describeFailure } from '../../services/api/failures';
import { useAuth } from '../../services/auth/AuthProvider';
import {
  accessStateOf,
  describeRemaining,
  formatPrice,
  getAccessProducts,
  getMe,
  newIdempotencyKey,
  startCheckout,
} from '../../services/access';
import type { AccessProduct, MeResponse } from '../../services/access/types';

const action = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-emerald-200 disabled:opacity-50';
const terms = [
  ['Payment confirmation', 'Access starts once PayFast confirms your payment.'],
  ['One payment per pass', 'Your pass ends automatically at expiry. There are no recurring charges.'],
  ['Extend or renew anytime', 'Buy another pass before expiry to add time to your current access, or choose one after expiry to start again.'],
];

const formatAccessExpiry = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Johannesburg',
  }).format(date);
};

interface AccessPageData {
  products: AccessProduct[] | null;
  me: MeResponse | null;
  error: string | null;
}

const AccessPassesScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, initialising } = useAuth();
  const uid = user?.uid;
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<AccessPageData & { uid: string; attempt: number }>();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [startingCode, setStartingCode] = useState<string | null>(null);

  useEffect(() => {
    if (initialising || !uid) return;
    let active = true;
    void Promise.allSettled([getAccessProducts(), getMe()]).then(([products, me]) => {
      if (!active) return;
      const error = products.status === 'rejected' ? products.reason : me.status === 'rejected' ? me.reason : null;
      const sessionRequired = ['sign-in', 'session-expired'].includes(classifyFailure(error));
      setPage({
        uid,
        attempt,
        products: products.status === 'fulfilled' ? products.value.data.products ?? [] : null,
        me: me.status === 'fulfilled' ? me.value.data : null,
        error: sessionRequired ? 'Please sign in again to view access passes.' :
          error ? 'We could not load all your premium access information.' : null,
      });
    });
    return () => { active = false; };
  }, [initialising, uid, attempt]);

  const handleSelect = async (product: AccessProduct) => {
    setCheckoutError(null);
    setStartingCode(product.code);
    try {
      const response = await startCheckout(product.code, newIdempotencyKey());
      navigate('/access/checkout', {
        state: { checkout: response.data, productName: product.name },
      });
    } catch (error) {
      const kind = classifyFailure(error);
      setCheckoutError(kind === 'sign-in' || kind === 'session-expired'
        ? describeFailure(error) : 'We could not start checkout. Please try again.');
      setStartingCode(null);
    }
  };

  const data = uid && page?.uid === uid && page.attempt === attempt ? page : null;
  const me = data?.me ?? null;
  const accessState = accessStateOf(me);
  const remaining = describeRemaining(me);
  const expiry = formatAccessExpiry(me?.prediction_access_ends_at);

  return (
    <main className="min-h-screen bg-[#0d1626] text-white">
      <header className="border-b border-slate-700">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Premium access</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">Unlock your own football predictions</h1>
          <p className="mt-4 max-w-2xl text-slate-300">Choose the leagues you follow, generate a personalised shortlist and explore match probabilities, team form and detailed analysis.</p>
          <Link to="/history" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-emerald-300 underline underline-offset-4">Explore free daily picks and results</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl items-start gap-5 px-5 py-7 sm:px-8 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="access-passes" className="min-w-0 rounded-2xl border border-slate-700 bg-[#152136] p-5 sm:p-7">
          {accessState === 'active' && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300/40 bg-emerald-300/10 p-4">
              <div role="status">
                <p className="font-bold text-emerald-200">Your premium access is active.</p>
                {expiry && <p className="mt-1 text-sm text-slate-100">Access ends on <time dateTime={me?.prediction_access_ends_at ?? undefined}>{expiry} SAST</time>.</p>}
                {remaining && <p className="text-sm text-slate-300">{remaining}</p>}
              </div>
              <Link to="/BetAndFixturesScreen" className={action}>Generate Predictions <span aria-hidden="true">↗</span></Link>
            </div>
          )}

          <h2 id="access-passes" className="text-xl font-bold tracking-tight">{accessState === 'active' ? 'Extend your access' : 'Choose an access pass'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">Every pass includes the same prediction tools for its full duration.</p>

          {accessState === 'expired' && (
            <div role="status" className="mt-4 rounded-xl border border-amber-300/40 bg-amber-400/10 p-4 text-sm text-amber-100">
              <p className="font-semibold">Your premium access has expired.</p>
              <p className="mt-1">{expiry && `It ended on ${expiry} SAST. `}Choose a pass to continue generating predictions.</p>
            </div>
          )}

          {initialising || (uid && !data) ? (
            <p role="status" className="mt-5 text-sm text-slate-300">Loading available passes…</p>
          ) : !uid ? (
            <div className="mt-5 rounded-xl border border-slate-600 bg-[#0d1626] p-4">
              <p className="mb-3 text-sm text-slate-200">Sign in to view available passes and buy one for your account.</p>
              <Link to="#account" className={action}>Sign in to view passes</Link>
            </div>
          ) : (
            <>
              {data?.error && (
                <div className="mt-4 rounded-xl border border-amber-300/40 p-4">
                  <p role="alert" className="text-sm text-amber-100">{data.error}</p>
                  <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-2 min-h-[44px] text-sm font-semibold text-emerald-300 underline underline-offset-4">Try again</button>
                </div>
              )}
              {checkoutError && <p role="alert" className="mt-4 rounded-xl border border-rose-300/40 bg-rose-400/10 p-4 text-sm text-rose-100">{checkoutError}</p>}

              {data?.products?.length === 0 && (
                <p role="status" className="mt-5 text-sm text-slate-300">No passes are on sale right now.</p>
              )}
              {data?.products && data.products.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-700">
                  {data.products.map(product => (
                    <li key={product.code} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
                      <div className="flex min-w-0 flex-[1_1_13rem] items-center gap-3">
                        <svg aria-hidden="true" className="h-9 w-9 shrink-0 rounded-lg bg-emerald-300/10 p-2 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" />
                        </svg>
                        <div className="min-w-0 break-words">
                          <h3 className="font-bold">{product.name}</h3>
                          <p className="text-sm text-slate-300">{product.duration_days} {product.duration_days === 1 ? 'day' : 'days'} of access</p>
                        </div>
                      </div>
                      <div className="flex flex-[1_1_auto] flex-wrap items-center justify-between gap-3 sm:flex-initial">
                        <p className="text-lg font-extrabold tabular-nums">{formatPrice(product.price_amount, product.currency)}</p>
                        <button type="button" aria-label={startingCode === product.code ? `Starting checkout for ${product.name}` : `Choose ${product.name}`}
                          disabled={startingCode !== null} onClick={() => void handleSelect(product)} className={action}>
                          {startingCode === product.code ? 'Starting checkout…' : 'Choose pass'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <aside aria-labelledby="pass-terms" className="rounded-2xl border border-slate-700 bg-[#152136] p-5 sm:p-7">
          <h2 id="pass-terms" className="text-xl font-bold tracking-tight">How passes work</h2>
          <dl className="mt-4 space-y-4 text-sm">
            {terms.map(([label, description]) => (
              <div key={label}>
                <dt className="font-bold text-slate-100">{label}</dt>
                <dd className="mt-1 leading-relaxed text-slate-300">{description}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t border-slate-700 pt-4 text-sm font-semibold text-emerald-300"><span aria-hidden="true">✓ </span> Secure checkout with PayFast</p>
        </aside>
      </div>
    </main>
  );
};

export default AccessPassesScreen;
