import { apiClient, apiGet } from '../api/client';
import { getPredictionsByLeagueSeason, getPredictionWorkspace, savePredictionWorkspace } from './index';

jest.mock('../api/client', () => ({
  apiGet: jest.fn(),
  apiClient: { post: jest.fn(), delete: jest.fn() },
  ApiRequestError: class ApiRequestError extends Error {},
}));

const get = apiGet as jest.Mock;
const post = apiClient.post as jest.Mock;
const row = (id: number) => ({ id, output: { fixture: { fixture: { id } } } });
beforeEach(() => { get.mockReset(); post.mockReset(); });

test('reads every league prediction page rather than dropping fixtures after the first fifty', async () => {
  get.mockResolvedValueOnce({ data: { response: [row(1)], paging: { current: 1, total: 2 } } })
    .mockResolvedValueOnce({ data: { response: [row(2)], paging: { current: 2, total: 2 } } });
  const response = await getPredictionsByLeagueSeason({ leagueId: 39, season: 2026 });
  expect(response.data.response.map(prediction => prediction.id)).toEqual([1, 2]);
  expect(get).toHaveBeenLastCalledWith('/predictions/', {
    params: { league: 39, season: 2026, page_size: 200, page: 2 },
  });
});

test('restores all workspace pages with the saved range and league metadata', async () => {
  const leagues = [{ leagueId: 39, season: 2026, predictions: 2 }];
  get.mockResolvedValueOnce({ data: {
    response: [row(1)], leagues, from: '2026-11-22', to: '2026-11-23',
    paging: { current: 1, total: 2 },
  } }).mockResolvedValueOnce({ data: { response: [row(2)], paging: { current: 2, total: 2 } } });
  const response = await getPredictionWorkspace();
  expect(response.data.response.map(prediction => prediction.id)).toEqual([1, 2]);
  expect(response.data.leagues).toEqual(leagues);
  expect(response.data.from).toBe('2026-11-22');
});

test('an additive save returns every consolidated page, not just the newly selected league', async () => {
  const workspace = { leagues: [{ leagueId: 140, season: 2026 }], from: '2026-11-22', to: '2026-11-23' };
  post.mockResolvedValue({ data: { response: [row(39)], leagues: workspace.leagues, paging: { current: 1, total: 2 } } });
  get.mockResolvedValue({ data: { response: [row(140)], paging: { current: 2, total: 2 } } });
  const response = await savePredictionWorkspace(workspace);
  expect(response.data.response.map(prediction => prediction.id)).toEqual([39, 140]);
  expect(post).toHaveBeenCalledWith('/predictions/workspace/', workspace, { params: { page_size: 200, include_saved: 'true' } });
  expect(get).toHaveBeenCalledWith('/predictions/workspace/', {
    params: { from: workspace.from, to: workspace.to, include_saved: 'true', page_size: 200, page: 2 },
  });
});
