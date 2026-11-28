import React, { useEffect, useState } from 'react';

export const PredictionLoader: React.FC<{
  leagueCount: number;
  statistical: boolean;
  hasPreviousForecasts: boolean;
}> = ({ leagueCount, statistical, hasPreviousForecasts }) => {
  const [takingLonger, setTakingLonger] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 60_000);
    return () => window.clearTimeout(timer);
  }, []);
  const message = statistical ? 'Loading match data and published probabilities…' : 'Loading match data and preparing rule-based forecasts…';

  return (
    <section aria-label="Prediction loading" className="rounded-2xl border border-emerald-300/40 bg-[#152136] p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 rounded-full border-2 border-emerald-300/25 border-t-emerald-300 motion-safe:animate-spin" />
        <div>
          <h3 className="font-bold text-white">Preparing your predictions</h3>
          <p role="status" aria-label="Prediction progress" className="mt-1 text-sm text-emerald-200">{message}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {leagueCount} selected {leagueCount === 1 ? 'league' : 'leagues'}. {takingLonger
              ? 'Still working. Some requests take longer depending on data availability.'
              : 'This usually takes about a minute.'}
          </p>
          {hasPreviousForecasts && <p className="mt-2 text-sm text-slate-300">Your previous forecasts remain below.</p>}
        </div>
      </div>
    </section>
  );
};

export const WorkspaceRestoreLoader: React.FC<{ checkingAccess: boolean }> = ({ checkingAccess }) => (
  <div role="status" aria-label="Prediction workspace loading"
    className="flex items-start gap-3 rounded-2xl border border-emerald-300/30 bg-[#152136] px-4 py-4 sm:px-5">
    <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-emerald-300/25 border-t-emerald-300 motion-safe:animate-spin" />
    <div>
      <p className="font-bold text-white">Restoring saved forecasts…</p>
      <p className="mt-1 text-sm text-slate-300">{checkingAccess
        ? 'Checking your session and prediction access.'
        : 'Loading the saved leagues, dates and match forecasts from your account.'}</p>
    </div>
  </div>
);
