import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../services/auth/AuthProvider';
import { getMyReferrals, ReferralDashboard } from '../../services/referrals';
import ReferralShare from './ReferralShare';

export function ReferralPrompt() {
  return <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-300/5 p-3 text-sm">
    <p className="font-bold text-white">Earn premium access by inviting friends</p>
    <p className="mt-1 text-slate-300">Get one premium day for each friend who joins through your link and purchases their first eligible pass.</p>
    <Link to="/referrals" className="inline-flex min-h-[44px] items-center font-semibold text-emerald-200 underline underline-offset-4">Refer &amp; Earn</Link>
  </div>;
}

export function HomeReferralCard() {
  const { user } = useAuth();
  return user ? <AccountInvite key={user.uid} /> : null;
}

function AccountInvite() {
  const [referral, setReferral] = useState<ReferralDashboard>();
  useEffect(() => {
    let active = true;
    void getMyReferrals().then(({ data }) => {
      if (active) setReferral(data);
    }).catch(() => {
      // The dedicated referral page includes a retry for unavailable data.
    });
    return () => { active = false; };
  }, []);

  if (referral && !referral.link) return null;

  return <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8" aria-label="Your referral rewards">
    <div className="grid gap-4 rounded-2xl border border-slate-700 bg-[#152136] p-5 sm:grid-cols-2 sm:items-center">
      <div>
        <h2 className="text-xl font-bold">Refer friends. Earn Premium.</h2>
        <p className="mt-1 text-sm text-slate-300">{referral
          ? `${referral.summary.daysEarned} premium ${referral.summary.daysEarned === 1 ? 'day' : 'days'} earned`
          : 'Share your invitation and earn a day for each friend’s first eligible pass.'}</p>
        <Link className="inline-flex min-h-[44px] items-center text-sm font-semibold text-emerald-200 underline underline-offset-4" to="/referrals">View referral rewards</Link>
      </div>
      {referral?.link && <ReferralShare link={referral.link} />}
    </div>
  </section>;
}
