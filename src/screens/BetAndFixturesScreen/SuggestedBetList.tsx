import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { FixturePrediction, MarketValue } from '../../prediction-engine/types';
import { BetListSuggestion, getSuggestedBetList } from '../../services/predictions';
import { ForecastHighlight } from './ForecastHighlight';

export const DEFAULT_BET_LIST_SIZE = 5;

/** Display-only strings, matching the backend's `priceStatus`/`family` enum
 * values. Zero decision logic lives here - which status/family a suggestion
 * gets is computed server-side; this just turns the resulting code into
 * readable text. */
const PRICE_STATUS_LABELS: Record<BetListSuggestion['priceStatus'], string> = {
  checked: 'Price checks passed',
  unqualified: 'Priced · value checks not met',
  stale: 'Stale quote · refresh needed',
  unpriced: 'Forecast only · odds unavailable',
};
const FORECAST_FAMILY_LABELS: Record<string, string> = {
  result: 'Match result',
  team_scoring: 'Team to score',
  btts: 'Both teams to score',
  totals: 'Goal totals',
  total_ranges: 'Total goal ranges',
  team_goals: 'Team goal totals and ranges',
};

const formatSuggestionsForClipboard = (
  suggestions: BetListSuggestion[],
  predictionsById: Map<number, FixturePrediction>,
) => [
  'Suggested bet list — one market per match',
  'Forecast-based suggestions; outcomes and profit are not guaranteed. Review each entry individually.',
  ...suggestions.map((suggestion, index) => {
    const prediction = predictionsById.get(suggestion.providerFixtureId);
    const fixture = prediction?.fixture;
    const quote = suggestion.priceStatus === 'unpriced' ? 'No available odds'
      : `Odds ${suggestion.decimalOdds?.toFixed(2)}${suggestion.bookmaker ? ` (${suggestion.bookmaker})` : ''}`;
    const header = fixture
      ? `${index + 1}. ${fixture.teams.home.name} vs ${fixture.teams.away.name} | ${fixture.league.name} | ${fixture.fixture.date}`
      : `${index + 1}. ${suggestion.marketLabel}`;
    return `${header}\n${suggestion.marketLabel} | Forecast ${(suggestion.probability * 100).toFixed(2)}% | Threshold ${(suggestion.preference.suggest * 100).toFixed(0)}%\n${suggestion.explanation}\n${quote} | ${PRICE_STATUS_LABELS[suggestion.priceStatus]}${suggestion.preference.isRange ? '\nSource: base scoreline model, separate from prior-blended totals.' : ''}${suggestion.historyLimited ? '\nLimited team history; inspect the statistics.' : ''}${suggestion.impliedBy ? '\nQualifies via combined markets that already passed their own thresholds.' : ''}`;
  }),
].join('\n\n');

