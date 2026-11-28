import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FixtureDataModel } from '../../models/fixtures';
import type { FixturePrediction } from '../../prediction-engine/types';
import { apiGet } from '../../services/api/client';
import type { PredictionEnvelopeRow } from '../../services/predictions';
import { marketDisplayLabel } from '../../services/predictions/market-label';
import { formatLeagueLabel } from '../../config/league-labels';
import { adminLink, Badge, Feedback, Pagination, Panel, sastDate, sastTime } from './admin-ui';
import useAdminResource from './useAdminResource';

type CanonicalFixture = Pick<FixtureDataModel, 'fixture' | 'teams' | 'goals' | 'score'> & {
  league: Pick<FixtureDataModel['league'], 'id' | 'season'>;
};

type Page<T> = { response: T[]; paging?: { total?: number } };
const previousUtcDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const matchStates: Record<string, string> = { NS: 'Scheduled', TBD: 'Time pending', FT: 'Full time', AET: 'After extra time', PEN: 'Penalties', PST: 'Postponed', CANC: 'Cancelled', LIVE: 'Live', '1H': 'First half', '2H': 'Second half', HT: 'Half time' };

function Team({ team }: { team: CanonicalFixture['teams']['home'] }) {
  return <span className="inline-flex items-center gap-1.5">{team.logo && <img src={team.logo} loading="lazy" alt="" className="w-5 h-5 object-contain" />}{team.name}</span>;
}

function Score({ fixture }: { fixture: CanonicalFixture }) {
  const { home, away } = fixture.goals;
  return <>{Number.isFinite(home) && Number.isFinite(away) ? `${home}–${away}` : '—'}</>;
}

