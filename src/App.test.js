import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import store from './redux/store';
import { registerWithEmail, signInWithEmail, signOut } from './services/auth/firebase';

let mockUser = null;
const mockAuthListeners = new Set();
jest.mock('./services/auth/firebase', () => ({
  subscribeToAuthChanges: (listener) => {
    mockAuthListeners.add(listener);
    listener(mockUser);
    return () => mockAuthListeners.delete(listener);
  },
  signInWithEmail: jest.fn(),
  registerWithEmail: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('./services/admin', () => ({ getAdminStatus: async () => ({ data: { isAdmin: false } }) }));

// The frontend now talks to the PredictXI Django API only. Mock the service layer so
// the app shell renders without any network request, provider access or ID token.
jest.mock('./services/analytics', () => ({ recordVisitorPageView: jest.fn() }));
jest.mock('./services/official', () => ({
  getOfficialToday: async () => ({ data: { businessDate: '2026-11-28', published: false } }),
  getOfficialPreview: async () => ({
    data: {
      businessDate: '2026-11-28',
      available: true,
      featured: {
        homeTeam: 'Home FC', awayTeam: 'Away FC', leagueName: 'Test League',
        marketLabel: 'Over 2.5 goals', probability: '0.62', markets: [],
      },
      explainer: { summary: '', how_the_list_is_made: '', limitations: [] },
    },
  }),
}));
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

const renderApp = async (path = '/') => {
  localStorage.clear();
  window.history.replaceState({}, '', path);
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  const { default: App } = await import('./App');

  await act(async () => {
    render(<Provider store={store}><App /></Provider>, { container: root });
  });
};

test('opens free daily picks and the existing prediction desk without signing in', async () => {
  await renderApp();
  expect(screen.getByRole('link', { name: 'PredictXI home' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'PredictXI home' })).toHaveTextContent('PredictXI');
  expect(await screen.findByText('62.0%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Explore Today’s Picks' }));
  expect(await screen.findByText('No official daily list was published for this date.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Generate Predictions' }));
  expect(await screen.findByRole('heading', { name: 'PredictXI Prediction Desk' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
});

test('uses the existing Firebase sign-in, registration and sign-out from the account menu', async () => {
  await renderApp();
  await screen.findByText('62.0%');
  fireEvent.click(screen.getByText('Sign in', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fan@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('fan@example.com', 'password123'));

  fireEvent.click(screen.getByRole('button', { name: 'Need an account?' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(registerWithEmail).toHaveBeenCalledWith('fan@example.com', 'password123'));

  act(() => {
    mockUser = { uid: 'fan', email: 'fan@example.com' };
    mockAuthListeners.forEach((listener) => listener(mockUser));
  });
  expect(screen.getByText('My Account', { selector: 'summary' })).toBeInTheDocument();
  expect(screen.getByText('fan@example.com')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByText('Sign in', { selector: 'summary' })).toBeInTheDocument();
  expect(signOut).toHaveBeenCalled();
  mockUser = null;
});
