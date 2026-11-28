import React, { useEffect, useRef, useState } from 'react';
import { Feedback, sastTime } from './admin-ui';

import { formatLeagueLabel } from '../../config/league-labels';
import { runManualTask } from '../../services/admin';
import { describeFailure } from '../../services/api/failures';
import { ApiRequestError } from '../../services/api/client';
import type { ManualTaskKind, ManualTasksResponse } from '../../services/admin/types';

const tasks: { kind: ManualTaskKind; label: string; guidance: string }[] = [
  { kind: 'daily', label: 'Daily ingestion', guidance: '1 pass per league per day: league data, history, fixtures and standings.' },
  { kind: 'odds', label: 'Refresh odds', guidance: 'Up to 5 passes per league per day, when odds are needed. Refresh fixtures first.' },
  { kind: 'predict-settle', label: 'Predict and settle', guidance: 'Up to 3 passes per league per day around match times. Refreshes fixtures and odds first.' },
  { kind: 'settle', label: 'Settle only', guidance: 'Refreshes results and settles eligible predictions independently of prediction generation.' },
  {
    kind: 'update-results',
    label: 'Update final results',
    guidance: 'Re-fetches stored fixtures for the selected league only, then settles its published selections. '
      + 'Updates the public history and win stats. Available for past dates.',
  },
];

const errorMessage = (error: unknown) => {
  if (error instanceof ApiRequestError && typeof error.validationErrors === 'object'
      && error.validationErrors !== null) {
    const detail = Object.entries(error.validationErrors).find(([key]) => key === 'detail')?.[1];
    if (typeof detail === 'string') return detail;
  }
  return describeFailure(error);
};

