import { marketDisplayLabel } from '../../services/predictions/market-label';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { BRAND_NAME, BRAND_TAGLINE } from '../../assets/brand';
import { getOfficialPreview } from '../../services/official';
import { formatBusinessDate, formatProbability } from '../../services/official/presentation';
import type { OfficialPreviewResponse } from '../../services/official/types';
import './home.css';

const steps = [
  { title: 'Read the match data', detail: 'Recent results, goals, home and away form, and league standings give each fixture context.', icon: 'M4 6h16M4 12h16M4 18h10' },
  { title: 'Estimate the probabilities', detail: 'The statistical model estimates how likely different match outcomes are.', icon: 'M3 17l5-5 4 3 5-7 4 4' },
  { title: 'Publish and follow up', detail: 'Explore the daily selections and see how each prediction settled after kickoff.', icon: 'M5 12l4 4L19 6' },
];

const HomeScreen: React.FC = () => {
  const [preview, setPreview] = useState<OfficialPreviewResponse>();
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    getOfficialPreview().then(
      ({ data }) => {
        if (active) {
          setPreview(data);
          setPreviewState('ready');
        }
      },
      () => { if (active) setPreviewState('error'); },
    );
    return () => { active = false; };
  }, []);

  const featured = preview?.available ? preview.featured : undefined;
  const probability = featured?.probability ? Number(featured.probability) : NaN;
  const hasProbability = Number.isFinite(probability) && probability >= 0 && probability <= 1;

  return (
    <main className="bg-[#0d1626] text-white">
      <section className="border-b border-slate-700">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14 lg:py-20">
          <div>
            <p className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-[.2em] text-emerald-300">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ui-gold" />
              Data-driven {BRAND_TAGLINE}
            </p>
            <h1 className="mt-5 text-[clamp(2.35rem,5.4vw,4.3rem)] font-extrabold leading-[1.04] tracking-[-.055em]">
              Smarter Football Predictions. <span className="block text-emerald-300">Better-Informed Decisions.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-200 sm:text-lg">
              Explore football match predictions, probability insights and daily selections powered by advanced statistical analysis.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/history" className="predictxi-action bg-emerald-300 text-slate-900 hover:bg-emerald-100">Explore Today’s Picks <span aria-hidden="true">↗</span></Link>
              <Link to="/BetAndFixturesScreen" className="predictxi-action border border-white/40 text-white hover:bg-white/10">Generate My Own Predictions</Link>
            </div>
          </div>
          <div className="predictxi-pitch relative flex min-h-[16rem] items-center justify-center overflow-hidden rounded-3xl border border-white/20 p-5 sm:min-h-[23rem] sm:p-8">
            <div className="predictxi-pitch-lines" aria-hidden="true"><span /><span /></div>
            <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/20 bg-[#111c2e] p-5 shadow-xl sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-emerald-300">Featured match</h2>
                {preview?.businessDate && <p className="text-xs text-slate-300">{formatBusinessDate(preview.businessDate)}</p>}
              </div>
              {featured ? (
                <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-300">{featured.leagueName}</p>
                  <p className="predictxi-teams mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 break-words text-lg font-bold leading-snug">
                    <span className="min-w-0">{featured.homeTeam}</span>
                    <span className="text-xs font-semibold uppercase text-slate-300">vs</span>
                    <span className="min-w-0 text-right">{featured.awayTeam}</span>
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-4">
                    <div>
                      <p className="text-xs text-slate-300">Model probability</p>
                      <p className="mt-1 text-sm font-semibold">{marketDisplayLabel(featured.marketId, featured.marketLabel)}</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-emerald-300">{formatProbability(featured.probability)}</p>
                  </div>
                  {hasProbability && (
                    <meter className="predictxi-probability mt-3" aria-label="Model probability" value={probability} max={1} />
                  )}
                </>
              ) : (
                <p role="status" className="mt-4 text-sm leading-relaxed text-slate-200">
                  {previewState === 'loading' ? 'Loading the featured match…' :
                    previewState === 'error' ? 'The featured match is temporarily unavailable.' :
                      preview?.message || 'No featured match has been published today.'}
                </p>
              )}
              <Link to="/history#featured-match" className="mt-5 inline-flex min-h-[44px] items-center text-sm font-semibold text-white underline decoration-emerald-300 underline-offset-4">
                View match insights
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="membership" className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16">
        <h2 className="text-3xl font-extrabold tracking-tight">Explore PredictXI</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="flex flex-col items-start rounded-2xl border border-slate-700 bg-[#152136] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Free access</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight">Results &amp; Daily Picks</h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-200 marker:text-emerald-300">
              <li>See today’s selections and the featured match.</li>
              <li>Browse previous daily lists and individual match predictions.</li>
              <li>Check final scores, outcomes and historical performance.</li>
            </ul>
            <Link to="/history?view=past" className="predictxi-action mt-6 w-full border border-slate-500 text-white hover:bg-white/10 sm:w-auto">Browse past results <span className="ml-2" aria-hidden="true">↗</span></Link>
          </article>
          <article className="flex flex-col items-start rounded-2xl border border-emerald-300/40 bg-[#152136] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Premium access</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight">Your leagues, your predictions</h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-200 marker:text-emerald-300">
              <li>Choose the leagues you follow and generate your own prediction shortlist.</li>
              <li>Explore detailed match probabilities and the analysis behind them.</li>
              <li>Return to the prediction desk to explore more leagues.</li>
            </ul>
            <Link to="/access" className="predictxi-action mt-6 w-full bg-emerald-300 text-slate-900 hover:bg-emerald-100 sm:w-auto">View premium passes <span className="ml-2" aria-hidden="true">↗</span></Link>
          </article>
        </div>
      </section>

      <section className="border-y border-slate-700 bg-slate-900">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16">
          <h2 className="text-3xl font-extrabold tracking-tight">How PredictXI works</h2>
          <ol className="mt-7 grid gap-6 md:grid-cols-3">
            {steps.map(({ title, detail, icon }) => (
              <li key={title} className="border-l-2 border-emerald-300/50 pl-4">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-emerald-300"><path d={icon} strokeLinecap="round" strokeLinejoin="round" /></svg>
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-1 max-w-xs text-sm leading-relaxed text-slate-300">{detail}</p>
              </li>
            ))}
          </ol>
          <details className="mt-8 rounded-xl border border-slate-600 px-4">
            <summary className="flex min-h-[48px] cursor-pointer items-center gap-2 font-semibold">
              <span aria-hidden="true" className="text-emerald-300">＋</span> How to generate your own predictions
            </summary>
            <ol className="grid list-decimal gap-4 pb-5 pl-5 text-sm leading-relaxed text-slate-200 md:grid-cols-3 md:gap-8">
              <li><strong>Choose your leagues.</strong> Select up to four competitions and set your match dates.</li>
              <li><strong>Generate your shortlist.</strong> The prediction desk pulls published forecasts for your selection.</li>
              <li><strong>Explore the results.</strong> Compare match probabilities, then choose more leagues to continue.</li>
            </ol>
          </details>
        </div>
      </section>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-300 sm:px-8">
        <p>© {new Date().getFullYear()} {BRAND_NAME}</p>
        <p>For adults 18+. Football forecasts describe likelihood. Results can vary.</p>
      </footer>
    </main>
  );
};

export default HomeScreen;
