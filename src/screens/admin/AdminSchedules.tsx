import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminSchedule, saveAdminSchedule } from '../../services/admin';
import { formatLeagueLabel } from '../../config/league-labels';
import { describeFailure } from '../../services/api/failures';
import { adminLink, Badge, durationText, Feedback, Panel, sastTime } from './admin-ui';
import useAdminResource from './useAdminResource';

export default function AdminSchedules({ date, configured, revision }: { date: string; configured: number[]; revision: number }) {
  const [savedAt, setSavedAt] = useState(0);
  const [draft, setDraft] = useState<number[]>();
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const currentDate = useRef(date);
  currentDate.current = date;
  const load = useCallback(() => getAdminSchedule(date), [date]);
  const { data, error, loading } = useAdminResource(`${date}:${revision}:${savedAt}`, load);
  useEffect(() => { setDraft(undefined); setMessage(''); setSaveError(''); }, [date]);
  const selected = draft ?? data?.selectedLeagues ?? [];
  const dirty = draft !== undefined && (draft.length !== data?.selectedLeagues.length || draft.some(id => !data?.selectedLeagues.includes(id)));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || !data || saving) return;
    setSaving(true);
    setMessage('');
    setSaveError('');
    try {
      await saveAdminSchedule(date, selected);
      if (currentDate.current === date) {
        setDraft(undefined);
        setMessage('League scope saved.');
      }
      setSavedAt(value => value + 1);
    } catch (caught) {
      if (currentDate.current === date) setSaveError(describeFailure(caught));
    } finally { setSaving(false); }
  };
  return <>
    {loading && <Feedback>Loading schedule information…</Feedback>}
    {error && <Feedback error>Schedules could not be loaded. Refresh to retry.</Feedback>}
    <div className="ax-grid">
      <Panel title="League scope" subtitle={`Daily ingestion and odds scope for ${date} SAST.`}>
        {data && <form onSubmit={save}>
          {data.selectionError && <Feedback error>{data.selectionError}</Feedback>}
          <p className="mb-3 ax-muted">Saved scope · {data.selectedLeagues.length ? `${data.selectedLeagues.length} explicitly selected` : 'Configured default'} · {data.effectiveLeagues.length} effective leagues</p>
          <fieldset disabled={saving}><legend className="sr-only">Leagues for this date</legend>
            <div className="ax-scope">{configured.map(id => <label key={id}><input type="checkbox" checked={selected.includes(id)}
              onChange={() => setDraft(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id])} />{formatLeagueLabel(id)}</label>)}</div>
          </fieldset>
          <div className="ax-toolbar mt-3"><button className="ax-button" type="button" onClick={() => setDraft([])} disabled={saving || !selected.length}>Use configured default</button>
            <button type="submit" className="ax-button ax-primary" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save league scope'}</button></div>
        </form>}
        {saveError && <Feedback error>{saveError}</Feedback>}{message && <Feedback>{message}</Feedback>}
      </Panel>
      <Panel title="Configured slots" subtitle="Recurring definitions · Africa/Johannesburg">
        <p className="ax-muted mb-3 text-xs">The current deployment spec runs operations manually. These slots describe stored definitions. Check recorded executions for actual starts.</p>
        <p className="ax-muted mb-3 text-xs">Predict and settle uses all configured leagues when run by the scheduler.</p>
        {data?.schedules.map(item => <div className="ax-disclosure" key={item.name}><strong className="block pt-2 capitalize">{item.name.replace(/-/g, ' ')}</strong><p className="my-1">{item.times.join(' · ')} SAST</p><p className="ax-muted text-xs">{item.modes.join(' → ')}</p></div>)}
        <Link className="ax-button" to={adminLink('operations', date)}>Open manual operations</Link>
      </Panel>
    </div>
    <Panel title="Recorded ingestion runs" subtitle={`${date} SAST · up to 100 records`}>
      {data?.runs.length === 0 && <p className="ax-empty">No scheduled ingestion runs are recorded for this date.</p>}
      {data?.runs.map(run => <details className="ax-disclosure" key={run.id}><summary>#{run.id} · {run.schedule} · {sastTime(run.scheduledAt)} SAST <Badge state={run.status} /></summary>
        <dl className="ax-detail-grid"><div><dt>Started (SAST)</dt><dd>{sastTime(run.startedAt)}</dd></div><div><dt>Finished (SAST)</dt><dd>{sastTime(run.finishedAt)}</dd></div><div><dt>Duration</dt><dd>{durationText(run.startedAt, run.finishedAt)}</dd></div></dl>
        <p className="mb-2">{run.leagues.map(formatLeagueLabel).join(', ')}</p>
        {run.error && <p className="text-rose-800">{run.error}</p>}
        {Object.entries({ ...(run.results?.leagues ?? {}), ...(run.results?.global ? { 'Global steps': run.results.global } : {}) }).map(([id, steps]) => <div className="mt-2 text-xs" key={id}><strong>{Number.isFinite(Number(id)) ? formatLeagueLabel(Number(id)) : id}</strong>
          {Object.entries(steps ?? {}).filter(([, step]) => step && typeof step === 'object' && step.status).map(([name, step]) => <p key={name}>{name} · {step.status}{step.recordsFetched !== undefined ? ` · ${step.recordsFetched} records` : ''}{step.attempts ? ` · ${step.attempts} attempts` : ''}{step.error || step.reason ? ` · ${step.error || step.reason}` : ''}</p>)}
        </div>)}
      </details>)}
    </Panel>
  </>;
}