const ManualTasksPanel: React.FC<{
  date: string;
  leagues: number[];
  configuredLeagues: number[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  resource: { data?: ManualTasksResponse; error?: string; loading: boolean };
  onRefresh: () => void;
  onActivity: () => void;
}> = ({ date, leagues, configuredLeagues, busy, onBusyChange, resource, onRefresh, onActivity }) => {
  const { data, error: loadError, loading } = resource;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const inFlight = useRef(false);
  const [progressExpanded, setProgressExpanded] = useState(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const run = async (kind: ManualTaskKind) => {
    if (inFlight.current) return;
    inFlight.current = true;
    onBusyChange(true);
    setError('');
    const failures: string[] = [];
    const decimals: string[] = [];
    try {
      const targets = kind === 'catalog' ? [0] : leagues;
      for (let index = 0; index < targets.length; index += 1) {
        if (!active.current) return;
        const league = targets[index];
        const label = league === 0 ? 'global catalogue' : formatLeagueLabel(league);
        setMessage(`Running ${kind} for ${label} (${index + 1}/${targets.length})…`);
        try {
          const response = await runManualTask(date, league, kind);
          if (kind === 'update-results') {
            decimals.push(`${label}: ${response.data.legsSettled ?? 0} settled, `
              + `${response.data.legsVoided ?? 0} void, ${response.data.legsUnresolved ?? 0} unresolved, `
              + `${response.data.listsFinalised ?? 0} list(s) finalised.`);
          }
        } catch (caught) {
          failures.push(`${label}: ${errorMessage(caught)}`);
        } finally {
          if (active.current) onActivity();
        }
      }
      if (!active.current) return;
      const suffix = decimals.length ? ` ${decimals.join(' ')}` : '';
      setMessage(failures.length ? 'Pass finished with errors. Review and retry the affected leagues.' : `Pass completed.${suffix}`);
      setError(failures.join(' '));
    } finally {
      inFlight.current = false;
      if (active.current) onBusyChange(false);
    }
  };

  return (
    <section aria-labelledby="manual-tasks-heading" className="ax-panel">
      <h2 id="manual-tasks-heading" className="text-lg font-bold">Manual ingestion and prediction tasks</h2>
      <p className="mt-2 text-sm text-slate-600">
        Operations run directly, one league at a time. Start with the global catalogue and daily ingestion, then refresh odds, predict or settle as needed.
        Prediction and settlement process bounded batches in the current season. Keep this workspace open while a request runs.
      </p>
      <div className="ax-toolbar mt-3">
        <strong>{date} SAST</strong><span className="ax-muted">{leagues.length ? leagues.map(formatLeagueLabel).join(', ') : 'No leagues selected'}</span>
        <button type="button" className="ax-button sm:ml-auto" onClick={onRefresh}>Reload task progress</button>
      </div>
      {message && <Feedback>{message}</Feedback>}
      {error && <Feedback error>{error}</Feedback>}
      {loadError && <Feedback error>Could not load manual task progress. {loadError}</Feedback>}
      {loading && <Feedback>Loading task progress…</Feedback>}
      <div className="mt-4 rounded-lg border p-3">
        <h3 className="font-semibold">Global league catalogue</h3>
        <p className="text-sm text-slate-600">1 pass per day; refreshes the global league catalogue.</p>
        {data && <p className="text-sm">
          Admin passes started today ({data.today}, SAST): {data.counts.catalog}. Latest for {date}:{' '}
          {data.progress.find(row => row.leagueId === 0 && row.kind === 'catalog')?.status ?? 'Remaining'}.
        </p>}
        <button type="button" disabled={busy} onClick={() => void run('catalog')}
          className="ax-button mt-2">
          Run global league catalogue
        </button>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {tasks.map(task => (
          <div key={task.kind} className="rounded-lg border p-3">
            <h3 className="font-semibold">{task.label}</h3>
            <p className="text-sm text-slate-600">{task.guidance}</p>
            {data && <p className="text-sm">Admin league passes started today ({data.today}, SAST): {data.counts[task.kind]}</p>}
            <button type="button" disabled={busy || !leagues.length} onClick={() => void run(task.kind)}
              className="ax-button mt-2">
              Run {task.label.toLowerCase()}
            </button>
          </div>
        ))}
      </div>
      <button
        aria-label="Toggle Progress by league" aria-expanded={progressExpanded}
        onClick={() => setProgressExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left mt-5 mb-2"
      >
        <h3 className="font-semibold">Progress by league for {date}</h3>
        <span className="ax-muted text-xs">{progressExpanded ? 'Hide' : 'Show'}</span>
      </button>
      {progressExpanded && (
        <>
          <p className="text-xs text-slate-500">Latest pass for each task; a failed or interrupted pass should be reviewed and retried. “Remaining” means no pass recorded for this date.</p>
          {data && <ul className="mt-2 space-y-2 text-sm">
            {configuredLeagues.map(league => (
              <li key={league} className="rounded-lg border p-3">
                <strong>{formatLeagueLabel(league)}</strong>
                {tasks.map(task => {
                  const progress = data.progress.find(row => row.leagueId === league && row.kind === task.kind);
                  const count = data.leagueCounts[String(league)]?.[task.kind] ?? 0;
                  const steps = progress ? Object.keys(progress.checkpoint)
                    .filter(key => key.startsWith('completed:')).map(key => key.slice('completed:'.length)) : [];
                  return <p key={task.kind}>{task.label}: {progress ? progress.status : 'Remaining'} · {count} started today
                    {steps.length ? ` · completed steps: ${steps.join(', ')}` : ''}
                    {progress?.error ? ` (${progress.error})` : ''}{progress?.startedAt ? ` · ${sastTime(progress.startedAt)} SAST` : ''}</p>;
                })}
                <p>Daily list prediction: {data.progress.find(row => row.leagueId === league && row.kind === 'predict')?.status ?? 'Remaining'}
                  {' '}· {data.leagueCounts[String(league)]?.predict ?? 0} started today</p>
              </li>
            ))}
          </ul>}
          {data && <p className="mt-2 text-sm text-slate-600">
            Daily list prediction passes started today by admins: {data.counts.predict}.
            Manual list publications today: {data.manualPublicationsToday}.
          </p>}
        </>
      )}
    </section>
  );
};

export default ManualTasksPanel;
