import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { predictFixture } from '../../prediction-engine/predict-fixture';
import { EnginePredictionPanel } from './BetAndFixturesScreen';
import BetAndFixturesScreen from './BetAndFixturesScreen';
import authNetworkService from '../../services/auth-network-service/auth-network.service';
import { makeFixture } from '../../prediction-engine/test-support/fixture-builders';
import { readPaperRecord, writePaperRecord } from '../../prediction-engine/paper-store';
import { createEmptyPaperRecord } from '../../prediction-engine/paper-tracking';

jest.mock('../../services/auth-network-service/auth-network.service', () => ({
  __esModule: true, default: { get: jest.fn() },
}));
jest.mock('react-modal', () => ({
  __esModule: true, default: Object.assign(() => null, { setAppElement: jest.fn() }),
}));
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockLeaguesState,
}));

const mockDispatch = jest.fn();
const currentYear = new Date().getFullYear();
const mockLeaguesState = {
  leagues: { response: [{
    league: { id: 39, name: 'Premier League', type: 'League', logo: '' },
    country: { name: 'England', code: 'GB', flag: '' },
    seasons: [{ year: currentYear, current: true }],
  }] },
  isLoadingLeagues: false,
};
const get = authNetworkService.get as jest.Mock;
let resultFinished: boolean;
let failRefresh: boolean;
let activeSeasonRequests: number;

const makeApiFixture = (id: number, timestamp: number, season: number, finished = true) => {
  const fixture = makeFixture({
    id, timestamp, homeId: 1, awayId: 2, homeGoals: finished ? 2 : null,
    awayGoals: finished ? 1 : null, leagueId: 39, season, status: finished ? 'FT' : 'NS',
  });
  return { ...fixture, fixture: { ...fixture.fixture, timestamp: Math.floor(timestamp / 1000) } };
};

beforeEach(() => {
  localStorage.clear();
  get.mockReset();
  mockDispatch.mockClear();
  resultFinished = false;
  failRefresh = false;
  activeSeasonRequests = 0;
  get.mockImplementation((endpoint, options) => {
    if (endpoint === 'fixtures') {
      const season = options.params.season;
      if (season === currentYear) {
        activeSeasonRequests += 1;
        if (failRefresh) return Promise.reject(new Error('Fixture refresh unavailable'));
      }
      const response = Array.from({ length: 10 }, (_, index) =>
        makeApiFixture(season * 100 + index, Date.UTC(season, 0, 1 + index), season)
      );
      if (season === currentYear) {
        response.push(makeApiFixture(900, Date.now() - 3_600_000, season, resultFinished));
        response.push(makeApiFixture(9999, Date.now() + 3_600_000, season, false));
      }
      return Promise.resolve({ data: { response, errors: [] } });
    }
    if (endpoint === 'standings' || endpoint === 'odds') {
      return Promise.resolve({ data: { response: [], errors: [] } });
    }
    throw new Error(`Unexpected test request: ${endpoint}`);
  });
  writePaperRecord({ ...createEmptyPaperRecord(), selections: [{
    fixtureId: 900, kickoff: Date.now() - 3_600_000, capturedAt: Date.now() - 7_200_000,
    homeTeam: 'Team 1', awayTeam: 'Team 2', marketId: 'home_win', label: 'Home win',
    modelProbability: 0.6, decimalOdds: 2, rawImpliedProbability: 0.5,
    edge: 0.1, expectedValue: 0.2, qualified: true,
  }] });
});

const runInitialBatch = async () => {
  render(<BetAndFixturesScreen />);
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  const run = screen.getByRole('button', { name: 'Bet (run predictions)' });
  await waitFor(() => expect(run).not.toBeDisabled());
  fireEvent.click(run);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Bet (run predictions)' })).not.toBeDisabled());
  expect(activeSeasonRequests).toBe(1);
  expect(readPaperRecord().selections[0].settled).toBeUndefined();
  return screen.getByRole('button', { name: 'Bet (run predictions)' });
};

