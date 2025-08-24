// =============================================================
// File: src/screens/BetAndFixturesScreen.tsx
// Purpose: Single screen that combines league selection (checkboxes)
//          + predictions/fixtures view with a 1-minute cooldown between
//          bet runs and robust localStorage caching + BEAUTIFUL modal
//          with Head-to-Head, Home/Away last 5, and two-team standings.
//
// Palette:
//  - High-contrast dark theme using Slate + Cyan/Amber accents
//  - Panels: bg-slate-900, Borders: border-slate-700
//  - Primary text: text-slate-100, Muted: text-slate-300/400
//  - Buttons: cyan gradient; Chips: amber
//  - Datepickers: light inputs for readability
//
// This revision adds:
//  - FAST local search (regex, debounced) for country/league/both
//  - Floating Bet button + Reset selection
//  - Filters only real leagues (no Cups) via filters.type = 'League'
//  - Standings are fetched + cached (6h) before prediction to avoid empty UI
//  - Predictions fixtures+output caching (6h) with option rehydration
//  - Multi-season fetch using numberOfSeasonsBack (current + previous seasons)
//    with retry window and local skip if we already have plenty of FT fixtures.
// =============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { CircularProgress } from '@mui/material';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import moment from 'moment';
import Modal from 'react-modal';

import { geFilteredLeaguesAction } from '../../reducers/leagues/leagues.actions';
import { leaguesSelector, LeaguesState } from '../../reducers/leagues/leagues.reducer';
import {
  LeagueDataModel,
  LeaguesFilterModel,
} from '../../models/leagues';
import {
  FixtureDataModel,
  FixturesFilterModel,
  FixturesModel,
} from '../../models/fixtures';
import { getFilteredFixtures } from '../../services/fixtures';
import {
  StandingsModel,
  StandingsDataStandingModel,
} from '../../models/standings-models';
import { getStandingsByLeagueId } from '../../services/standings';
import { betOptions, numberOfSeasonsBack } from '../../variables/variables';
import { betOptionModel } from '../../models/bet-option-model';
import { toMomentDate } from '../../helpers/dateTimeHelper';
import { getH2HFixtures, getLastFiveTeamFixtures } from '../../prediction-functions/shared-functions';

Modal.setAppElement('#root');

// ======= Config =======
const MAX_BATCH = 7;
const COOLDOWN_MS = 60_000; // 1 minute
const LEAGUES_CACHE_KEY = 'leaguesCache_v1';
const PREDICTIONS_CACHE_KEY = 'leaguePredictions_v1';
const STANDINGS_CACHE_KEY = 'standingsCache_v1';
const LEAGUES_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days
const PREDICTIONS_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
const STANDINGS_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

// If we already have at least this many FT fixtures for a league+season,
// skip fetching that season again (avoid overfetch).
const MIN_SEASON_EXISTING_THRESHOLD = 10;

// ======= Cache shapes =======
interface LeaguesCacheShape {
  ts: number;
  filters: LeaguesFilterModel;
  data: LeagueDataModel[];
}

interface PredictionsCacheItem {
  leagueId: number;
  season: number;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  optionIds: number[]; // sorted
  fixtures: FixtureDataModel[]; // raw fixtures used to compute
  // Store only serializable option meta in cache
  predicted: {
    fixtures: FixtureDataModel[];
    option: {
      id: number;
      name: string;
      level: number;
      shortName: string;
      description: string;
    };
  }[];
  ts: number; // cache timestamp
}
interface PredictionsCacheShape { items: PredictionsCacheItem[] }

interface StandingsCacheItem {
  leagueId: number;
  season: number;
  data: StandingsModel;
  ts: number;
}
interface StandingsCacheShape { items: StandingsCacheItem[] }

// ======= Utility: Cache helpers =======
const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