export const SuggestedBetList: React.FC<{
  predictions: FixturePrediction[];
  loading: boolean;
  statistical: boolean;
  selectedPickKeys: string[];
  onReview: (prediction: FixturePrediction) => void;
  onTogglePick: (fixtureId: number, market: MarketValue) => void;
}> = ({ predictions, loading, statistical, selectedPickKeys, onReview, onTogglePick }) => {
  const [limit, setLimit] = useState(DEFAULT_BET_LIST_SIZE);
  const [copyMessage, setCopyMessage] = useState('');
  const [suggestions, setSuggestions] = useState<BetListSuggestion[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [fetching, setFetching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!statistical || !predictions.length) {
      setSuggestions([]);
      setFetchError('');
      setFetching(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setFetching(true);
    setFetchError('');
    getSuggestedBetList({ predictions, limit })
      .then((response) => {
        if (requestIdRef.current !== requestId) return;
        setSuggestions(response.data.response);
        setFetching(false);
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        setSuggestions([]);
        setFetching(false);
        setFetchError(error instanceof Error ? error.message : 'Could not load the suggested bet list.');
      });
  }, [predictions, limit, statistical]);

  const predictionsById = new Map(predictions.map((prediction) => [prediction.fixture.fixture.id, prediction]));
  const isLoading = loading || fetching;
  const familyCount = new Set(suggestions.map((suggestion) => suggestion.family)).size;
  const checkedCount = suggestions.filter((suggestion) => suggestion.priceStatus === 'checked').length;
  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(formatSuggestionsForClipboard(suggestions, predictionsById));
      setCopyMessage('List copied.');
    } catch { setCopyMessage('Copy is unavailable in this browser. You can select the list text below.'); }
  };

  return <section aria-label="Suggested bet list" className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Suggested bet list <span className="text-cyan-200">· {suggestions.length}</span></h2>
        <p className="mt-1 text-xs text-slate-300">Only forecast options meeting our market-specific percentage thresholds qualify. One qualifying option per upcoming match; matches with none are left out.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-300">Up to{' '}
          <select aria-label="Suggested bet list size" value={limit} onChange={event => { setLimit(Number(event.target.value)); setCopyMessage(''); }} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-slate-100">
            {[3, 5, 8, 10].map(size => <option key={size} value={size}>{size} matches</option>)}
          </select>
        </label>
        <button type="button" disabled={isLoading || !suggestions.length} onClick={copyList} className="rounded-lg border border-cyan-400/40 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50">Copy list</button>
      </div>
    </div>
    <p className="mt-2 text-xs text-slate-400">Uses the strongest qualifying forecast for each match. Thresholds stay unchanged.</p>
    <p className="mt-2 text-xs text-amber-200">Suggestions for review; not guaranteed outcomes or proven returns. Each entry shows whether its price checks passed.</p>
    {copyMessage && <p role="status" className="mt-2 text-xs text-slate-200">{copyMessage}</p>}
    {isLoading && <p className="mt-3 text-sm text-cyan-100">Updating the suggested list with the current prediction batch…</p>}
    {fetchError && <p role="alert" className="mt-3 text-sm text-amber-200">{fetchError}</p>}
    {!statistical ? <p className="mt-3 text-sm text-slate-300">Switch to Statistical to generate this list. Legacy rules do not supply forecast probabilities.</p>
      : !suggestions.length ? (!fetchError && <p className="mt-3 text-sm text-slate-300">{isLoading ? 'Your suggested list will appear when forecasts are ready.' : 'No upcoming matches meet your suggestion thresholds. The list stays empty until qualifying forecasts are available.'}</p>)
      : <>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
          <span>{suggestions.length} of up to {limit} matches</span><span>·</span><span>{familyCount} market {familyCount === 1 ? 'type' : 'types'}</span><span>·</span><span>{checkedCount} with price checks passed</span><span>·</span><span>{suggestions.length - checkedCount} need price review</span>
        </div>
        <ol className="mt-3 space-y-3">
          {suggestions.map((suggestion, index) => {
            const { marketId, marketLabel, preference, probability, priceStatus, historyLimited, impliedBy, family, decimalOdds, bookmaker } = suggestion;
            const prediction = predictionsById.get(suggestion.providerFixtureId);
            if (!prediction) return null;
            const fixture = prediction.fixture;
            const market = prediction.markets.find((entry) => entry.marketId === marketId);
            const key = `${suggestion.providerFixtureId}:${marketId}`;
            const picked = selectedPickKeys.includes(key);
            return <li key={key} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">{index + 1}. {fixture.teams.home.name} vs {fixture.teams.away.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{fixture.league.name} · {moment(fixture.fixture.date).format('DD MMM HH:mm')}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${priceStatus === 'checked' ? 'border-emerald-400/40 text-emerald-200' : 'border-amber-400/30 text-amber-200'}`}>{PRICE_STATUS_LABELS[priceStatus]}</span>
              </div>
              <div className="mt-2 font-semibold text-cyan-100">{marketLabel} · {(probability * 100).toFixed(2)}%</div>
              <p className="mt-1 text-[10px] text-slate-400">{FORECAST_FAMILY_LABELS[family] ?? family}</p>
              {impliedBy && <p className="mt-2 text-xs text-cyan-200">Qualifies via combined markets that already passed their own thresholds.</p>}
              <ForecastHighlight probability={probability} preference={preference} progressive={marketId === 'btts_yes'} level={suggestion.level}
                note={impliedBy ? `qualifies via combined markets, not its own threshold.` : undefined} />
              <p className="mt-2 text-xs text-slate-300">{suggestion.explanation}</p>
              {preference.isRange && <p className="mt-1 text-xs text-slate-400">Base scoreline model; separate from prior-blended totals. This range model is unvalidated.</p>}
              {!preference.isRange && market && prediction.dataQuality.weakMarkets.includes(market.marketId) && <p className="mt-1 text-xs text-amber-200">Weak or unvalidated market model.</p>}
              <p className="mt-1 text-xs text-slate-400">Team history: home {prediction.homeTeam.overallSampleSize}, away {prediction.awayTeam.overallSampleSize} matches.</p>
              {historyLimited && <p className="mt-1 text-xs text-amber-200">Limited team history; inspect the statistics before deciding.</p>}
              {priceStatus !== 'unpriced' && <p className="mt-2 text-xs text-slate-200">Odds {decimalOdds?.toFixed(2)}{bookmaker ? ` · ${bookmaker}` : ''}
                {priceStatus === 'checked' && market?.expectedValue !== undefined ? ` · model-estimated EV ${(market.expectedValue * 100).toFixed(1)}%` : ''}</p>}
              {priceStatus === 'unqualified' && <p className="mt-1 text-xs text-amber-200">{market?.rejectReasons.slice(0, 2).join(' ') || 'The forecast qualifies for highlighting, but does not pass the existing probability, edge and positive-EV price checks.'}</p>}
              {priceStatus === 'unpriced' && <p className="mt-2 text-xs text-slate-400">Review this forecast against an available price before deciding.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onReview(prediction)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Review match statistics</button>
                {priceStatus === 'checked' && market && <button type="button" disabled={isLoading} onClick={() => onTogglePick(fixture.fixture.id, market)} className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-50">{picked ? 'Remove from my picks' : 'Add to my picks'}</button>}
              </div>
            </li>;
          })}
        </ol>
      </>}
  </section>;
};
