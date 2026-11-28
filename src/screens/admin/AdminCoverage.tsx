import React, { useState } from 'react';
import type { CoverageResponse } from '../../services/admin/types';
import { formatLeagueLabel } from '../../config/league-labels';
import { Badge, Feedback, Panel, sastTime } from './admin-ui';

export function RunScope({ coverage, configured, busy, selected, onSelect, date, error }: {
  coverage?: CoverageResponse; configured: number[]; busy: boolean; selected: number[];
  onSelect: (ids: number[]) => void; date: string; error?: string;
}) {
  const [query, setQuery] = useState('');
  const rows = (coverage?.leagues ?? configured.map(leagueId => ({ leagueId, eligibleFixtures: undefined, status: undefined })));
  return <Panel title="Run controls" subtitle={`${date} SAST · ${selected.length} selected`}>
    {error && <Feedback error>Coverage could not be loaded. The configured leagues are shown for selection.</Feedback>}
    <div className="ax-toolbar">
      <label className="sr-only" htmlFor="run-league-search">Find a league</label>
      <input id="run-league-search" type="search" placeholder="Find a league" value={query} onChange={event => setQuery(event.target.value)} />
      <button className="ax-button" type="button" disabled={busy || !coverage} onClick={() => onSelect(rows.filter(row => (row.eligibleFixtures ?? 0) > 0).map(row => row.leagueId))}>Select all eligible</button>
      <button className="ax-button" type="button" disabled={busy || !rows.length} onClick={() => onSelect(rows.map(row => row.leagueId))}>Select all</button>
      <button className="ax-button" type="button" disabled={busy} onClick={() => onSelect([])}>Clear</button>
    </div>
    <fieldset disabled={busy}>
      <legend className="sr-only">Leagues to cover</legend>
      <div className="ax-scope">{rows.filter(row => formatLeagueLabel(row.leagueId).toLowerCase().includes(query.trim().toLowerCase())).map(row => <label key={row.leagueId}>
        <input type="checkbox" checked={selected.includes(row.leagueId)} onChange={() => onSelect(selected.includes(row.leagueId) ? selected.filter(id => id !== row.leagueId) : [...selected, row.leagueId])} />
        <span>{formatLeagueLabel(row.leagueId)}{row.eligibleFixtures !== undefined && <small className="ax-muted block">{row.eligibleFixtures} eligible</small>}</span>
      </label>)}</div>
    </fieldset>
    {!selected.length && <Feedback error>Select at least one league to run a manual task.</Feedback>}
  </Panel>;
}

export default function AdminCoverage({ coverage, loading, error }: {
  coverage?: CoverageResponse; loading: boolean; error?: string;
}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const rows = (coverage?.leagues ?? []).filter(row =>
    formatLeagueLabel(row.leagueId).toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter === 'all' || (filter === 'eligible' ? row.eligibleFixtures > 0 : row.status === filter)));
  return <Panel title="Coverage by league" subtitle={coverage?.summary.label}>
    <div className="ax-toolbar">
      <label>League <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, country or ID" /></label>
      <label>Coverage status <select value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">All configured leagues</option><option value="eligible">With eligible fixtures</option>
        <option value="published">Published</option><option value="not_generated">Not generated</option>
        <option value="failed">Failed</option><option value="no_eligible_fixtures">No eligible fixtures</option>
      </select></label>
    </div>
    {loading && <Feedback>Loading coverage…</Feedback>}
    {error && <Feedback error>League coverage could not be loaded. Refresh to retry.</Feedback>}
    {coverage && (rows.length ? <div className="ax-table-wrap" tabIndex={0} role="region" aria-label="League coverage table">
      <table className="ax-table"><thead><tr>{['League', 'Coverage', 'Eligible fixtures', 'Forecasts', 'Last update (SAST)', 'Season freshness', 'Notes'].map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const freshness = coverage.freshness?.[String(row.leagueId)];
          return <tr key={row.leagueId}><td className="font-semibold">{formatLeagueLabel(row.leagueId)}</td>
            <td><Badge state={row.status} /></td><td>{row.eligibleFixtures}</td><td>{row.predictions}</td>
            <td>{sastTime(freshness?.lastGeneratedAt || row.lastPublishedAt)}</td>
            <td>{freshness ? <Badge state={freshness.state} label={{ current: 'Current', stale: 'Stale', empty: 'Nothing published' }[freshness.state]} /> : '—'}</td>
            <td>{row.error && <p className="text-rose-800">{row.error}</p>}
              {row.previousVersionAvailable && <p>An earlier published version is still available.</p>}
              {row.status === 'no_eligible_fixtures' && <p>Nothing to generate for this date.</p>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="ax-empty">No leagues match these filters.</p>)}
    <p className="ax-muted mt-3 text-xs">Coverage can include earlier queued or failed jobs. Check manual operations for the latest direct requests.</p>
  </Panel>;
}
