import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { predictFixture } from '../../prediction-engine/predict-fixture';
import { buildForecastBetList } from '../../prediction-engine/forecast-bet-list';
import { EnginePredictionPanel } from './BetAndFixturesScreen';
import BetAndFixturesScreen from './BetAndFixturesScreen';
import { apiClient, apiGet } from '../../services/api/client';
import { makeFixture } from '../../prediction-engine/test-support/fixture-builders';
import { readPaperRecord, writePaperRecord } from '../../prediction-engine/paper-store';
import { createEmptyPaperRecord } from '../../prediction-engine/paper-tracking';
import { readPredictionsCache, writePredictionsCache, clearPredictionsCache } from '../../services/prediction-cache';
import { writeBrowserCache, resetMemoryBrowserCache } from '../../services/test-support/memory-browser-cache';
import { FORECAST_HIGHLIGHTS, ForecastPreference, impliedHighlightResult, forecastProbability, ForecastId } from '../../config/forecast-highlights';
import { FixturePrediction } from '../../prediction-engine/types';
import { PredictionEnvelopeRow, PredictionWorkspacePayload } from '../../services/predictions';
jest.mock('../../services/browser-cache', () => require('../../services/test-support/memory-browser-cache'));

jest.mock('../../services/api/client', () => ({
  __esModule: true,
  apiGet: jest.fn(),
  apiClient: { post: jest.fn(), delete: jest.fn() },
  PremiumRequiredError: class PremiumRequiredError extends Error {},
  SessionExpiredError: class SessionExpiredError extends Error {},
  SignInRequiredError: class SignInRequiredError extends Error {},
  ApiRequestError: class ApiRequestError extends Error {},
}));
jest.mock('react-modal', () => ({
  __esModule: true, default: Object.assign(() => null, { setAppElement: jest.fn() }),
}));
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockLeaguesState,
}));

// The screen requires a signed-in user; default the test to signed-in.
const mockAuth: { user: { uid: string; email: string } | null; initialising: boolean; markSignedOut: jest.Mock } = {
  user: { uid: 'test-user', email: 'test@example.com' }, initialising: false, markSignedOut: jest.fn(),
};
jest.mock('../../services/auth/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: unknown }) => children,
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
const get = apiGet as jest.Mock;
const post = apiClient.post as jest.Mock;
const remove = apiClient.delete as jest.Mock;
type TestPredictionRow = Omit<PredictionEnvelopeRow, 'output'> & { output: FixturePrediction };
const serverPredictions = new Map<number, TestPredictionRow>();
const serverWorkspaces = new Map<string, PredictionWorkspacePayload>();
const businessDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
});
const workspaceResponse = (range?: { from?: string; to?: string }) => {
  const workspace = serverWorkspaces.get(mockAuth.user?.uid ?? '') ?? {
    leagues: [], from: null, to: null, response: [],
  };
  const from = range?.from ?? workspace.from;
  const to = range?.to ?? workspace.to;
  const response = Array.from(serverPredictions.values()).filter(row => {
    const fixture = row.output.fixture;
    const day = businessDate.format((row.fixture?.fixture.timestamp ?? fixture.fixture.timestamp) * 1000);
    return workspace.leagues.some(league => league.leagueId === fixture.league.id && league.season === fixture.league.season)
      && (!from || day >= from) && (!to || day <= to);
  });
  return { data: { ...workspace, from, to, response, results: response.length,
    leagues: workspace.leagues.map(league => ({ ...league,
      predictions: response.filter(row => row.output.fixture.league.id === league.leagueId).length,
    })), errors: [], paging: { current: 1, total: 1 },
  } };
};

/** Wire-format mapping matching the backend's real `bet_list`/`highlight_levels`
 * operations exactly (see PredictXI-backend's prediction_runner/run.ts), so this
 * mock exercises the same request/response contract as production - just
 * computed in-process via the still-present engine modules instead of a real
 * HTTP round trip to a compiled runner subprocess. */
const preferenceWire = (forecastId: ForecastId) => {
  const preference: ForecastPreference = FORECAST_HIGHLIGHTS[forecastId];
  return { label: preference.label, meaning: preference.meaning, suggest: preference.suggest, strong: preference.strong ?? null, isRange: Boolean(preference.range) };
};
const mockBetListResponse = (predictions: FixturePrediction[], limit?: number) => ({
  data: {
    errors: [], results: 0,
    response: buildForecastBetList(predictions, Date.now(), { limit }).map((suggestion) => ({
      providerFixtureId: suggestion.prediction.fixture.fixture.id,
      marketId: suggestion.forecastId,
      marketLabel: suggestion.preference.label,
      marketLine: suggestion.preference.range ? `${suggestion.preference.range.min}-${suggestion.preference.range.max} ${suggestion.preference.range.side}` : '',
      probability: suggestion.probability,
      explanation: suggestion.preference.meaning ?? '',
      level: suggestion.level,
      preference: preferenceWire(suggestion.forecastId),
      family: suggestion.family,
      historyLimited: suggestion.historyLimited,
      ...(suggestion.impliedBy ? { impliedBy: suggestion.impliedBy } : {}),
      priceStatus: suggestion.priceStatus,
      decimalOdds: Number.isFinite(suggestion.market?.decimalOdds) && (suggestion.market?.decimalOdds as number) > 1 ? (suggestion.market?.decimalOdds as number) : null,
      bookmaker: suggestion.market?.bookmaker ?? '',
      oddsTimestamp: Number.isFinite(suggestion.market?.oddsTimestamp) ? (suggestion.market?.oddsTimestamp as number) : null,
    })),
  },
});
const mockHighlightsResponse = (predictions: FixturePrediction[]) => ({
  data: {
    errors: [], results: predictions.length,
    response: predictions.map((prediction) => ({
      providerFixtureId: prediction.fixture.fixture.id,
      markets: (Object.keys(FORECAST_HIGHLIGHTS) as ForecastId[]).reduce((acc, forecastId) => {
        const { level, impliedBy } = impliedHighlightResult(prediction, forecastId);
        const probability = forecastProbability(prediction, forecastId);
        acc[forecastId] = { level, probability: probability === undefined ? null : probability, preference: preferenceWire(forecastId), ...(impliedBy ? { impliedBy } : {}) };
        return acc;
      }, {} as Record<string, unknown>),
    })),
  },
});
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