const readLeaguesCache = (): LeaguesCacheShape | null => {
  const parsed = safeParse<LeaguesCacheShape>(localStorage.getItem(LEAGUES_CACHE_KEY));
  if (!parsed) return null;
  if (Date.now() - parsed.ts > LEAGUES_CACHE_TTL) return null;
  return parsed;
};
const writeLeaguesCache = (filters: LeaguesFilterModel, data: LeagueDataModel[]) => {
  const payload: LeaguesCacheShape = { ts: Date.now(), filters, data };
  try { localStorage.setItem(LEAGUES_CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
};

const readPredictionsCache = (): PredictionsCacheShape =>
  safeParse<PredictionsCacheShape>(localStorage.getItem(PREDICTIONS_CACHE_KEY)) || { items: [] };
const writePredictionsCache = (shape: PredictionsCacheShape) => {
  try { localStorage.setItem(PREDICTIONS_CACHE_KEY, JSON.stringify(shape)); } catch { /* ignore */ }
};

const readStandingsCache = (): StandingsCacheShape =>
  safeParse<StandingsCacheShape>(localStorage.getItem(STANDINGS_CACHE_KEY)) || { items: [] };
const writeStandingsCache = (shape: StandingsCacheShape) => {
  try { localStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify(shape)); } catch { /* ignore */ }
};

// Predictions cache key matcher
const cacheKeyMatch = (
  it: PredictionsCacheItem,
  leagueId: number,
  season: number,
  from: string,
  to: string,
  optionIds: number[]
) => {
  if (it.leagueId !== leagueId || it.season !== season) return false;
  if (it.from !== from || it.to !== to) return false;
  const a = [...it.optionIds].sort((x,y) => x-y);
  const b = [...optionIds].sort((x,y) => x-y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

// ======= Country group UI =======

type CountrySectionProps = {
  country: string;
  leagues: LeagueDataModel[];
  isOpenDefault?: boolean;
  isSelected: (id: number) => boolean;
  disabledReason: (id: number) => string | null;
  onToggle: (league: LeagueDataModel, checked?: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
};

const CountrySection: React.FC<CountrySectionProps> = ({
  country,
  leagues,
  isOpenDefault = false,
  isSelected,
  disabledReason,
  onToggle,
  onSelectAll,
  onClearAll,
}) => {
  const [open, setOpen] = useState(isOpenDefault);
  const selectedCount = leagues.filter((l) => isSelected(l.league.id)).length;
  const someSelected = selectedCount > 0 && selectedCount !== leagues.length;

  return (
    <div className="border-b border-slate-700/60 last:border-none">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-800 text-[10px] text-slate-200">{country.slice(0,2).toUpperCase()}</span>
          <div>
            <div className="text-sm font-semibold text-slate-100">{country}</div>
            <div className="text-xs text-slate-400">{leagues.length} league{leagues.length>1?'s':''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {someSelected && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">{selectedCount} selected</span>}
          <svg className={`h-5 w-5 text-slate-300 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="mb-3 flex items-center gap-2 text-xs">
            <button onClick={onSelectAll} className="rounded-lg bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700">Select all</button>
            <button onClick={onClearAll} className="rounded-lg bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700">Clear</button>
          </div>

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {leagues.map((league) => {
              const checked = isSelected(league.league.id);
              const reason = disabledReason(league.league.id);
              return (
                <li key={league.league.id} className={`flex items-center justify-between rounded-xl border border-slate-700/60 p-3 ${reason ? 'opacity-60' : 'bg-slate-900'}`}>
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <img src={league.league.logo} alt={league.league.name} className="h-6 w-6 rounded" />
                    <div>
                      <div className="text-sm font-medium text-slate-100">{league.league.name}</div>
                      <div className="text-xs text-slate-400">{league.league.type}</div>
                    </div>
                  </label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!!reason && !checked}
                    title={reason || ''}
                    onChange={(e) => onToggle(league, e.target.checked)}
                    className="h-5 w-5 rounded border-slate-600 bg-slate-800 accent-cyan-500"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

// ======= Mini components for modal =======

const FixtureRowCompact: React.FC<{ fixture: FixtureDataModel }> = ({ fixture }) => {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900 p-2">
      <div className="flex w-1/2 items-center gap-2">
        <img src={fixture.teams.home.logo} alt={fixture.teams.home.name} className="h-4 w-4" />
        <span className="truncate text-xs text-slate-100">{fixture.teams.home.name}</span>
      </div>
      <div className="text-[11px] text-slate-300">
        {toMomentDate(fixture.fixture.date).format('DD MMM, HH:mm')}
      </div>
      <div className="flex w-1/2 items-center justify-end gap-2">
        <span className="truncate text-xs text-slate-100">{fixture.teams.away.name}</span>
        <img src={fixture.teams.away.logo} alt={fixture.teams.away.name} className="h-4 w-4" />
      </div>
    </div>
  );
};

const StandingsHeader: React.FC = () => (
  <div className="grid grid-cols-10 gap-2 rounded-lg bg-slate-800 p-2 text-[11px] font-semibold text-slate-200">
    <span className="text-center">#</span>
    <span className="col-span-3">Team</span>
    <span className="text-center">MP</span>
    <span className="text-center">W</span>
    <span className="text-center">D</span>
    <span className="text-center">L</span>
    <span className="text-center">GF</span>
    <span className="text-center">GA</span>
    <span className="text-center">GD</span>
    <span className="text-center">Pts</span>
  </div>
);

const StandingsRow: React.FC<{ s: StandingsDataStandingModel }> = ({ s }) => (
  <div className="grid grid-cols-10 items-center gap-2 rounded-lg border-b border-slate-700/40 p-2 text-[11px] text-slate-300">
    <span className="text-center">{s.rank}</span>
    <div className="col-span-3 flex items-center gap-2">
      <img src={s.team.logo} className="h-4 w-4" />
      <span className="truncate text-slate-100">{s.team.name}</span>
    </div>
    <span className="text-center">{s.all.played}</span>
    <span className="text-center">{s.all.win}</span>
    <span className="text-center">{s.all.draw}</span>
    <span className="text-center">{s.all.lose}</span>
    <span className="text-center">{s.all.goals.for}</span>
    <span className="text-center">{s.all.goals.against}</span>
    <span className="text-center">{s.all.goals.for - s.all.goals.against}</span>
    <span className="text-center font-semibold text-slate-100">{s.points}</span>
  </div>
);

// ======= Main Screen =======

const BetAndFixturesScreen: React.FC = () => {
  // Redux leagues
  const { leagues, isLoadingLeagues }: LeaguesState = useSelector(leaguesSelector);
  const dispatch: any = useDispatch();

  // Leagues list (with cache) — filter to real leagues (no Cups)
  const [leaguesFilters] = useState<LeaguesFilterModel>({ current: true, type: 'League' });
  const [allLeagues, setAllLeagues] = useState<LeagueDataModel[] | null>(null);

  // Search (debounced)
  const [rawSearch, setRawSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'both' | 'country' | 'league'>('both');
  useEffect(() => {
    const id = window.setTimeout(() => setSearchQuery(rawSearch), 150);
    return () => window.clearTimeout(id);
  }, [rawSearch]);

  // Selection (batch of up to 7)
  const [selectedBatch, setSelectedBatch] = useState<LeagueDataModel[]>([]);

  // Fixtures & predictions state (accumulated)
  const [allFixtures, setAllFixtures] = useState<FixtureDataModel[]>([]);
  const [futureFixtures, setFutureFixtures] = useState<FixtureDataModel[]>([]);
  const [currentFixtures, setCurrentFixtures] = useState<FixtureDataModel[]>([]);
  const [predictedFixtures, setPredictedFixtures] = useState<{ fixtures: FixtureDataModel[]; option: betOptionModel; }[]>([]);
  const [groupedData, setGroupedData] = useState<Record<number, betOptionModel[]>>({});

  const [selectedOptions, setSelectedOptions] = useState<betOptionModel[]>(betOptions);

  // Date range
  const [fromDate, setFromDate] = useState(new Date(moment().format('YYYY-MM-DD')));
  const [toDate, setToDate] = useState(new Date(moment().add(1, 'days').format('YYYY-MM-DD')));

  // Cooldown
  const [lastBetAt, setLastBetAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const tickRef = useRef<number | null>(null);

  // Modal & standings state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFixtureRow, setSelectedFixtureRow] = useState<FixtureDataModel | null>(null);
  const [fixtureTeamsStandings, setFixtureTeamsStandings] = useState<StandingsDataStandingModel[] | null>(null);

  // Standings store
  const [leaguesStandings, setLeaguesStandings] = useState<StandingsModel[]>([]);

  // ===== Init: leagues list (cache) =====
  useEffect(() => {
    const cached = readLeaguesCache();
    if (cached?.data?.length) {
      setAllLeagues(cached.data.map(l => new LeagueDataModel(l)));
    } else {
      dispatch(geFilteredLeaguesAction(leaguesFilters));
    }
  }, [dispatch, leaguesFilters]);

  useEffect(() => {
    const data = leagues?.response?.map((l: LeagueDataModel) => new LeagueDataModel(l));
    if (data && data.length) {
      // filter out cups locally too, just in case API ignores the type filter
      const filtered = data.filter(l => (l.league?.type || '').toLowerCase() === 'league');
      setAllLeagues(filtered);
      writeLeaguesCache(leaguesFilters, filtered);
    }
  }, [JSON.stringify(leagues)]);

  // ===== Group by country =====
  const groupedByCountry = useMemo(() => {
    const map = new Map<string, LeagueDataModel[]>();
    (allLeagues || []).forEach((l) => {
      const key = l?.country?.name || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([country, leagues]) => [country, leagues.sort((x, y) => x.league.name.localeCompare(y.league.name))] as const);
  }, [allLeagues]);

  // ===== Local search (country / league / both) =====
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return groupedByCountry;
    let re: RegExp;
    try { re = new RegExp(q, 'i'); } catch {
      re = new RegExp(q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
    }

    if (searchMode === 'country') {
      return groupedByCountry
        .filter(([country]) => re.test(country))
        .map(([country, leagues]) => [country, leagues] as const);
    }

    if (searchMode === 'league') {
      return groupedByCountry
        .map(([country, leagues]) => [country, leagues.filter(l => re.test(l.league.name))] as const)
        .filter(([, leagues]) => leagues.length > 0);
    }

    // both
    const countryMatches = new Set(
      groupedByCountry.filter(([country]) => re.test(country)).map(([country]) => country)
    );

    return groupedByCountry
      .map(([country, leagues]) => {
        if (countryMatches.has(country)) return [country, leagues] as const;
        const filtered = leagues.filter(l => re.test(l.league.name));
        return [country, filtered] as const;
      })
      .filter(([, leagues]) => leagues.length > 0);
  }, [groupedByCountry, searchQuery, searchMode]);

  // ===== Selection helpers (limit 7) =====
  const isSelected = (id: number) => selectedBatch.some((l) => l.league.id === id);
  const disabledReason = (id: number): string | null => {
    if (isSelected(id)) return null;
    if (selectedBatch.length >= MAX_BATCH) return `You can select up to ${MAX_BATCH} leagues per bet.`;
    return null;
  };
  const toggleLeague = (league: LeagueDataModel, checked?: boolean) => {
    setSelectedBatch((prev) => {
      const exists = prev.some((l) => l.league.id === league.league.id);
      const shouldAdd = checked ?? !exists;
      if (shouldAdd && !exists) return [...prev, league].slice(0, MAX_BATCH);
      if (!shouldAdd && exists) return prev.filter((l) => l.league.id !== league.league.id);
      return prev;
    });
  };
  const selectAllInCountry = (leagues: LeagueDataModel[]) => {
    setSelectedBatch((prev) => {
      const ids = new Set(prev.map((l) => l.league.id));
      const merged = [...prev];
      for (const l of leagues) {
        if (merged.length >= MAX_BATCH) break;
        if (!ids.has(l.league.id)) merged.push(l);
      }
      return merged;
    });
  };
  const clearAllInCountry = (leagues: LeagueDataModel[]) => {
    setSelectedBatch((prev) => prev.filter((l) => !leagues.some((x) => x.league.id === l.league.id)));
  };
  const resetSelection = () => setSelectedBatch([]);

  // ===== Cooldown ticker =====
  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, []);
  const msLeft = lastBetAt ? Math.max(0, lastBetAt + COOLDOWN_MS - nowTick) : 0;
  const canBet = msLeft === 0 && selectedBatch.length > 0;

  // ===== Fixtures helpers =====
  const filterFutureFixtures = (fixtures: FixtureDataModel[]) =>
    fixtures.filter((fixtureData) =>
      toMomentDate(fixtureData.fixture.date).isSameOrAfter(new Date(moment().subtract(1, 'days').format('YYYY-MM-DD')))
    );

  const filterBetweenDates = (fixtures: FixtureDataModel[], from: Date, to: Date) =>
    fixtures.filter((fixtureData) =>
      toMomentDate(fixtureData.fixture.date).isSameOrAfter(moment(from)) &&
      toMomentDate(fixtureData.fixture.date).isSameOrBefore(moment(to))
    );

  // ===== Restore cached predictions on mount (rehydrate options) =====
  useEffect(() => {
    const cache = readPredictionsCache();
    const fresh = cache.items.filter(it => Date.now() - it.ts <= PREDICTIONS_CACHE_TTL);
    if (fresh.length === 0) return;

    const fromStr = moment(fromDate).format('YYYY-MM-DD');
    const toStr = moment(toDate).format('YYYY-MM-DD');
    const withinWindow = fresh.filter(it => it.from === fromStr && it.to === toStr);

    const mergedFixtures = withinWindow.flatMap(it => it.fixtures);
    setAllFixtures(prev => dedupeFixtures([...prev, ...mergedFixtures]));

    const mergedPred = withinWindow.flatMap(it =>
      it.predicted.map(p => {
        const opt = betOptions.find(o => o.id === p.option.id);
        const fallback = opt ?? new betOptionModel({ ...p.option, predict: () => ({ fixtures: [], option: {} as any }) });
        return { fixtures: p.fixtures, option: fallback };
      })
    );
    setPredictedFixtures(prev => [...prev, ...mergedPred]);
  }, []); // run once

  // ===== Keep derived future/current fixtures & grouping in sync =====
  useEffect(() => {
    setFutureFixtures(filterFutureFixtures(allFixtures));
  }, [allFixtures.length]);

  useEffect(() => {
    setCurrentFixtures(filterBetweenDates(futureFixtures, fromDate, toDate));
  }, [futureFixtures.length, fromDate.toString(), toDate.toString()]);

  useEffect(() => {
    const grouped: Record<number, betOptionModel[]> = {};
    for (const block of predictedFixtures) {
      for (const fx of block.fixtures) {
        const id = fx.fixture.id;
        if (!grouped[id]) grouped[id] = [];
        if (!grouped[id].some(o => o.id === block.option.id)) {
          grouped[id].push(block.option);
        }
      }
    }
    setGroupedData(grouped);
  }, [JSON.stringify(predictedFixtures)]);

  // ===== Predict (preserving your logic) =====
  const runPredict = ({
    allFixturesLocal,
    currentFixturesLocal,
    leaguesStandingsLocal,
  }: {
    allFixturesLocal: FixtureDataModel[];
    currentFixturesLocal: FixtureDataModel[];
    leaguesStandingsLocal: StandingsModel[];
  }) => {
    const predictions = selectedOptions
      .map((option: betOptionModel) =>
        option.predict({
          currentFixtures: currentFixturesLocal,
          allFixtures: allFixturesLocal,
          leaguesStandings: leaguesStandingsLocal,
        })
      )
      .filter((pred) => pred.fixtures.length > 0);
    return predictions;
  };

  // ===== Helpers for multi-season fetch =====
  const seasonWindow = (season: number) => {
    const from = moment(`${season}-07-01`, 'YYYY-MM-DD'); // generic July start
    const to = moment().add(30, 'days');                  // small lookahead
    return {
      from: from.isValid() ? from.format('YYYY-MM-DD') : moment().subtract(365, 'days').format('YYYY-MM-DD'),
      to: to.format('YYYY-MM-DD'),
    };
  };

  const countFinished = (arr: FixtureDataModel[]) =>
    arr?.filter(f => f?.fixture?.status?.short === 'FT').length ?? 0;

  const dedupeFixtures = (arr: FixtureDataModel[]) => {
    const map = new Map<number, FixtureDataModel>();
    for (const f of arr) map.set(f.fixture.id, f);
    return Array.from(map.values()).sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
  };

  // ===== Fetch fixtures for leagues & multiple seasons (uses numberOfSeasonsBack) =====
  const getLeaguesSeasonsFixtures = async (leaguesInput: LeagueDataModel[]) => {
    const seasonsCount = Math.max(1, Number(numberOfSeasonsBack || 1));
    return Promise.all(
      leaguesInput.map(async (league: LeagueDataModel) => {
        const currentSeason =
          league.seasons.find((s) => s.current === true)?.year ??
          league.seasons[0]?.year;

        const seasons: number[] = Array.from({ length: seasonsCount }, (_, i) => currentSeason - i);

        const perSeason = await Promise.all(
          seasons.map(async (season) => {
            // If we already have enough FT fixtures for this league+season in memory, skip fetching.
            const existing = allFixtures.filter(f => f.league.id === league.league.id && f.league.season === season);
            if (countFinished(existing) >= MIN_SEASON_EXISTING_THRESHOLD) {
              return existing;
            }

            // Fast path: league + season
            try {
              const resFast: FixturesModel = (await getFilteredFixtures(
                new FixturesFilterModel({ league: league.league.id, season })
              )).data;

              const fixturesFast = resFast?.response ?? [];
              if (countFinished(fixturesFast) > 0) {
                return fixturesFast;
              }

              // Retry with explicit from/to
              const { from, to } = seasonWindow(season);
              const resRanged: FixturesModel = (await getFilteredFixtures(
                new FixturesFilterModel({ league: league.league.id, season, from, to })
              )).data;

              return resRanged?.response ?? [];
            } catch {
              // On error, try ranged query as a fallback
              try {
                const { from, to } = seasonWindow(season);
                const resRanged: FixturesModel = (await getFilteredFixtures(
                  new FixturesFilterModel({ league: league.league.id, season, from, to })
                )).data;

                return resRanged?.response ?? [];
              } catch {
                return [];
              }
            }
          })
        );

        // Merge seasons for this league and dedupe
        return dedupeFixtures(perSeason.flat());
      })
    );
  };

  // standings ensure + cache, returns the standings that will be available for prediction immediately
  const ensureStandingsFor = async (leaguesInput: LeagueDataModel[]): Promise<StandingsModel[]> => {
    if (!leaguesInput || leaguesInput.length === 0) return [];
    const cache = readStandingsCache();

    const results: StandingsModel[] = [];
    const toFetch: { league: LeagueDataModel; season: number }[] = [];

    for (const lg of leaguesInput) {
      const season = lg.seasons.find(s => s.current === true)?.year || lg.seasons[0]?.year;
      const hit = cache.items.find(it => it.leagueId === lg.league.id && it.season === season && (Date.now() - it.ts <= STANDINGS_CACHE_TTL));
      if (hit) {
        results.push(hit.data);
      } else if (!leaguesStandings.find(s => s.response?.[0]?.league?.id === lg.league.id)) {
        toFetch.push({ league: lg, season });
      }
    }

    if (toFetch.length > 0) {
      const fetched = await Promise.all(
        toFetch.map(({ league, season }) => getStandingsByLeagueId({ leagueId: league.league.id, season }))
      );

      // write to cache
      const freshCache = readStandingsCache();
      toFetch.forEach((entry, idx) => {
        freshCache.items = freshCache.items.filter(it => !(it.leagueId === entry.league.league.id && it.season === entry.season));
        freshCache.items.push({ leagueId: entry.league.league.id, season: entry.season, data: fetched[idx], ts: Date.now() });
      });
      writeStandingsCache(freshCache);

      // append to state
      setLeaguesStandings(prev => [...prev, ...fetched]);
      results.push(...fetched);
    }

    return results;
  };

  // ===== BET: run batch, obey cooldown, cache results, and append =====
  const [loadingBatch, setLoadingBatch] = useState(false);

  const handleBet = async () => {
    if (!canBet) return;
    setLoadingBatch(true);

    const fromStr = moment(fromDate).format('YYYY-MM-DD');
    const toStr   = moment(toDate).format('YYYY-MM-DD');
    const optionIds = [...selectedOptions.map(o => o.id)].sort((a,b) => a-b);

    const predCache = readPredictionsCache();
    const hits: PredictionsCacheItem[] = [];
    const misses: LeagueDataModel[] = [];

    for (const lg of selectedBatch) {
      const season = lg.seasons.find(s => s.current === true)?.year || lg.seasons[0]?.year;
      const item = predCache.items.find(it =>
        cacheKeyMatch(it, lg.league.id, season, fromStr, toStr, optionIds) &&
        (Date.now() - it.ts <= PREDICTIONS_CACHE_TTL)
      );
      if (item) hits.push(item); else misses.push(lg);
    }

    // fixtures from cache
    const cachedFixtures = hits.flatMap(h => h.fixtures);
    const cachedPred = hits.flatMap(h => h.predicted).map(p => {
      const opt = betOptions.find(o => o.id === p.option.id);
      const fallback = opt ?? new betOptionModel({ ...p.option, predict: () => ({ fixtures: [], option: {} as any }) });
      return { fixtures: p.fixtures, option: fallback };
    });

    // new fixtures if any misses (multi-season)
    let fetchedFixtures: FixtureDataModel[] = [];
    if (misses.length > 0) {
      const responses = await getLeaguesSeasonsFixtures(misses);
      fetchedFixtures = responses.flat();
    }

    // ensure standings (use returned list immediately to avoid race)
    const freshStandings = await ensureStandingsFor(selectedBatch);
    const standingsForPrediction = [...leaguesStandings, ...freshStandings];

    const mergedAll = dedupeFixtures([...allFixtures, ...cachedFixtures, ...fetchedFixtures]);
    const currentWindow = filterBetweenDates(filterFutureFixtures(mergedAll), fromDate, toDate);

    const freshPred = runPredict({
      allFixturesLocal: mergedAll,
      currentFixturesLocal: currentWindow,
      leaguesStandingsLocal: standingsForPrediction
    });

    // Merge predictions: cached + fresh
    const mergedPred = [...predictedFixtures, ...cachedPred, ...freshPred];

    // write predictions cache for misses (store only predictions relevant to that league)
    if (misses.length > 0) {
      const toWrite = readPredictionsCache();
      for (const lg of misses) {
        const season = lg.seasons.find(s => s.current === true)?.year || lg.seasons[0]?.year;

        const perLeaguePred = freshPred
          .map(p => ({
            fixtures: p.fixtures.filter(f => f.league.id === lg.league.id && f.league.season === season),
            option: {
              id: p.option.id,
              name: p.option.name,
              shortName: p.option.shortName,
              level: p.option.level,
              description: p.option.description,
            }
          }))
          .filter(p => p.fixtures.length > 0);

        const item: PredictionsCacheItem = {
          leagueId: lg.league.id,
          season,
          from: fromStr,
          to: toStr,
          optionIds,
          fixtures: fetchedFixtures.filter(f => f.league.id === lg.league.id && f.league.season === season),
          predicted: perLeaguePred,
          ts: Date.now(),
        };

        toWrite.items = toWrite.items.filter(it => !cacheKeyMatch(it, lg.league.id, season, fromStr, toStr, optionIds));
        toWrite.items.push(item);
      }
      writePredictionsCache(toWrite);
    }

    setAllFixtures(mergedAll);
    setPredictedFixtures(mergedPred);

    setLastBetAt(Date.now());
    setLoadingBatch(false);
  };

  // ===== Bet Options bar (restored) =====
  const addOrRemoveBetOptions = (id: number) => {
    setSelectedOptions((prev) => {
      const exists = prev.some((o) => o.id === id);
      if (exists) return prev.filter((o) => o.id !== id);
      const found = betOptions.find((o) => o.id === id);
      return found ? [...prev, found] : prev;
    });
  };

  // ===== Standings/H2H helpers =====
  const toggleModal = () => {
    setIsModalOpen((v) => !v);
    if (isModalOpen) {
      setSelectedFixtureRow(null);
      setFixtureTeamsStandings(null);
    }
  };

  const getFixtureTeamsStandingsLocal = ({
    homeTeamId, awayTeamId, leagueId
  }: {
    homeTeamId: number; awayTeamId: number; leagueId: number;
  }) => {
    try {
      const selectedLeagueStandings = [...leaguesStandings]
        .find((standings) => standings.response[0]?.league.id === leagueId)
        ?.response[0]?.league.standings[0]
        .filter((standing) => standing.team.id === homeTeamId || standing.team.id === awayTeamId);
      setFixtureTeamsStandings(selectedLeagueStandings || null);
    } catch {
      setFixtureTeamsStandings(null);
    }
  };

  const onFixtureClick = (fx: FixtureDataModel) => () => {
    setSelectedFixtureRow(fx);
    getFixtureTeamsStandingsLocal({
      homeTeamId: fx.teams.home.id,
      awayTeamId: fx.teams.away.id,
      leagueId: fx.league.id,
    });
    toggleModal();
  };

  // ===== Render =====
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="text-sm font-semibold">BetSmart</div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Date range:</span>
            <DatePicker
              className="rounded-md border border-slate-700 bg-white px-2 py-1 text-xs text-slate-900"
              selected={fromDate}
              onChange={(d: Date) => setFromDate(d)}
            />
            <span>to</span>
            <DatePicker
              className="rounded-md border border-slate-700 bg-white px-2 py-1 text-xs text-slate-900"
              selected={toDate}
              onChange={(d: Date) => setToDate(d)}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-12">
        {/* Left: leagues selection + search + bet options */}
        <div className="lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Select Leagues</h2>
            <div className="text-xs text-slate-400">Batch: {selectedBatch.length}/{MAX_BATCH}</div>
          </div>

          {/* Search controls */}
          <div className="mb-3 flex items-center gap-2">
            <input
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search country or league…"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
              {(['both','country','league'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSearchMode(m)}
                  className={`px-3 py-2 text-xs ${searchMode===m ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300'}`}
                >{m}</button>
              ))}
            </div>
            <button
              onClick={() => { setRawSearch(''); setSearchQuery(''); setSearchMode('both'); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Clear
            </button>
          </div>

          {/* Bet Options (restored) */}
          <div className="mb-3">
            <div className="mb-2 text-sm font-semibold">Bet Options</div>
            <div className="flex flex-wrap gap-2">
              {betOptions.map((option) => {
                const active = selectedOptions.some((o) => o.id === option.id);
                return (
                  <button
                    key={option.id}
                    onClick={() => addOrRemoveBetOptions(option.id)}
                    className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs ${
                      active
                        ? 'border-cyan-400 bg-cyan-600 text-white'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                    title={option.description}
                  >
                    {option.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/60 bg-slate-900">
            {isLoadingLeagues ? (
              <div className="grid place-items-center py-12"><CircularProgress /></div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No matches.</div>
            ) : (
              filteredGroups.map(([country, leagues], idx) => (
                <CountrySection
                  key={country}
                  country={country}
                  leagues={leagues}
                  isOpenDefault={idx < 6}
                  isSelected={isSelected}
                  disabledReason={disabledReason}
                  onToggle={toggleLeague}
                  onSelectAll={() => selectAllInCountry(leagues)}
                  onClearAll={() => clearAllInCountry(leagues)}
                />
              ))
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between">
            <button onClick={resetSelection} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800">Reset selection</button>
            <div className="text-xs text-slate-400">
              {msLeft > 0 ? `Cooldown: ${Math.ceil(msLeft / 1000)}s` : 'Ready'}
            </div>
            <button
              onClick={handleBet}
              disabled={!canBet || loadingBatch}
              className={`rounded-xl px-6 py-2 text-sm font-semibold transition ${
                !canBet || loadingBatch
                  ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                  : 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {loadingBatch ? 'Betting…' : 'Bet (run predictions)'}
            </button>
          </div>
        </div>

        {/* Right: predictions list */}
        <div className="lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Predictions</h2>
            <div className="text-xs text-slate-400">{Object.keys(groupedData).length} fixtures</div>
          </div>

          <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-2">
            {predictedFixtures.length === 0 ? (
              <div className="grid place-items-center py-16 text-sm text-slate-400">No predictions yet. Select up to {MAX_BATCH} leagues and press Bet.</div>
            ) : (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {Object.keys(groupedData).map((fixtureId) => {
                  const currentFixture = currentFixtures.find((f) => `${f.fixture.id}` === fixtureId);
                  if (!currentFixture) return null;
                  return (
                    <div key={fixtureId} className="rounded-xl bg-slate-900 p-3 ring-1 ring-slate-700/60">
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                        <div>
                          <div className="font-semibold text-slate-100">{currentFixture.league.name} ({currentFixture.league.country})</div>
                          <div>{toMomentDate(currentFixture.fixture.date).format('DD-MMMM-YYYY HH:mm')}</div>
                        </div>
                        <button
                          onClick={onFixtureClick(currentFixture)}
                          className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20"
                        >
                          View details
                        </button>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex w-1/2 items-center gap-2">
                          <img src={currentFixture.teams.home.logo} className="h-5 w-5" />
                          <div className="truncate text-sm font-medium text-slate-100">{currentFixture.teams.home.name}</div>
                        </div>
                        <div className="flex w-1/2 items-center gap-2">
                          <img src={currentFixture.teams.away.logo} className="h-5 w-5" />
                          <div className="truncate text-sm font-medium text-slate-100">{currentFixture.teams.away.name}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {groupedData[currentFixture.fixture.id]?.map((option) => (
                          <span key={option.id} className="rounded-md border border-amber-500/30 bg-amber-400/15 px-2 py-1 text-[11px] font-semibold text-amber-200">
                            {option.shortName}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Bet button */}
      <button
        onClick={handleBet}
        disabled={!canBet || loadingBatch}
        className={`fixed bottom-6 right-6 z-30 rounded-full px-5 py-3 text-sm font-semibold shadow-xl transition ${
          !canBet || loadingBatch
            ? 'cursor-not-allowed bg-slate-800/90 text-slate-400'
            : 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white hover:shadow-2xl'
        }`}
        title={msLeft > 0 ? `Cooldown: ${Math.ceil(msLeft/1000)}s` : 'Bet now'}
      >
        {loadingBatch ? 'Betting…' : 'Bet'}
      </button>

      {/* ===== Modal: H2H + last 5 + standings ===== */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={toggleModal}
        overlayClassName="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        className="absolute left-1/2 top-10 z-50 h-[80vh] w-[92vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl outline-none sm:w-[80vw] lg:w-[70vw]"
        contentLabel="Fixture details"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-3">
            <div className="flex items-center gap-3">
              {selectedFixtureRow && (
                <>
                  <img src={selectedFixtureRow.teams.home.logo} className="h-6 w-6" />
                  <span className="text-sm font-semibold text-slate-100">{selectedFixtureRow.teams.home.name}</span>
                  <span className="text-xs text-slate-400">vs</span>
                  <span className="text-sm font-semibold text-slate-100">{selectedFixtureRow.teams.away.name}</span>
                  <img src={selectedFixtureRow.teams.away.logo} className="h-6 w-6" />
                </>
              )}
            </div>
            <button onClick={toggleModal} className="rounded-xl bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700">Close</button>
          </div>

          {/* Body */}
          <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-3">
            {/* H2H */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-100">Head to Head</div>
              <div className="space-y-2">
                {selectedFixtureRow && getH2HFixtures({ teamOneId: selectedFixtureRow.teams.home.id, teamTwoId: selectedFixtureRow.teams.away.id, allFixtures }).map((fx) => (
                  <FixtureRowCompact key={fx.fixture.id} fixture={fx} />
                ))}
              </div>
            </div>

            {/* Home last 5 */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-100">Home Team – Last 5</div>
              <div className="space-y-2">
                {selectedFixtureRow && getLastFiveTeamFixtures({ teamId: selectedFixtureRow.teams.home.id, allFixtures }).map((fx) => (
                  <FixtureRowCompact key={fx.fixture.id} fixture={fx} />
                ))}
              </div>
            </div>

            {/* Away last 5 */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-100">Away Team – Last 5</div>
              <div className="space-y-2">
                {selectedFixtureRow && getLastFiveTeamFixtures({ teamId: selectedFixtureRow.teams.away.id, allFixtures }).map((fx) => (
                  <FixtureRowCompact key={fx.fixture.id} fixture={fx} />
                ))}
              </div>
            </div>

            {/* Standings (full width) */}
            <div className="md:col-span-3">
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-3">
                <div className="mb-2 text-sm font-semibold text-slate-100">League Standings (Both Teams)</div>
                <StandingsHeader />
                <div className="mt-1">
                  {fixtureTeamsStandings && fixtureTeamsStandings.length > 0 ? (
                    fixtureTeamsStandings.map((s) => <StandingsRow key={s.team.id} s={s} />)
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-400">Standings not available for this fixture.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BetAndFixturesScreen;
