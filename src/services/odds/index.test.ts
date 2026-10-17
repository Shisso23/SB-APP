import authNetworkService from '../auth-network-service/auth-network.service';
import { getOddsByDate, getOddsByFixture } from './index';

jest.mock('../auth-network-service/auth-network.service', () => ({
  __esModule: true, default: { get: jest.fn() },
}));

const get = authNetworkService.get as jest.Mock;

beforeEach(() => get.mockReset());

it('collects fixtures from all date pages', async () => {
  get.mockResolvedValueOnce({ data: { paging: { total: 2 }, response: [{ fixture: { id: 1 } }] } });
  get.mockResolvedValueOnce({ data: { response: [{ fixture: { id: 2 } }] } });
  const result = await getOddsByDate('2026-10-17');
  expect(result.data.response.map((entry) => entry.fixture?.id)).toEqual([1, 2]);
  expect(get).toHaveBeenLastCalledWith('odds', { params: { date: '2026-10-17', page: 2 } });
});

it('surfaces provider errors instead of returning an empty odds list', async () => {
  get.mockResolvedValue({ data: { errors: { requests: 'Request limit reached' }, response: [] } });
  await expect(getOddsByFixture(1)).rejects.toThrow('Request limit reached');
});

it('does not present an incomplete page set as successful', async () => {
  get.mockResolvedValueOnce({ data: { paging: { total: 2 }, response: [{ fixture: { id: 1 } }] } });
  get.mockRejectedValueOnce(new Error('Network unavailable'));
  await expect(getOddsByDate('2026-10-17')).rejects.toThrow('Network unavailable');
});

it('returns an empty list when the provider has no fixture coverage', async () => {
  get.mockResolvedValue({ data: { errors: [], response: [] } });
  expect((await getOddsByFixture(1)).data.response).toEqual([]);
  expect(get).toHaveBeenCalledTimes(1);
});