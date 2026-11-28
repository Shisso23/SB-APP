import React, { useState } from 'react';
import type { AdminJob, ManualTasksResponse } from '../../services/admin/types';
import { formatLeagueLabel } from '../../config/league-labels';
import { Badge, durationText, Feedback, Panel, sastTime } from './admin-ui';

type Result<T> = { data?: T; loading: boolean; error?: string };
const checkpoints = (value: Record<string, unknown>) => Object.keys(value).filter(key => key.startsWith('completed:')).map(key => key.slice(10));

export default function AdminExecutions({ date, jobs, manual }: {
  date: string; jobs: Result<AdminJob[]>; manual: Result<ManualTasksResponse>;
}) {
  const [filter, setFilter] = useState('all');
  const filteredJobs = jobs.data?.filter(job => filter === 'all' || job.status === filter);
  const direct = manual.data?.progress.filter(row => filter === 'all' || row.status === filter)
    .slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return <>
    <div className="ax-toolbar"><label>Execution status <select value={filter} onChange={event => setFilter(event.target.value)}>
      {['all', 'running', 'queued', 'completed', 'failed', 'interrupted', 'cancelled'].map(state =>
        <option key={state} value={state}>{state === 'all' ? 'All statuses' : state[0].toUpperCase() + state.slice(1)}</option>)}
    </select></label></div>
    <Panel title="Direct requests" subtitle={`Latest request for each league and operation · ${date} SAST`}>
      {manual.loading && <Feedback>Loading direct requests…</Feedback>}
      {manual.error && <Feedback error>Direct requests could not be loaded. Refresh to retry.</Feedback>}
      {direct?.length === 0 && <p className="ax-empty">No direct requests match this date and status.</p>}
      {direct?.map(row => <details className="ax-disclosure" key={`${row.leagueId}-${row.kind}`}>
        <summary><span className="capitalize">{row.kind.replace(/-/g, ' ')}</span> · {row.leagueId ? formatLeagueLabel(row.leagueId) : 'Global catalogue'} <Badge state={row.status} /></summary>
        <dl className="ax-detail-grid"><div><dt>Started (SAST)</dt><dd>{sastTime(row.startedAt)}</dd></div>
          <div><dt>Finished (SAST)</dt><dd>{sastTime(row.finishedAt)}</dd></div><div><dt>Duration</dt><dd>{durationText(row.startedAt, row.finishedAt)}</dd></div></dl>
        {row.error && <p className="text-rose-800">{row.error}</p>}
        {checkpoints(row.checkpoint ?? {}).length > 0 && <p>Completed steps · {checkpoints(row.checkpoint).join(', ')}</p>}
      </details>)}
    </Panel>
    <Panel title="Recent runs" subtitle="Historical job records for the selected business date. New direct requests are recorded separately.">
      {jobs.loading && <Feedback>Loading job history…</Feedback>}
      {jobs.error && <Feedback error>Job history could not be loaded. Refresh to retry.</Feedback>}
      {filteredJobs?.length === 0 && <p className="ax-empty">No runs for this date and status.</p>}
      {filteredJobs?.map(job => <details className="ax-disclosure" key={job.jobId}>
        <summary className="capitalize">#{job.jobId} · {job.kind} <Badge state={job.status} /></summary>
        <p className="ax-muted my-2 text-xs">Triggered by {job.trigger}{job.requestedBy ? ` (${job.requestedBy})` : ''} · created {sastTime(job.createdAt)} SAST</p>
        <dl className="ax-detail-grid"><div><dt>Started (SAST)</dt><dd>{sastTime(job.startedAt)}</dd></div><div><dt>Finished (SAST)</dt><dd>{sastTime(job.finishedAt)}</dd></div>
          <div><dt>Duration</dt><dd>{durationText(job.startedAt, job.finishedAt)}</dd></div>
          {job.executionMechanism && <div><dt>Mechanism</dt><dd>{job.executionMechanism}</dd></div>}{job.scheduleId && <div><dt>Schedule</dt><dd>{job.scheduleId}</dd></div>}</dl>
        <p className="mb-2 text-xs">Season {job.season} · {job.leagues.map(formatLeagueLabel).join(', ') || 'No league scope recorded'}</p>
        {job.error && <p className="text-rose-800">{job.error}</p>}
        <ul className="ax-row-list text-xs">{Object.entries(job.leagueResults ?? {}).map(([id, result]) => <li key={id}>
          <span>{formatLeagueLabel(Number(id))} <Badge state={result.status} />
            {result.error && ` · ${result.error}`}
            {result.steps && Object.values(result.steps).includes('skipped') && ` · already completed this five-minute slot: ${Object.entries(result.steps).filter(([, outcome]) => outcome === 'skipped').map(([step]) => step).join(', ')}`}
          </span>
        </li>)}</ul>
        {Object.entries(job.summary ?? {}).some(([, value]) => typeof value === 'number') && <dl className="ax-detail-grid">
          {Object.entries(job.summary).filter(([, value]) => typeof value === 'number').map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{String(value)}</dd></div>)}
        </dl>}
      </details>)}
    </Panel>
  </>;
}