it('refreshes the active season through both caches and settles the latest result', async () => {
  const run = await runInitialBatch();
  expect(localStorage.getItem('leaguePredictions_v3')).toBeTruthy();
  resultFinished = true;
  fireEvent.click(run);
  await waitFor(() => expect(readPaperRecord().selections[0].settled?.won).toBe(true));
  expect(activeSeasonRequests).toBe(2);
  const requestedSeasons = get.mock.calls.filter(([endpoint]) => endpoint === 'fixtures')
    .map(([, options]) => options.params.season);
  expect(requestedSeasons.filter((season) => season === currentYear - 1)).toHaveLength(1);
  expect(requestedSeasons.filter((season) => season === currentYear - 2)).toHaveLength(1);
  expect(readPaperRecord().selections[0].settled?.profit).toBe(1);
});

it('reports a failed explicit refresh without inventing a settled result', async () => {
  const run = await runInitialBatch();
  failRefresh = true;
  fireEvent.click(run);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Fixture refresh unavailable'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Bet (run predictions)' })).not.toBeDisabled());
  expect(readPaperRecord().selections[0].settled).toBeUndefined();
});
it('keeps forecasts first, removes model-pick sections, and updates the threshold bet list on model and filter changes', async () => {
  await runInitialBatch();
  const forecasts = screen.getByText(/All forecasts and market details/).closest('details')!;
  expect(screen.queryByText('Model picks, rankings and explanations')).not.toBeInTheDocument();
  expect(screen.queryByText('Model picks and explanations')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Best available options' })).not.toBeInTheDocument();
  expect(forecasts).toHaveAttribute('open');
  const betList = screen.getByRole('region', { name: 'Suggested bet list' });
  expect(forecasts.compareDocumentPosition(betList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(betList).getAllByRole('listitem')).toHaveLength(1);
  expect(forecasts.querySelector('[data-highlight]')).toBeTruthy();
  expect(forecasts).toHaveTextContent('2–5 total goals');
  expect(forecasts).toHaveTextContent('3–6 total goals');
  const statisticalBadges = forecasts.querySelectorAll('[data-highlight]').length;
  fireEvent.click(screen.getByRole('button', { name: 'Legacy rules', exact: true }));
  expect(screen.queryByText(/All forecasts and market details/)).not.toBeInTheDocument();
  expect(within(betList).queryByRole('listitem')).not.toBeInTheDocument();
  expect(betList).toHaveTextContent('Legacy rules do not supply forecast probabilities');
  expect(screen.getByText(/Legacy fixture results/).closest('details')!.querySelector('[data-highlight]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Statistical', exact: true }));
  expect(screen.getByText(/All forecasts and market details/).closest('details')!.querySelectorAll('[data-highlight]')).toHaveLength(statisticalBadges);
  // A date range with no assessed fixtures must remove the previous highlights.
  const dates = screen.getAllByRole('textbox').filter(input => (input as HTMLInputElement).value.match(/^\d{2}\/\d{2}\/\d{4}$/));
  expect(dates.length).toBeGreaterThanOrEqual(2);
  await act(async () => {
    fireEvent.change(dates[0], { target: { value: '01/01/2099' } });
    fireEvent.blur(dates[0]);
  });
  await waitFor(() => expect(screen.getByText(/All forecasts and market details/).closest('details')!.querySelector('[data-highlight]')).toBeNull());
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  expect(within(betList).queryByRole('listitem')).not.toBeInTheDocument();
});


it('keeps every forecast visible with an honest empty suggestion state when probabilities are missing', () => {
  const prediction = predictFixture({
    fixture: makeApiFixture(999, Date.now() + 3_600_000, currentYear, false),
    allFixtures: [], leaguesStandings: [],
  });
  prediction.markets = [{ marketId: 'btts_no', label: 'BTTS No', modelProbability: .99 } as typeof prediction.markets[number]];
  prediction.selections = [...prediction.markets];
  prediction.headline = 'BTTS No is leading';
  prediction.probabilities.baseScorelines = undefined;
  render(<EnginePredictionPanel prediction={prediction} onCaptureOdds={jest.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('No forecasts meet the configured suggestion thresholds.');
  expect(screen.getAllByText('Probability unavailable')).toHaveLength(25);
  expect(screen.queryByText(/BTTS No/)).not.toBeInTheDocument();
  expect(screen.getByText('Both teams to score')).toBeInTheDocument();
  expect(screen.queryByText('Model picks and explanations')).not.toBeInTheDocument();
});


it('restores statistical forecasts and highlights after remount without refetching or renewing their six-hour lifetime', async () => {
  await runInitialBatch();
  const cacheBefore = localStorage.getItem('leaguePredictions_v3');
  const forecastsBefore = screen.getByText(/All forecasts and market details/).closest('details')!.textContent;
  const requestsBefore = get.mock.calls.length;
  expect(JSON.parse(cacheBefore!).items[0].enginePredictions.length).toBeGreaterThan(0);
  cleanup();
  render(<BetAndFixturesScreen />);
  await screen.findAllByText('2–5 total goals');
  expect(screen.getByText(/All forecasts and market details/).closest('details')!.textContent).toBe(forecastsBefore);
  expect(get.mock.calls.length).toBe(requestsBefore);
  expect(localStorage.getItem('leaguePredictions_v3')).toBe(cacheBefore);
  expect(screen.queryByText(/BTTS No/)).not.toBeInTheDocument();
});

it('restores a saved date range and legacy results, and clearing removes both caches', async () => {
  await runInitialBatch();
  const view = JSON.parse(localStorage.getItem('predictionView_v1')!);
  // Save a wider custom range that still includes the assessed fixture.
  view.from = '2020-01-01';
  view.to = '2099-01-01';
  localStorage.setItem('predictionView_v1', JSON.stringify(view));
  const cache = JSON.parse(localStorage.getItem('leaguePredictions_v3')!);
  cache.items.forEach((item: { from: string; to: string }) => { item.from = view.from; item.to = view.to; });
  // Seed a known legacy match: the synthetic team's rule-based run can legitimately return none.
  cache.items[0].predicted = [{
    fixtures: [cache.items[0].enginePredictions[0].fixture],
    option: { id: 1, name: 'Home Win', shortName: 'Home', level: 3, description: 'Home team wins' },
  }];
  localStorage.setItem('leaguePredictions_v3', JSON.stringify(cache));
  fireEvent.click(screen.getByRole('button', { name: 'Legacy rules', exact: true }));
  cleanup();
  render(<BetAndFixturesScreen />);
  await waitFor(() => expect(screen.getByText(/Legacy fixture results/).textContent).not.toContain('0 fixtures'));
  expect(screen.getByDisplayValue('01/01/2020')).toBeInTheDocument();
  expect(screen.getByDisplayValue('01/01/2099')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear predictions' }));
  expect(localStorage.getItem('leaguePredictions_v3')).toBeNull();
  expect(localStorage.getItem('predictionView_v1')).toBeNull();
  cleanup();
  render(<BetAndFixturesScreen />);
  expect(screen.getByText(/Legacy fixture results/)).toHaveTextContent('0 fixtures');
});

it('does not restore cached predictions at the six-hour expiry boundary', async () => {
  await runInitialBatch();
  const cache = JSON.parse(localStorage.getItem('leaguePredictions_v3')!);
  cache.items.forEach((item: { ts: number }) => { item.ts = Date.now() - 6 * 60 * 60 * 1000; });
  localStorage.setItem('leaguePredictions_v3', JSON.stringify(cache));
  cleanup();
  render(<BetAndFixturesScreen />);
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('0 fixtures');
  expect(screen.queryByText('2–5 total goals')).not.toBeInTheDocument();
});

test.each(['not-json', '{"items":{}}'])('ignores malformed prediction cache: %s', raw => {
  localStorage.setItem('leaguePredictions_v3', raw);
  localStorage.setItem('predictionView_v1', raw);
  render(<BetAndFixturesScreen />);
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('0 fixtures');
});

it('keeps forecasts usable and reports a browser-storage failure', async () => {
  const original = Storage.prototype.setItem;
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (key === 'leaguePredictions_v3') throw new DOMException('Storage full', 'QuotaExceededError');
    return original.call(this, key, value);
  });
  try {
    await runInitialBatch();
    expect(screen.getAllByText('2–5 total goals').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/predictions could not be saved for page refresh/).length).toBeGreaterThan(0);
  } finally { spy.mockRestore(); }
});

it('expands or collapses individual fixtures and the full forecast list without removing forecasts', async () => {
  await runInitialBatch();
  const toggles = screen.getAllByRole('button', { name: /^Collapse forecast for/ });
  expect(toggles.length).toBeGreaterThan(1);
  const contents = toggles.map(button => document.getElementById(button.getAttribute('aria-controls')!)!);
  contents.forEach(content => expect(content).toBeVisible());
  const probabilitiesBefore = contents.map(content => content.textContent);
  fireEvent.click(toggles[0]);
  expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');
  expect(contents[0]).not.toBeVisible();
  expect(contents[1]).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'View details' }).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all', exact: true }));
  contents.forEach(content => expect(content).not.toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'Expand all', exact: true }));
  contents.forEach(content => expect(content).toBeVisible());
  expect(contents.map(content => content.textContent)).toEqual(probabilitiesBefore);
  expect(screen.getAllByRole('button', { name: /^Collapse forecast for/ })).toHaveLength(toggles.length);
});

