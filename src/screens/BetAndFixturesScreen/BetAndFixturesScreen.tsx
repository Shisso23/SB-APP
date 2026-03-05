/* eslint-disable no-empty */
// =============================================================
// File: src/screens/BetAndFixturesScreen.tsx
// (…header comments unchanged…)
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
import { fuzzyScore } from '../../helpers/fuzzy-search';

Modal.setAppElement('#root');

// ======= Config =======
const MAX_BATCH = 7;
const COOLDOWN_MS = 60_000; // 1 minute
const LEAGUES_CACHE_KEY = 'leaguesCache_v1';
const PREDICTIONS_CACHE_KEY = 'leaguePredictions_v1';
const STANDINGS_CACHE_KEY = 'standingsCache_v1';
const FAVORITES_CACHE_KEY = 'favoritePredictions_v1';
const POPULAR_LEAGUE_IDS_KEY = 'popularLeagueIds_v1';
const LEAGUES_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days
const PREDICTIONS_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
const STANDINGS_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

const MIN_SEASON_EXISTING_THRESHOLD = 10;

const DEFAULT_POPULAR_LEAGUE_IDS = [140, 135, 203, 88, 144, 179, 40, 79, 136, 218, 94];

const PRIORITY_COUNTRIES = [
  'england',
  'france',
  'spain',
  'netherlands',
  'germany',
  'italy',
  'turkey',
  'belgium',
];

const PRIORITY_LEAGUE_TERMS = [
  'premier league',
  'championship',
  'league one',
  'league two',
  'ligue 1',
  'ligue 2',
  'la liga',
  'segunda',
  'eredivisie',
  'eerste divisie',
  'bundesliga',
  '2. bundesliga',
  'serie a',
  'serie b',
  'super lig',
  '1. lig',
  'pro league',
  'jupiler',
  'challenger pro',
];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getTokenMatchRatio = (query: string, target: string) => {
  const queryTokens = normalizeText(query).split(' ').filter(Boolean);
  if (queryTokens.length === 0) {
    return 0;
  }

  const normalizedTarget = normalizeText(target);
  const matchedTokens = queryTokens.filter((token) => normalizedTarget.includes(token));
  return matchedTokens.length / queryTokens.length;
};

const smartMatchScore = (query: string, target: string) => {
  const normalizedQuery = normalizeText(query);
  const normalizedTarget = normalizeText(target);

  if (!normalizedQuery) {
    return 1;
  }

  if (normalizedTarget.includes(normalizedQuery)) {
    return 1;
  }

  const tokenRatio = getTokenMatchRatio(normalizedQuery, normalizedTarget);
  if (tokenRatio === 1) {
    return 0.9;
  }

  return Math.max(tokenRatio * 0.75, fuzzyScore(normalizedQuery, normalizedTarget));
};

// ======= Cache shapes =======
interface LeaguesCacheShape {
  ts: number;
  filters: LeaguesFilterModel;
  data: LeagueDataModel[];
}

interface PredictionsCacheItem {
  leagueId: number;
  season: number;
  from: string;
  to: string;
  optionIds: number[];
  fixtures: FixtureDataModel[];
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
  ts: number;
}
interface PredictionsCacheShape { items: PredictionsCacheItem[] }

interface StandingsCacheItem {
  leagueId: number;
  season: number;
  data: StandingsModel;
  ts: number;
}
interface StandingsCacheShape { items: StandingsCacheItem[] }

interface FavoritePredictionItem {
  fixtureId: number;
  optionId: number;
  savedAt: number;
  fixtureDate: string;
  leagueName: string;
  leagueCountry: string;
  homeTeamName: string;
  homeTeamLogo: string;
  awayTeamName: string;
  awayTeamLogo: string;
  optionName: string;
  optionShortName: string;
  optionDescription: string;
}

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
  try { localStorage.setItem(LEAGUES_CACHE_KEY, JSON.stringify(payload)); } catch {}
};

const readPredictionsCache = (): PredictionsCacheShape =>
  safeParse<PredictionsCacheShape>(localStorage.getItem(PREDICTIONS_CACHE_KEY)) || { items: [] };
const writePredictionsCache = (shape: PredictionsCacheShape) => {
  try { localStorage.setItem(PREDICTIONS_CACHE_KEY, JSON.stringify(shape)); } catch {}
};

const readStandingsCache = (): StandingsCacheShape =>
  safeParse<StandingsCacheShape>(localStorage.getItem(STANDINGS_CACHE_KEY)) || { items: [] };
