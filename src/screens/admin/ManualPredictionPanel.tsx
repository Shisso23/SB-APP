import { marketDisplayLabel } from '../../services/predictions/market-label';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiRequestError } from '../../services/api/client';
import { describeFailure } from '../../services/api/failures';
import { predictAdminManualLeague, previewAdminManualList, publishAdminManualList } from '../../services/admin';
import type { ManualBetListPreview, ManualPredictionResponse } from '../../services/admin/types';
import { formatLeagueLabel } from '../../config/league-labels';

const errorMessage = (error: unknown) => {
  if (error instanceof ApiRequestError && typeof error.validationErrors === 'object'
      && error.validationErrors !== null) {
    const detail = Object.entries(error.validationErrors).find(([key]) => key === 'detail')?.[1];
    if (typeof detail === 'string') return detail;
  }
  return describeFailure(error);
};

const ManualPredictionPanel: React.FC<{
  date: string;
  leagues: number[];
  onBusyChange: (busy: boolean) => void;
  onPublished: () => void;
  onActivity: () => void;
  otherBusy: boolean;
}> = ({ date, leagues, onBusyChange, onPublished, onActivity, otherBusy }) => {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<ManualPredictionResponse[]>([]);
  const [preview, setPreview] = useState<ManualBetListPreview | null>(null);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [published, setPublished] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  const selection = leagues.join(',');

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    setResults([]);
    setPreview(null);
    setError('');
    setProgress('');
    setConfirmed(false);
    setPublished(false);
  }, [date, selection]);

  const prepare = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setResults([]);
    setPreview(null);
    setConfirmed(false);
    setPublished(false);
    const generated: ManualPredictionResponse[] = [];
    const failures: string[] = [];
    try {
      for (let index = 0; index < leagues.length; index += 1) {
        const league = leagues[index];
        if (!active.current) return;
        setProgress(`Fetching data and predicting ${formatLeagueLabel(league)} (${index + 1}/${leagues.length})…`);
        try {
          const response = await predictAdminManualLeague(date, league);
          if (!active.current) return;
          generated.push(response.data);
          setResults([...generated]);
        } catch (caught) {
          if (!active.current) return;
          failures.push(`${formatLeagueLabel(league)}: ${errorMessage(caught)}`);
          setError(failures.join(' '));
        } finally {
          onActivity();
        }
      }
      const ids = generated.flatMap(result => result.predictionIds);
      if (!ids.length) {
        setProgress('No forecasts were generated. Resolve the reported errors and retry.');
        return;
      }
      setProgress('Preparing the daily bet list from saved forecasts…');
      const response = await previewAdminManualList(date, ids);
      if (!active.current) return;
      setPreview(response.data);
      setProgress(failures.length ? 'Preview ready using only the successful leagues. Review the errors before publishing.' : 'Preview ready. Nothing is published yet.');
    } catch (caught) {
      if (active.current) {
        setError([...failures, errorMessage(caught)].join(' '));
        setProgress('');
      }
    } finally {
      inFlight.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  const publish = async () => {
    if (!preview || !confirmed || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      await publishAdminManualList(preview);
      if (!active.current) return;
      setPublished(true);
      setProgress('Daily bet list published. It is available publicly and in history.');
      onPublished();
    } catch (caught) {
      if (active.current) {
        setError(errorMessage(caught));
        setConfirmed(false);
      }
    } finally {
      inFlight.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  return (
    <section aria-labelledby="manual-heading" className="mt-6 rounded-2xl border border-teal-300 bg-white p-6 shadow-sm">
      <h2 id="manual-heading" className="text-lg font-bold">Manual daily bet list (no jobs)</h2>
      <p className="mt-2 text-sm text-slate-600">
        Use the date and league selection above for today or tomorrow (SAST). Fetch fresh fixtures,
        standings and odds, generate forecasts immediately, then review and publish the daily list.
        No queue or background worker is used. Provider limits and forecast eligibility still apply.
      </p>
      <button type="button" disabled={busy || otherBusy || !leagues.length || leagues.length > 4}
        onClick={() => void prepare()}
        className="mt-4 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
        {busy ? 'Working…' : 'Predict manually and preview'}
      </button>
      {leagues.length > 4 && <p role="alert" className="mt-2 text-sm text-rose-700">Select up to four leagues for a manual batch.</p>}
      {progress && <p role="status" className="mt-3 text-sm text-teal-900">{progress}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {results.map(result => (
        <details key={result.leagueId} className="mt-3 text-sm text-slate-700">
          <summary>{result.leagueName}: {result.forecasts.length} saved forecasts</summary>
          <ul className="mt-2 space-y-1">{result.forecasts.map(forecast => (
            <li key={forecast.id}>{forecast.homeTeam} v {forecast.awayTeam} — {new Date(forecast.kickoff).toLocaleString()}</li>
          ))}</ul>
        </details>
      ))}
      {preview && (
        <div className="mt-5">
          <h3 className="font-bold">Daily bet list preview — {preview.date}</h3>
          <p className="mt-2 text-sm text-slate-600">
            {preview.suggestions.length} distinct qualifying matches selected. Publication requires at least{' '}
            {preview.minimumSize ?? preview.requiredSize}, with up to {preview.requiredSize} matches.
            Estimated model fair odds are 1 / forecast probability, not bookmaker quotes or proof of value.
          </p>
          <ol className="mt-3 space-y-2">{preview.suggestions.map(pick => (
            <li key={pick.providerFixtureId} className="rounded-lg border border-slate-200 p-3 text-sm">
              <strong>{pick.homeTeam} v {pick.awayTeam}</strong>
              <p>{marketDisplayLabel(pick.marketId, pick.marketLabel)} — {(pick.probability * 100).toFixed(1)}%</p>
              <p className="text-slate-500">
                {pick.decimalOdds
                  ? pick.oddsSource === 'model-fair'
                    ? `Estimated model fair odds ${pick.decimalOdds} (not a bookmaker quote)`
                    : `Odds ${pick.decimalOdds} (${pick.bookmaker})`
                  : 'No stored pre-match price'}
              </p>
            </li>
          ))}</ol>
          {!preview.canPublish && <p role="alert" className="mt-3 text-sm text-amber-800">{preview.reason}</p>}
          {!published && <>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmed} disabled={busy || otherBusy || !preview.canPublish}
                onChange={event => setConfirmed(event.target.checked)} />
              I confirm publication of this immutable daily bet list.
            </label>
            <button type="button" disabled={busy || otherBusy || !confirmed || !preview.canPublish}
              onClick={() => void publish()}
              className="mt-3 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              Publish manual daily bet list
            </button>
          </>}
          {published && <Link to="/history" className="mt-3 inline-block text-sm font-semibold text-teal-700 underline">View published history</Link>}
        </div>
      )}
    </section>
  );
};

export default ManualPredictionPanel;
