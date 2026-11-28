import React from 'react';
import { ProbabilityTrack } from '../BetAndFixturesScreen/ProbabilityTrack';
import { describeLegStatus, formatOdds, formatProbability, formatScore, formatTimestamp, tallyList } from '../../services/official/presentation';
import type { OfficialListLeg } from '../../services/official/types';

export const panel = 'rounded-2xl border border-slate-700 bg-[#152136]';
export const control = 'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-500 bg-[#0d1626] px-3 text-sm font-semibold text-slate-100 hover:border-emerald-300 disabled:opacity-50';
export const disclosure = 'min-h-[44px] cursor-pointer py-3 text-sm font-semibold text-emerald-200';

const outcomeStyle = {
  won: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
  lost: 'border-rose-300/40 bg-rose-400/10 text-rose-200',
  pending: 'border-amber-300/40 bg-amber-400/10 text-amber-100',
  void: 'border-slate-500 bg-slate-700/40 text-slate-200',
  unresolved: 'border-slate-500 bg-slate-700/40 text-slate-200',
};

export const Outcome: React.FC<{ status: OfficialListLeg['status']; wholeList?: boolean }> = ({ status, wholeList }) => {
  const { label, glyph } = describeLegStatus(status);
  const text = wholeList ? `List ${label.toLowerCase()}` : status === 'won' ? 'Correct' : status === 'lost' ? 'Incorrect' : label;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeStyle[status] ?? outcomeStyle.pending}`}>
      <span aria-hidden="true">{glyph}</span>{text}
    </span>
  );
};

const Selection: React.FC<{ leg: OfficialListLeg; showOutcome?: boolean }> = ({ leg, showOutcome = true }) => (
  <div className="border-t border-slate-700 pt-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 break-words">
        <p className="text-xs font-semibold text-slate-300">Published prediction</p>
        <p className="mt-1 text-sm font-bold">{leg.marketLabel || leg.marketId}</p>
        {leg.marketLine && <p className="text-xs text-slate-300">{leg.marketLine}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-slate-300">Model probability</p>
        <p className="mt-1 text-lg font-bold leading-none tabular-nums text-emerald-200">{formatProbability(leg.probability)}</p>
      </div>
    </div>
    <ProbabilityTrack value={leg.probability ? Number(leg.probability) : undefined} />
    {showOutcome && <div className="mt-3"><Outcome status={leg.status} /></div>}
    <details className="mt-1">
      <summary className={disclosure}>Selection details</summary>
      <div className="space-y-2 pb-2 text-xs leading-relaxed text-slate-300">
        {leg.explanation && <p>{leg.explanation}</p>}
        <p>
          <strong>Saved odds</strong>{' '}<span>{formatOdds(leg.odds?.decimalOdds) ?? '—'}</span>{' '}
          <span>{leg.odds?.source === 'model-fair' ? 'Estimated model fair odds (not a bookmaker quote)' : leg.odds?.bookmaker || 'No quote'}</span>
        </p>
        {leg.settledAt && <p>Settled {formatTimestamp(leg.settledAt)}</p>}
        {leg.resolutionNote && <p>{leg.resolutionNote}</p>}
      </div>
    </details>
  </div>
);

export const matchOptionKey = (leg: OfficialListLeg, index: number) => `${leg.marketId}-${leg.marketLine}-${index}`;

export const MatchCard: React.FC<{ legs: OfficialListLeg[] }> = ({ legs }) => {
  const first = legs[0];
  const result = legs.find(leg => leg.homeGoals != null && leg.awayGoals != null);
  const score = result ? formatScore(result.homeGoals, result.awayGoals) : null;
  const scheduled = !score && Date.parse(first.kickoff) > Date.now();
  const tally = legs.length > 1 ? tallyList(legs) : null;
  return (
    <article className={`${panel} min-w-0 break-words px-4 pb-2 pt-4 sm:px-5`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-emerald-200">{first.leagueName || `League ${first.leagueId}`}</p>
          {first.kickoff && <time dateTime={first.kickoff} className="mt-1 block text-xs text-slate-300">{formatTimestamp(first.kickoff)}</time>}
        </div>
        {legs.length === 1 && <Outcome status={first.status} />}
      </header>
      <h4 className="my-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 leading-tight sm:gap-4">
        <span className="min-w-0 font-bold">{first.homeTeam}</span>
        <span className="text-center">
          <span className={score ? 'block whitespace-nowrap text-xl font-extrabold tabular-nums sm:text-2xl' : 'block text-sm font-semibold text-slate-300'}>{score ?? 'vs'}</span>
          <span className="mt-1 block text-[10px] font-normal text-slate-300">{score ? 'Actual score' : scheduled ? 'Upcoming' : 'Score unavailable'}</span>
        </span>
        <span className="min-w-0 text-right font-bold">{first.awayTeam}</span>
      </h4>
      {legs.length === 1 ? <Selection leg={first} showOutcome={false} /> :
        <div className="border-t border-slate-700 pt-3">
          {tally && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
              {tally.won > 0 && <span className="text-emerald-200">{tally.won} correct</span>}
              {tally.lost > 0 && <span className="text-rose-200">{tally.lost} incorrect</span>}
              {tally.pending > 0 && <span className="text-amber-100">{tally.pending} pending</span>}
              {tally.void > 0 && <span>{tally.void} void</span>}
              {tally.unresolved > 0 && <span>{tally.unresolved} unresolved</span>}
            </p>
          )}
          <details>
            <summary className={disclosure}>View {legs.length} published predictions</summary>
            {legs.map((leg, index) => <Selection key={matchOptionKey(leg, index)} leg={leg} />)}
          </details>
        </div>}
    </article>
  );
};

/** Group options within one published date so later snapshots remain distinct. */
export const groupByFixture = (legs: OfficialListLeg[]) => {
  const fixtures = new Map<number, OfficialListLeg[]>();
  for (const leg of legs) {
    const options = fixtures.get(leg.providerFixtureId);
    if (options) options.push(leg);
    else fixtures.set(leg.providerFixtureId, [leg]);
  }
  return Array.from(fixtures.values());
};