const writeStandingsCache = (shape: StandingsCacheShape) => {
  try { localStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify(shape)); } catch {}
};

const readFavoritesCache = (): FavoritePredictionItem[] =>
  safeParse<FavoritePredictionItem[]>(localStorage.getItem(FAVORITES_CACHE_KEY)) || [];

const writeFavoritesCache = (items: FavoritePredictionItem[]) => {
  try { localStorage.setItem(FAVORITES_CACHE_KEY, JSON.stringify(items)); } catch {}
};

const readPopularLeagueIds = (): number[] => {
  const parsed = safeParse<number[]>(localStorage.getItem(POPULAR_LEAGUE_IDS_KEY));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return DEFAULT_POPULAR_LEAGUE_IDS;
  }

  return parsed
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
};

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
// (CountrySection component unchanged)
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
    <div className="border-b border-slate-700/40 last:border-none">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/30"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-[10px] font-semibold text-slate-100">
            {country.slice(0,2).toUpperCase()}
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-100">{country}</div>
            <div className="text-xs text-slate-400">{leagues.length} league{leagues.length>1?'s':''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {someSelected && (
            <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
              {selectedCount} selected
            </span>
          )}
          <svg className={`h-5 w-5 text-slate-300 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="mb-3 flex items-center gap-2 text-xs">
            <button onClick={onSelectAll} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700">Select all</button>
            <button onClick={onClearAll} className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700">Clear</button>
          </div>

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {leagues.map((league) => {
              const checked = isSelected(league.league.id);
              const reason = disabledReason(league.league.id);
              return (
                <li
                  key={league.league.id}
                  className={`flex items-center justify-between rounded-xl border border-slate-700/60 p-3 transition ${
                    reason ? 'opacity-60' : 'bg-slate-900/90 hover:border-slate-500'
                  }`}
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <img src={league.league.logo} alt={league.league.name} className="h-6 w-6 rounded" />
                    <div>
                      <div className="text-sm font-medium text-slate-100">{league.league.name}</div>
                      <div className="text-xs text-slate-400">{league.country.name}</div>
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
      <div className="flex w-1/2 items-center gap-2 text-slate-300">
        {fixture.score.fulltime.home} - {fixture.score.fulltime.away}
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


// ======= Mini components for modal =======
// (FixtureRowCompact, StandingsHeader, StandingsRow unchanged)

// ======= Main Screen =======

const BetAndFixturesScreen: React.FC = () => {
  const { leagues, isLoadingLeagues }: LeaguesState = useSelector(leaguesSelector);
  const dispatch = useDispatch() as (action: unknown) => unknown;

  const [leaguesFilters] = useState<LeaguesFilterModel>({ current: true, type: 'League' });
  const [allLeagues, setAllLeagues] = useState<LeagueDataModel[] | null>(null);

  // Search (debounced)
  const [rawSearch, setRawSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const popularLeagueIds = useMemo(() => readPopularLeagueIds(), []);
  useEffect(() => {
    const id = window.setTimeout(() => setSearchQuery(rawSearch), 150);
    return () => window.clearTimeout(id);
  }, [rawSearch]);

  // Selection
  const [selectedBatch, setSelectedBatch] = useState<LeagueDataModel[]>([]);

  // Fixtures & predictions
  const [allFixtures, setAllFixtures] = useState<FixtureDataModel[]>([]);
  const [futureFixtures, setFutureFixtures] = useState<FixtureDataModel[]>([]);
  const [currentFixtures, setCurrentFixtures] = useState<FixtureDataModel[]>([]);
  const [predictedFixtures, setPredictedFixtures] = useState<{ fixtures: FixtureDataModel[]; option: betOptionModel; }[]>([]);
  const [groupedData, setGroupedData] = useState<Record<number, betOptionModel[]>>({});
  const [favoritePredictions, setFavoritePredictions] = useState<FavoritePredictionItem[]>(() => readFavoritesCache());
  const [isLeaguesByCountryCollapsed, setIsLeaguesByCountryCollapsed] = useState(false);
  const [isBetOptionsCollapsed, setIsBetOptionsCollapsed] = useState(true);

  const [selectedOptions, setSelectedOptions] = useState<betOptionModel[]>(betOptions);

  // Date range
  const [fromDate, setFromDate] = useState(new Date(moment().format('YYYY-MM-DD')));
  const [toDate, setToDate] = useState(new Date(moment().add(1, 'days').format('YYYY-MM-DD')));

  // Cooldown
  const [lastBetAt, setLastBetAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const tickRef = useRef<number | null>(null);

  // Modal & standings
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFixtureRow, setSelectedFixtureRow] = useState<FixtureDataModel | null>(null);
  const [fixtureTeamsStandings, setFixtureTeamsStandings] = useState<StandingsDataStandingModel[] | null>(null);

  const [leaguesStandings, setLeaguesStandings] = useState<StandingsModel[]>([]);

  useEffect(() => {
    writeFavoritesCache(favoritePredictions);
  }, [favoritePredictions]);

  // Init leagues
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
      const filtered = data.filter(l => (l.league?.type || '').toLowerCase() === 'league');
      setAllLeagues(filtered);
      writeLeaguesCache(leaguesFilters, filtered);
    }
  }, [JSON.stringify(leagues)]);

  // Group by country
  const groupedByCountry = useMemo(() => {
    const map = new Map<string, LeagueDataModel[]>();
    (allLeagues || []).forEach((l) => {
      const key = l?.country?.name || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(l);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([country, leagues]) => [country, leagues.sort((x, y) => x.league.name.localeCompare(y.league.name))] as const);
  }, [allLeagues]);

  // Local search
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return groupedByCountry;
    const COUNTRY_THRESHOLD = 0.42;
    const LEAGUE_THRESHOLD = 0.4;

    const rankLeague = (query: string, country: string, leagueName: string) =>
      smartMatchScore(query, `${leagueName} ${country}`);
  
    return groupedByCountry
      .map(([country, leagues]) => {
        const countryScore = smartMatchScore(q, country);
  
        if (countryScore >= COUNTRY_THRESHOLD) {
          // if country matches well, keep all its leagues
          return { country, leagues, score: countryScore };
        }
  
        const scoredLeagues = leagues
          .map(l => ({ l, score: rankLeague(q, country, l.league.name) }))
          .filter(x => x.score >= LEAGUE_THRESHOLD)
          .sort((a, b) => b.score - a.score)
          .map(x => x.l);
  
        const bestLeagueScore = scoredLeagues.length
          ? rankLeague(q, country, scoredLeagues[0].league.name)
          : 0;
  
        return { country, leagues: scoredLeagues, score: bestLeagueScore };
      })
      .filter(x => x.leagues.length > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => [x.country, x.leagues] as const);
  
  }, [groupedByCountry, searchQuery]);

  const popularLeagues = useMemo(() => {
    const leaguesPool = allLeagues || [];
    if (leaguesPool.length === 0) {
      return [] as LeagueDataModel[];
    }

    const byConfiguredIds = popularLeagueIds
      .map((leagueId) => leaguesPool.find((league) => league.league.id === leagueId))
      .filter((league): league is LeagueDataModel => Boolean(league));

    if (byConfiguredIds.length > 0) {
      return byConfiguredIds;
    }

    const byPriorityCountry = leaguesPool.filter((league) =>
      PRIORITY_COUNTRIES.includes(normalizeText(league.country?.name || ''))
    );

    const byPriorityLeague = byPriorityCountry.filter((league) => {
      const normalizedLeagueName = normalizeText(league.league?.name || '');
      return PRIORITY_LEAGUE_TERMS.some((term) => normalizedLeagueName.includes(term));
    });

    const ordered = byPriorityLeague.length > 0 ? byPriorityLeague : byPriorityCountry;
    const seen = new Set<number>();

    return ordered.filter((league) => {
      if (seen.has(league.league.id)) {
        return false;
      }
      seen.add(league.league.id);
      return true;
    }).slice(0, 14);
  }, [allLeagues, popularLeagueIds]);

  const predictionRangeLabel = useMemo(
    () => `${moment(fromDate).format('DD MMM YYYY')} - ${moment(toDate).format('DD MMM YYYY')}`,
    [fromDate, toDate]
  );

  const quickSearchLeagues = useMemo(() => {
    if (!searchQuery.trim()) {
      return [] as LeagueDataModel[];
    }

    const flattened = filteredGroups.flatMap(([, leagues]) => leagues);
    const uniqueById = new Map<number, LeagueDataModel>();
    flattened.forEach((league) => {
      if (!uniqueById.has(league.league.id)) {
        uniqueById.set(league.league.id, league);
      }
    });

    return Array.from(uniqueById.values()).slice(0, 10);
  }, [filteredGroups, searchQuery]);
  

  // Selection helpers
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

  const clearPredictions = () => {
    setPredictedFixtures([]);
    setGroupedData({});
    setAllFixtures([]);
    setFutureFixtures([]);
    setCurrentFixtures([]);
    setLastBetAt(null);
    try { localStorage.removeItem(PREDICTIONS_CACHE_KEY); } catch {}
  };

  // Cooldown ticker
  useEffect(() => {
    tickRef.current = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, []);
  const msLeft = lastBetAt ? Math.max(0, lastBetAt + COOLDOWN_MS - nowTick) : 0;

  // <<< CHANGE: allow bets during countdown if batch < 7
  const canBet = selectedBatch.length > 0 && (selectedBatch.length < MAX_BATCH || msLeft === 0);


  useEffect(() => {
    if (msLeft === 0 && selectedBatch.length>=5) {
      resetSelection();
    }
  }, [msLeft]);

  // Fixtures helpers
  const filterFutureFixtures = (fixtures: FixtureDataModel[]) =>
    fixtures.filter((fixtureData) =>
      toMomentDate(fixtureData.fixture.date).isSameOrAfter(new Date(moment().subtract(1, 'days').format('YYYY-MM-DD')))
    );

  const filterBetweenDates = (fixtures: FixtureDataModel[], from: Date, to: Date) =>
    fixtures.filter((fixtureData) =>
      toMomentDate(fixtureData.fixture.date).isSameOrAfter(moment(from)) &&
      toMomentDate(fixtureData.fixture.date).isSameOrBefore(moment(to))
    );

  // Restore cached predictions
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
        const fallback = opt ?? new betOptionModel({ ...p.option, predict: () => ({ fixtures: [], option: {} as betOptionModel }) });
        return { fixtures: p.fixtures, option: fallback };
      })
    );
    setPredictedFixtures(prev => [...prev, ...mergedPred]);
  }, []); // run once

  // Derived fixtures & grouping
  useEffect(() => {
    setFutureFixtures(filterFutureFixtures(allFixtures));
  }, [allFixtures.length]);

  useEffect(() => {
    setCurrentFixtures(filterBetweenDates(futureFixtures, fromDate, toDate));
  }, [futureFixtures.length, fromDate.toString(), toDate.toString()]);

  useEffect(()=>{
    const bet = ()=> handleBet()
    bet()
  }, [fromDate.toString(), toDate.toString()])

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

  // Predict
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

  // Multi-season helpers
  const seasonWindow = (season: number) => {
    const from = moment(`${season}-07-01`, 'YYYY-MM-DD');
    const to = moment().add(30, 'days');
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

  // <<< CHANGE: return whether we actually hit network per league
  type LeagueFixturesResult = { leagueId: number; fixtures: FixtureDataModel[]; didNetwork: boolean };

  const getLeaguesSeasonsFixtures = async (leaguesInput: LeagueDataModel[]): Promise<LeagueFixturesResult[]> => {
    const seasonsCount = Math.max(1, Number(numberOfSeasonsBack || 1));

    return Promise.all(
      leaguesInput.map(async (league: LeagueDataModel) => {
        const currentSeason =
          league.seasons.find((s) => s.current === true)?.year ??
          league.seasons[0]?.year;

        const seasons: number[] = Array.from({ length: seasonsCount }, (_, i) => currentSeason - i);

        let didNetwork = false;

        const perSeason = await Promise.all(
          seasons.map(async (season) => {
            const existing = allFixtures.filter(f => f.league.id === league.league.id && f.league.season === season);
            if (countFinished(existing) >= MIN_SEASON_EXISTING_THRESHOLD) {
              return existing; // no network
            }

            // try fast path
            try {
              const resFast: FixturesModel = (await getFilteredFixtures(
                new FixturesFilterModel({ league: league.league.id, season })
              )).data;
              didNetwork = true;
              const fixturesFast = resFast?.response ?? [];
              if (countFinished(fixturesFast) > 0) {
                return fixturesFast;
              }

              // retry ranged
              const { from, to } = seasonWindow(season);
              const resRanged: FixturesModel = (await getFilteredFixtures(
                new FixturesFilterModel({ league: league.league.id, season, from, to })
              )).data;
              didNetwork = true;
              return resRanged?.response ?? [];
            } catch {
              try {
                const { from, to } = seasonWindow(season);
                const resRanged: FixturesModel = (await getFilteredFixtures(
                  new FixturesFilterModel({ league: league.league.id, season, from, to })
                )).data;
                didNetwork = true;
                return resRanged?.response ?? [];
              } catch {
                return [];
              }
            }
          })
        );

        return { leagueId: league.league.id, fixtures: dedupeFixtures(perSeason.flat()), didNetwork };
      })
    );
  };

  // Standings ensure (unchanged)
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
      const freshCache = readStandingsCache();
      toFetch.forEach((entry, idx) => {
        freshCache.items = freshCache.items.filter(it => !(it.leagueId === entry.league.league.id && it.season === entry.season));
        freshCache.items.push({ leagueId: entry.league.league.id, season: entry.season, data: fetched[idx], ts: Date.now() });
      });
      writeStandingsCache(freshCache);
      setLeaguesStandings(prev => [...prev, ...fetched]);
      results.push(...fetched);
    }

    return results;
  };

  // ===== BET flow =====
  const [loadingBatch, setLoadingBatch] = useState(false);

  const handleBet = async () => {
    if (loadingBatch) return;
    setLoadingBatch(true);

    const fromStr = moment(fromDate).format('YYYY-MM-DD');
    const toStr   = moment(toDate).format('YYYY-MM-DD');
    const optionIds = [...selectedOptions.map(o => o.id)].sort((a,b) => a-b);

    // Determine cache hits vs misses (per-league)
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
      const fallback = opt ?? new betOptionModel({ ...p.option, predict: () => ({ fixtures: [], option: {} as betOptionModel }) });
      return { fixtures: p.fixtures, option: fallback };
    });

    // new fixtures if any misses (multi-season) — also tells us whether we hit network per league
    let fetchedFixtures: FixtureDataModel[] = [];
    let fetchedLeagueCount = 0; // <<< CHANGE: track leagues that actually triggered network
    if (misses.length > 0) {
      const responses = await getLeaguesSeasonsFixtures(misses);
      fetchedFixtures = responses.flatMap(r => r.fixtures);
      fetchedLeagueCount = responses.filter(r => r.didNetwork).length;
    }

    // ensure standings
    const freshStandings = await ensureStandingsFor(selectedBatch);
    const standingsForPrediction = [...leaguesStandings, ...freshStandings];

    // predict
    const mergedAll = dedupeFixtures([...allFixtures, ...cachedFixtures, ...fetchedFixtures]);
    const currentWindow = filterBetweenDates(filterFutureFixtures(mergedAll), fromDate, toDate);

    const freshPred = runPredict({
      allFixturesLocal: mergedAll,
      currentFixturesLocal: currentWindow,
      leaguesStandingsLocal: standingsForPrediction
    });

    const mergedPred = [...predictedFixtures, ...cachedPred, ...freshPred];

    // write predictions cache for misses
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

    // <<< CHANGE: start cooldown ONLY if we actually fetched 7 leagues now
    if (fetchedLeagueCount >= MAX_BATCH) {
      setLastBetAt(Date.now());
    }

    setLoadingBatch(false);
  };

  // Bet Options bar (unchanged)
  const addOrRemoveBetOptions = (id: number) => {
    setSelectedOptions((prev) => {
      const exists = prev.some((o) => o.id === id);
      if (exists) return prev.filter((o) => o.id !== id);
      const found = betOptions.find((o) => o.id === id);
      return found ? [...prev, found] : prev;
    });
  };

  const isFavoritePrediction = (fixtureId: number, optionId: number) =>
    favoritePredictions.some((favorite) => favorite.fixtureId === fixtureId && favorite.optionId === optionId);

  const toggleFavoritePrediction = (fixture: FixtureDataModel, option: betOptionModel) => {
    setFavoritePredictions((prev) => {
      const exists = prev.some((favorite) => favorite.fixtureId === fixture.fixture.id && favorite.optionId === option.id);
      if (exists) {
        return prev.filter((favorite) => !(favorite.fixtureId === fixture.fixture.id && favorite.optionId === option.id));
      }

      const nextFavorite: FavoritePredictionItem = {
        fixtureId: fixture.fixture.id,
        optionId: option.id,
        savedAt: Date.now(),
        fixtureDate: fixture.fixture.date,
        leagueName: fixture.league.name,
        leagueCountry: fixture.league.country,
        homeTeamName: fixture.teams.home.name,
        homeTeamLogo: fixture.teams.home.logo,
        awayTeamName: fixture.teams.away.name,
        awayTeamLogo: fixture.teams.away.logo,
        optionName: option.name,
        optionShortName: option.shortName,
        optionDescription: option.description,
      };

      return [nextFavorite, ...prev].slice(0, 150);
    });
  };

  const openFavoriteFixture = (favorite: FavoritePredictionItem) => {
    const fixture =
      currentFixtures.find((currentFixture) => currentFixture.fixture.id === favorite.fixtureId) ||
      allFixtures.find((allFixture) => allFixture.fixture.id === favorite.fixtureId);

    if (fixture) {
      onFixtureClick(fixture)();
    }
  };

  // Standings/H2H helpers (unchanged)
  const toggleModal = () => {
    setIsModalOpen((v) => !v);
    if (isModalOpen) {
      setSelectedFixtureRow(null);
      setFixtureTeamsStandings(null);
    }
  };
  const getFixtureTeamsStandingsLocal = ({ homeTeamId, awayTeamId, leagueId }:{ homeTeamId:number; awayTeamId:number; leagueId:number; }) => {
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
    getFixtureTeamsStandingsLocal({ homeTeamId: fx.teams.home.id, awayTeamId: fx.teams.away.id, leagueId: fx.league.id });
    toggleModal();
  };

  // ===== Render =====
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100" style={{ fontFamily: '"Avenir Next", "Segoe UI", sans-serif' }}>
      <div className="relative">
        <div className="sticky top-0 z-30 border-b border-slate-700 bg-slate-900 backdrop-blur-xl">
          <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">BetSmart Prediction Desk</h1>
                <p className="mt-1 text-sm text-slate-200">Search leagues fast, pick options, and run predictions for fixtures in your date window.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-cyan-100">Selected leagues: {selectedBatch.length}/{MAX_BATCH}</span>
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-sky-100">Active options: {selectedOptions.length}</span>
                  <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-300">Predicted fixtures: {Object.keys(groupedData).length}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-600 bg-slate-800 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-200">Prediction Date Range</div>
                <div className="flex flex-wrap items-center gap-2">
                  <DatePicker
                    className="w-[140px] rounded-lg border border-slate-500 bg-white px-2 py-1.5 text-xs text-slate-900"
                    selected={fromDate}
                    onChange={(d: Date) => setFromDate(d)}
                  />
                  <span className="text-xs text-slate-200">to</span>
                  <DatePicker
                    className="w-[140px] rounded-lg border border-slate-500 bg-white px-2 py-1.5 text-xs text-slate-900"
                    selected={toDate}
                    onChange={(d: Date) => setToDate(d)}
                  />
                </div>
                <div className="mt-2 text-[11px] text-slate-200">Current window: {predictionRangeLabel}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-slate-600 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">League Selection</h2>
                  <p className="text-xs text-slate-200">Search by country or league and build your batch quickly.</p>
                </div>
                <button
                  onClick={resetSelection}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700"
                >
                  Clear selected leagues
                </button>
              </div>

              <div className="mb-2 flex items-center gap-2">
                <input
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                  placeholder="Search country or league..."
                  className="flex-1 rounded-xl border border-slate-500 bg-white px-3 py-2.5 text-sm text-slate-900 caret-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
                <button
                  onClick={() => {
                    setRawSearch('');
                    setSearchQuery('');
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
                >
                  Clear
                </button>
              </div>

              {searchQuery.trim() && (
                <div className="mb-3 rounded-xl border border-slate-700 bg-slate-950/70 p-2">
                  <div className="mb-2 text-[11px] font-semibold text-slate-300">Quick Search Results</div>
                  {quickSearchLeagues.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No direct league matches found.</div>
                  ) : (
                    <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1">
                      {quickSearchLeagues.map((league) => {
                        const selected = isSelected(league.league.id);
                        return (
                          <button
                            key={`quick-${league.league.id}`}
                            onClick={() => toggleLeague(league)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              selected
                                ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                                : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500'
                            }`}
                          >
                            <img src={league.league.logo} alt={league.league.name} className="h-3 w-3 rounded-full" />
                            <span className="max-w-[100px] truncate">{league.league.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Popular Leagues</div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {popularLeagues.map((league) => {
                  const selected = isSelected(league.league.id);
                  return (
                    <button
                      key={league.league.id}
                      onClick={() => toggleLeague(league)}
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                        selected
                          ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100'
                          : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500'
                      }`}
                    >
                      <img src={league.league.logo} alt={league.league.name} className="h-3.5 w-3.5 rounded-full" />
                      <span className="max-w-[120px] truncate">{league.league.name}</span>
                      <span className="hidden text-[10px] text-slate-400 sm:inline">{league.country.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected Leagues</div>
              {selectedBatch.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-2 text-xs text-slate-500">No leagues selected yet.</div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedBatch.map((league) => (
                    <button
                      key={league.league.id}
                      onClick={() => toggleLeague(league, false)}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100"
                    >
                      <span className="truncate">{league.league.name}</span>
                      <span className="text-cyan-300">x</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-600 bg-slate-900 p-4">
              <button
                onClick={() => setIsBetOptionsCollapsed((value) => !value)}
                className="mb-2 flex w-full items-center justify-between text-left"
              >
                <div className="text-sm font-semibold text-white">Bet Options</div>
                <span className="text-xs text-slate-300">{isBetOptionsCollapsed ? 'Show' : 'Hide'}</span>
              </button>
              {!isBetOptionsCollapsed && (
                <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {betOptions.map((option) => {
                    const active = selectedOptions.some((o) => o.id === option.id);
                    return (
                      <button
                        key={option.id}
                        onClick={() => addOrRemoveBetOptions(option.id)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          active
                            ? 'border-cyan-400 bg-cyan-600/90 text-white'
                            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                        }`}
                        title={option.description}
                      >
                        <div className="text-xs font-semibold">{option.name}</div>
                        <div className={`mt-1 text-[11px] ${active ? 'text-cyan-100' : 'text-slate-400'}`}>
                          {option.description || option.shortName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-600 bg-slate-900">
              <button
                onClick={() => setIsLeaguesByCountryCollapsed((value) => !value)}
                className="flex w-full items-center justify-between border-b border-slate-700/50 px-4 py-3 text-left"
              >
                <div className="text-sm font-semibold text-slate-100">Leagues by Country</div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">{filteredGroups.reduce((acc, [, leagues]) => acc + leagues.length, 0)} results</span>
                  <span className="text-xs text-slate-300">{isLeaguesByCountryCollapsed ? 'Show' : 'Hide'}</span>
                </div>
              </button>
              {!isLeaguesByCountryCollapsed && (
                <div className="max-h-[48vh] overflow-y-auto">
                  {isLoadingLeagues ? (
                    <div className="grid place-items-center py-12"><CircularProgress /></div>
                  ) : filteredGroups.length === 0 ? (
                    <div className="p-6 text-sm text-slate-400">No matches for your current search.</div>
                  ) : (
                    filteredGroups.map(([country, leagues], idx) => (
                      <CountrySection
                        key={country}
                        country={country}
                        leagues={leagues}
                        isOpenDefault={idx < 4}
                        isSelected={isSelected}
                        disabledReason={disabledReason}
                        onToggle={toggleLeague}
                        onSelectAll={() => selectAllInCountry(leagues)}
                        onClearAll={() => clearAllInCountry(leagues)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-600 bg-slate-900 p-4">
              <div className="mb-2 text-xs text-slate-200">Run predictions for fixtures between:</div>
              <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                {predictionRangeLabel}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-400">{msLeft > 0 ? `Cooldown: ${Math.ceil(msLeft / 1000)}s` : 'Ready'}</div>
                <button
                  onClick={handleBet}
                  disabled={!canBet || loadingBatch}
                  className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                    !canBet || loadingBatch
                      ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                      : 'bg-cyan-600 text-white shadow-lg hover:bg-cyan-500'
                  }`}
                >
                  {loadingBatch ? 'Betting...' : 'Bet (run predictions)'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-7 xl:col-span-8">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Predictions</h2>
                  <div className="text-xs text-slate-400">Fixtures matched in current range: {Object.keys(groupedData).length}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">{predictionRangeLabel}</div>
                  <button
                    onClick={clearPredictions}
                    className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20"
                  >
                    Clear predictions
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-100">Favorite Predictions</div>
                {favoritePredictions.length > 0 && (
                  <button
                    onClick={() => setFavoritePredictions([])}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {favoritePredictions.length === 0 ? (
                <div className="py-4 text-xs text-slate-400">Save predictions from fixture cards and they will appear here.</div>
              ) : (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {favoritePredictions.map((favorite) => (
                    <div key={`${favorite.fixtureId}-${favorite.optionId}`} className="rounded-xl border border-slate-700/60 bg-slate-900 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-100">
                          {favorite.optionShortName}
                        </div>
                        <div className="text-[10px] text-slate-400">Saved {moment(favorite.savedAt).fromNow()}</div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs text-slate-100">
                          <img src={favorite.homeTeamLogo} className="h-4 w-4" />
                          <span>{favorite.homeTeamName}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">vs</span>
                        <div className="flex items-center gap-2 text-xs text-slate-100">
                          <span>{favorite.awayTeamName}</span>
                          <img src={favorite.awayTeamLogo} className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="mt-1 text-[11px] text-slate-300">{favorite.optionDescription}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {favorite.leagueName} ({favorite.leagueCountry}) · {toMomentDate(favorite.fixtureDate).format('DD MMM YYYY HH:mm')}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => openFavoriteFixture(favorite)}
                          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20"
                        >
                          View fixture
                        </button>
                        <button
                          onClick={() =>
                            setFavoritePredictions((prev) =>
                              prev.filter(
                                (item) => !(item.fixtureId === favorite.fixtureId && item.optionId === favorite.optionId)
                              )
                            )
                          }
                          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2">
              {predictedFixtures.length === 0 ? (
                <div className="grid place-items-center py-16 text-sm text-slate-400">
                  No predictions yet. Select leagues, choose options, and press Bet.
                </div>
              ) : (
                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                  {Object.keys(groupedData).map((fixtureId) => {
                    const currentFixture = currentFixtures.find((f) => `${f.fixture.id}` === fixtureId);
                    if (!currentFixture) return null;

                    return (
                      <div key={fixtureId} className="rounded-xl border border-slate-700/70 bg-slate-900 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                          <div>
                            <div className="font-semibold text-slate-100">{currentFixture.league.name} ({currentFixture.league.country})</div>
                            <div>{toMomentDate(currentFixture.fixture.date).format('DD MMMM YYYY HH:mm')}</div>
                          </div>
                          <button
                            onClick={onFixtureClick(currentFixture)}
                            className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20"
                          >
                            View details
                          </button>
                        </div>

                        <div className="flex flex-col gap-2 text-sm font-medium text-slate-100 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <img src={currentFixture.teams.home.logo} className="h-5 w-5" />
                            <div className="truncate">{currentFixture.teams.home.name}</div>
                          </div>
                          <div className="text-xs text-slate-500">vs</div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            <img src={currentFixture.teams.away.logo} className="h-5 w-5" />
                            <div className="truncate">{currentFixture.teams.away.name}</div>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {groupedData[currentFixture.fixture.id]?.map((option) => {
                            const favorite = isFavoritePrediction(currentFixture.fixture.id, option.id);
                            return (
                              <div key={option.id} className="rounded-lg border border-sky-400/20 bg-sky-500/10 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold text-sky-100">{option.shortName}</span>
                                  <button
                                    onClick={() => toggleFavoritePrediction(currentFixture, option)}
                                    className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                                      favorite
                                        ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                                        : 'border border-slate-600 bg-slate-800 text-slate-300'
                                    }`}
                                  >
                                    {favorite ? 'Saved' : 'Save'}
                                  </button>
                                </div>
                                <div className="mt-1 text-[10px] text-slate-200">{option.description || option.name}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleBet}
        disabled={!canBet || loadingBatch}
        className={`fixed bottom-5 right-4 z-30 rounded-full px-5 py-3 text-sm font-semibold shadow-xl transition lg:hidden ${
          !canBet || loadingBatch
            ? 'cursor-not-allowed bg-slate-800/90 text-slate-400'
            : 'bg-cyan-600 text-white hover:bg-cyan-500'
        }`}
        title={msLeft > 0 ? `Cooldown: ${Math.ceil(msLeft / 1000)}s` : 'Bet now'}
      >
        {loadingBatch ? 'Betting...' : 'Bet'}
      </button>

      {/* Modal (unchanged) */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={toggleModal}
        overlayClassName="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        className="absolute left-1/2 top-10 z-50 h-[80vh] w-[92vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl outline-none sm:w-[80vw] lg:w-[70vw]"
        contentLabel="Fixture details"
      >
        <div className="flex h-full flex-col">
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

          <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-100">Head to Head</div>
              <div className="space-y-2">
                {selectedFixtureRow && getH2HFixtures({ teamOneId: selectedFixtureRow.teams.home.id, teamTwoId: selectedFixtureRow.teams.away.id, allFixtures }).map((fx) => (
                  <FixtureRowCompact key={fx.fixture.id} fixture={fx} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-100">Home Team – Last 5</div>
              <div className="space-y-2">
                {selectedFixtureRow && getLastFiveTeamFixtures({ teamId: selectedFixtureRow.teams.home.id, allFixtures }).map((fx) => (
                  <FixtureRowCompact key={fx.fixture.id} fixture={fx} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-100">Away Team – Last 5</div>
              <div className="space-y-2">
                {selectedFixtureRow && getLastFiveTeamFixtures({ teamId: selectedFixtureRow.teams.away.id, allFixtures }).map((fx) => {
                  return (
                  <FixtureRowCompact key={fx.fixture.id} fixture={fx} />
                )})}
              </div>
            </div>

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
