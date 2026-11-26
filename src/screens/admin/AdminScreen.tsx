import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatLeagueLabel } from '../../config/league-labels';

import {
  getAdminCoverage,
  getAdminJobs,
  getAdminStatus,
} from '../../services/admin';
import type {
  AdminJob,
  AdminStatusResponse,
  CoverageResponse,
  CoverageStatus,
} from '../../services/admin/types';
import ManualTasksPanel from './ManualTasksPanel';
import AccessProductsPanel from './AccessProductsPanel';
import ManualPredictionPanel from './ManualPredictionPanel';
import AdminUsersPanel from './AdminUsersPanel';
import { useAuth } from '../../services/auth/AuthProvider';
import { PremiumRequiredError, SessionExpiredError, SignInRequiredError } from '../../services/api/client';

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

const todayIso = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const AccessChecking: React.FC = () => (
  <div className="mx-auto max-w-5xl px-4 pt-10 text-slate-600">
    <p role="status">Checking access…</p>
  </div>
);

const AccessDenied: React.FC = () => (
  <div className="mx-auto max-w-2xl px-4 pt-16 text-center">
    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin access required</h1>
    <p className="mt-3 text-slate-600">
      This area is limited to authorised administrators. Membership does not grant access to it.
    </p>
  </div>
);

const AdminScreen: React.FC = () => {
  const { user, initialising } = useAuth();
  if (initialising) return <AccessChecking />;
  if (!user) return <AccessDenied />;

  // Remount on account changes so access and dashboard data cannot carry over.
  return <AuthenticatedAdminScreen key={user.uid} />;
};

