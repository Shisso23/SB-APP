import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  getOfficialHistory,
  getOfficialPreview,
  getOfficialSummary,
  getOfficialToday,
} from '../../services/official';
import type {
  OfficialHistoryResponse,
  OfficialListSummary,
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
  formatRatio,
  formatScore,
  formatTimestamp,
  presentHypothetical,
  tallyList,
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

const control = 'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50';

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${className}`}>{children}</div>
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
const ListCard: React.FC<{ list: OfficialListSummary }> = ({ list }) => {
  const status = describeListStatus(list.status);
  const money = presentHypothetical(list.hypothetical);
  const tally = list.legs ? tallyList(list.legs) : null;

  if (!list.published) {
    return (
      <Card className="border-dashed">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{formatBusinessDate(list.businessDate)}</div>
            <p className="mt-1 text-sm text-slate-600">
              {list.message ?? 'No official daily list was published for this date.'}
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
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">{formatBusinessDate(list.businessDate)}</h3>
            <StatusPill {...status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {list.legCount ?? list.legs?.length ?? 'Unknown number of'} selections ·{' '}
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
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {money.estimated ? 'Estimated hypothetical net' : 'Hypothetical net'}
            </div>
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

      {/* Per-list tally. Every outcome is counted, and the percentage uses the
          same won / (won + lost) rule as the overall metric, so void and
          unresolved selections never distort it. */}
      {tally ? (
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            This list
          </span>{' '}
          <span className="font-bold tabular-nums text-slate-900">{formatRatio(tally.rate)}</span>
          <span className="ml-1 text-xs text-slate-500">
            ({tally.won} won / {tally.won + tally.lost} settled)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true">✓</span> {tally.won} won
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true">✕</span> {tally.lost} lost
          </span>
          {tally.void > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">⊘</span> {tally.void} void
            </span>
          ) : null}
          {tally.unresolved > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">?</span> {tally.unresolved} unresolved
            </span>
          ) : null}
          {tally.pending > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">⋯</span> {tally.pending} pending
            </span>
          ) : null}
        </div>
      </div>
      ) : null}

      {list.legs?.length ? (
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {list.legs.map((leg) => (
            <li key={leg.providerFixtureId} className="min-w-0 break-words rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div>
                  <p className="text-xs font-semibold text-teal-800">{leg.leagueName || `League ${leg.leagueId}`}</p>
                  <p className="mt-1 font-bold text-slate-900">
                    {leg.homeTeam} <span className="text-slate-500">v</span> {leg.awayTeam}
                  </p>
                  {leg.kickoff && <p className="mt-1 text-xs text-slate-600">{formatTimestamp(leg.kickoff)}</p>}
                </div>
                <StatusPill {...describeLegStatus(leg.status)} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200 pt-3 text-sm sm:grid-cols-[1.3fr_1fr_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-xs text-slate-600">Prediction</dt>
                  <dd className="mt-1 font-semibold">{leg.marketLabel || leg.marketId}</dd>
                  {leg.marketLine && <dd className="text-xs text-slate-600">{leg.marketLine}</dd>}
                </div>
                <div>
                  <dt className="text-xs text-slate-600">Model probability</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-teal-800">{formatProbability(leg.probability)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">Score</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{formatScore(leg.homeGoals, leg.awayGoals)}</dd>
                </div>
              </dl>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <span className="font-semibold">Saved odds</span>
                <span className="tabular-nums">{formatOdds(leg.odds?.decimalOdds ?? null) ?? '—'}</span>
                {leg.odds?.source === 'model-fair' ? (
                  <span className="text-amber-800">Estimated model fair odds (not a bookmaker quote)</span>
                ) : (
                  <span>{leg.odds?.bookmaker || 'No quote'}</span>
                )}
              </p>
              {leg.resolutionNote && <p className="mt-2 text-xs text-slate-600">{leg.resolutionNote}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Selection details are not available for this date.</p>
      )}

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
          {money.kind !== 'unavailable' && money.estimated ? (
            <p className="mt-3 text-xs font-medium text-amber-700">
              Estimated: {money.estimatedOddsCount === 1 ? '1 selection is' : `${money.estimatedOddsCount} selections are`}{' '}
              priced from model fair odds, not bookmaker quotes.
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">{money.disclosure}</p>
        </div>
      ) : null}
    </Card>
  );
};

type Resource<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

function useOfficialResource<T>(request: () => Promise<{ data: T }>) {
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState<Resource<T>>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setResource({ status: 'loading' });
    request().then(
      ({ data }) => { if (active) setResource({ status: 'ready', data }); },
      () => { if (active) setResource({ status: 'error' }); },
    );
    return () => { active = false; };
  }, [request, attempt]);

  return { resource, retry: () => setAttempt((count) => count + 1) };
}

function OfficialContent<T>({ request, label, children }: {
  request: () => Promise<{ data: T }>;
  label: string;
  children: (data: T) => React.ReactNode;
}) {
  const { resource, retry } = useOfficialResource(request);
  if (resource.status === 'ready') return <>{children(resource.data)}</>;

  return (
    <Card>
      {resource.status === 'loading' ? (
        <p role="status" className="text-sm text-slate-600">Loading {label}…</p>
      ) : (
        <>
          <p role="alert" className="text-sm text-rose-800">We could not load {label}. Please try again.</p>
          <button type="button" className={`${control} mt-3`} onClick={retry}>Try again</button>
        </>
      )}
    </Card>
  );
}

const FeaturedMatch: React.FC<{ preview: OfficialPreviewResponse }> = ({ preview }) => (
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
            <div className="mt-4">
              <table className="w-full text-sm">
                <caption className="sr-only">Markets assessed for the featured match.</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th scope="col" className="py-2 pr-3 font-semibold">Market</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Probability</th>
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
);

const ForecastNotes: React.FC<{ preview: OfficialPreviewResponse }> = ({ preview }) => (
  <details className="rounded-2xl border border-slate-200 bg-white px-4 sm:px-6">
    <summary className="cursor-pointer py-4 text-sm font-bold">How these forecasts work</summary>
    <div className="pb-5 text-sm leading-relaxed text-slate-700">
      <p>{preview.explainer.summary}</p>
      <p className="mt-2">{preview.explainer.how_the_list_is_made}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {preview.explainer.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </div>
  </details>
);

const TrackRecord: React.FC<{ summary: OfficialSummaryResponse }> = ({ summary }) => {
  const { lists, selections } = summary.metrics;
  return (
    <section aria-labelledby="metrics-heading">
      <h2 id="metrics-heading" className="text-lg font-bold tracking-tight">Track record</h2>
      <p className="mt-1 text-sm text-slate-600">
        The daily list rate measures whole lists. The selection rate measures individual predictions.
        Both rates use settled wins and losses.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Daily list win rate"
          value={formatRate(lists.win_rate)}
          hint={`${lists.won} lists won / ${lists.denominator} settled`}
        />
        <Metric
          label="Selection win rate"
          value={formatRate(selections.hit_rate)}
          hint={`${selections.won} selections won / ${selections.denominator} settled`}
        />
        <Metric label="Void" value={String(lists.void)} hint="Excluded from both rates" />
        <Metric
          label="Pending / unresolved"
          value={`${lists.pending} / ${lists.unresolved}`}
          hint="Not yet decided"
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Based on the {summary.scope.listsConsidered} most recent lists
        {summary.scope.period.from && summary.scope.period.to
          ? ` (${formatBusinessDate(summary.scope.period.from)} – ${formatBusinessDate(summary.scope.period.to)})`
          : ''}
        . Pending and unresolved lists are not counted as losses.
      </p>
    </section>
  );
};

const getRecentHistory = () => getOfficialHistory();

const RecentResults: React.FC<{ history: OfficialHistoryResponse }> = ({ history }) => {
  const [date, setDate] = useState('');
  const entries = date ? history.recent.filter((entry) => entry.businessDate === date) : history.recent;

  return (
    <section aria-labelledby="recent-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="recent-heading" className="text-xl font-bold tracking-tight">Last two weeks</h2>
          <p className="mt-1 text-sm text-slate-600">Browse recent dates, including days without a published list.</p>
        </div>
        <div>
          <label htmlFor="result-date" className="mb-1 block text-xs font-semibold text-slate-700">Filter by date</label>
          <select id="result-date" className={control} value={date} onChange={(event) => setDate(event.target.value)}>
            <option value="">All recent dates</option>
            {history.recent.map((entry) => (
              <option key={entry.businessDate} value={entry.businessDate}>{formatBusinessDate(entry.businessDate)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {entries.length ? entries.map((entry) => <ListCard key={entry.businessDate} list={entry} />) :
          <Card><p className="text-sm text-slate-600">No recent dates are available.</p></Card>}
      </div>
    </section>
  );
};

const PublishedArchive: React.FC = () => {
  const [page, setPage] = useState(1);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const changePage = (next: number) => {
    setPage(next);
    heading.current?.focus();
  };
  const request = useCallback(() => getOfficialHistory(page), [page]);

  return (
    <section aria-labelledby="archive-heading">
      <h2 id="archive-heading" ref={heading} tabIndex={-1} className="text-xl font-bold tracking-tight">Published archive</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">Explore all published daily lists, most recent first.</p>
      <OfficialContent key={page} request={request} label="the published archive">
        {(history) => history.results.length ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button type="button" className={control} disabled={history.page <= 1} onClick={() => changePage(history.page - 1)}>Newer lists</button>
              <span className="px-2 text-sm text-slate-700">Page {history.page} of {history.totalPages}</span>
              <button type="button" className={control} disabled={history.page >= history.totalPages} onClick={() => changePage(history.page + 1)}>Older lists</button>
            </div>
            <div className="space-y-4">
              {history.results.map((entry) => <ListCard key={entry.businessDate} list={entry} />)}
            </div>
          </>
        ) : <Card><p className="text-sm text-slate-600">No daily lists have been published yet.</p></Card>}
      </OfficialContent>
    </section>
  );
};

const OfficialHistoryScreen: React.FC = () => {
  const { hash, search } = useLocation();
  const featuredRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hash === '#featured-match') {
      featuredRef.current?.focus({ preventScroll: true });
      featuredRef.current?.scrollIntoView?.();
    } else {
      document.documentElement.scrollTop = 0;
    }
  }, [hash, search]);
  const view = new URLSearchParams(search).get('view');
  const archive = view === 'archive';
  const past = archive || view === 'past';
  const activeLink = 'border-teal-800 text-teal-900';
  const inactiveLink = 'border-transparent text-slate-600 hover:text-teal-900';
  const tabClass = 'inline-flex min-h-[48px] items-center border-b-[3px] px-3 text-sm font-bold sm:px-5';

  return (
    <main className="min-h-screen bg-[#f6f8f7] pb-16 text-slate-900">
      <header className="bg-[#0d1626] text-white">
        <div className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-200">Free access</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">Results &amp; Daily Picks</h1>
          <p className="mt-3 max-w-xl text-slate-200">Explore daily football selections, match probabilities and the outcomes of previously published predictions. Open to everyone.</p>
        </div>
      </header>
      <div className="border-b border-slate-200 bg-white">
        <nav aria-label="Results and picks" className="mx-auto flex max-w-6xl gap-2 px-5 sm:px-8">
          <Link to="/history" aria-current={past ? undefined : 'page'} className={`${tabClass} ${past ? inactiveLink : activeLink}`}>Today’s Picks</Link>
          <Link to="/history?view=past" aria-current={past ? 'page' : undefined} className={`${tabClass} ${past ? activeLink : inactiveLink}`}>Past Results</Link>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl space-y-8 px-5 pt-7 sm:px-8 sm:pt-9">
        {past ? (
          <>
            <OfficialContent request={getOfficialSummary} label="the track record">
              {(summary) => <TrackRecord summary={summary} />}
            </OfficialContent>
            <nav aria-label="History date range" className="flex flex-wrap gap-2">
              <Link to="/history?view=past" aria-current={archive ? undefined : 'page'} className={`${control} ${archive ? '' : 'border-teal-700 text-teal-900'}`}>Recent dates</Link>
              <Link to="/history?view=archive" aria-current={archive ? 'page' : undefined} className={`${control} ${archive ? 'border-teal-700 text-teal-900' : ''}`}>All published lists</Link>
            </nav>
            {archive ? <PublishedArchive /> : (
              <OfficialContent request={getRecentHistory} label="past results">
                {(history) => <RecentResults history={history} />}
              </OfficialContent>
            )}
          </>
        ) : (
          <>
            <section aria-labelledby="today-heading">
              <h2 id="today-heading" className="mb-4 text-xl font-bold tracking-tight">Today’s official list</h2>
              <OfficialContent request={getOfficialToday} label="today’s picks">
                {(list) => <ListCard list={list} />}
              </OfficialContent>
            </section>
            <div id="featured-match" className="space-y-5" tabIndex={-1} ref={featuredRef}>
              <OfficialContent request={getOfficialPreview} label="the featured match">
                {(preview) => <><FeaturedMatch preview={preview} /><ForecastNotes preview={preview} /></>}
              </OfficialContent>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default OfficialHistoryScreen;
