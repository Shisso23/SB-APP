import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../services/auth/AuthProvider';
import { captureReferral } from '../../services/referrals';
import { getReferralTicket, saveFirstReferral } from '../../services/referrals/attribution';

type State = 'checking' | 'captured' | 'invalid' | 'error';

export default function ReferralLanding() {
  const { code = '' } = useParams();
  const { initialising, user } = useAuth();
  const [resolution, setResolution] = useState<{ code: string; state: State }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initialising || user) return;
    let active = true;
    if (getReferralTicket()) {
      setResolution({ code, state: 'captured' });
    } else {
      void captureReferral(code).then(({ data }) => {
        if (!active) return;
        if (data.valid) saveFirstReferral(data.ticket, data.expiresIn);
        setResolution({ code, state: data.valid ? 'captured' : 'invalid' });
      }).catch(() => {
        if (active) setResolution({ code, state: 'error' });
      });
    }
    return () => { active = false; };
  }, [attempt, code, initialising, user]);

  const state = resolution?.code === code ? resolution.state : 'checking';
  return <main className="min-h-screen bg-[#0d1626] px-5 py-16 text-white">
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-700 bg-[#152136] p-6 sm:p-10">
      <p className="mb-3 text-sm font-bold text-emerald-300">PredictXI invitation</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Explore football predictions</h1>
      <p className="mt-3 text-slate-200">Browse free daily picks and past results, or choose a pass to generate your own predictions.</p>
      {initialising || !user && state === 'checking'
        ? <p role="status" className="mt-5 text-sm text-slate-300">Checking your invitation…</p>
        : <>
          {user && <p className="mt-5 text-sm text-slate-300">You already have an account. You can share your own invitation from Refer &amp; Earn.</p>}
          {!user && state === 'captured' && <p className="mt-5 rounded-lg bg-emerald-300/10 p-3 text-sm text-emerald-100">Invitation saved. Your friend earns a premium day when you buy your first pass.</p>}
          {!user && state === 'invalid' && <p role="status" className="mt-5 text-sm text-amber-200">This invitation is unavailable. You can still create an account.</p>}
          {!user && state === 'error' && <div className="mt-5 text-sm text-amber-100">
            <p role="alert">We couldn’t check this invitation. Retry or continue creating an account.</p>
            <button className="min-h-[44px] font-semibold underline" type="button" onClick={() => { setResolution(undefined); setAttempt(value => value + 1); }}>Retry invitation</button>
          </div>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-[44px] items-center rounded-lg bg-emerald-300 px-4 font-bold text-slate-900" to={user ? '/referrals' : '/?join=1#account'}>
              {user ? 'Open Refer & Earn' : 'Create an account'}
            </Link>
            <Link className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-500 px-4 font-semibold" to="/history">Explore free picks</Link>
          </div>
        </>}
    </section>
  </main>;
}