const AuthenticatedAdminScreen: React.FC = () => {
  const [status, setStatus] = useState<AdminStatusResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessAttempt, setAccessAttempt] = useState(0);

  const [targetDate, setTargetDate] = useState<string>(todayIso());
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualVersion, setManualVersion] = useState(0);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  /** Ask the server whether this user is an admin. Never inferred locally. */
  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setAccessError(null);
    (async () => {
      try {
        const response = await getAdminStatus();
        if (!cancelled) setStatus(response.data);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof SignInRequiredError || caught instanceof SessionExpiredError
            || caught instanceof PremiumRequiredError) {
          setStatus({ isAdmin: false, isMember: false, configuredLeagues: [] });
        } else {
          setAccessError('We could not check admin access. Please try again.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessAttempt]);

  const loadCoverage = useCallback(async (date: string) => {
    try {
      const response = await getAdminCoverage(date);
      setCoverage(response.data);
      setCoverageError(null);
      setLastRefreshedAt(new Date());
      return response.data;
    } catch {
      setCoverageError('We could not load league coverage.');
      return null;
    }
  }, []);

  const loadJobs = useCallback(async (date: string) => {
    try {
      const response = await getAdminJobs(date);
      setJobs(response.data.jobs);
      setStatusError(null);
    } catch {
      setStatusError('We could not load historical run status.');
    }
  }, []);

  useEffect(() => {
    if (!status?.isAdmin) return;
    void loadCoverage(targetDate);
    void loadJobs(targetDate);
  }, [status?.isAdmin, targetDate, loadCoverage, loadJobs]);

  const eligibleLeagues = useMemo(
    () => (coverage?.leagues ?? []).filter((row) => row.eligibleFixtures > 0).map((row) => row.leagueId),
    [coverage],
  );

  const allLeagues = useMemo(
    () => (coverage?.leagues ?? []).map((row) => row.leagueId),
    [coverage],
  );

  const toggleLeague = (leagueId: number) => {
    setSelectedLeagues((current) =>
      current.includes(leagueId) ? current.filter((id) => id !== leagueId) : [...current, leagueId],
    );
  };

  if (checking) return <AccessChecking />;

  if (accessError) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16 text-center">
        <p role="alert" className="text-rose-700">{accessError}</p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          onClick={() => {
            setChecking(true);
            setAccessAttempt((attempt) => attempt + 1);
          }}
        >
          Retry access check
        </button>
      </div>
    );
  }

  if (!status?.isAdmin) {
    return <AccessDenied />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <header className="mb-8">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-700">Operations</span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Prediction workflow</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Select a date and leagues, then execute the required tasks manually.
          </p>
        </header>

        {coverageError || statusError ? (
          <p role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {coverageError || statusError}
          </p>
        ) : null}

        {/* Controls */}
        <section aria-labelledby="controls-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="controls-heading" className="text-lg font-bold tracking-tight">Run controls</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
            <label className="text-sm font-medium text-slate-700">
              Workflow date (SAST)
              <input
                type="date"
                value={targetDate}
                disabled={manualBusy}
                onChange={(event) => setTargetDate(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Leagues to cover</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(coverage?.leagues ?? []).map((row) => {
                  const checked = selectedLeagues.includes(row.leagueId);
                  const fresh = coverage?.freshness?.[String(row.leagueId)];
                  const published = row.status === 'published' || fresh?.hasPublished;
                  const refreshing = row.status === 'refreshing' || row.status === 'running';
                  const inputId = `admin-league-${row.leagueId}`;
                  return (
                    <label
                      key={row.leagueId}
                      htmlFor={inputId}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm ${
                        published
                          ? 'border-blue-500 bg-blue-50 text-blue-950'
                          : refreshing
                            ? 'border-cyan-500 bg-cyan-50 text-cyan-950'
                            : checked
                              ? 'border-teal-400 bg-teal-50 text-teal-900'
                              : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked}
                        disabled={manualBusy}
                        onChange={() => toggleLeague(row.leagueId)}
                        className="h-4 w-4"
                      />
                      <span>{formatLeagueLabel(row.leagueId)}</span>
                      {published && <span className="text-xs font-semibold text-blue-700">Published</span>}
                      {refreshing && <span className="text-xs font-semibold text-cyan-700">Refreshing</span>}
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
                  disabled={manualBusy}
                  onClick={() => setSelectedLeagues(eligibleLeagues)}
                  className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Select all eligible
                </button>
                <button
                  type="button"
                  disabled={manualBusy || !allLeagues.length}
                  onClick={() => setSelectedLeagues(allLeagues)}
                  className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  disabled={manualBusy}
                  onClick={() => setSelectedLeagues([])}
                  className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </fieldset>
          </div>

          {/* A disabled button must say why, rather than leaving the operator to
              guess whether the control is broken. */}
          {!selectedLeagues.length ? (
            <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Select at least one league to run a manual task.
            </p>
          ) : null}
        </section>

        <ManualPredictionPanel date={targetDate} leagues={selectedLeagues}
          onBusyChange={setManualBusy}
          otherBusy={manualBusy}
          onPublished={() => { void loadCoverage(targetDate); setManualVersion(value => value + 1); }}
          onActivity={() => setManualVersion(value => value + 1)} />
        <ManualTasksPanel date={targetDate} leagues={selectedLeagues} configuredLeagues={status.configuredLeagues}
          busy={manualBusy} onBusyChange={setManualBusy} version={manualVersion}
          onActivity={() => { setManualVersion(value => value + 1); void loadCoverage(targetDate); }} />
        <AdminUsersPanel />
        <AccessProductsPanel />

        {/* Coverage */}
        <section aria-labelledby="coverage-heading" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="coverage-heading" className="text-lg font-bold tracking-tight">League coverage</h2>
              <p className="mt-1 text-sm text-slate-600">{coverage?.summary.label ?? 'Loading coverage…'}</p>
              {lastRefreshedAt && (
                <p className="mt-1 text-xs text-slate-500">Refreshed {lastRefreshedAt.toLocaleTimeString()} · includes the latest published and refresh state.</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Coverage may still show older queued or failed jobs; use manual task progress above for current work.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void loadCoverage(targetDate); void loadJobs(targetDate); }}
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
                      <td className="px-4 py-3 font-medium text-slate-900">{formatLeagueLabel(row.leagueId)}</td>
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
            Historical queued runs are shown for reference; manual tasks are tracked above.
          </p>
          <ul className="mt-4 space-y-3">
            {jobs.map((job) => {
              const presentation = JOB_PRESENTATION[job.status] ?? JOB_PRESENTATION.queued;
              return (
                <li
                  key={job.jobId}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-semibold text-slate-900">#{job.jobId}</span>{' '}
                      <span className="text-slate-600">{job.kind}</span>{' '}
                      <span className="text-slate-400">·</span>{' '}
                      <span className="text-slate-600">{job.targetDate}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {job.leagues.map(formatLeagueLabel).join(', ')}
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
                          {formatLeagueLabel(Number(leagueId))}: {result.status}
                          {result.error ? ` (${result.error})` : ''}
                          {result.steps && Object.values(result.steps).includes('skipped')
                            ? ` · already completed this five-minute slot: ${Object.entries(result.steps)
                                .filter(([, outcome]) => outcome === 'skipped')
                                .map(([step]) => step)
                                .join(', ')}`
                            : ''}
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