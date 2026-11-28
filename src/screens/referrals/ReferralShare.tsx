import React, { useState } from 'react';

export const referralMessage = (link: string) =>
  `Check out PredictXI! Explore free daily football predictions, past results and data-driven match analysis. Premium access lets you generate your own predictions.\n\nJoin using my link: ${link}`;

export default function ReferralShare({ link }: { link: string }) {
  const [message, setMessage] = useState('');
  const text = referralMessage(link);
  const shareButton = 'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-500 px-4 text-sm font-semibold text-white hover:border-emerald-300';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Referral link copied.');
    } catch {
      setMessage('Select the link above to copy it.');
    }
  };
  const share = async () => {
    try { await navigator.share({ title: 'PredictXI invitation', text }); }
    catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') setMessage('Sharing is unavailable. Copy your link or use WhatsApp.');
    }
  };
  return <div>
    <label className="block text-sm font-semibold text-slate-100">Your referral link
      <input className="mt-1 block min-h-[44px] w-full min-w-0 rounded-lg border border-slate-500 bg-[#0d1626] px-3 text-sm text-white"
        readOnly value={link} onFocus={event => event.target.select()} />
    </label>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="min-h-[44px] rounded-lg bg-emerald-300 px-4 text-sm font-bold text-slate-900 hover:bg-emerald-200" onClick={() => void copy()}>Copy link</button>
      {typeof navigator.share === 'function' && <button type="button" className={shareButton} onClick={() => void share()}>Share</button>}
      <a className={shareButton} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
    </div>
    {message && <p role="status" className="mt-2 text-sm text-emerald-200">{message}</p>}
  </div>;
}
