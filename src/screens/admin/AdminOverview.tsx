import React from 'react';
import { Link } from 'react-router-dom';
import type { AdminJob, CoverageResponse, ManualTasksResponse } from '../../services/admin/types';
import type { OfficialListSummary } from '../../services/official/types';
import { formatLeagueLabel } from '../../config/league-labels';
import { adminLink, AdminButtonLink, Badge, Feedback, Icon, Panel, sastTime } from './admin-ui';

const Metric = ({ label, value, caption }: { label: string; value?: number | string; caption: string }) => <div className="ax-metric">
  <dt>{label}</dt><dd>{typeof value === 'number' ? value.toLocaleString('en-ZA') : value ?? '—'}</dd><small>{caption}</small>
</div>;

export default function AdminOverview({ date, workflowDate, configured, coverage, jobs, manual, list, customers, error, loading }: {
  date: string; workflowDate: string; configured: number; coverage?: CoverageResponse; jobs?: AdminJob[];
  manual?: ManualTasksResponse; list?: OfficialListSummary; customers?: number; error: boolean; loading: boolean;
}) {
  const leagues = coverage?.leagues;
  const eligible = leagues?.reduce((sum, row) => sum + row.eligibleFixtures, 0);
  const predictions = leagues?.reduce((sum, row) => sum + row.predictions, 0);
  const failed = manual?.progress.filter(run => run.status === 'failed' || run.status === 'interrupted') ?? [];
  const running = manual?.progress.filter(run => run.status === 'running') ?? [];
  const coverageAttention = leagues?.filter(row => row.eligibleFixtures > 0 && row.predictions < row.eligibleFixtures) ?? [];
  const recent = [...(manual?.progress ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5);
  return <>
    {loading && <Feedback>Loading today’s workspace data…</Feedback>}
    {error && <Feedback error>Some data sources could not be loaded. Refresh to retry.</Feedback>}
    <dl className="ax-metrics" aria-label="Today’s football operations">
      <Metric label="Eligible fixtures" value={eligible} caption="Today · configured leagues" />
      <Metric label="Fixtures with forecasts" value={predictions} caption="Today · stored forecasts" />
      <Metric label="Leagues with eligible fixtures" value={coverage?.summary.eligibleLeagues} caption={`${configured} leagues configured`} />
      <Metric label="Official daily picks" value={list && (list.published ? list.legCount ?? list.legs?.length ?? 'Published' : 'Unpublished')} caption={list?.published ? 'Published selections' : 'Today’s publication'} />
    </dl>
    <div className="ax-grid">
      <div>
        <Panel title="Today’s processing coverage" subtitle={coverage?.summary.label ?? date}
          action={<AdminButtonLink view="coverage" date={date}>Open coverage</AdminButtonLink>}>
          {leagues?.length ? <ul className="ax-row-list">
            {[...leagues].sort((a, b) => b.eligibleFixtures - a.eligibleFixtures).slice(0, 6).map(row => <li key={row.leagueId}>
              <div><strong>{formatLeagueLabel(row.leagueId)}</strong><div className="ax-muted text-xs">{row.predictions} stored · {row.eligibleFixtures} eligible</div></div>
              <Badge state={row.status} label={row.status === 'not_generated' && row.predictions > 0 ? 'Forecasts stored' : undefined} />
            </li>)}
          </ul> : <p className="ax-empty">{leagues ? 'No league coverage is available for today.' : 'Coverage data is unavailable.'}</p>}
        </Panel>
        <Panel title="Recent activity" subtitle="Latest manual task per league and operation" action={<AdminButtonLink view="executions" date={date}>Execution history</AdminButtonLink>}>
          <ul className="ax-row-list">
            {recent.map(row => <li key={`${row.leagueId}-${row.kind}`}><div><strong className="capitalize">{row.kind.replace(/-/g, ' ')}</strong>
              <div className="ax-muted text-xs">{row.leagueId ? formatLeagueLabel(row.leagueId) : 'Global catalogue'} · {sastTime(row.startedAt)} SAST</div></div><Badge state={row.status} /></li>)}
            {!recent.length && <li className="ax-muted">{manual ? 'No manual tasks recorded for today.' : 'Manual activity unavailable.'}</li>}
          </ul>
          {jobs && jobs.length > 0 && <p className="ax-muted mt-3 text-xs">{jobs.length} recent job records for this date · latest <Badge state={jobs[0].status} /></p>}
        </Panel>
      </div>
      <div>
        {(failed.length > 0 || coverageAttention.length > 0 || list?.lastCheckError) && <Panel title="Requires attention">
          <ul className="ax-row-list">
            {failed.length > 0 && <li><span>{failed.length} latest manual {failed.length === 1 ? 'task needs' : 'tasks need'} review</span><Link className="font-semibold text-teal-800" to={adminLink('operations', workflowDate)}>Review</Link></li>}
            {coverageAttention.length > 0 && <li><span>{coverageAttention.length} eligible leagues with fewer forecasts than fixtures</span><Link className="font-semibold text-teal-800" to={adminLink('coverage', date)}>Review</Link></li>}
            {list?.lastCheckError && <li><span>The published list has a recorded check error.</span><Link className="font-semibold text-teal-800" to={adminLink('picks')}>Review</Link></li>}
          </ul>
        </Panel>}
        <Panel title="Quick actions" subtitle={running.length ? `${running.length} manual ${running.length === 1 ? 'task recorded' : 'tasks recorded'} as running` : undefined}>
          <div className="ax-pick-actions">
            <Link className="ax-button ax-primary" to={adminLink('operations', workflowDate)}><Icon name="operations" /> Manual tasks</Link>
            <Link className="ax-button" to={adminLink('predictions', workflowDate)}><Icon name="predictions" /> Run forecasts</Link>
            <Link className="ax-button" to={adminLink('picks')}><Icon name="picks" /> Review picks</Link>
            <Link className="ax-button" to={adminLink('schedules', workflowDate)}><Icon name="schedules" /> Schedules</Link>
          </div>
        </Panel>
        <Panel title="Customer operations" subtitle="Lifetime directory count" action={<AdminButtonLink view="customers">Customers</AdminButtonLink>}>
          <dl><div className="ax-metric"><dt>Registered accounts</dt><dd>{customers?.toLocaleString('en-ZA') ?? '—'}</dd></div></dl>
        </Panel>
      </div>
    </div>
  </>;
}
