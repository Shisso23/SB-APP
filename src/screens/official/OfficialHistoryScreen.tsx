import React, { useCallback, useEffect, useState } from 'react';

import {
  getOfficialHistory,
  getOfficialPreview,
  getOfficialSummary,
  getOfficialToday,
} from '../../services/official';
import type {
  OfficialHistoryResponse,
  OfficialList,
  OfficialPreviewResponse,
  OfficialSummaryResponse,
} from '../../services/official/types';
import {
  describeLegStatus,
  describeListStatus,
  formatBusinessDate,
  formatMoney,
  formatOdds,
  formatProbability,
  formatRate,
  formatScore,
  formatTimestamp,
  presentHypothetical,
} from '../../services/official/presentation';

/**
 * Public official-list history and free preview.
 *
 * This page is the FREE experience and needs no sign-in. The server returns only
 * published records and the cached featured match, so nothing here filters or
 * hides premium data.
 *
 * Deliberate presentation choices:
 *  - Wins, losses, void and unresolved lists all render with equal weight. There
 *    is no winners-only default view.
 *  - An unavailable monetary figure says so; it is never shown as R0.00.
 *  - Status is carried by a text label and glyph, not by colour alone.
 */

type LoadState = 'loading' | 'ready' | 'error';

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</div>
);

const StatusPill: React.FC<{ label: string; glyph: string; className: string }> = ({ label, glyph, className }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
  >
    <span aria-hidden="true">{glyph}</span>
    {label}
  </span>
);

const Metric: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
    {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
  </div>
);

