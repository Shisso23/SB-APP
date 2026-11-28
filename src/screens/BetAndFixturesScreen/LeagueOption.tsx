import React from 'react';
import type { LeagueDataModel } from '../../models/leagues';

export const CountryIndicator: React.FC<{ country: LeagueDataModel['country'] }> = ({ country }) => (
  <span aria-hidden="true" className="grid h-8 w-9 shrink-0 place-items-center rounded-md border border-slate-600 bg-slate-800 text-[10px] font-bold text-slate-200">
    {country.flag ? <img src={country.flag} alt="" className="h-5 w-6 object-contain" loading="lazy" />
      : country.code || country.name.slice(0, 2).toUpperCase()}
  </span>
);

export const LeagueOption: React.FC<{
  league: LeagueDataModel;
  selected: boolean;
  disabled?: boolean;
  savedStatus: string | null;
  onToggle: () => void;
}> = ({ league, selected, disabled, savedStatus, onToggle }) => (
  <button
    type="button"
    aria-pressed={selected}
    disabled={disabled}
    onClick={onToggle}
    className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left disabled:opacity-60 ${selected
      ? 'border-emerald-300/70 bg-emerald-300/10' : 'border-slate-700 bg-[#0d1626] enabled:hover:border-slate-400'}`}
  >
    <CountryIndicator country={league.country} />
    <span className="min-w-0 flex-1 break-words">
      <span className="block text-sm font-bold text-white">{league.league.name}</span>
      <span className="block text-xs text-slate-300">{league.country.name}</span>
      {savedStatus && <span className="mt-1 block text-xs font-medium text-emerald-200">{savedStatus}</span>}
    </span>
    <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-sm ${selected
      ? 'border-emerald-300 bg-emerald-300 text-slate-900' : 'border-slate-500 text-slate-300'}`}>{selected ? '✓' : '+'}</span>
  </button>
);
