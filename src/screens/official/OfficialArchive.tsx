import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatBusinessDate, formatRate } from '../../services/official/presentation';
import type { MetricBlock, OfficialHistoryResponse, OfficialListLeg, OfficialSummaryResponse } from '../../services/official/types';
import { DailyList } from './OfficialDailyList';
import { control, groupByFixture, MatchCard, panel } from './OfficialMatchCard';

export const PreviousPicks: React.FC<{ history: OfficialHistoryResponse; date: string | null }> = ({ history, date }) => {
  const navigate = useNavigate();
  // The API lists recent dates newest first, with the current business day first.
  const dates = history.recent.slice(1);
  const selected = dates.find(entry => entry.businessDate === date) ?? dates[0];
  const index = dates.indexOf(selected);
  const all = date === 'all';
  const path = (value: string) => `/history?view=past&date=${value}`;

  return (
    <section aria-labelledby="previous-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="previous-heading" className="text-xl font-bold">Previous daily lists</h2>
          <p className="mt-1 text-sm text-slate-300">Browse recent dates, including days without a published list.</p>
        </div>
        <Link className={control} to="/history?view=archive">All published lists</Link>
      </div>
      {selected ? (
        <>
          <div className={`${panel} flex flex-wrap items-end gap-2 p-3 sm:gap-3`}>
            {dates[index + 1] && !all ? <Link className={control} to={path(dates[index + 1].businessDate)} aria-label="Previous date">‹ <span className="ml-1 hidden sm:inline">Older</span></Link> :
              <button type="button" className={control} disabled aria-label="Previous date">‹ <span className="ml-1 hidden sm:inline">Older</span></button>}
            <label className="min-w-0 flex-1 text-xs font-semibold text-slate-300">
              Choose a date
              <select className={`${control} mt-1 block w-full`} value={all ? 'all' : selected.businessDate}
                onChange={event => navigate(path(event.target.value))}>
                {dates.map(entry => <option key={entry.businessDate} value={entry.businessDate}>{formatBusinessDate(entry.businessDate)}</option>)}
                <option value="all">All recent dates</option>
              </select>
            </label>
            {dates[index - 1] && !all ? <Link className={control} to={path(dates[index - 1].businessDate)} aria-label="Next date"><span className="mr-1 hidden sm:inline">Newer</span> ›</Link> :
              <button type="button" className={control} disabled aria-label="Next date"><span className="mr-1 hidden sm:inline">Newer</span> ›</button>}
          </div>
          <div className="space-y-7">{(all ? dates : [selected]).map(entry => <DailyList key={entry.businessDate} list={entry} />)}</div>
        </>
      ) : <p className={`${panel} p-4 text-sm text-slate-300`}>There are no previous dates to display.</p>}
    </section>
  );
};

export const ArchivePagination: React.FC<{ history: OfficialHistoryResponse; view: string }> = ({ history, view }) => {
  if (history.totalPages <= 1) return null;
  return (
    <nav aria-label="Published history pages" className="flex flex-wrap items-center justify-between gap-2">
      {history.page > 1 ?
        <Link className={control} to={`/history?view=${view}&page=${history.page - 1}`}>‹ Newer entries</Link> :
        <button type="button" className={control} disabled>‹ Newer entries</button>}
      <p className="text-sm text-slate-300">Page {history.page} of {history.totalPages}</p>
      {history.page < history.totalPages ?
        <Link className={control} to={`/history?view=${view}&page=${history.page + 1}`}>Older entries ›</Link> :
        <button type="button" className={control} disabled>Older entries ›</button>}
    </nav>
  );
};

export const PublishedLists: React.FC<{ history: OfficialHistoryResponse }> = ({ history }) => (
  <section aria-labelledby="published-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 id="published-heading" className="text-xl font-bold">Published daily lists</h2>
      <Link className={control} to="/history?view=past">Recent dates</Link>
    </div>
    <ArchivePagination history={history} view="archive" />
    {history.results.length ? (
      <div className="space-y-4">{history.results.map(entry => (
        <details key={entry.businessDate} className={`${panel} px-4 sm:px-5`}>
          <summary className="cursor-pointer py-4 text-sm font-bold">{formatBusinessDate(entry.businessDate)} <span className="ml-2 font-normal text-slate-300">{entry.legCount ?? entry.legs.length} selections</span></summary>
          <div className="border-t border-slate-700 py-4"><DailyList list={entry} /></div>
        </details>
      ))}</div>
    ) : <p className={`${panel} p-4 text-sm text-slate-300`}>No daily lists have been published yet.</p>}
  </section>
);