/** One published list: header, legs, and the hypothetical illustration. */
const ListCard: React.FC<{ list: OfficialList }> = ({ list }) => {
  const status = describeListStatus(list.status);
  const money = presentHypothetical(list.hypothetical);

  if (!list.published) {
    return (
      <Card className="border-dashed">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{formatBusinessDate(list.businessDate)}</div>
            <p className="mt-1 text-sm text-slate-600">
              {list.message ?? 'No official five-match list was published for this date.'}
            </p>
          </div>
          <StatusPill label="Not published" glyph="—" className="bg-slate-100 text-slate-600 border-slate-300" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">{formatBusinessDate(list.businessDate)}</h3>
            <StatusPill {...status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Published {formatTimestamp(list.publishedAt) ?? '—'}
            {list.lastCheckedAt ? ` · Last checked ${formatTimestamp(list.lastCheckedAt)}` : ''}
          </p>
          {list.lastCheckError ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              A reconciliation check failed ({list.lastCheckError}). Results may be incomplete.
            </p>
          ) : null}
        </div>
        {money?.kind === 'settled' ? (
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hypothetical net</div>
            <div
              className={`text-lg font-bold tabular-nums ${
                (formatMoney(money.net) ?? '').startsWith('-') ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {formatMoney(money.net) ?? 'Unavailable'}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">
            Published selections for {formatBusinessDate(list.businessDate)} with saved odds and results.
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-2 pr-3 font-semibold">Fixture</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Selection</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Forecast</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Odds</th>
              <th scope="col" className="py-2 pr-3 text-center font-semibold">Score</th>
              <th scope="col" className="py-2 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody>
            {list.legs.map((leg) => {
              const legStatus = describeLegStatus(leg.status);
              return (
                <tr key={leg.providerFixtureId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-900">
                      {leg.homeTeam} <span className="text-slate-400">v</span> {leg.awayTeam}
                    </div>
                    <div className="text-xs text-slate-500">
                      {leg.leagueName || `League ${leg.leagueId}`}
                      {leg.kickoff ? ` · ${formatTimestamp(leg.kickoff)}` : ''}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="text-slate-800">{leg.marketLabel || leg.marketId}</div>
                    {leg.marketLine ? <div className="text-xs text-slate-500">{leg.marketLine}</div> : null}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-800">
                    {formatProbability(leg.probability)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-800">
                    {formatOdds(leg.odds?.decimalOdds ?? null) ?? <span className="text-slate-400">—</span>}
                    {leg.odds?.bookmaker ? (
                      <div className="text-xs text-slate-500">{leg.odds.bookmaker}</div>
                    ) : (
                      <div className="text-xs text-amber-700">No quote</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-center tabular-nums text-slate-800">
                    {formatScore(leg.homeGoals, leg.awayGoals)}
                  </td>
                  <td className="py-2.5">
                    <StatusPill {...legStatus} />
                    {leg.resolutionNote ? (
                      <div className="mt-1 max-w-[16rem] text-xs text-slate-500">{leg.resolutionNote}</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hypothetical illustration. Unavailable is stated, never shown as zero. */}
      {money ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          {money.kind === 'unavailable' ? (
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Monetary figure unavailable.</span> {money.reason}
            </p>
          ) : money.kind === 'potential' ? (
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Potential return</span> — this list is not fully settled.
              {money.combinedOdds ? (
                <>
                  {' '}
                  Combined odds <span className="tabular-nums">{money.combinedOdds}</span>.
                </>
              ) : null}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Combined odds</div>
                <div className="text-sm font-semibold tabular-nums text-slate-900">
                  {money.combinedOdds ?? '—'}
                  <span className="ml-1 text-xs font-normal text-slate-500">indicative</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total return</div>
                <div className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatMoney(money.totalReturn) ?? 'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Net</div>
                <div className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatMoney(money.net) ?? 'Unavailable'}
                </div>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">{money.disclosure}</p>
        </div>
      ) : null}
    </Card>
  );
};

const OfficialHistoryScreen: React.FC = () => {
  const [state, setState] = useState<LoadState>('loading');
  const [today, setToday] = useState<OfficialList | null>(null);
  const [history, setHistory] = useState<OfficialHistoryResponse | null>(null);
  const [summary, setSummary] = useState<OfficialSummaryResponse | null>(null);
  const [preview, setPreview] = useState<OfficialPreviewResponse | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setState('loading');
    setError(null);
    try {
      // All four endpoints are public, so they load in parallel. Failures here
      // are surfaced rather than rendering an empty history that looks like
      // "no predictions were ever published".
      const [todayResponse, historyResponse, summaryResponse, previewResponse] = await Promise.all([
        getOfficialToday(),
        getOfficialHistory(targetPage),
        getOfficialSummary(),
        getOfficialPreview(),
      ]);
      setToday(todayResponse.data);
      setHistory(historyResponse.data);
      setSummary(summaryResponse.data);
      setPreview(previewResponse.data);
      setPage(targetPage);
      setState('ready');
    } catch (caught) {
      setError('We could not load the prediction history right now. Please try again.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const lists = summary?.metrics.lists;
  const selections = summary?.metrics.selections;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
        <header className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-700">Public record</span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Prediction history</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Every official five-match list, published before the earliest kickoff and never rewritten
            afterwards. Wins, losses and unresolved lists are all shown — this is the complete record,
            not a selection of highlights.
          </p>
        </header>

        {state === 'error' ? (
          <Card className="border-rose-200 bg-rose-50">
            <p role="alert" className="text-sm text-rose-800">{error}</p>
            <button
              type="button"
              onClick={() => void load(page)}
              className="mt-3 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </Card>
        ) : null}

        {state === 'loading' && !history ? (
          <p role="status" className="text-slate-600">Loading history…</p>
        ) : null}

        {history ? (
          <div className="space-y-10">
            {/* Summary metrics with explicit denominators */}
            {lists && selections ? (
              <section aria-labelledby="metrics-heading">
                <h2 id="metrics-heading" className="text-lg font-bold tracking-tight">Track record</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Void, pending and unresolved lists are counted separately and excluded from both rates.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    label="Full-list win rate"
                    value={formatRate(lists.win_rate)}
                    hint={`${lists.won} won / ${lists.denominator} settled`}
                  />
                  <Metric
                    label="Selection hit rate"
                    value={formatRate(selections.hit_rate)}
                    hint={`${selections.won} won / ${selections.denominator} settled`}
                  />
                  <Metric label="Void" value={String(lists.void)} hint="Excluded from both rates" />
                  <Metric
                    label="Pending / unresolved"
                    value={`${lists.pending} / ${lists.unresolved}`}
                    hint="Not yet decided"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Based on the {summary?.scope.listsConsidered ?? 0} most recent lists
                  {summary?.scope.period.from && summary?.scope.period.to
                    ? ` (${formatBusinessDate(summary.scope.period.from)} – ${formatBusinessDate(summary.scope.period.to)})`
                    : ''}
                  . Pending and unresolved lists are not counted as losses.
                </p>
              </section>
            ) : null}

            {/* Today */}
            <section aria-labelledby="today-heading">
              <h2 id="today-heading" className="text-lg font-bold tracking-tight">Today’s official list</h2>
              <div className="mt-4">
                {today ? <ListCard list={today} /> : null}
              </div>
            </section>

            {/* Featured free preview */}
            {preview ? (
              <section aria-labelledby="preview-heading">
                <h2 id="preview-heading" className="text-lg font-bold tracking-tight">Today’s featured match</h2>
                <p className="mt-1 text-sm text-slate-600">
                  One match from today’s list, with the full market analysis available to everyone.
                </p>
                <Card className="mt-4">
                  {preview.available && preview.featured ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-bold text-slate-900">
                            {preview.featured.homeTeam} <span className="text-slate-400">v</span>{' '}
                            {preview.featured.awayTeam}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {preview.featured.leagueName}
                            {preview.featured.kickoff ? ` · ${formatTimestamp(preview.featured.kickoff)}` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            {preview.featured.marketLabel || preview.featured.marketId}
                          </div>
                          <div className="text-lg font-bold tabular-nums text-slate-900">
                            {formatProbability(preview.featured.probability)}
                          </div>
                        </div>
                      </div>
                      {preview.featured.explanation ? (
                        <p className="mt-3 text-sm leading-relaxed text-slate-700">
                          {preview.featured.explanation}
                        </p>
                      ) : null}
                      {preview.featured.markets.length ? (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full min-w-[420px] text-sm">
                            <caption className="sr-only">Markets assessed for the featured match.</caption>
                            <thead>
                              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                                <th scope="col" className="py-2 pr-3 font-semibold">Market</th>
                                <th scope="col" className="py-2 pr-3 text-right font-semibold">Model</th>
                                <th scope="col" className="py-2 text-right font-semibold">Odds</th>
                              </tr>
                            </thead>
                            <tbody>
                              {preview.featured.markets.map((market) => (
                                <tr key={market.marketId} className="border-b border-slate-100 last:border-0">
                                  <td className="py-2 pr-3 text-slate-800">{market.label || market.marketId}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                                    {market.probability === null ? '—' : `${(market.probability * 100).toFixed(1)}%`}
                                  </td>
                                  <td className="py-2 text-right tabular-nums text-slate-800">
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
                    <p className="text-sm text-slate-600">
                      {preview.message ?? 'No featured match is available today.'}
                    </p>
                  )}
                </Card>
              </section>
            ) : null}

            {/* How forecasts work */}
            {preview ? (
              <section aria-labelledby="explainer-heading">
                <h2 id="explainer-heading" className="text-lg font-bold tracking-tight">
                  How these forecasts work
                </h2>
                <Card className="mt-4">
                  <p className="text-sm leading-relaxed text-slate-700">{preview.explainer.summary}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700">
                    {preview.explainer.how_the_list_is_made}
                  </p>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900">What they cannot do</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                    {preview.explainer.limitations.map((limitation) => (
                      <li key={limitation} className="flex gap-2">
                        <span aria-hidden="true" className="text-slate-400">•</span>
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}

            {/* Recent dates, including gaps */}
            <section aria-labelledby="recent-heading">
              <h2 id="recent-heading" className="text-lg font-bold tracking-tight">Most recent dates</h2>
              <p className="mt-1 text-sm text-slate-600">
                Dates with no published list are shown too, so gaps are visible.
              </p>
              <div className="mt-4 space-y-4">
                {history.recent.map((entry) => (
                  <ListCard key={entry.businessDate} list={entry} />
                ))}
              </div>
            </section>

            {/* Older history */}
            {history.results.length ? (
              <section aria-labelledby="older-heading">
                <h2 id="older-heading" className="text-lg font-bold tracking-tight">Full history</h2>
                <div className="mt-4 space-y-4">
                  {history.results.map((entry) => (
                    <ListCard key={entry.businessDate} list={entry} />
                  ))}
                </div>
                {history.totalPages > 1 ? (
                  <nav className="mt-6 flex items-center justify-between" aria-label="History pages">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => void load(page - 1)}
                      className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
                    >
                      Newer
                    </button>
                    <span className="text-sm text-slate-600">
                      Page {history.page} of {history.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= history.totalPages}
                      onClick={() => void load(page + 1)}
                      className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
                    >
                      Older
                    </button>
                  </nav>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default OfficialHistoryScreen;