import { publicClient } from '../api/client';
import { recordVisitorPageView } from './index';

jest.mock('../api/client', () => ({ publicClient: { post: jest.fn() } }));
const post = publicClient.post as jest.Mock;

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({});
});

test.each(['/admin', '/admin/?view=traffic', '/AdMiN/operations', '/admin#account'])(
  'skips admin workspace traffic before looking up a token for %s',
  async path => {
    const user = { getIdToken: jest.fn().mockResolvedValue('test-token') };
    await recordVisitorPageView(path, user);
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  },
);

test('retains anonymous public visits and sends signed-in visits for the server role check', async () => {
  await recordVisitorPageView('/administrator');
  expect(post).toHaveBeenLastCalledWith('/analytics/visitor/', expect.objectContaining({ pagePath: '/administrator' }), undefined);
  await recordVisitorPageView('/history', { getIdToken: jest.fn().mockResolvedValue('test-token') });
  expect(post).toHaveBeenLastCalledWith('/analytics/visitor/', expect.objectContaining({ pagePath: '/history' }), {
    headers: { Authorization: 'Bearer test-token' },
  });
});

test('does not count a signed-in visit as anonymous when its token is unavailable', async () => {
  await recordVisitorPageView('/history', { getIdToken: jest.fn().mockRejectedValue(new Error('Token unavailable')) });
  expect(post).not.toHaveBeenCalled();
});
