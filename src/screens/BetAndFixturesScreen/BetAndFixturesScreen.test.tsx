import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
it('keeps all forecasts first and open, retains collapsible picks, and updates on model and filter changes', async () => {
  await runInitialBatch();
  const forecasts = screen.getByText(/All forecasts and market details/).closest('details')!;
  const picks = screen.getByText('Model picks, rankings and explanations').closest('details')!;
  expect(forecasts).toHaveAttribute('open');
  expect(picks).not.toHaveAttribute('open');
  expect(forecasts.compareDocumentPosition(picks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(forecasts.querySelector('[data-highlight]')).toBeTruthy();
  expect(forecasts).toHaveTextContent('2–5 total goals');
  expect(forecasts).toHaveTextContent('3–6 total goals');
  const statisticalBadges = forecasts.querySelectorAll('[data-highlight]').length;
  fireEvent.click(screen.getByRole('button', { name: 'Legacy rules', exact: true }));
  expect(screen.queryByText(/All forecasts and market details/)).not.toBeInTheDocument();
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
  render(<EnginePredictionPanel prediction={prediction} selectedPickKeys={[]} onTogglePick={jest.fn()} onCaptureOdds={jest.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('No forecasts meet the configured suggestion thresholds.');
  expect(screen.getAllByText('Probability unavailable')).toHaveLength(25);
  expect(screen.queryByText(/BTTS No/)).not.toBeInTheDocument();
  expect(screen.getByText('Both teams to score')).toBeInTheDocument();
  expect(screen.getByText('Model picks and explanations').closest('details')).not.toHaveAttribute('open');
});