it('shows progress while a request is pending and removes the loader when predictions finish', async () => {
  const implementation = get.getMockImplementation();
  if (!implementation) throw new Error('Missing API fixture mock');
  let release: () => void = () => undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  get.mockImplementation(async (endpoint, options) => {
    if (endpoint === 'fixtures' && options.params.season === currentYear) await pending;
    return implementation(endpoint, options);
  });
  render(<BetAndFixturesScreen />);
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Bet (run predictions)' }));
  expect(screen.getByRole('region', { name: 'Prediction loading' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Prediction progress' })).toHaveTextContent('Gathering fixtures');
  expect(screen.getByRole('button', { name: 'Preparing forecasts…' })).toBeDisabled();
  expect(screen.queryByText('No predictions yet. Select leagues, choose options, and press Bet.')).not.toBeInTheDocument();
  await act(async () => { release(); });
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  expect(screen.queryByRole('region', { name: 'Prediction loading' })).not.toBeInTheDocument();
  expect(screen.getAllByText('2–5 total goals').length).toBeGreaterThan(0);
});

it('keeps existing forecasts visible while refreshing and clears the loader after a failed data request', async () => {
  const run = await runInitialBatch();
  failRefresh = true;
  fireEvent.click(run);
  expect(screen.getByRole('region', { name: 'Prediction loading' })).toHaveTextContent('Your previous forecasts remain below');
  expect(screen.getAllByText('2–5 total goals').length).toBeGreaterThan(0);
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  expect(screen.queryByRole('region', { name: 'Prediction loading' })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Fixture refresh unavailable');
});

const retryLeagueNames: Record<number, string> = { 39: 'Premier League', 78: 'Bundesliga', 140: 'La Liga' };
const setupLeagueRetryApi = () => {
  const base = mockLeaguesState.leagues.response[0];
  mockLeaguesState.leagues.response = [39, 78, 140].map(id => ({
    ...base,
    league: { ...base.league, id, name: retryLeagueNames[id] },
    country: { ...base.country, name: id === 39 ? 'England' : id === 78 ? 'Germany' : 'Spain' },
  }));
  localStorage.setItem('popularLeagueIds_v1', JSON.stringify([39, 78, 140]));
  const fixtureFailures = new Set<string>();
  const standingsFailures = new Set<number>();
  const payloadFailures = new Set<string>();
  const fallbackSuccesses = new Set<string>();
  const blockers = new Map<string, Promise<void>>();
  get.mockImplementation(async (endpoint, options) => {
    const { league, season } = options.params;
    if (endpoint === 'fixtures') {
      const key = `${league}:${season}`;
      if (blockers.has(key)) await blockers.get(key);
      if (fixtureFailures.has(key) || fallbackSuccesses.has(key) && !options.params.from) throw new Error(`Network unavailable for ${retryLeagueNames[league]}`);
      if (payloadFailures.has(key)) return { data: { response: [], errors: { access: 'Provider access temporarily unavailable' } } };
      const fixtureForLeague = (id: number, timestamp: number, finished: boolean) => {
        const fixture = makeApiFixture(id, timestamp, season, finished);
        return {
          ...fixture,
          league: { ...fixture.league, id: league, name: retryLeagueNames[league] },
          teams: {
            home: { ...fixture.teams.home, id: league * 10, name: `Home ${league}` },
            away: { ...fixture.teams.away, id: league * 10 + 1, name: `Away ${league}` },
          },
        };
      };
      const response = Array.from({ length: 10 }, (_, index) => fixtureForLeague(league * 1_000_000 + season * 100 + index, Date.UTC(season, 0, index + 1), true));
      if (season === currentYear) response.push(fixtureForLeague(league * 1_000_000 + 99_999, Date.now() + 3_600_000, false));
      return { data: { response, errors: [] } };
    }
    if (endpoint === 'standings' && standingsFailures.has(league)) return { data: { response: [], errors: { access: 'Standings unavailable from provider' } } };
    if (endpoint === 'standings' || endpoint === 'odds') return { data: { response: [], errors: [] } };
    throw new Error(`Unexpected test request: ${endpoint}`);
  });
  return { fixtureFailures, standingsFailures, payloadFailures, fallbackSuccesses, blockers };
};
afterEach(() => { mockLeaguesState.leagues.response = mockLeaguesState.leagues.response.slice(0, 1); });
const runRetryBatch = async () => {
  render(<BetAndFixturesScreen />);
  for (const id of [39, 78, 140]) fireEvent.click((await screen.findAllByRole('button', { name: new RegExp(retryLeagueNames[id]) }))[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Bet (run predictions)' }));
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
};

it('retries only a failed league and season, preserves successful forecasts, and clears only recovered failures', async () => {
  const api = setupLeagueRetryApi();
  api.fixtureFailures.add(`78:${currentYear}`);
  api.fixtureFailures.add(`140:${currentYear - 1}`);
  await runRetryBatch();
  expect(screen.getByRole('alert')).toHaveTextContent('Bundesliga');
  expect(screen.getByRole('alert')).toHaveTextContent('La Liga');
  const successfulForecast = document.getElementById('forecast-content-39099999')?.textContent;
  expect(successfulForecast).toBeTruthy();
  const successfulCache = JSON.parse(localStorage.getItem('leaguePredictions_v3')!).items.find((item: { leagueId: number }) => item.leagueId === 39);
  expect(JSON.parse(localStorage.getItem('leaguePredictions_v3')!).items.some((item: { leagueId: number }) => item.leagueId === 78)).toBe(false);
  api.fixtureFailures.delete(`78:${currentYear}`);
  let before = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry Bundesliga', exact: true }));
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  let fixtureRequests = get.mock.calls.slice(before).filter(([endpoint]) => endpoint === 'fixtures');
  expect(fixtureRequests).toHaveLength(1);
  expect(fixtureRequests[0][1].params).toMatchObject({ league: 78, season: currentYear });
  expect(screen.queryByRole('button', { name: 'Retry Bundesliga', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry La Liga', exact: true })).toBeEnabled();
  expect(document.getElementById('forecast-content-39099999')?.textContent).toBe(successfulForecast);
  expect(JSON.parse(localStorage.getItem('leaguePredictions_v3')!).items.find((item: { leagueId: number }) => item.leagueId === 39)).toEqual(successfulCache);
  api.fixtureFailures.delete(`140:${currentYear - 1}`);
  before = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry La Liga', exact: true }));
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  fixtureRequests = get.mock.calls.slice(before).filter(([endpoint]) => endpoint === 'fixtures');
  expect(fixtureRequests).toHaveLength(1);
  expect(fixtureRequests[0][1].params).toMatchObject({ league: 140, season: currentYear - 1 });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('retries all failed leagues, disables duplicate retries, and keeps a failure that still has a network error', async () => {
  const api = setupLeagueRetryApi();
  api.fixtureFailures.add(`78:${currentYear}`);
  api.fixtureFailures.add(`140:${currentYear}`);
  await runRetryBatch();
  api.fixtureFailures.delete(`78:${currentYear}`);
  let release: () => void = () => undefined;
  api.blockers.set(`78:${currentYear}`, new Promise<void>(resolve => { release = resolve; }));
  const before = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry all failed leagues' }));
  expect(screen.getByRole('button', { name: 'Retrying Bundesliga', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Retrying La Liga', exact: true })).toBeDisabled();
  const pendingCalls = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry all failed leagues' }));
  expect(get.mock.calls.length).toBe(pendingCalls);
  await act(async () => { release(); });
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  const fixtureRequests = get.mock.calls.slice(before).filter(([endpoint]) => endpoint === 'fixtures');
  expect(new Set(fixtureRequests.map(([, options]) => options.params.league))).toEqual(new Set([78, 140]));
  expect(fixtureRequests.every(([, options]) => options.params.season === currentYear)).toBe(true);
  expect(screen.queryByRole('button', { name: 'Retry Bundesliga', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry La Liga', exact: true })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable for La Liga');
});

it('handles a standings provider error per league and retries standings without refetching any fixtures', async () => {
  const api = setupLeagueRetryApi();
  api.standingsFailures.add(78);
  // Older app versions could cache provider errors; those must not count as a healthy hit.
  localStorage.setItem('standingsCache_v2', JSON.stringify({ items: [{
    leagueId: 78, season: currentYear, ts: Date.now(), data: { response: [], errors: ['Old provider failure'] },
  }] }));
  await runRetryBatch();
  expect(screen.getByRole('alert')).toHaveTextContent('Standings unavailable from provider');
  expect(document.getElementById('forecast-content-39099999')).toBeInTheDocument();
  api.standingsFailures.delete(78);
  const before = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry Bundesliga', exact: true }));
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  const requests = get.mock.calls.slice(before);
  expect(requests.filter(([endpoint]) => endpoint === 'fixtures')).toHaveLength(0);
  const standings = requests.filter(([endpoint]) => endpoint === 'standings');
  expect(standings).toHaveLength(1);
  expect(standings[0][1].params.league).toBe(78);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('does not report a league failure when the automatic ranged fallback succeeds', async () => {
  const api = setupLeagueRetryApi();
  api.fallbackSuccesses.add(`78:${currentYear}`);
  await runRetryBatch();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(get.mock.calls.filter(([endpoint, options]) => endpoint === 'fixtures' && options.params.league === 78 && options.params.season === currentYear)).toHaveLength(2);
});

it('offers retries for an entirely failed fixture batch even after clearing the league selection', async () => {
  const api = setupLeagueRetryApi();
  [39, 78, 140].forEach(id => api.payloadFailures.add(`${id}:${currentYear}`));
  await runRetryBatch();
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('0 fixtures');
  expect(screen.getByRole('alert')).toHaveTextContent('Provider access temporarily unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Clear selected leagues' }));
  api.payloadFailures.delete(`78:${currentYear}`);
  fireEvent.click(screen.getByRole('button', { name: 'Retry Bundesliga', exact: true }));
  await screen.findByRole('button', { name: 'Bet (run predictions)' });
  expect(document.getElementById('forecast-content-78099999')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry Bundesliga', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry Premier League', exact: true })).toBeEnabled();
});
