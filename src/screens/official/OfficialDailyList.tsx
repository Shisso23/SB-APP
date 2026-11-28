import React from 'react';
import { formatBusinessDate, formatMoney, formatRatio, formatTimestamp, presentHypothetical, tallyList } from '../../services/official/presentation';
import type { OfficialListSummary } from '../../services/official/types';
import { disclosure, groupByFixture, MatchCard, Outcome, panel } from './OfficialMatchCard';

const ListReturns: React.FC<{ value: OfficialListSummary['hypothetical'] }> = ({ value }) => {
  const money = presentHypothetical(value);
  if (!money) return null;
  return (
    <details className={`${panel} px-4 sm:px-5`}>
      <summary className={disclosure}>Hypothetical returns</summary>
      <div className="space-y-3 pb-4 text-sm text-slate-200">
        {money.kind === 'unavailable' ? (
          <p><strong>Monetary figure unavailable.</strong> {money.reason}</p>
        ) : money.kind === 'potential' ? (
          <p><strong>Potential return</strong> · Settlement is pending.
            {money.combinedOdds && <> Combined odds {money.combinedOdds}.</>}</p>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-3">
            <div><dt className="text-xs text-slate-300">Combined odds (indicative)</dt><dd>{money.combinedOdds ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-300">Total return</dt><dd>{formatMoney(money.totalReturn) ?? 'Unavailable'}</dd></div>
            <div><dt className="text-xs text-slate-300">{money.estimated ? 'Estimated hypothetical net' : 'Hypothetical net'}</dt><dd>{formatMoney(money.net) ?? 'Unavailable'}</dd></div>
          </dl>
        )}
        {money.kind !== 'unavailable' && money.estimated && (
          <p className="text-xs text-amber-200">
            Estimated: {money.estimatedOddsCount === 1 ? '1 selection is' : `${money.estimatedOddsCount} selections are`} priced from model fair odds.
          </p>
        )}
        <p className="text-xs text-slate-300">{money.disclosure}</p>
      </div>
    </details>
  );
};

export const DailyList: React.FC<{ list: OfficialListSummary; emptyAction?: React.ReactNode }> = ({ list, emptyAction }) => {
  const dateLabel = formatBusinessDate(list.businessDate);
  if (!list.published) {
    return (
      <article className={`${panel} border-dashed p-5 sm:p-6`}>
        <p className="text-xs font-bold text-slate-300">{dateLabel}</p>
        <h3 className="mt-2 text-lg font-bold">No picks published</h3>
        <p className="mt-1 text-sm text-slate-300">{list.message ?? 'No official daily list was published for this date.'}</p>
        {emptyAction}
      </article>
    );
  }
  const tally = list.legs?.length ? tallyList(list.legs) : null;
  const count = list.legCount ?? list.legs?.length;
  const counts = tally ? [
    { label: 'Correct', value: tally.won, color: 'text-emerald-200' },
    { label: 'Incorrect', value: tally.lost, color: 'text-rose-200' },
    { label: 'Pending', value: tally.pending, color: 'text-amber-100' },
  ] : [];
  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight">{dateLabel}</h3>
          <p className="mt-1 text-xs text-slate-300">
            {count === undefined ? 'Published daily list' : `${count} ${count === 1 ? 'selection' : 'selections'}`}
            {list.publishedAt && ` · Published ${formatTimestamp(list.publishedAt)}`}
            {list.lastCheckedAt && ` · Last checked ${formatTimestamp(list.lastCheckedAt)}`}
          </p>
        </div>
        <Outcome status={list.status ?? 'pending'} wholeList />
      </header>
      {list.lastCheckError && <p className="rounded-lg border border-amber-300/40 px-3 py-2 text-sm text-amber-100">A reconciliation check failed ({list.lastCheckError}). Results may be incomplete.</p>}
      {tally && (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {counts.map(({ label, value, color }) => (
              <div key={label} className={`${panel} px-2 py-3 text-center sm:px-4`}>
                <dt className="text-xs text-slate-300 sm:text-sm">{label}</dt>
                <dd className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-300">
            <strong>{formatRatio(tally.rate)}</strong> selection success rate · {tally.rate === null ? 'No settled selections yet' : `${tally.won} won / ${tally.won + tally.lost} settled`}
            {tally.void > 0 && ` · ${tally.void} void`}{tally.unresolved > 0 && ` · ${tally.unresolved} unresolved`}
          </p>
        </>
      )}
      {list.legs?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {groupByFixture(list.legs).map(legs => <MatchCard key={legs[0].providerFixtureId} legs={legs} />)}
        </div>
      ) : <p className={`${panel} p-4 text-sm text-slate-300`}>Selection details are not available for this date.</p>}
      <ListReturns value={list.hypothetical} />
    </article>
  );
};