beforeEach(async () => {
  await clearPredictionsCache();
  resetMemoryBrowserCache();
  localStorage.clear();
  get.mockReset();
  post.mockReset();
  mockDispatch.mockClear();
  mockAuth.user = { uid: 'test-user', email: 'test@example.com' };
  mockAuth.initialising = false;
  serverPredictions.clear();
  serverWorkspaces.clear();
  remove.mockReset();
  remove.mockImplementation(() => {
    serverWorkspaces.delete(mockAuth.user?.uid ?? '');
    return Promise.resolve({ status: 204 });
  });
  resultFinished = false;
  failRefresh = false;
  activeSeasonRequests = 0;
  post.mockImplementation((path: string, body: { predictions: FixturePrediction[]; limit?: number } & PredictionWorkspacePayload) => {
    if (path === '/predictions/bet-list/') return Promise.resolve(mockBetListResponse(body.predictions, body.limit));
    if (path === '/predictions/highlights/') return Promise.resolve(mockHighlightsResponse(body.predictions));
    if (path === '/predictions/workspace/') {
      const owner = mockAuth.user?.uid ?? '';
      const previous = serverWorkspaces.get(owner);
      const leagues = new Map((previous?.leagues ?? []).map(league => [`${league.leagueId}:${league.season}`, league]));
      body.leagues.forEach(league => leagues.set(`${league.leagueId}:${league.season}`, league));
      serverWorkspaces.set(owner, { from: body.from, to: body.to, leagues: Array.from(leagues.values()), lastBatch: body.leagues });
      return Promise.resolve(workspaceResponse());
    }
    throw new Error(`Unexpected test POST request: ${path}`);
  });
  get.mockImplementation((endpoint, options) => {
    if (endpoint === '/predictions/workspace/') return Promise.resolve(workspaceResponse(options?.params));
    if (endpoint === '/me/') {
      return Promise.resolve({ data: { has_prediction_access: true, prediction_access_ends_at: '2099-01-01' } });
    }
    if (endpoint === '/predictions/') {
      const season = options.params.season;
      if (season !== currentYear) return Promise.resolve({ data: { response: [], errors: [], results: 0 } });
      const now = Date.now();
      const history = Array.from({ length: 10 }, (_, index) =>
        makeApiFixture(season * 100 + index, Date.UTC(season, 0, 1 + index), season)
      );
      const settled = makeApiFixture(900, now - 3_600_000, season, resultFinished);
      const upcoming = makeApiFixture(9999, now + 3_600_000, season, false);
      const allFixtures = [...history, settled, upcoming];
      const toRow = (id: number, fixture: ReturnType<typeof makeApiFixture>) => ({
        id, engine_version: 'test', config_hash: 'test',
        generated_at: new Date(now).toISOString(), as_of: new Date(now).toISOString(),
        valid_until: null, is_actionable: true,
        output: predictFixture({ fixture, allFixtures, leaguesStandings: [] }),
      });
      const response = [toRow(1, settled), toRow(2, upcoming)];
      response.forEach(row => serverPredictions.set(row.id, row));
      return Promise.resolve({ data: { response, errors: [], results: 2 } });
    }
    if (endpoint === '/fixtures/') {
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
      return Promise.resolve({ data: { response, errors: [], results: response.length } });
    }
    if (endpoint === '/standings/' || endpoint === '/odds/') {
      return Promise.resolve({ data: { response: [], errors: [], results: 0 } });
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

const renderPredictionDesk = async () => {
  const rendered = render(<MemoryRouter><BetAndFixturesScreen /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Restoring saved forecasts…')).not.toBeInTheDocument());
  return rendered;
};

const awaitHighlightsSettled = async () => {
  await waitFor(() => expect(screen.queryByText('Checking forecast highlights…')).not.toBeInTheDocument());
};

const runInitialBatch = async () => {
  await renderPredictionDesk();
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  const run = screen.getByRole('button', { name: 'Generate Predictions' });
  await waitFor(() => expect(run).not.toBeDisabled());
  fireEvent.click(run);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Predictions' })).not.toBeDisabled());
  expect(activeSeasonRequests).toBe(1);
  expect(readPaperRecord().selections[0].settled).toBeUndefined();
  await awaitHighlightsSettled();
  return screen.getByRole('button', { name: 'Generate Predictions' });
};

it('refreshes the active season through both caches and settles the latest result', async () => {
  const run = await runInitialBatch();
  expect((await readPredictionsCache()).items.length).toBeGreaterThan(0);
  expect(localStorage.getItem('leaguePredictions_v3')).toBeNull();
  resultFinished = true;
  fireEvent.click(run);
  await waitFor(() => expect(readPaperRecord().selections[0].settled?.won).toBe(true));
  expect(activeSeasonRequests).toBe(2);
  const requestedSeasons = get.mock.calls.filter(([endpoint]) => endpoint === '/fixtures/')
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Predictions' })).not.toBeDisabled());
  expect(readPaperRecord().selections[0].settled).toBeUndefined();
});

it('does not run predictions when signed out', async () => {
  mockAuth.user = null;
  await renderPredictionDesk();
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  const run = screen.getByRole('button', { name: 'Generate Predictions' });
  await waitFor(() => expect(run).toBeDisabled());
  // No fixtures request should be issued while signed out.
  expect(get.mock.calls.filter(([endpoint]) => endpoint === '/fixtures/')).toHaveLength(0);
  mockAuth.user = { uid: 'test-user', email: 'test@example.com' };
});
it('shows a paywall CTA and blocks the predictions fetch when no active pass exists', async () => {
  const implementation = get.getMockImplementation();
  if (!implementation) throw new Error('Missing API fixture mock');
  get.mockImplementation((endpoint, options) => {
    if (endpoint === '/me/') return Promise.resolve({ data: { has_prediction_access: false, prediction_access_ends_at: null } });
    return implementation(endpoint, options);
  });
  const Location = () => {
    const location = useLocation();
    return <span data-testid="location">{location.pathname}:{JSON.stringify(location.state)}</span>;
  };
  render(<MemoryRouter><BetAndFixturesScreen /><Location /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/An active prediction pass is required/)).toBeInTheDocument());
  expect(screen.getByRole('link', { name: 'View access passes' })).toHaveAttribute('href', '/access');
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  const run = screen.getByRole('button', { name: 'Generate Predictions' });
  expect(run).toBeDisabled();
  fireEvent.click(run);
  expect(get.mock.calls.filter(([endpoint]) => endpoint === '/me/')).not.toHaveLength(0);
  expect(get.mock.calls.filter(([endpoint]) => ['/fixtures/', '/standings/', '/predictions/'].includes(endpoint))).toHaveLength(0);
  fireEvent.click(screen.getByRole('link', { name: 'View access passes' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/access:{"reason":"premium-required"}');
});

it('does not fetch fixtures in legacy mode without an active pass', async () => {
  const implementation = get.getMockImplementation();
  if (!implementation) throw new Error('Missing API fixture mock');
  get.mockImplementation((endpoint, options) => {
    if (endpoint === '/me/') return Promise.resolve({ data: { has_prediction_access: false, prediction_access_ends_at: null } });
    return implementation(endpoint, options);
  });
  await renderPredictionDesk();
  await waitFor(() => expect(screen.getByText(/An active prediction pass is required/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Legacy rules', exact: true }));
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Generate Predictions' }));
  expect(get.mock.calls.filter(([endpoint]) => endpoint === '/fixtures/' || endpoint === '/standings/')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Generate Predictions' })).toBeDisabled();
});

it('does not fetch fixtures while access is still being checked in legacy mode', async () => {
  const implementation = get.getMockImplementation();
  if (!implementation) throw new Error('Missing API fixture mock');
  get.mockImplementation((endpoint, options) => {
    if (endpoint === '/me/') return new Promise(() => { /* Simulate an access request that has not resolved. */ });
    return implementation(endpoint, options);
  });
  render(<MemoryRouter><BetAndFixturesScreen /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Legacy rules', exact: true }));
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  const run = screen.getByRole('button', { name: 'Generate Predictions' });
  expect(run).toBeDisabled();
  fireEvent.click(run);
  expect(get.mock.calls.filter(([endpoint]) => endpoint === '/fixtures/' || endpoint === '/standings/')).toHaveLength(0);
  expect(run).toHaveAccessibleDescription('Checking prediction access…');
});
it('keeps the suggested bet list first for easy discovery, removes model-pick sections, and updates the threshold bet list on model and filter changes', async () => {
  await runInitialBatch();
  const forecasts = screen.getByText(/All forecasts and market details/).closest('details')!;
  expect(screen.queryByText('Model picks, rankings and explanations')).not.toBeInTheDocument();
  expect(screen.queryByText('Model picks and explanations')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Best available options' })).not.toBeInTheDocument();
  expect(forecasts).toHaveAttribute('open');
  const betList = screen.getByRole('region', { name: 'Suggested bet list' });
  expect(betList.compareDocumentPosition(forecasts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(await within(betList).findAllByRole('listitem')).toHaveLength(1);
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
  await waitFor(() => expect(screen.getByText(/All forecasts and market details/).closest('details')!.querySelectorAll('[data-highlight]')).toHaveLength(statisticalBadges));
  // A date range with no assessed fixtures must remove the previous highlights.
  const dates = screen.getAllByRole('textbox').filter(input => (input as HTMLInputElement).value.match(/^\d{2}\/\d{2}\/\d{4}$/));
  expect(dates.length).toBeGreaterThanOrEqual(2);
  const emptyDay = new Date(Date.now() + 3 * 86_400_000);
  const emptyDate = `${String(emptyDay.getMonth() + 1).padStart(2, '0')}/${String(emptyDay.getDate()).padStart(2, '0')}/${emptyDay.getFullYear()}`;
  await act(async () => {
    fireEvent.change(dates[0], { target: { value: emptyDate } });
    fireEvent.blur(dates[0]);
  });
  await waitFor(() => expect(screen.getByText(/All forecasts and market details/).closest('details')!.querySelector('[data-highlight]')).toBeNull());
  await screen.findByRole('button', { name: 'Generate Predictions' });
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
  const { rerender } = render(<EnginePredictionPanel prediction={prediction} highlightsLoading onCaptureOdds={jest.fn()} />);
  expect(screen.getAllByText('Loading probability…')).toHaveLength(25);
  expect(screen.queryByText('Probability unavailable')).not.toBeInTheDocument();
  expect(screen.queryByText('No forecasts meet the configured suggestion thresholds.')).not.toBeInTheDocument();
  rerender(<EnginePredictionPanel prediction={prediction} highlights={{}} onCaptureOdds={jest.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('No forecasts meet the configured suggestion thresholds.');
  expect(screen.getAllByText('Probability unavailable')).toHaveLength(25);
  expect(screen.queryByText(/BTTS No/)).not.toBeInTheDocument();
  const primary = within(screen.getByRole('group', { name: 'Primary model probabilities' }));
  for (const name of ['Both teams to score', 'Over 1.5 goals', 'Home or Draw (1X)', 'Away or Draw (X2)',
    'Home Team Over 1.5 Goals', 'Away Team Over 1.5 Goals', 'Under 3.5 goals']) {
    expect(primary.getByText(name)).toBeInTheDocument();
  }
  expect(screen.getAllByText('Over 1.5 goals')).toHaveLength(1);
  expect(screen.getByText('Base scoreline model')).toBeInTheDocument();
  expect(screen.queryByText('Model picks and explanations')).not.toBeInTheDocument();
});


it('restores statistical forecasts from the backend after remount without regenerating or renewing the browser cache', async () => {
  await runInitialBatch();
  const cacheBefore = await readPredictionsCache();
  const forecastsBefore = screen.getByText(/All forecasts and market details/).closest('details')!.textContent;
  const requestsBefore = get.mock.calls.length;
  expect(cacheBefore.items[0].enginePredictions?.length).toBeGreaterThan(0);
  cleanup();
  await renderPredictionDesk();
  await screen.findAllByText('2–5 total goals');
  await waitFor(() => expect(screen.getByText(/All forecasts and market details/).closest('details')!.textContent).toBe(forecastsBefore));
  const dataRequestsAfter = get.mock.calls.slice(requestsBefore).filter(([endpoint]) =>
    endpoint !== '/me/' && endpoint !== '/predictions/workspace/');
  expect(dataRequestsAfter).toHaveLength(0);
  expect(await readPredictionsCache()).toEqual(cacheBefore);
  expect(screen.queryByText(/BTTS No/)).not.toBeInTheDocument();
});

it('clamps a restored date range to seven days, restores legacy results, and clearing removes both caches', async () => {
  await runInitialBatch();
  const cache = await readPredictionsCache();
  const view = cache.view;
  if (!view) throw new Error('Missing saved prediction view');
  // Save a wider custom range that still includes the assessed fixture.
  view.from = '2020-01-01';
  view.to = '2099-01-01';

  cache.items.forEach((item: { from: string; to: string }) => { item.from = view.from; item.to = view.to; });
  // Seed a known legacy match: the synthetic team's rule-based run can legitimately return none.
  cache.items[0].predicted = [{
    fixtures: [cache.items[0].enginePredictions?.[0].fixture],
    option: { id: 1, name: 'Home Win', shortName: 'Home', level: 3, description: 'Home team wins' },
  }];
  await writePredictionsCache(cache);
  fireEvent.click(screen.getByRole('button', { name: 'Legacy rules', exact: true }));
  cleanup();
  await renderPredictionDesk();
  await waitFor(() => expect(screen.getByText(/Legacy fixture results/).textContent).not.toContain('0 fixtures'));
  expect(screen.getByDisplayValue('01/01/2020')).toBeInTheDocument();
  const lastDay = new Date(Date.now() + 7 * 86_400_000);
  const lastDate = `${String(lastDay.getMonth() + 1).padStart(2, '0')}/${String(lastDay.getDate()).padStart(2, '0')}/${lastDay.getFullYear()}`;
  expect(screen.getByDisplayValue(lastDate)).toBeInTheDocument();
  expect(screen.queryByDisplayValue('01/01/2099')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear predictions' }));
  await waitFor(async () => expect((await readPredictionsCache()).items).toHaveLength(0));
  const clearedCache = await readPredictionsCache();
  expect(clearedCache.items).toHaveLength(0);
  expect(clearedCache.view).toBeUndefined();
  expect(localStorage.getItem('predictionView_v1')).toBeNull();
  cleanup();
  await renderPredictionDesk();
  expect(screen.getByText(/Legacy fixture results/)).toHaveTextContent('0 fixtures');
});

it('locks calendar days beyond a one-day pass expiry', async () => {
  const originalGet = get.getMockImplementation()!;
  const expiry = new Date(Date.now() + 2 * 3_600_000);
  get.mockImplementation((endpoint, options) => endpoint === '/me/'
    ? Promise.resolve({ data: { has_prediction_access: true, is_admin: false,
      prediction_access_starts_at: new Date(expiry.getTime() - 86_400_000).toISOString(),
      prediction_access_ends_at: expiry.toISOString(), prediction_horizon_ends_at: expiry.toISOString() } })
    : originalGet(endpoint, options));
  const { container } = await renderPredictionDesk();
  await screen.findByText(/Eligible kickoffs must be before/);
  const from = screen.getByLabelText('From');
  await waitFor(() => expect(from).toBeEnabled());
  fireEvent.click(from);
  const blockedDay = new Date(expiry);
  blockedDay.setDate(blockedDay.getDate() + 1);
  if (blockedDay.getMonth() !== new Date().getMonth()) {
    expect(container.querySelector('.react-datepicker__navigation--next')).toBeNull();
  } else {
    const day = String(blockedDay.getDate()).padStart(3, '0');
    expect(container.querySelector(`.react-datepicker__day--${day}:not(.react-datepicker__day--outside-month)`))
      .toHaveAttribute('aria-disabled', 'true');
  }
});

it('blocks a new prediction run when the pass expires while the desk stays open', async () => {
  let now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const expiry = now + 2 * 3_600_000;
    const originalGet = get.getMockImplementation()!;
    get.mockImplementation((endpoint, options) => endpoint === '/me/'
      ? Promise.resolve({ data: { has_prediction_access: true, is_admin: false,
        prediction_access_ends_at: new Date(expiry).toISOString(),
        prediction_horizon_ends_at: new Date(expiry).toISOString() } })
      : originalGet(endpoint, options));
    await renderPredictionDesk();
    await screen.findByText(/Eligible kickoffs must be before/);
    fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
    now = expiry;
    await screen.findByText(/An active prediction pass is required/);
    get.mockClear();
    const run = screen.getByRole('button', { name: 'Generate Predictions' });
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(get.mock.calls.filter(([endpoint]) =>
      ['/fixtures/', '/standings/', '/predictions/'].includes(endpoint))).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'View access passes' })).toBeInTheDocument();
  } finally {
    cleanup();
    clock.mockRestore();
  }
});

it('filters cached legacy fixtures whose exact kickoff exceeds the pass, even on the last allowed calendar day', async () => {
  await runInitialBatch();
  const cache = await readPredictionsCache();
  const expiry = Date.now() + 2 * 3_600_000;
  const fixture = cache.items[0].enginePredictions?.[0].fixture;
  if (!fixture) throw new Error('Missing cached fixture');
  fixture.fixture.id = 88888;
  fixture.fixture.timestamp = (expiry + 1) / 1000;
  fixture.fixture.date = new Date(expiry + 1).toISOString();
  cache.items[0].fixtures = [fixture];
  cache.items[0].predicted = [{
    fixtures: [fixture],
    option: { id: 1, name: 'Home Win', shortName: 'Home', level: 3, description: 'Home team wins' },
  }];
  await writePredictionsCache(cache);
  fireEvent.click(screen.getByRole('button', { name: 'Legacy rules', exact: true }));
  cleanup();
  const originalGet = get.getMockImplementation()!;
  get.mockImplementation((endpoint, options) => endpoint === '/me/'
    ? Promise.resolve({ data: { has_prediction_access: true, is_admin: false,
      prediction_access_ends_at: new Date(expiry).toISOString(),
      prediction_horizon_ends_at: new Date(expiry).toISOString() } })
    : originalGet(endpoint, options));
  await renderPredictionDesk();
  await screen.findByText(/Eligible kickoffs must be before/);
  expect(screen.getByText(/Legacy fixture results/)).toHaveTextContent('0 fixtures');
});

it('restores saved completed forecasts, their original probabilities and the last selected league after reload', async () => {
  const pastKickoff = Date.now() - 3 * 86_400_000;
  const fixture = makeApiFixture(123_456, pastKickoff, currentYear, false);
  const output = predictFixture({ fixture, allFixtures: [], leaguesStandings: [] });
  const homeWin = output.markets.find(market => market.marketId === 'home_win');
  if (!homeWin) throw new Error('Missing home win market.');
  homeWin.modelProbability = .73;
  const completed = makeApiFixture(123_456, pastKickoff, currentYear, true);
  const day = businessDate.format(pastKickoff);
  serverPredictions.set(123_456, {
    id: 123_456, engine_version: 'test', config_hash: 'test', generated_at: new Date(pastKickoff - 1).toISOString(),
    as_of: new Date(pastKickoff - 1).toISOString(), valid_until: new Date(pastKickoff).toISOString(),
    is_actionable: false,
    fixture: { fixture: completed.fixture, score: completed.score, goals: completed.goals },
    output,
  });
  serverWorkspaces.set('test-user', {
    from: day, to: day, leagues: [{ leagueId: 39, season: currentYear, predictions: 1 }],
    lastBatch: [{ leagueId: 39, season: currentYear }],
  });
  await renderPredictionDesk();
  const league = await screen.findByRole('button', { name: /Premier League.*Already predicted/ });
  expect(league).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('list', { name: 'Saved leagues' })).toHaveTextContent('Premier League');
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('1 fixture');
  expect(screen.getByText('Saved forecast · for review')).toBeVisible();
  expect(screen.getByText(/Final score/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Expand forecast for/ }));
  expect(screen.getByText('73%')).toBeVisible();
  expect(screen.queryByText('Probability unavailable')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Capture pre-match odds' })).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
  expect(get.mock.calls.filter(([path]) => path === '/predictions/workspace/')).toHaveLength(1);
});

it('restores valid backend forecasts even when the browser snapshot has expired', async () => {
  await runInitialBatch();
  const cache = await readPredictionsCache();
  cache.items.forEach((item: { ts: number }) => { item.ts = Date.now() - 6 * 60 * 60 * 1000; });
  await writePredictionsCache(cache);
  cleanup();
  await renderPredictionDesk();
  await screen.findAllByText('2–5 total goals');
  expect(screen.getByText(/All forecasts and market details/)).not.toHaveTextContent('0 fixtures');
});

test.each(['not-json', '{"items":{}}'])('ignores malformed prediction cache: %s', async raw => {
  localStorage.setItem('leaguePredictions_v3', raw);
  localStorage.setItem('predictionView_v1', raw);
  await renderPredictionDesk();
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('0 fixtures');
});

it('saves forecasts and date range when localStorage is full, without writing the large legacy key', async () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage full', 'QuotaExceededError');
  });
  try {
    await runInitialBatch();
    expect(screen.getAllByText('2–5 total goals').length).toBeGreaterThan(0);
    const saved = await readPredictionsCache();
    expect(saved.items[0].enginePredictions?.length).toBeGreaterThan(0);
    expect(saved.view).toBeDefined();
    expect(screen.queryByText(/could not be saved for page refresh/)).not.toBeInTheDocument();
  } finally { spy.mockRestore(); }
});

it('keeps forecasts usable and reports a genuine IndexedDB write failure', async () => {
  writeBrowserCache.mockRejectedValueOnce(new DOMException('Database full', 'QuotaExceededError'));
  await runInitialBatch();
  expect(screen.getAllByText('2–5 total goals').length).toBeGreaterThan(0);
  expect(screen.getByRole('alert')).toHaveTextContent(/account forecasts are restored from the backend/);
  cleanup();
  await renderPredictionDesk();
  await screen.findAllByText('2–5 total goals');
});

it('expands or collapses individual fixtures and the full forecast list without removing forecasts', async () => {
  await runInitialBatch();
  // Fixture cards start collapsed by default to keep the list compact; only the
  // matchup header, league and kickoff time are visible until expanded.
  const collapsedToggles = screen.getAllByRole('button', { name: /^Expand forecast for/ });
  expect(collapsedToggles.length).toBeGreaterThan(1);
  const contents = collapsedToggles.map(button => document.getElementById(button.getAttribute('aria-controls')!)!);
  contents.forEach(content => expect(content).not.toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'Expand all', exact: true }));
  const toggles = screen.getAllByRole('button', { name: /^Collapse forecast for/ });
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
    if (endpoint === '/predictions/workspace/') return workspaceResponse(options?.params);
    if (endpoint === '/fixtures/' && options.params.season === currentYear) await pending;
    return implementation(endpoint, options);
  });
  await renderPredictionDesk();
  fireEvent.click((await screen.findAllByRole('button', { name: /Premier League/ }))[0]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Predictions' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Generate Predictions' }));
  expect(screen.getByRole('region', { name: 'Prediction loading' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Prediction progress' })).toHaveTextContent('Loading match data and published probabilities');
  expect(screen.getByRole('button', { name: 'Preparing forecasts…' })).toBeDisabled();
  expect(screen.queryByText('Predictions ready.')).not.toBeInTheDocument();
  await act(async () => { release(); });
  await screen.findByRole('button', { name: 'Generate Predictions' });
  expect(screen.queryByRole('region', { name: 'Prediction loading' })).not.toBeInTheDocument();
  expect(screen.getByText('Predictions ready.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add More Leagues' })).toBeEnabled();
  expect((await screen.findAllByText('2–5 total goals')).length).toBeGreaterThan(0);
});

it('reports an empty completed request without treating it as a service failure', async () => {
  const originalGet = get.getMockImplementation();
  if (!originalGet) throw new Error('Missing API fixture mock');
  get.mockImplementation((endpoint, options) => endpoint === '/predictions/'
    ? Promise.resolve({ data: { response: [], errors: [], results: 0 } })
    : originalGet(endpoint, options));
  await renderPredictionDesk();
  fireEvent.click(screen.getByRole('button', { name: /Premier League/ }));
  const run = screen.getByRole('button', { name: 'Generate Predictions' });
  await waitFor(() => expect(run).toBeEnabled());
  fireEvent.click(run);
  expect(await screen.findByText(/This request found no predictions/)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add More Leagues' })).toBeEnabled();
});

it('keeps existing forecasts visible while refreshing and clears the loader after a failed data request', async () => {
  const run = await runInitialBatch();
  failRefresh = true;
  fireEvent.click(run);
  expect(screen.getByRole('region', { name: 'Prediction loading' })).toHaveTextContent('Your previous forecasts remain below');
  expect(screen.getAllByText('2–5 total goals').length).toBeGreaterThan(0);
  await screen.findByRole('button', { name: 'Generate Predictions' });
  expect(screen.queryByRole('region', { name: 'Prediction loading' })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Fixture refresh unavailable');
});

const retryLeagueNames: Record<number, string> = { 39: 'Premier League', 78: 'Bundesliga', 135: 'Serie A', 140: 'La Liga' };
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
    if (endpoint === '/predictions/workspace/') return workspaceResponse(options?.params);
    if (endpoint === '/me/') {
      return { data: { has_prediction_access: true, prediction_access_ends_at: '2099-01-01' } };
    }
    if (endpoint === '/predictions/') {
      const { league, season } = options.params;
      if (season !== currentYear) return { data: { response: [], errors: [], results: 0 } };
      const now = Date.now();
      const base = makeApiFixture(league * 1_000_000 + 99_999, now + 3_600_000, season, false);
      const fixture = {
        ...base,
        league: { ...base.league, id: league, name: retryLeagueNames[league] },
      };
      const output = predictFixture({ fixture, allFixtures: [], leaguesStandings: [] });
      const row = {
        id: league, engine_version: 'test', config_hash: 'test',
        generated_at: new Date(now).toISOString(), as_of: new Date(now).toISOString(),
        valid_until: null, is_actionable: true, output,
      };
      serverPredictions.set(row.id, row);
      return { data: { response: [row], errors: [], results: 1 } };
    }
    const { league, season } = options.params;
    if (endpoint === '/fixtures/') {
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
    if (endpoint === '/standings/' && standingsFailures.has(league)) return { data: { response: [], errors: { access: 'Standings unavailable from provider' } } };
    if (endpoint === '/standings/' || endpoint === '/odds/') return { data: { response: [], errors: [] } };
    throw new Error(`Unexpected test request: ${endpoint}`);
  });
  return { fixtureFailures, standingsFailures, payloadFailures, fallbackSuccesses, blockers };
};
afterEach(() => { mockLeaguesState.leagues.response = mockLeaguesState.leagues.response.slice(0, 1); });
const runRetryBatch = async () => {
  await renderPredictionDesk();
  for (const id of [39, 78, 140]) fireEvent.click((await screen.findAllByRole('button', { name: new RegExp(retryLeagueNames[id]) }))[0]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Predictions' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Generate Predictions' }));
  await screen.findByRole('button', { name: 'Generate Predictions' });
  await awaitHighlightsSettled();
};

it('enforces the four-league request cap and preserves the cooldown for a subsequent request', async () => {
  setupLeagueRetryApi();
  retryLeagueNames[61] = 'Ligue 1';
  const base = mockLeaguesState.leagues.response[0];
  mockLeaguesState.leagues.response.push(...[135, 61].map(id => ({
    ...base, league: { ...base.league, id, name: retryLeagueNames[id] },
    country: { ...base.country, name: id === 135 ? 'Italy' : 'France' },
  })));
  localStorage.setItem('popularLeagueIds_v1', JSON.stringify([39, 78, 135, 140, 61]));
  await renderPredictionDesk();
  for (const id of [39, 78, 135, 140]) fireEvent.click(screen.getByRole('button', { name: new RegExp(retryLeagueNames[id]) }));
  expect(screen.getByText('4 of 4 leagues selected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Ligue 1/ })).toBeDisabled();
  const run = screen.getByRole('button', { name: 'Generate Predictions' });
  await waitFor(() => expect(run).toBeEnabled());
  fireEvent.click(run);
  expect(await screen.findByText('Predictions ready.')).toBeInTheDocument();
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('4 fixtures');
  const request = post.mock.calls.find(([endpoint]) => endpoint === '/predictions/workspace/');
  expect(request?.[1].leagues.map(({ leagueId }: { leagueId: number }) => leagueId)).toEqual([39, 78, 135, 140]);
  fireEvent.click(screen.getByRole('button', { name: 'Add More Leagues' }));
  fireEvent.click(screen.getByRole('button', { name: /Ligue 1/ }));
  expect(screen.getByRole('button', { name: 'Generate Predictions' })).toBeDisabled();
  expect(screen.getByText(/Next request in/)).toBeInTheDocument();
});

it('consolidates separate league batches and restores the complete fixture and bet-list inputs without browser storage', async () => {
  setupLeagueRetryApi();
  const base = mockLeaguesState.leagues.response[0];
  mockLeaguesState.leagues.response.push({
    ...base, league: { ...base.league, id: 135, name: 'Serie A' },
    country: { ...base.country, name: 'Italy' },
  });
  localStorage.setItem('popularLeagueIds_v1', JSON.stringify([39, 78, 135, 140]));
  await renderPredictionDesk();
  const runBatch = async (ids: number[]) => {
    for (const id of ids) fireEvent.click(screen.getAllByRole('button', { name: new RegExp(retryLeagueNames[id]) })[0]);
    const run = screen.getByRole('button', { name: 'Generate Predictions' });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Predictions' })).toBeEnabled());
  };
  await runBatch([39, 78]);
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('2 fixtures');
  expect(screen.getAllByRole('button', { name: /Premier League/ })[0]).toHaveTextContent('Already predicted');
  fireEvent.click(screen.getByRole('button', { name: 'Add More Leagues' }));
  expect(screen.getByText('0 of 4 leagues selected')).toBeInTheDocument();
  expect(screen.getByLabelText('Find a league')).toHaveFocus();
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('2 fixtures');
  await runBatch([135, 140]);
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('4 fixtures');
  const predictionIds = () => {
    const request = post.mock.calls.filter(([path]) => path === '/predictions/bet-list/').pop();
    return request?.[1].predictions.map((prediction: FixturePrediction) => prediction.fixture.fixture.id).sort();
  };
  await waitFor(() => expect(predictionIds()).toHaveLength(4));
  const beforeIds = predictionIds();
  await runBatch([]); // An explicit refresh must update, not duplicate, the selected leagues.
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('4 fixtures');
  cleanup();
  await clearPredictionsCache();
  await renderPredictionDesk();
  await waitFor(() => expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('4 fixtures'));
  await waitFor(() => expect(predictionIds()).toEqual(beforeIds));
  expect(screen.getAllByRole('button', { name: /Premier League/ })[0]).toHaveTextContent('Already predicted');
});

it('keeps single-league results and suggestions during a slow second save, then analyses the consolidated forecasts once', async () => {
  setupLeagueRetryApi();
  const read = get.getMockImplementation();
  if (!read) throw new Error('Missing API fixture mock.');
  get.mockImplementation(async (endpoint, options) => {
    const result = await read(endpoint, options);
    if (endpoint === '/predictions/') {
      result.data.response.forEach(({ output }: { output: FixturePrediction }) => {
        const homeWin = output.markets.find(market => market.marketId === 'home_win');
        if (!homeWin) throw new Error('Missing forecast for the home team.');
        homeWin.modelProbability = .99;
      });
    }
    return result;
  });
  await renderPredictionDesk();
  fireEvent.click(screen.getByRole('button', { name: /Premier League/ }));
  const run = screen.getByRole('button', { name: 'Generate Predictions' });
  await waitFor(() => expect(run).toBeEnabled());
  fireEvent.click(run);
  const shortlist = within(screen.getByRole('region', { name: 'Suggested bet list' }));
  expect(await shortlist.findAllByRole('listitem')).toHaveLength(1);
  const save = post.getMockImplementation();
  if (!save) throw new Error('Missing API fixture mock.');
  let releaseSave!: () => void;
  let releaseSuggestions!: () => void;
  const pendingSave = new Promise<void>(resolve => { releaseSave = resolve; });
  const pendingSuggestions = new Promise<void>(resolve => { releaseSuggestions = resolve; });
  let failHighlights = true;
  post.mockClear();
  post.mockImplementation(async (path, body) => {
    if (path === '/predictions/workspace/') await pendingSave;
    if (path === '/predictions/bet-list/') await pendingSuggestions;
    if (path === '/predictions/highlights/' && failHighlights) throw new Error('Temporary runner error.');
    return save(path, body);
  });

  fireEvent.click(screen.getByRole('button', { name: 'Add More Leagues' }));
  fireEvent.click(screen.getByRole('button', { name: /Bundesliga/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Generate Predictions' }));
  await waitFor(() => expect(post.mock.calls.some(([path]) => path === '/predictions/workspace/')).toBe(true));
  expect(screen.getByRole('region', { name: 'Prediction loading' })).toHaveTextContent('Your previous forecasts remain below');
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('1 fixture');
  expect(shortlist.getAllByRole('listitem')).toHaveLength(1);
  expect(shortlist.getByText(/Updating the suggested list/)).toBeInTheDocument();
  expect(post.mock.calls.filter(([path]) => path.endsWith('/highlights/') || path.endsWith('/bet-list/'))).toHaveLength(0);

  await act(async () => { releaseSave(); });
  expect(await screen.findByText(/Forecast highlights could not be loaded/)).toBeInTheDocument();
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('2 fixtures');
  expect(screen.getAllByText('99%')).toHaveLength(2);
  expect(screen.queryByText('Probability unavailable')).not.toBeInTheDocument();
  expect(shortlist.getAllByRole('listitem')).toHaveLength(1);
  const selectionCalls = post.mock.calls.filter(([path]) => path.endsWith('/bet-list/'));
  expect(selectionCalls).toHaveLength(1);
  const inputs = selectionCalls[0][1].predictions;
  expect(inputs).toHaveLength(2);
  expect(new Set(inputs.map((entry: FixturePrediction) => entry.fixture.fixture.id)).size).toBe(2);
  expect(inputs[0].fixture).not.toHaveProperty('teams');
  expect(inputs[0].probabilities.baseScorelines.length).toBeGreaterThan(0);

  await act(async () => { releaseSuggestions(); });
  await waitFor(() => expect(shortlist.getAllByRole('listitem')).toHaveLength(2));
  failHighlights = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry forecast highlights' }));
  await waitFor(() => expect(screen.queryByText('Checking forecast highlights…')).not.toBeInTheDocument());
  expect(screen.queryByText(/Forecast highlights could not be loaded/)).not.toBeInTheDocument();
  expect(screen.getAllByText('99%')).toHaveLength(2);
});

it('waits for Firebase restoration and loads the saved account without logging out and back in', async () => {
  await runInitialBatch();
  cleanup();
  get.mockClear();
  post.mockClear();
  mockAuth.user = null;
  mockAuth.initialising = true;
  const rendered = render(<MemoryRouter><BetAndFixturesScreen /></MemoryRouter>);
  await act(async () => { await Promise.resolve(); });
  expect(get).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('0 fixtures');
  mockAuth.user = { uid: 'test-user', email: 'test@example.com' };
  mockAuth.initialising = false;
  rendered.rerender(<MemoryRouter><BetAndFixturesScreen /></MemoryRouter>);
  await screen.findAllByText('2–5 total goals');
  expect(get.mock.calls.filter(([path]) => path === '/predictions/')).toHaveLength(0);
  await waitFor(() => expect(post.mock.calls.some(([path]) => path === '/predictions/bet-list/')).toBe(true));
});

it('clears the desk without deleting database forecasts and allows those leagues to be loaded again', async () => {
  const run = await runInitialBatch();
  const storedIds = Array.from(serverPredictions.keys());
  fireEvent.click(screen.getByRole('button', { name: 'Clear predictions' }));
  await waitFor(() => expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('0 fixtures'));
  expect(Array.from(serverPredictions.keys())).toEqual(storedIds);
  expect(serverWorkspaces.has('test-user')).toBe(false);
  fireEvent.click(run);
  await screen.findAllByText('2–5 total goals');
  expect(Array.from(serverPredictions.keys())).toEqual(storedIds);
  expect(screen.getAllByRole('button', { name: /Premier League/ })[0]).toHaveTextContent('Already predicted');
});

it('does not restore another account from the shared browser prediction cache', async () => {
  await runInitialBatch();
  cleanup();
  mockAuth.user = { uid: 'another-user', email: 'another@example.com' };
  await renderPredictionDesk();
  expect(screen.getByText(/All forecasts and market details/)).toHaveTextContent('0 fixtures');
  expect(screen.queryByText('2–5 total goals')).not.toBeInTheDocument();
});

it('retries only a failed league and season, preserves successful forecasts, and clears only recovered failures', async () => {
  const api = setupLeagueRetryApi();
  api.fixtureFailures.add(`78:${currentYear}`);
  api.fixtureFailures.add(`140:${currentYear - 1}`);
  await runRetryBatch();
  expect(screen.getByRole('alert')).toHaveTextContent('Bundesliga');
  expect(screen.getByRole('alert')).toHaveTextContent('La Liga');
  const successfulForecast = document.getElementById('forecast-content-39099999')?.textContent;
  expect(successfulForecast).toBeTruthy();
  const successfulCache = (await readPredictionsCache()).items.find((item: { leagueId: number }) => item.leagueId === 39);
  expect((await readPredictionsCache()).items.some((item: { leagueId: number }) => item.leagueId === 78)).toBe(false);
  api.fixtureFailures.delete(`78:${currentYear}`);
  let before = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry Bundesliga', exact: true }));
  await screen.findByRole('button', { name: 'Generate Predictions' });
  await awaitHighlightsSettled();
  let fixtureRequests = get.mock.calls.slice(before).filter(([endpoint]) => endpoint === '/fixtures/');
  expect(fixtureRequests).toHaveLength(1);
  expect(fixtureRequests[0][1].params).toMatchObject({ league: 78, season: currentYear });
  expect(screen.queryByRole('button', { name: 'Retry Bundesliga', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry La Liga', exact: true })).toBeEnabled();
  expect(document.getElementById('forecast-content-39099999')?.textContent).toBe(successfulForecast);
  expect((await readPredictionsCache()).items.find((item: { leagueId: number }) => item.leagueId === 39)).toEqual(successfulCache);
  api.fixtureFailures.delete(`140:${currentYear - 1}`);
  before = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry La Liga', exact: true }));
  await screen.findByRole('button', { name: 'Generate Predictions' });
  await awaitHighlightsSettled();
  fixtureRequests = get.mock.calls.slice(before).filter(([endpoint]) => endpoint === '/fixtures/');
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
  await screen.findByRole('button', { name: 'Generate Predictions' });
  const fixtureRequests = get.mock.calls.slice(before).filter(([endpoint]) => endpoint === '/fixtures/');
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
  await screen.findByRole('button', { name: 'Generate Predictions' });
  const requests = get.mock.calls.slice(before);
  expect(requests.filter(([endpoint]) => endpoint === '/fixtures/')).toHaveLength(0);
  const standings = requests.filter(([endpoint]) => endpoint === '/standings/');
  expect(standings).toHaveLength(1);
  expect(standings[0][1].params.league).toBe(78);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('does not report a league failure when the automatic ranged fallback succeeds', async () => {
  const api = setupLeagueRetryApi();
  api.fallbackSuccesses.add(`78:${currentYear}`);
  await runRetryBatch();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(get.mock.calls.filter(([endpoint, options]) => endpoint === '/fixtures/' && options.params.league === 78 && options.params.season === currentYear)).toHaveLength(2);
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
  await screen.findByRole('button', { name: 'Generate Predictions' });
  expect(document.getElementById('forecast-content-78099999')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry Bundesliga', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry Premier League', exact: true })).toBeEnabled();
});
