import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOfficialHistory, getOfficialSummary, getOfficialToday } from '../../services/official';
import type { OfficialListLeg, OfficialListSummary } from '../../services/official/types';
import { marketDisplayLabel } from '../../services/predictions/market-label';
import { adminLink, Badge, Feedback, Pagination, Panel, sastDate, sastTime } from './admin-ui';
import useAdminResource from './useAdminResource';

function Picks({ list, legs }: { list: OfficialListSummary; legs?: OfficialListLeg[] }) {
  return <>
    {list.publishedAt && <p className="ax-muted mb-2 text-xs">Published {sastTime(list.publishedAt)} SAST</p>}
    {list.lastCheckError && <Feedback error>{list.lastCheckError}</Feedback>}
    {!list.published && <p className="ax-empty">{list.message || 'No official list is published for this date.'}</p>}
    {list.published && !(legs ?? list.legs)?.length && <p className="ax-empty">No selections match these filters.</p>}
    {(legs ?? list.legs)?.map(leg => <details className="ax-disclosure" key={`${leg.providerFixtureId}-${leg.marketId}`}>
      <summary>{leg.homeTeam} vs {leg.awayTeam} <Badge state={leg.status} /></summary>
      <dl className="ax-detail-grid"><div><dt>League · kickoff (SAST)</dt><dd>{leg.leagueName} · {sastTime(leg.kickoff)}</dd></div>
        <div><dt>Published market</dt><dd>{marketDisplayLabel(leg.marketId, leg.marketLabel)}</dd></div>
        <div><dt>Predicted probability</dt><dd>{leg.probability ? `${(Number(leg.probability) * 100).toFixed(1)}%` : '—'}</dd></div>
        <div><dt>Actual score</dt><dd>{leg.homeGoals != null && leg.awayGoals != null ? `${leg.homeGoals}–${leg.awayGoals}` : '—'}</dd></div>
        <div><dt>Saved odds</dt><dd>{leg.odds ? `${leg.odds.decimalOdds} · ${leg.odds.source === 'model-fair' ? 'Estimated model fair odds' : leg.odds.bookmaker || leg.odds.source}` : '—'}</dd></div>
        {leg.settledAt && <div><dt>Settled (SAST)</dt><dd>{sastTime(leg.settledAt)}</dd></div>}
      </dl>
      {leg.explanation && <p className="ax-muted text-xs">{leg.explanation}</p>}
      {leg.resolutionNote && <p className="ax-muted text-xs">{leg.resolutionNote}</p>}
    </details>)}
  </>;
}

export default function AdminPublished({ mode, revision }: { mode: 'picks' | 'history'; revision: number }) {
  return mode === 'picks' ? <DailyPicks revision={revision} /> : <History revision={revision} />;
}

function DailyPicks({ revision }: { revision: number }) {
  const source = useAdminResource(`picks:${revision}`, getOfficialToday);
  return <Panel title="Today’s official list" subtitle={`${source.data?.businessDate ?? sastDate()} SAST`}
    action={<Link className="ax-button" to={adminLink('predictions')}>Open manual preview</Link>}>
    {source.loading && <Feedback>Loading the official list…</Feedback>}
    {source.error && <Feedback error>{source.error}</Feedback>}
    {source.data && <><div className="mb-3"><Badge state={source.data.published ? 'published' : 'unpublished'} label={source.data.published ? 'Published' : 'Unpublished'} /></div><Picks list={source.data} /></>}
    <Link className="ax-button mt-3" to="/history">View customer results</Link>
  </Panel>;
}

function History({ revision }: { revision: number }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [market, setMarket] = useState('');
  const historyLoader = useCallback(() => getOfficialHistory(page), [page]);
  const history = useAdminResource(`history:${page}:${revision}`, historyLoader);
  const summary = useAdminResource(`metrics:${revision}`, getOfficialSummary);
  const lists = history.data?.results ?? [];
  const markets = new Map<string, string>();
  lists.forEach(list => list.legs.forEach(leg => markets.set(leg.marketId, marketDisplayLabel(leg.marketId, leg.marketLabel))));
  const entries = lists.filter(list => !date || date === list.businessDate).map(list => ({
    list, legs: list.legs.filter(leg =>
      (!status || leg.status === status) && (!market || leg.marketId === market) &&
      `${leg.homeTeam} ${leg.awayTeam} ${leg.leagueName}`.toLowerCase().includes(query.toLowerCase().trim())),
  })).filter(entry => entry.legs.length > 0);
  return <>
    <Panel title="Performance" subtitle={summary.data ? `${summary.data.scope.period.from ?? '—'} to ${summary.data.scope.period.to ?? '—'} · ${summary.data.scope.listsConsidered} published lists` : 'Published selections only'}>
      {summary.loading && <Feedback>Loading performance…</Feedback>}
      {summary.error && <Feedback error>{summary.error}</Feedback>}
      {summary.data && <div className="ax-grid">{(['lists', 'selections'] as const).map(key => {
        const result = summary.data?.metrics[key];
        const rate = result?.win_rate ?? result?.hit_rate;
        return result && <div className="ax-disclosure" key={key}><h3 className="font-semibold pt-2">{key === 'lists' ? 'Whole daily lists' : 'Individual selections'}</h3>
          <strong className="text-xl">{rate == null ? '—' : `${(Number(rate) * 100).toFixed(1)}%`}</strong>
          <p className="ax-muted text-xs">{result.won} won of {result.denominator} settled · {result.lost} lost · {result.pending} pending · {result.void} void · {result.unresolved} unresolved</p></div>;
      })}</div>}
    </Panel>
    <Panel title="Published history" subtitle="Date, league, team, market and outcome filters apply to the current page."
      action={<Link className="ax-button" to="/history?view=predictions">Open full customer archive</Link>}>
      <div className="ax-toolbar"><label>Date <input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label>Team or league <input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Outcome <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All outcomes</option><option value="won">Correct</option><option value="lost">Incorrect</option><option value="pending">Pending</option><option value="void">Void</option><option value="unresolved">Unresolved</option></select></label>
        <label>Market <select value={market} onChange={event => setMarket(event.target.value)}><option value="">All markets</option>
          {Array.from(markets.entries()).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
      </div>
      {history.loading && <Feedback>Loading published history…</Feedback>}
      {history.error && <Feedback error>{history.error}</Feedback>}
      {history.data && <>
        {!entries.length && <p className="ax-empty">No published selections on this page match the current filters.</p>}
        {entries.map(({ list, legs }) => <section className="mb-4" key={list.businessDate}><h3 className="font-semibold mb-2">{list.businessDate} SAST <Badge state={list.status ?? 'pending'} label={list.status === 'won' ? 'List won' : list.status === 'lost' ? 'List lost' : undefined} /></h3><Picks list={list} legs={legs} /></section>)}
        <Pagination page={page} totalPages={history.data.totalPages} onPage={value => { setPage(value); setMarket(''); }} />
      </>}
    </Panel>
  </>;
}
