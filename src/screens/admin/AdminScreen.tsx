import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getAdminCoverage,
  getAdminJobs,
  getAdminJob,
  getAdminStatus,
  startAdminRun,
} from '../../services/admin';
import type {
  AdminJob,
  AdminJobKind,
  AdminStatusResponse,
  CoverageResponse,
  CoverageStatus,
} from '../../services/admin/types';

/**
 * Administrative prediction workflow.
 *
 * SCOPE: this screen orchestrates and reports. It never computes a probability,
 * builds a betlist, or changes a threshold — forecasts come from the existing
 * engine path, untouched.
 *
 * ACCESS: the server refuses every endpoint here to a non-staff user. This screen
 * additionally hides itself, but that is only courtesy: hiding is not the control.
 *
 * LEAGUE SELECTION IS A FILTER. Selecting leagues narrows which fixtures a run
 * covers; it does not split the run, so suggested betlists remain identical to
 * what the desk already produces across the full prediction set.
 */

const STATUS_PRESENTATION: Record<CoverageStatus, { label: string; glyph: string; className: string }> = {
  not_generated: { label: 'Not generated', glyph: '○', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  queued: { label: 'Queued', glyph: '⋯', className: 'bg-sky-50 text-sky-800 border-sky-300' },
  running: { label: 'Running', glyph: '◐', className: 'bg-indigo-50 text-indigo-800 border-indigo-300' },
  published: { label: 'Published', glyph: '✓', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  refreshing: { label: 'Refreshing', glyph: '↻', className: 'bg-cyan-50 text-cyan-800 border-cyan-300' },
  failed: { label: 'Failed', glyph: '✕', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  no_eligible_fixtures: {
    label: 'No eligible fixtures',
    glyph: '—',
    className: 'bg-slate-50 text-slate-500 border-slate-200',
  },
};

const JOB_PRESENTATION: Record<string, { label: string; glyph: string; className: string }> = {
  queued: { label: 'Queued', glyph: '⋯', className: 'text-sky-700' },
  running: { label: 'Running', glyph: '◐', className: 'text-indigo-700' },
  completed: { label: 'Completed', glyph: '✓', className: 'text-emerald-700' },
  failed: { label: 'Failed', glyph: '✕', className: 'text-rose-700' },
  cancelled: { label: 'Cancelled', glyph: '⊘', className: 'text-slate-600' },
};

const StatusPill: React.FC<{ label: string; glyph: string; className: string }> = ({ label, glyph, className }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}>
    <span aria-hidden="true">{glyph}</span>
    {label}
  </span>
);

const todayIso = () => new Date().toISOString().slice(0, 10);

const AdminScreen: React.FC = () => {
  const [status, setStatus] = useState<AdminStatusResponse | null>(null);
  const [checking, setChecking] = useState(true);

  const [targetDate, setTargetDate] = useState<string>(todayIso());
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const pollTimer = useRef<number | null>(null);

  /** Ask the server whether this user is an admin. Never inferred locally. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await getAdminStatus();
        if (!cancelled) setStatus(response.data);
      } catch {
        // A signed-out visitor cannot read this; treat as "not an admin".
        if (!cancelled) setStatus({ isAdmin: false, isMember: false, configuredLeagues: [] });
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCoverage = useCallback(async (date: string) => {
    try {
      const response = await getAdminCoverage(date);
      setCoverage(response.data);
      setError(null);
      return response.data;
    } catch {
      setError('We could not load league coverage.');
      return null;
    }
  }, []);

  const loadJobs = useCallback(async (date: string) => {
    try {
      const response = await getAdminJobs(date);
      setJobs(response.data.jobs);
    } catch {
      /* Coverage already surfaces errors; the list can stay as-is. */
    }
  }, []);

  useEffect(() => {
    if (!status?.isAdmin) return;
    void loadCoverage(targetDate);
    void loadJobs(targetDate);
  }, [status?.isAdmin, targetDate, loadCoverage, loadJobs]);

  /** Poll a running job until it reaches a terminal state. */
  const pollJob = useCallback(
    async (jobId: number) => {
      const tick = async () => {
        try {
          const response = await getAdminJob(jobId);
          const job = response.data;
          if (job.isTerminal) {
            if (pollTimer.current) window.clearTimeout(pollTimer.current);
            pollTimer.current = null;
            setActiveJobId(null);
            setNotice(
              job.status === 'completed'
                ? 'Run completed. Coverage updated below.'
                : `Run ${job.status}: ${job.error || 'see details'}`,
            );
            void loadCoverage(targetDate);
            void loadJobs(targetDate);
            return;
          }
        } catch {
          /* Keep polling: a transient status read should not abort the run view. */
        }
        pollTimer.current = window.setTimeout(tick, 3000);
      };
      await tick();
    },
    [targetDate, loadCoverage, loadJobs],
  );

  useEffect(
    () => () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    },
    [],
  );

  const eligibleLeagues = useMemo(
    () => (coverage?.leagues ?? []).filter((row) => row.eligibleFixtures > 0).map((row) => row.leagueId),
    [coverage],
  );

  const toggleLeague = (leagueId: number) => {
    setSelectedLeagues((current) =>
      current.includes(leagueId) ? current.filter((id) => id !== leagueId) : [...current, leagueId],
    );
  };

  const run = async (kind: AdminJobKind) => {
    setNotice(null);
    setError(null);
    if (!selectedLeagues.length) {
      setError('Select at least one league before starting a run.');
      return;
    }
    setBusy(true);
    try {
      const response = await startAdminRun({ kind, date: targetDate, leagues: selectedLeagues });
      setActiveJobId(response.data.jobId);
      setNotice(`Run queued (job ${response.data.jobId}). Status will update automatically.`);
      void loadJobs(targetDate);
      void pollJob(response.data.jobId);
    } catch (caught) {
      // The server returns an actionable reason (e.g. an unconfigured league);
      // surface it rather than a generic failure.
      setError(
        (caught as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'We could not start the run.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-10 text-slate-600">
        <p role="status">Checking access…</p>
      </div>
    );
  }

  if (!status?.isAdmin) {
    // A plain refusal. The server enforces this independently; nothing here is
    // an access control.
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin access required</h1>
        <p className="mt-3 text-slate-600">
          This area is limited to authorised administrators. Membership does not grant access to it.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <header className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-700">Operations</span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Prediction workflow</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Select a date and the leagues to cover, then start a run. Selecting leagues filters which
            fixtures are included — it does not split the run, so suggested betlists stay exactly as the
            engine produces them.
          </p>
        </header>

        {notice ? (
          <p role="status" className="mb-4 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
        ) : null}

        {/* Controls */}
        <section aria-labelledby="controls-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="controls-heading" className="text-lg font-bold tracking-tight">Run controls</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
            <label className="text-sm font-medium text-slate-700">
              Prediction date
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Leagues to cover</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(coverage?.leagues ?? []).map((row) => {
                  const disabled = row.eligibleFixtures === 0;
                  const checked = selectedLeagues.includes(row.leagueId);
                  const inputId = `admin-league-${row.leagueId}`;
                  return (
                    <label
                      key={row.leagueId}
                      htmlFor={inputId}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                        checked ? 'border-teal-400 bg-teal-50 text-teal-900' : 'border-slate-300 bg-white text-slate-700'
                      } ${disabled ? 'opacity-60' : ''}`}
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleLeague(row.leagueId)}
                        className="h-4 w-4"
                      />
                      <span>League {row.leagueId}</span>
                      <span className="text-xs text-slate-500">
                        ({row.eligibleFixtures} eligible)
                      </span>
                    </label>
                  );
                })}
                {!coverage?.leagues.length ? (
                  <p className="text-sm text-slate-500">No leagues are configured for this project.</p>
                ) : null}
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedLeagues(eligibleLeagues)}
                  className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Select all eligible
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLeagues([])}
                  className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </fieldset>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !selectedLeagues.length}
              onClick={() => void run('generate')}
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              Predict
            </button>
            <button
              type="button"
              disabled={busy || !selectedLeagues.length}
              onClick={() => void run('refresh')}
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Refresh latest data
            </button>
            <button
              type="button"
              disabled={busy || !selectedLeagues.length}
              onClick={() => void run('publish')}
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Publish official list
            </button>
          </div>
          {/* A disabled button must say why, rather than leaving the operator to
              guess whether the control is broken. */}
          {!selectedLeagues.length ? (
            <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Select at least one league to start a run.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            Successful leagues become available to users as the run progresses; there is no need to wait
            for every league to finish.
          </p>
        </section>

        {/* Coverage */}
        <section aria-labelledby="coverage-heading" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="coverage-heading" className="text-lg font-bold tracking-tight">League coverage</h2>
              <p className="mt-1 text-sm text-slate-600">{coverage?.summary.label ?? 'Loading coverage…'}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadCoverage(targetDate)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh view
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Per-league coverage for {targetDate}</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">League</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Eligible fixtures</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Predictions</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last published</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Publication state</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(coverage?.leagues ?? []).map((row) => {
                  const presentation = STATUS_PRESENTATION[row.status];
                  const fresh = coverage?.freshness?.[String(row.leagueId)];
                  return (
                    <tr key={row.leagueId} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">League {row.leagueId}</td>
                      <td className="px-4 py-3">
                        <StatusPill {...presentation} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-800">{row.eligibleFixtures}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-800">{row.predictions}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {fresh?.lastGeneratedAt
                          ? new Date(fresh.lastGeneratedAt).toLocaleString()
                          : row.lastPublishedAt
                            ? new Date(row.lastPublishedAt).toLocaleString()
                            : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {fresh ? (
                          <span
                            className={
                              fresh.state === 'current'
                                ? 'text-sm font-semibold text-emerald-700'
                                : fresh.state === 'stale'
                                  ? 'text-sm font-semibold text-amber-700'
                                  : 'text-sm font-semibold text-slate-500'
                            }
                          >
                            <span aria-hidden="true">
                              {fresh.state === 'current' ? '✓' : fresh.state === 'stale' ? '⚠' : '○'}
                            </span>{' '}
                            {fresh.state === 'current'
                              ? 'Current'
                              : fresh.state === 'stale'
                                ? 'Stale'
                                : 'Nothing published'}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.error ? <span className="text-rose-700">{row.error}</span> : null}
                        {row.previousVersionAvailable ? (
                          <span className="block text-amber-700">An earlier published version is still available.</span>
                        ) : null}
                        {row.status === 'no_eligible_fixtures' ? (
                          <span className="block text-slate-500">Nothing to generate for this date.</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {!coverage?.leagues.length ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      No leagues to report.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* Job status */}
        <section aria-labelledby="jobs-heading" className="mt-8">
          <h2 id="jobs-heading" className="text-lg font-bold tracking-tight">Recent runs</h2>
          <p className="mt-1 text-sm text-slate-600">
            Runs execute outside this page; status updates on its own.
          </p>
          <ul className="mt-4 space-y-3">
            {jobs.map((job) => {
              const presentation = JOB_PRESENTATION[job.status] ?? JOB_PRESENTATION.queued;
              return (
                <li
                  key={job.jobId}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    activeJobId === job.jobId ? 'border-indigo-300' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-semibold text-slate-900">#{job.jobId}</span>{' '}
                      <span className="text-slate-600">{job.kind}</span>{' '}
                      <span className="text-slate-400">·</span>{' '}
                      <span className="text-slate-600">{job.targetDate}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        Leagues {job.leagues.join(', ')}
                      </span>
                    </div>
                    <span className={`text-sm font-semibold ${presentation.className}`}>
                      <span aria-hidden="true">{presentation.glyph}</span> {presentation.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Triggered by {job.trigger}
                    {job.requestedBy ? ` (${job.requestedBy})` : ''} · created{' '}
                    {new Date(job.createdAt).toLocaleString()}
                    {job.finishedAt ? ` · finished ${new Date(job.finishedAt).toLocaleString()}` : ''}
                  </p>
                  {job.error ? <p className="mt-1 text-xs text-rose-700">{job.error}</p> : null}
                  {Object.keys(job.leagueResults).length ? (
                    <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                      {Object.entries(job.leagueResults).map(([leagueId, result]) => (
                        <li
                          key={leagueId}
                          className={`rounded-full border px-2 py-0.5 ${
                            result.status === 'ok'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : 'border-rose-300 bg-rose-50 text-rose-800'
                          }`}
                        >
                          League {leagueId}: {result.status}
                          {result.error ? ` (${result.error})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
            {!jobs.length ? <li className="text-sm text-slate-500">No runs for this date yet.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default AdminScreen;