import { apiGet } from '../api/client';
import { getOddsByDate, getOddsByFixture, getOddsByLeagueSeason, getBookmakers, getLiveOdds } from './index';

jest.mock('../api/client', () => ({
  __esModule: true,
  apiGet: jest.fn(),
  PremiumRequiredError: class PremiumRequiredError extends Error {},
  SessionExpiredError: class SessionExpiredError extends Error {},
  SignInRequiredError: class SignInRequiredError extends Error {},
}));

const get = apiGet as jest.Mock;

beforeEach(() => get.mockReset());

it('requests odds for a fixture from the Django endpoint', async () => {
  get.mockResolvedValue({ data: { errors: [], results: 1, paging: { current: 1, total: 1 }, response: [{ market_id: 'home_win' }] } });
  const result = await getOddsByFixture(10);
  expect(get).toHaveBeenCalledWith('/odds', { params: { fixture: 10 } });
  expect(result.data.response).toHaveLength(1);
});

it('requests odds by date through Django', async () => {
  get.mockResolvedValue({ data: { errors: [], results: 0, paging: { current: 1, total: 1 }, response: [] } });
  await getOddsByDate('2026-10-18');
  expect(get).toHaveBeenCalledWith('/odds', { params: { date: '2026-10-18' } });
});

it('requests odds by league and season through Django', async () => {
  get.mockResolvedValue({ data: { errors: [], results: 0, paging: { current: 1, total: 1 }, response: [] } });
  await getOddsByLeagueSeason({ leagueId: 39, season: 2026 });
  expect(get).toHaveBeenCalledWith('/odds', { params: { league: 39, season: 2026 } });
});

it('requests bookmaker and live odds helpers through Django', async () => {
  get.mockResolvedValue({ data: { errors: [], results: 0, paging: { current: 1, total: 1 }, response: [] } });
  await getBookmakers();
  await getLiveOdds();
  expect(get).toHaveBeenNthCalledWith(1, '/odds/bookmakers');
  expect(get).toHaveBeenNthCalledWith(2, '/odds/live');
});

it('never falls back to an unauthenticated call when premium access is denied', async () => {
  const { PremiumRequiredError } = jest.requireMock('../api/client');
  get.mockRejectedValue(new PremiumRequiredError());
  await expect(getOddsByFixture(10)).rejects.toBeInstanceOf(PremiumRequiredError);
  expect(get).toHaveBeenCalledTimes(1);
});