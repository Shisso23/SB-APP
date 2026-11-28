import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../services/auth/AuthProvider';
import { getMyReferrals, ReferralDashboard, referralStatusLabels } from '../../services/referrals';
import ReferralShare from './ReferralShare';

const panel = 'min-w-0 rounded-2xl border border-slate-700 bg-[#152136] p-5 sm:p-6';
const button = 'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-500 px-4 text-sm font-bold hover:border-emerald-300 disabled:opacity-50';

const dateTime = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

export default function ReferralScreen() {
  const { user, initialising } = useAuth();
  return <main className="min-h-screen bg-[#0d1626] px-5 py-9 text-white sm:px-8 sm:py-12">
    <div className="mx-auto max-w-6xl">
      <header className="mb-7 border-b border-slate-700 pb-6">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Refer &amp; Earn</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">Refer friends. Earn Premium.</h1>
        <p className="mt-3 max-w-2xl text-slate-300">Earn one free day of premium access every time a friend joins through your link and purchases their first eligible pass.</p>
      </header>
      {initialising ? <p role="status" className={panel}>Checking your account…</p>
        : user ? <ReferralDashboardView key={user.uid} />
          : <section className={panel}>
            <h2 className="text-xl font-bold">Get your personal link</h2>
            <p className="mb-4 mt-1 text-slate-300">Every customer can share a link and earn premium days. Share the same link with as many friends as you like.</p>
            <div className="flex flex-wrap gap-3">
              <Link to="/referrals#account" className={button}>Sign in</Link>
              <Link to="/referrals?join=1#account" className={button}>Create an account</Link>
            </div>
          </section>}
      <section aria-labelledby="referral-how" className="mt-6">
        <h2 id="referral-how" className="mb-3 text-lg font-bold">How it works</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            ['Share your link', 'Send your personal invitation to someone new to PredictXI.'],
            ['Your friend buys a pass', 'Any eligible paid pass qualifies. Registrations alone do not earn a reward.'],
            ['Get 24 hours of Premium', 'Your day starts automatically or is added to the end of your current access.'],
          ].map(([title, description], index) => <li key={title} className={panel}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-300/10 text-sm font-bold text-emerald-200">{index + 1}</span>
            <h3 className="mt-3 font-bold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-300">{description}</p>
          </li>)}
        </ol>
      </section>
    </div>
  </main>;
}

function ReferralDashboardView() {
  const [page, setPage] = useState(1);
  const [attempt, retry] = useState(0);
  const [data, setData] = useState<ReferralDashboard>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void getMyReferrals(page).then(({ data: response }) => {
      if (active) setData(response);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt, page]);

  return <>
    {loading && <p role="status" className="mb-4 rounded-lg bg-slate-800 p-3 text-sm text-slate-200">Loading referral activity…</p>}
    {error && <div className="mb-4 rounded-lg border border-rose-300/50 bg-rose-900/30 p-4 text-sm">
      <p role="alert">We couldn’t load your referral activity.</p>
      <button type="button" onClick={() => retry(value => value + 1)} className={`${button} mt-2`}>Try again</button>
    </div>}
    {data && <>
      <div className="grid items-stretch gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className={panel} aria-label="Share your invitation">{data.link
          ? <ReferralShare link={data.link} />
          : <p className="text-sm text-slate-200">Referral links are available to customer accounts.</p>}</section>
        <section className={panel} aria-label="Premium access expiry">
          <h2 className="font-bold">Your effective premium access</h2>
          <p className="mt-2 text-sm text-slate-200">{data.accessEndsAt ? `Access ends ${dateTime(data.accessEndsAt)} SAST.`
            : data.link ? 'You have no active premium access.' : 'View your account for current access details.'}</p>
          <Link className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-emerald-300 underline underline-offset-4" to="/access">View passes and current access</Link>
        </section>
      </div>
      <dl className="my-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Registered referrals', data.summary.registered],
          ['Qualifying referrals', data.summary.qualified],
          ['Awaiting first purchase', data.summary.awaiting],
          ['Premium days earned', data.summary.daysEarned],
        ].map(([label, value]) => <div className={panel} key={label}>
          <dt className="text-xs font-semibold text-slate-300 sm:text-sm">{label}</dt><dd className="mt-1 text-3xl font-bold tabular-nums text-emerald-200">{value}</dd>
        </div>)}
      </dl>
      <section className={panel} aria-labelledby="referral-history">
        <h2 id="referral-history" className="text-xl font-bold">Referral reward history</h2>
        {!data.history.length ? <p className="mt-3 text-sm text-slate-300">Your referrals will appear here when friends register through your link.</p>
          : <ul className="mt-3 divide-y divide-slate-700">{data.history.map(entry => <li className="py-3" key={entry.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Friend #{entry.id}</p>
              <span className={`rounded-full border px-2 py-1 text-xs ${entry.status === 'rewarded' ? 'border-emerald-400/40 text-emerald-200' : 'border-slate-500 text-slate-200'}`}>{referralStatusLabels[entry.status]}</span>
            </div>
            <p className="mt-1 text-xs text-slate-300">Registered {dateTime(entry.registeredAt)} SAST</p>
            {entry.reward && <p className="mt-1 text-sm text-slate-200">{entry.status === 'reversed'
              ? `Reward reversed on ${dateTime(entry.reward.reversedAt ?? entry.reward.grantedAt)} SAST.`
              : `1 premium day added on ${dateTime(entry.reward.grantedAt)} SAST. Reward access ends ${dateTime(entry.reward.endsAt)} SAST.`}</p>}
          </li>)}</ul>}
        {data.totalPages > 1 && <nav className="mt-4 flex flex-wrap items-center gap-3" aria-label="Referral history pages">
          <button type="button" className={button} disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</button>
          <span className="text-xs">Page {data.page} of {data.totalPages}</span>
          <button type="button" className={button} disabled={loading || data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>Next</button>
        </nav>}
      </section>
    </>}
  </>;
}
