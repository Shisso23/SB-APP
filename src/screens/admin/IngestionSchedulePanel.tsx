import React, { useEffect, useRef, useState } from 'react';

import { getIngestionSchedule, saveIngestionSchedule } from '../../services/admin';
import type { IngestionScheduleResponse, IngestionStep } from '../../services/admin/types';

const Step: React.FC<{ name: string; step: IngestionStep }> = ({ name, step }) => (
  <span>
    {name}: {step.status}
    {step.recordsFetched !== undefined ? ` (${step.recordsFetched} fetched)` : ''}
    {step.error ? ` (${step.error})` : ''}
  </span>
);

const formatSast = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

const IngestionSchedulePanel: React.FC<{ date: string; configuredLeagues: number[] }> = ({
  date, configuredLeagues,
}) => {
  const [data, setData] = useState<IngestionScheduleResponse | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const currentDate = useRef(date);
  currentDate.current = date;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoading(true);
    setError(null);
    setNotice(null);
    getIngestionSchedule(date).then((response) => {
      if (!cancelled) {
        setData(response.data);
        setSelected(response.data.selectedLeagues);
      }
    }).catch((caught) => {
      if (!cancelled) setError(
        (caught as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Could not load ingestion scheduling.',
      );
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [date, version]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await saveIngestionSchedule(date, selected);
      if (currentDate.current === date) {
        setData((current) => current ? { ...current, ...response.data, selectionError: '' } : current);
        setNotice('Ingestion selection saved.');
      }
    } catch (caught) {
      if (currentDate.current === date) {
        setError((caught as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Could not save ingestion scheduling.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="ingestion-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="ingestion-heading" className="text-lg font-bold">Scheduled ingestion</h2>
      <p className="mt-2 text-sm text-slate-600">
        Schedule leagues for {date} using the date above. Leave all unchecked to process every configured
        league. Changes apply to ingestion jobs that have not started; prediction and settlement schedules
        are unchanged.
      </p>
      {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-2 text-sm text-teal-700">{notice}</p> : null}
      {loading ? <p className="mt-2 text-sm">Loading ingestion schedule…</p> : null}
      {data ? (
        <>
          {data.selectionError ? <p role="alert" className="mt-2 text-sm text-rose-700">{data.selectionError}</p> : null}
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Leagues for scheduled ingestion</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from(new Set([...configuredLeagues, ...selected])).map((league) => (
                <label key={league} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Scheduled league ${league}`}
                    checked={selected.includes(league)}
                    onChange={() => setSelected((current) => current.includes(league)
                      ? current.filter((value) => value !== league) : [...current, league])}
                  />
                  League {league}{!configuredLeagues.includes(league) ? ' (not configured)' : ''}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={() => void save()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Save ingestion schedule
            </button>
            <button type="button" disabled={saving} onClick={() => setSelected([])}
              className="rounded-lg border px-4 py-2 text-sm font-semibold">
              Use all configured leagues
            </button>
            <button type="button" disabled={saving} onClick={() => setVersion((value) => value + 1)}
              className="rounded-lg border px-4 py-2 text-sm font-semibold">
              Reload ingestion history
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Saved schedule: {data.selectedLeagues.length ? data.effectiveLeagues.join(', ') : 'all configured leagues'}.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Times below reflect the checked-in App Platform schedule, in SAST. Verify the deployed spec matches.
            The league catalogue is fetched globally. A stored fixture list may be stale; unselected leagues
            are not automatically checked for matches.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.schedules.map((schedule) => (
              <li key={schedule.name}>
                <strong>{schedule.name}</strong>: {schedule.times.join(', ')} SAST — {schedule.modes.join(', ')}
              </li>
            ))}
          </ul>
          <h3 className="mt-5 font-semibold">Ingestion history</h3>
          {!data.runs.length ? <p className="mt-2 text-sm text-slate-500">No ingestion runs for this date.</p> : null}
          <ul className="mt-2 space-y-3">
            {data.runs.map((run) => (
              <li key={run.id} className="rounded-lg border p-3 text-sm">
                <p><strong>{run.schedule}: {run.status}</strong> · scheduled {formatSast(run.scheduledAt)} SAST</p>
                <p>Started {formatSast(run.startedAt)} SAST
                  {run.finishedAt ? ` · finished ${formatSast(run.finishedAt)} SAST` : ''}
                </p>
                <p>Leagues: {run.leagues.join(', ')}</p>
                {run.error ? <p className="text-rose-700">{run.error}</p> : null}
                {run.status === 'running' ? (
                  <p className="text-slate-500">If the platform job has stopped but this remains running, check its logs.</p>
                ) : null}
                {Object.entries(run.results.global ?? {}).map(([name, step]) => (
                  <p key={name}>Global <Step name={name} step={step} /></p>
                ))}
                {Object.entries(run.results.leagues ?? {}).map(([league, steps]) => (
                  <p key={league}>
                    League {league}: {Object.entries(steps).map(([name, step], index) => (
                      <React.Fragment key={name}>{index ? ' · ' : ''}<Step name={name} step={step} /></React.Fragment>
                    ))}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
};

export default IngestionSchedulePanel;
