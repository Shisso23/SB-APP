import React, { useEffect, useState } from 'react';

export type PredictionLoadingStage = 'fixtures' | 'standings' | 'form' | 'odds' | 'forecasts';

const STAGES: { id: PredictionLoadingStage; label: string; message: string }[] = [
  { id: 'fixtures', label: 'Match history', message: 'Gathering fixtures and recent match results…' },
  { id: 'standings', label: 'League context', message: 'Checking league standings and team context…' },
  { id: 'form', label: 'Team form', message: 'Reviewing team form and scoring patterns…' },
  { id: 'odds', label: 'Available prices', message: 'Checking available bookmaker prices. Some matches may have no prices yet…' },
  { id: 'forecasts', label: 'Your forecasts', message: 'Preparing forecast probabilities, explanations and highlights…' },
];

const TOUCHLINE_NOTES = [
  'The numbers are warming up. No shuttle runs required.',
  'Form is useful. Football still enjoys a plot twist.',
  'You pick the markets. We’ll bring the numbers.',
  'The spreadsheet has put its boots on.',
  'A strong-looking forecast still has to survive kick-off.',
  'No VAR review required to change your mind.',
];

export const PredictionLoader: React.FC<{
  stage: PredictionLoadingStage;
  leagueCount: number;
  includeOdds: boolean;
  hasPreviousForecasts: boolean;
}> = ({ stage, leagueCount, includeOdds, hasPreviousForecasts }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const steps = STAGES.filter(step => includeOdds || step.id !== 'odds');
  const activeIndex = steps.findIndex(step => step.id === stage);
  const current = steps[activeIndex] ?? steps[0];
  const message = stage === 'forecasts' && !includeOdds ? 'Preparing your rule-based forecasts and match details…' : current.message;

  return (
    <section aria-label="Prediction loading" className="overflow-hidden rounded-2xl border border-cyan-400/30 bg-slate-900 p-4 shadow-lg shadow-cyan-950/20 sm:p-5">
      <div className="flex items-start gap-4">
        <div aria-hidden="true" className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-400/30 bg-emerald-950/50">
          <div className="absolute inset-x-0 top-1/2 border-t border-emerald-300/20" />
          <div className="absolute h-10 w-10 rounded-full border border-emerald-300/20" />
          <span className="relative text-2xl motion-safe:animate-bounce">⚽</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">Preparing your predictions</h3>
            <span aria-live="off" className="text-xs tabular-nums text-slate-400">{elapsed}s elapsed</span>
          </div>
          <p role="status" aria-label="Prediction progress" aria-live="polite" aria-atomic="true" className="mt-1 text-sm text-cyan-100">{message}</p>
          <p className="mt-1 text-xs text-slate-400">{leagueCount} selected league{leagueCount === 1 ? '' : 's'} · {includeOdds ? 'Statistical model' : 'Legacy rules'}</p>
        </div>
        <span aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 rounded-full border-2 border-cyan-400/20 border-t-cyan-300 motion-safe:animate-spin" />
      </div>

      <ol aria-label="Prediction preparation steps" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-700/70 pt-3">
        {steps.map((step, index) => (
          <li key={step.id} aria-current={index === activeIndex ? 'step' : undefined} className={`flex items-center gap-1.5 text-xs ${index === activeIndex ? 'font-semibold text-cyan-200' : index < activeIndex ? 'text-emerald-300' : 'text-slate-400'}`}>
            <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border ${index === activeIndex ? 'border-cyan-300 bg-cyan-500/10' : 'border-current'}`}>{index < activeIndex ? '✓' : index + 1}</span>
            {step.label}
            <span className="sr-only">{index < activeIndex ? 'completed' : index === activeIndex ? 'in progress' : 'pending'}</span>
          </li>
        ))}
      </ol>

      <div aria-live="off" className="mt-4 rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">From the touchline</div>
        <p className="mt-1 text-sm text-slate-200">{TOUCHLINE_NOTES[Math.floor(elapsed / 6) % TOUCHLINE_NOTES.length]}</p>
      </div>
      {elapsed >= 25 && <p className="mt-3 text-xs text-amber-200">Still working. Larger batches and data requests can take a little longer.</p>}
      {hasPreviousForecasts && <p className="mt-3 text-xs text-slate-400">Your previous forecasts remain below while this batch is prepared.</p>}
    </section>
  );
};
