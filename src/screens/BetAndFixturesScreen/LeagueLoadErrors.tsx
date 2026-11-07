import React from 'react';
import { LeagueDataModel } from '../../models/leagues';

export interface LeagueLoadFailure {
  league: LeagueDataModel;
  fixtureSeasons: number[];
  standings: boolean;
  messages: string[];
}

export const LeagueLoadErrors: React.FC<{
  failures: LeagueLoadFailure[];
  warnings: string[];
  loading: boolean;
  retryingIds: number[];
  onRetry: (failures: LeagueLoadFailure[]) => void;
}> = ({ failures, warnings, loading, retryingIds, onRetry }) => {
  if (!failures.length && !warnings.length) return null;
  return <section role="alert" aria-label="Prediction data errors" className="rounded-2xl border-2 border-red-500 bg-[#641b2e] p-4 text-white sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-base font-bold text-white"><span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm text-white">!</span>{failures.length ? 'Some leagues need another try' : 'Prediction notice'}</h3>
        {failures.length > 0 && <p className="mt-2 text-sm text-rose-50">Available forecasts are kept. Retry the affected leagues below.</p>}
      </div>
      {failures.length > 1 && <button type="button" disabled={loading} onClick={() => onRetry(failures)} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-70">Retry all failed leagues</button>}
    </div>
    {failures.length > 0 && <ul className="mt-4 space-y-3">
      {failures.map(failure => {
        const id = failure.league.league.id;
        const retrying = retryingIds.includes(id);
        return <li key={id} className="rounded-xl border border-red-400 bg-[#42101f] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-white">{failure.league.league.name} <span className="font-normal text-rose-100">· {failure.league.country.name}</span></h4>
              <p className="mt-1 text-xs text-rose-100">{[failure.fixtureSeasons.length ? `Fixtures: ${failure.fixtureSeasons.join(', ')}` : '', failure.standings ? 'Standings' : ''].filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" disabled={loading} onClick={() => onRetry([failure])} aria-label={`${retrying ? 'Retrying' : 'Retry'} ${failure.league.league.name}`} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-70">{retrying ? 'Retrying…' : 'Retry league'}</button>
          </div>
          <ul className="mt-2 space-y-1 break-words text-sm leading-relaxed text-rose-50">{Array.from(new Set(failure.messages)).map(message => <li key={message}>{message}</li>)}</ul>
        </li>;
      })}
    </ul>}
    {warnings.length > 0 && <ul className="mt-3 space-y-2 break-words text-sm leading-relaxed text-white">{Array.from(new Set(warnings)).map(warning => <li key={warning}>{warning}</li>)}</ul>}
  </section>;
};
