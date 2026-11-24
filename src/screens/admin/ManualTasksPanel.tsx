import React, { useEffect, useRef, useState } from 'react';

import { formatLeagueLabel } from '../../config/league-labels';
import { getManualTasks, runManualTask } from '../../services/admin';
import { describeFailure } from '../../services/api/failures';
import { ApiRequestError } from '../../services/api/client';
import type { ManualTaskKind, ManualTasksResponse } from '../../services/admin/types';

const tasks: { kind: ManualTaskKind; label: string; guidance: string }[] = [
  { kind: 'daily', label: 'Daily ingestion', guidance: '1 pass per league per day: league data, history, fixtures and standings.' },
  { kind: 'odds', label: 'Refresh odds', guidance: 'Up to 5 passes per league per day, when odds are needed. Refresh fixtures first.' },
  { kind: 'predict-settle', label: 'Predict and settle', guidance: 'Up to 3 passes per league per day around match times. Refreshes fixtures and odds first.' },
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
  version: number;
  onActivity: () => void;
}> = ({ date, leagues, configuredLeagues, busy, onBusyChange, version, onActivity }) => {
  const [data, setData] = useState<ManualTasksResponse | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setData(null);
    getManualTasks(date).then(response => {
      if (active) {
        setData(response.data);
        setLoadError('');
      }
    }).catch(caught => {
      if (active) setLoadError(`Could not load manual task progress: ${describeFailure(caught)}`);
    });
    return () => { active = false; };
  }, [date, version]);

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
    <section aria-labelledby="manual-tasks-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="manual-tasks-heading" className="text-lg font-bold">Manual ingestion and prediction tasks</h2>
      <p className="mt-2 text-sm text-slate-600">
        Select leagues above. Tasks execute immediately, one league at a time; no background job is sent.
        Refresh the global catalogue and run daily ingestion first, then odds and predict/settle as needed. Recommendations reflect the
        previous schedule, not hard limits. Each pass consumes provider quota. Keep this page open while it runs.
        Prediction and settlement process bounded batches of fixtures in the current season, not only the selected date.
        If prediction fails or completed fixtures need fresh scores, use Update final results to refresh and settle the published selections separately.
      </p>
      {message && <p role="status" className="mt-3 text-sm text-teal-900">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {loadError && <p role="alert" className="mt-3 text-sm text-rose-700">{loadError}</p>}
      {!data && !loadError && <p className="mt-3 text-sm">Loading task progress…</p>}
      <button type="button" onClick={onActivity}
        className="mt-3 rounded-lg border px-4 py-2 text-sm font-semibold">Reload task progress</button>
      <div className="mt-4 rounded-lg border p-3">
        <h3 className="font-semibold">Global league catalogue</h3>
        <p className="text-sm text-slate-600">1 pass per day; refreshes the global league catalogue.</p>
        {data && <p className="text-sm">
          Admin passes started today ({data.today}, SAST): {data.counts.catalog}. Latest for {date}:{' '}
          {data.progress.find(row => row.leagueId === 0 && row.kind === 'catalog')?.status ?? 'Remaining'}.
        </p>}
        <button type="button" disabled={busy} onClick={() => void run('catalog')}
          className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Run global league catalogue
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.map(task => (
          <div key={task.kind} className="rounded-lg border p-3">
            <h3 className="font-semibold">{task.label}</h3>
            <p className="text-sm text-slate-600">{task.guidance}</p>
            {data && <p className="text-sm">Admin league passes started today ({data.today}, SAST): {data.counts[task.kind]}</p>}
            <button type="button" disabled={busy || !leagues.length} onClick={() => void run(task.kind)}
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Run {task.label.toLowerCase()}
            </button>
          </div>
        ))}
      </div>
      <h3 className="mt-5 font-semibold">Progress by league for {date}</h3>
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
                {progress?.error ? ` (${progress.error})` : ''}</p>;
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
    </section>
  );
};

export default ManualTasksPanel;