function ForecastVersion({ row }: { row: PredictionEnvelopeRow }) {
  const output = row.output as unknown as Partial<FixturePrediction>;
  const context = row.fixture as CanonicalFixture | undefined;
  const teams = output.fixture?.teams ?? context?.teams;
  const kickoff = output.fixture?.fixture.date ?? context?.fixture.date;
  const id = output.fixture?.league.id ?? context?.league.id;
  const markets = (output.markets ?? []).filter(market => Number.isFinite(market.modelProbability));
  const selections = new Set(output.selections?.map(market => market.marketId));
  return <details className="ax-disclosure">
    <summary><span>{teams ? `${teams.home.name} vs ${teams.away.name}` : `Forecast #${row.id}`}</span> <Badge state={row.is_actionable ? 'active' : 'saved'} label={row.is_actionable ? 'Current pre-match' : 'Saved version'} /></summary>
    <p className="ax-muted my-2 text-xs">{id ? formatLeagueLabel(id) : 'League unavailable'} · kickoff {sastTime(kickoff)} SAST · generated {sastTime(row.generated_at)} SAST · version #{row.id}</p>
    {context && <p className="mb-2 text-xs">Actual score <strong><Score fixture={context} /></strong> · {matchStates[context.fixture.status.short] ?? context.fixture.status.short}</p>}
    {markets.length ? <div className="ax-table-wrap" tabIndex={0} role="region" aria-label="Forecast markets"><table className="ax-table"><thead><tr><th scope="col">Market</th><th scope="col">Model probability</th><th scope="col">Saved selection</th></tr></thead>
      <tbody>{markets.map(market => <tr key={market.marketId}><td>{marketDisplayLabel(market.marketId, market.label)}</td>
        <td className="font-semibold tabular-nums">{(market.modelProbability * 100).toFixed(1)}%</td><td>{selections.has(market.marketId) ? 'Selected' : '—'}</td></tr>)}</tbody></table></div>
      : <p className="ax-empty">This version has no stored market probabilities.</p>}
    {output.headline && <p className="mt-3 text-sm">{output.headline}</p>}
    {!!output.dataQuality?.warnings.length && <ul className="mt-3 text-xs ax-muted">{output.dataQuality.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
  </details>;
}

export default function AdminFootball({ mode, date, configured, revision }: {
  mode: 'fixtures' | 'predictions'; date: string; configured: number[]; revision: number;
}) {
  const [filter, setFilter] = useState({ date, league: '', page: 1 });
  const { league, page } = filter.date === date ? filter : { league: '', page: 1 };
  const forecastPages = useRef<{ key: string; byDate: Map<string, number> }>();
  const load = useCallback(async () => {
    const params = { page, page_size: 20, ...(league ? { league } : {}) };
    const previous = previousUtcDate(date);
    if (mode === 'fixtures') {
      const response = await apiGet<Page<CanonicalFixture>>('/fixtures/', { params: { ...params, from: previous, to: date } });
      return { data: { fixtures: response.data.response.filter(row => sastDate(new Date(row.fixture.date)) === date),
        versions: [], pages: response.data.paging?.total ?? 1 } };
    }
    const key = `${date}:${league}:${revision}`;
    if (forecastPages.current?.key !== key) forecastPages.current = { key, byDate: new Map() };
    const known = forecastPages.current.byDate;
    const days = await Promise.all([previous, date].map(async day => {
      const pages = known.get(day);
      if (pages !== undefined && page > pages) return { data: { response: [], paging: { total: pages } } };
      const response = await apiGet<Page<PredictionEnvelopeRow>>('/predictions/', { params: { ...params, history: 'true', date: day } });
      known.set(day, response.data.paging?.total ?? 1);
      return response;
    }));
    return { data: { fixtures: [], versions: days.flatMap(response => response.data.response).filter(row => {
      const kickoff = row.fixture?.fixture.date ?? (row.output as unknown as Partial<FixturePrediction>).fixture?.fixture.date;
      return kickoff && Number.isFinite(Date.parse(kickoff)) && sastDate(new Date(kickoff)) === date;
    }), pages: Math.max(1, ...days.map(response => response.data.paging?.total ?? 1)) } };
  }, [mode, page, league, date, revision]);
  const record = useAdminResource(`${mode}:${date}:${league}:${page}:${revision}`, load);
  return <Panel title={mode === 'fixtures' ? 'Stored fixtures' : 'Saved forecast versions'} subtitle={`${date} SAST · match data stored by PredictXI`}
    action={mode === 'fixtures' ? <Link className="ax-button" to={adminLink('operations', date)}>Refresh football data</Link> : undefined}>
    <div className="ax-toolbar"><label>League <select value={league} onChange={event => setFilter({ date, league: event.target.value, page: 1 })}>
      <option value="">All leagues</option>{configured.map(id => <option key={id} value={id}>{formatLeagueLabel(id)}</option>)}
    </select></label></div>
    {record.loading && <Feedback>{mode === 'fixtures' ? 'Loading stored fixtures…' : 'Loading saved forecasts…'}</Feedback>}
    {record.error && <Feedback error>{record.error}</Feedback>}
    {record.data && <>
      {mode === 'fixtures' && record.data.fixtures.length > 0 && <div className="ax-table-wrap" tabIndex={0} role="region" aria-label="Stored fixtures table">
        <table className="ax-table"><thead><tr>{['Kickoff (SAST)', 'League', 'Match', 'Score', 'Match status'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{record.data.fixtures.map(item => <tr key={item.fixture.id}><td>{sastTime(item.fixture.date)}</td><td>{formatLeagueLabel(item.league.id)}</td>
            <td><Team team={item.teams.home} /> <span className="ax-muted">vs</span> <Team team={item.teams.away} /></td>
            <td><Score fixture={item} /></td><td><Badge state={item.fixture.status.short} label={matchStates[item.fixture.status.short] ?? item.fixture.status.short} /></td></tr>)}</tbody>
        </table>
      </div>}
      {mode === 'predictions' && record.data.versions.map(row => <ForecastVersion key={row.id} row={row} />)}
      {record.data.versions.length + record.data.fixtures.length === 0 && <p className="ax-empty">No {mode === 'fixtures' ? 'fixtures' : 'saved forecasts'} on this page for the selected SAST date and league.</p>}
      {record.data.pages > 1 && <Pagination page={page} totalPages={record.data.pages} onPage={value => setFilter({ date, league, page: value })} />}
    </>}
  </Panel>;
}
