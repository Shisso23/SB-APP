import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import store from './redux/store';
import { registerWithEmail, signInWithEmail, signOut } from './services/auth/firebase';
import { getAccountProfile, updateAccountPhone } from './services/auth/profile';
import { captureReferral, getMyReferrals } from './services/referrals';
import { getReferralTicket } from './services/referrals/attribution';

jest.mock('./services/auth/profile', () => ({
  ...jest.requireActual('./services/auth/profile'),
  getAccountProfile: jest.fn(),
  updateAccountPhone: jest.fn(),
}));

jest.mock('./services/referrals', () => ({
  ...jest.requireActual('./services/referrals'),
  captureReferral: jest.fn(),
  getMyReferrals: jest.fn(),
}));

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
beforeEach(() => {
  mockUser = null;
  getMyReferrals.mockResolvedValue({ data: {
    link: 'https://predictxi.co.za/ref/test', summary: { daysEarned: 0 },
  } });
  getAccountProfile.mockResolvedValue({ data: { email: 'fan@example.com', phone_number: null } });
});

const publishSession = (user) => {
  mockUser = user;
  mockAuthListeners.forEach(listener => listener(user));
};

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
jest.mock('./services/leagues', () => ({
  getFilteredLeagues: async () => ({
    data: { ...envelope.data, results: 1, response: [{
      league: { id: 39, name: 'Premier League', type: 'League' },
      country: { name: 'England', code: 'GB' },
      seasons: [{ year: 2026, current: true }],
    }] },
  }),
}));
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
  const league = await screen.findByRole('button', { name: /Premier League/ });
  fireEvent.click(league);
  expect(league).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1 of 4 leagues selected')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Generate Predictions' })).toBeDisabled();
});

test('uses the existing Firebase sign-in, registration and sign-out from the account menu', async () => {
  await renderApp();
  await screen.findByText('62.0%');
  fireEvent.click(screen.getByText('Sign in', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'fan@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('fan@example.com', 'password123'));

  const registerMode = screen.getByRole('button', { name: 'Need an account?' });
  await waitFor(() => expect(registerMode).toBeEnabled());
  fireEvent.click(registerMode);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(registerWithEmail).toHaveBeenCalledWith('fan@example.com', 'password123'));

  act(() => {
    mockUser = { uid: 'fan', email: 'fan@example.com' };
    mockAuthListeners.forEach((listener) => listener(mockUser));
  });
  expect(screen.getByText('My Account', { selector: 'summary' })).toBeInTheDocument();
  expect(screen.getByText('fan@example.com')).toBeVisible();
  expect(await screen.findByRole('button', { name: 'Save phone number' })).toBeEnabled();
  expect(getAccountProfile).toHaveBeenCalled();
  expect(updateAccountPhone).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByText('Sign in', { selector: 'summary' })).toBeInTheDocument();
  expect(signOut).toHaveBeenCalled();
  mockUser = null;
});

test('validates optional registration phone and retries a failed save for the registered UID', async () => {
  const newUser = { uid: 'new-fan', email: 'fan@example.com' };
  registerWithEmail.mockImplementation(async () => {
    publishSession(newUser);
    return newUser;
  });
  updateAccountPhone.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
    data: { email: newUser.email, phone_number: '+27821234567' },
  });
  await renderApp();
  fireEvent.click(screen.getByText('Sign in', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Need an account?' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: newUser.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByRole('alert')).toHaveTextContent('country calling code');
  expect(registerWithEmail).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: '82 123 4567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your account is ready');
  expect(screen.getByLabelText(/Phone number/)).toHaveValue('+27821234567');
  expect(updateAccountPhone).toHaveBeenNthCalledWith(1, newUser.uid, '+27821234567');
  fireEvent.click(screen.getByRole('button', { name: 'Save phone number' }));
  expect(await screen.findByText('Phone number saved.')).toBeInTheDocument();
  expect(updateAccountPhone).toHaveBeenNthCalledWith(2, newUser.uid, '+27821234567');
  expect(registerWithEmail).toHaveBeenCalledTimes(1);
});

test('loads an existing customer phone and lets them update or remove it', async () => {
  mockUser = { uid: 'existing', email: 'fan@example.com' };
  getAccountProfile.mockResolvedValue({ data: { email: mockUser.email, phone_number: '+27821234567' } });
  updateAccountPhone
    .mockResolvedValueOnce({ data: { email: mockUser.email, phone_number: '+447911123456' } })
    .mockResolvedValueOnce({ data: { email: mockUser.email, phone_number: null } });
  await renderApp();
  fireEvent.click(screen.getByText('My Account', { selector: 'summary' }));
  const phone = await screen.findByLabelText(/Phone number/);
  expect(phone).toHaveValue('+27821234567');
  fireEvent.change(phone, { target: { value: '0044 7911 123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save phone number' }));
  expect(await screen.findByText('Phone number saved.')).toBeInTheDocument();
  expect(updateAccountPhone).toHaveBeenNthCalledWith(1, 'existing', '+447911123456');
  fireEvent.change(phone, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save phone number' }));
  expect(await screen.findByText('Phone number removed.')).toBeInTheDocument();
  expect(updateAccountPhone).toHaveBeenNthCalledWith(2, 'existing', null);
});


test('a referral deep link opens existing registration with server-validated attribution saved', async () => {
  captureReferral.mockResolvedValueOnce({ data: { valid: true, ticket: 'backend-signed-referral-ticket', expiresIn: 86_400 } });
  await renderApp('/ref/PXI0123456789ABCDEFFEDCBA9876543210');
  expect(await screen.findByText(/Invitation saved/)).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Create an account' }));
  expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeVisible();
  expect(getReferralTicket()).toBe('backend-signed-referral-ticket');
  expect(window.location.hash).toBe('#account');
});