export const PredictionArchive: React.FC<{ history: OfficialHistoryResponse }> = ({ history }) => {
  const [team, setTeam] = useState('');
  const [date, setDate] = useState('');
  const [league, setLeague] = useState('');
  const [market, setMarket] = useState('');
  const [outcome, setOutcome] = useState('');
  const legs = history.results.flatMap(entry => entry.legs ?? []);
  const leagues = Array.from(new Set(legs.map(leg => leg.leagueName || `League ${leg.leagueId}`))).sort();
  const markets = Array.from(new Map(legs.map(leg => [leg.marketId, leg.marketLabel || leg.marketId]))).sort((a, b) => a[1].localeCompare(b[1]));
  const query = team.trim().toLowerCase();
  const matches = (leg: OfficialListLeg) =>
    (!league || (leg.leagueName || `League ${leg.leagueId}`) === league) &&
    (!market || leg.marketId === market) && (!outcome || leg.status === outcome) &&
    (!query || `${leg.homeTeam} ${leg.awayTeam}`.toLowerCase().includes(query));
  const entries = history.results.filter(entry => !date || entry.businessDate === date)
    .map(entry => ({ date: entry.businessDate, matches: groupByFixture((entry.legs ?? []).filter(matches)) }))
    .filter(entry => entry.matches.length);
  const field = `${control} mt-1 block w-full min-w-0`;

  return (
    <section aria-labelledby="predictions-heading" className="space-y-4">
      <div>
        <h2 id="predictions-heading" className="text-xl font-bold">Published match predictions</h2>
        <p className="mt-1 text-sm text-slate-300">Individual selections from published daily lists. Filters apply to the current page.</p>
      </div>
      <ArchivePagination history={history} view="predictions" />
      {legs.length > 0 && (
        <div className={`${panel} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5`}>
          <label className="min-w-0 text-xs font-semibold text-slate-300">Team
            <input type="search" placeholder="Search team" className={field} value={team} onChange={e => setTeam(e.target.value)} />
          </label>
          <label className="min-w-0 text-xs font-semibold text-slate-300">Published date
            <select className={field} value={date} onChange={e => setDate(e.target.value)}>
              <option value="">All dates</option>
              {history.results.map(entry => <option key={entry.businessDate} value={entry.businessDate}>{formatBusinessDate(entry.businessDate)}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-xs font-semibold text-slate-300">League
            <select className={field} value={league} onChange={e => setLeague(e.target.value)}>
              <option value="">All leagues</option>{leagues.map(name => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-xs font-semibold text-slate-300">Outcome
            <select className={field} value={outcome} onChange={e => setOutcome(e.target.value)}>
              <option value="">All outcomes</option><option value="won">Correct</option><option value="lost">Incorrect</option>
              <option value="pending">Pending</option><option value="void">Void</option><option value="unresolved">Unresolved</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-semibold text-slate-300">Prediction market
            <select className={field} value={market} onChange={e => setMarket(e.target.value)}>
              <option value="">All markets</option>{markets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
        </div>
      )}
      {entries.length ? entries.map(entry => (
        <section key={entry.date} className="space-y-3">
          <h3 className="text-sm font-bold text-slate-200">{formatBusinessDate(entry.date)}</h3>
          <div className="grid gap-3 md:grid-cols-2">{entry.matches.map(options => <MatchCard key={options[0].providerFixtureId} legs={options} />)}</div>
        </section>
      )) : <p role="status" className={`${panel} p-5 text-sm text-slate-300`}>{legs.length ? 'No predictions match these filters on this page.' : 'No match predictions are available on this page.'}</p>}
    </section>
  );
};

const Metrics: React.FC<{ title: string; data: MetricBlock; individual?: boolean }> = ({ title, data, individual }) => (
  <div className={`${panel} p-4`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="font-bold tabular-nums text-emerald-200">{formatRate(individual ? data.hit_rate : data.win_rate)} <span className="text-xs font-normal text-slate-300">success rate</span></p>
    </div>
    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700 pt-3 text-sm sm:grid-cols-6">
      {[
        ['Settled', data.denominator], [individual ? 'Correct' : 'Won', data.won], [individual ? 'Incorrect' : 'Lost', data.lost],
        ['Pending', data.pending], ['Void', data.void], ['Unresolved', data.unresolved],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-300">{label}</dt><dd className="font-bold tabular-nums">{value}</dd></div>)}
    </dl>
  </div>
);

export const TrackRecord: React.FC<{ summary: OfficialSummaryResponse }> = ({ summary }) => {
  const { lists, selections } = summary.metrics;
  const { listsConsidered, period } = summary.scope;
  return (
    <section aria-labelledby="metrics-heading" className="space-y-3">
      <h2 id="metrics-heading" className="text-xl font-bold">Track record</h2>
      <p className="text-sm text-slate-300">
        Based on {listsConsidered} published {listsConsidered === 1 ? 'list' : 'lists'}
        {listsConsidered >= 500 ? ` through ${period.to ? formatBusinessDate(period.to) : 'the latest published date'}` :
          period.from && period.to ? ` · ${formatBusinessDate(period.from)} to ${formatBusinessDate(period.to)}` : ''}.
        Success rates use only wins and losses.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <Metrics title="Individual selections" data={selections} individual />
        <Metrics title="Whole daily lists" data={lists} />
      </div>
    </section>
  );
};
