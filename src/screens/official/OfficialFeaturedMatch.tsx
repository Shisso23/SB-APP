import React from 'react';
import type { OfficialPreviewResponse } from '../../services/official/types';
import { formatProbability, formatTimestamp } from '../../services/official/presentation';
import { panel } from './OfficialMatchCard';

export const FeaturedMatch: React.FC<{ preview: OfficialPreviewResponse }> = ({ preview }) => (
  <section aria-labelledby="preview-heading">
    <h2 id="preview-heading" className="text-lg font-bold tracking-tight">Today’s featured match</h2>
    <p className="mt-1 text-sm text-slate-300">
      One match from today’s list, with the full market analysis available to everyone.
    </p>
    <div className={`${panel} mt-4 p-4 sm:p-5`}>
      {preview.available && preview.featured ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-bold text-white">
                {preview.featured.homeTeam} <span className="text-slate-300">v</span>{' '}
                {preview.featured.awayTeam}
              </div>
              <div className="mt-0.5 text-xs text-slate-300">
                {preview.featured.leagueName}
                {preview.featured.kickoff ? ` · ${formatTimestamp(preview.featured.kickoff)}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                {preview.featured.marketLabel || preview.featured.marketId}
              </div>
              <div className="text-lg font-bold tabular-nums text-white">
                {formatProbability(preview.featured.probability)}
              </div>
            </div>
          </div>
          {preview.featured.explanation ? (
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {preview.featured.explanation}
            </p>
          ) : null}
          {preview.featured.markets.length ? (
            <div className="mt-4">
              <table className="w-full text-sm">
                <caption className="sr-only">Markets assessed for the featured match.</caption>
                <thead>
                  <tr className="border-b border-slate-700 text-left text-[11px] uppercase tracking-wider text-slate-300">
                    <th scope="col" className="py-2 pr-3 font-semibold">Market</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Probability</th>
                    <th scope="col" className="py-2 text-right font-semibold">Odds</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.featured.markets.map((market) => (
                    <tr key={market.marketId} className="border-b border-slate-700 last:border-0">
                      <td className="py-2 pr-3 text-slate-200">{market.label || market.marketId}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-200">
                        {market.probability === null ? '—' : `${(market.probability * 100).toFixed(1)}%`}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-200">
                        {market.decimalOdds === null ? '—' : market.decimalOdds.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-slate-300">
          {preview.message ?? 'No featured match is available today.'}
        </p>
      )}
    </div>
  </section>
);

export const ForecastNotes: React.FC<{ preview: OfficialPreviewResponse }> = ({ preview }) => (
  <details className="rounded-2xl border border-slate-700 bg-[#152136] px-4 sm:px-6">
    <summary className="cursor-pointer py-4 text-sm font-bold">How these forecasts work</summary>
    <div className="pb-5 text-sm leading-relaxed text-slate-300">
      <p>{preview.explainer.summary}</p>
      <p className="mt-2">{preview.explainer.how_the_list_is_made}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {preview.explainer.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </div>
  </details>
);
