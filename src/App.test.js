import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import store from './redux/store';

// The frontend now talks to the PredictXI Django API only. Mock the service layer so
// the app shell renders without any network request, provider access or ID token.
const envelope = { data: { errors: [], results: 0, paging: { current: 1, total: 1 }, response: [] } };
jest.mock('./services/leagues', () => ({ __esModule: true, getFilteredLeagues: jest.fn().mockResolvedValue(envelope) }));
jest.mock('./services/fixtures', () => ({
  __esModule: true,
  getFilteredFixtures: jest.fn().mockResolvedValue(envelope),
  getFixturesByDate: jest.fn().mockResolvedValue(envelope),
  getFixturesBetweenTwoDates: jest.fn().mockResolvedValue(envelope),
  getH2hFixtures: jest.fn().mockResolvedValue(envelope),
}));
jest.mock('./services/standings', () => ({
  __esModule: true,
  getStandingsByLeagueId: jest.fn().mockResolvedValue({ errors: [], results: 0, response: [] }),
  getStandingsByTeamId: jest.fn().mockResolvedValue({ errors: [], results: 0, response: [] }),
}));
jest.mock('./services/odds', () => ({
  __esModule: true,
  getOddsByDate: jest.fn().mockResolvedValue(envelope),
  getOddsByFixture: jest.fn().mockResolvedValue(envelope),
  getOddsByLeagueSeason: jest.fn().mockResolvedValue(envelope),
  getBookmakers: jest.fn().mockResolvedValue(envelope),
  getLiveOdds: jest.fn().mockResolvedValue(envelope),
}));

test('renders the app shell and opens the prediction desk without real network requests', async () => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  const App = require('./App').default;

  render(<Provider store={store}><App /></Provider>, { container: root });
  expect(screen.getByRole('link', { name: 'PREDICTZ' })).toHaveAttribute('href', '/');
  fireEvent.click(screen.getByRole('button', { name: 'Go to Bets' }));
  expect(await screen.findByRole('heading', { name: 'BetSmart Prediction Desk' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
});
