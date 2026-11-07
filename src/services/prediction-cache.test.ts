import { clearPredictionsCache, PREDICTION_CACHE_RECORD, PREDICTION_CACHE_TTL, PredictionsCacheItem, readPredictionsCache, writePredictionsCache } from './prediction-cache';
import { readBrowserCache, resetMemoryBrowserCache, writeBrowserCache } from './test-support/memory-browser-cache';
import { makeForecastBetPrediction } from '../prediction-engine/test-support/forecast-bet-builders';
jest.mock('./browser-cache', () => require('./test-support/memory-browser-cache'));

const makeItem = (leagueId = 1, ts = Date.now()): PredictionsCacheItem => {
  const prediction = makeForecastBetPrediction({ now: Date.now(), id: leagueId });
  return {
    leagueId, season: 2026, from: '2026-11-07', to: '2026-11-08', ts, optionIds: [1],
    fixtures: [prediction.fixture], enginePredictions: [prediction], predicted: [],
  };
};
beforeEach(async () => { await clearPredictionsCache(); resetMemoryBrowserCache(); localStorage.clear(); });

test('migrates forecasts and view together before freeing only the old prediction keys', async () => {
  const item = makeItem();
  const view = { ts: item.ts, from: item.from, to: item.to, optionIds: [1] };
  localStorage.setItem('leaguePredictions_v3', JSON.stringify({ items: [item] }));
  localStorage.setItem('predictionView_v1', JSON.stringify(view));
  localStorage.setItem('favoritePredictions_v1', '["my favourite"]');
  localStorage.setItem('statisticalPicks_v1', '["1:home_win"]');
  localStorage.setItem('paperTracking_v1', '{"selections":["saved history"]}');
  const restored = await readPredictionsCache();
  expect(restored).toEqual({ items: [item], view });
  expect(localStorage.getItem('leaguePredictions_v3')).toBeNull();
  expect(localStorage.getItem('predictionView_v1')).toBeNull();
  expect(localStorage.getItem('favoritePredictions_v1')).toBe('["my favourite"]');
  expect(localStorage.getItem('statisticalPicks_v1')).toBe('["1:home_win"]');
  expect(localStorage.getItem('paperTracking_v1')).toContain('saved history');
  expect(await readPredictionsCache()).toEqual(restored);
});

test('keeps readable old and new snapshots if migration cannot commit', async () => {
  const stored = makeItem(1);
  await writePredictionsCache({ items: [stored] });
  const old = makeItem(2);
  localStorage.setItem('leaguePredictions_v3', JSON.stringify({ items: [old] }));
  writeBrowserCache.mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
  expect((await readPredictionsCache()).items).toEqual([old, stored]);
  expect(localStorage.getItem('leaguePredictions_v3')).not.toBeNull();
  expect((await readBrowserCache(PREDICTION_CACHE_RECORD) as { items: PredictionsCacheItem[] }).items).toEqual([stored]);
});

test('removes expired and future snapshots, collapses repeated keys and never renews expiry on read', async () => {
  const now = Date.now();
  const recent = makeItem(1, now - 1000);
  const olderDuplicate = { ...recent, ts: now - 2000 };
  const expired = makeItem(2, now - PREDICTION_CACHE_TTL);
  const future = makeItem(3, now + 1_000_000);
  await writeBrowserCache(PREDICTION_CACHE_RECORD, { items: [olderDuplicate, expired, recent, future] });
  expect((await readPredictionsCache()).items).toEqual([recent]);
  expect((await readBrowserCache(PREDICTION_CACHE_RECORD) as { items: PredictionsCacheItem[] }).items).toEqual([recent]);
  expect((await readPredictionsCache()).items[0].ts).toBe(now - 1000);
});

test('deduplicates exact fixture copies in the structured-clone payload without merging different snapshots', async () => {
  const item = makeItem();
  const prediction = item.enginePredictions?.[0];
  if (!prediction) throw new Error('Missing test prediction');
  prediction.fixture = JSON.parse(JSON.stringify(item.fixtures[0]));
  const differentFixture = JSON.parse(JSON.stringify(item.fixtures[0]));
  differentFixture.fixture.status.short = 'FT';
  item.predicted = [{ fixtures: [differentFixture], option: { id: 1, name: 'Home', shortName: 'Home', description: '', level: 1 } }];
  await writePredictionsCache({ items: [item] });
  const payload = writeBrowserCache.mock.calls[0][1] as { items: PredictionsCacheItem[] };
  expect(payload.items[0].enginePredictions?.[0].fixture).toBe(payload.items[0].fixtures[0]);
  expect(payload.items[0].predicted[0].fixtures[0]).not.toBe(payload.items[0].fixtures[0]);
  expect(payload.items[0].predicted[0].fixtures[0].fixture.status.short).toBe('FT');
  expect(await readPredictionsCache()).toEqual({ items: [item] });
});

test('saves to IndexedDB when every localStorage write fails', async () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  try {
    const item = makeItem();
    expect(await writePredictionsCache({ items: [item], view: { ts: item.ts, from: item.from, to: item.to, optionIds: [1] } })).toBe(true);
    expect((await readPredictionsCache()).items).toEqual([item]);
    expect((await readPredictionsCache()).view).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});

test('a rejected write retains the previous committed snapshot and reports failure', async () => {
  const previous = makeItem(1);
  await writePredictionsCache({ items: [previous] });
  writeBrowserCache.mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
  expect(await writePredictionsCache({ items: [makeItem(2)] })).toBe(false);
  expect((await readPredictionsCache()).items).toEqual([previous]);
});

test('a clear queued behind a pending write wins and also removes the saved view', async () => {
  let release: () => void = () => undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const implementation = writeBrowserCache.getMockImplementation();
  if (!implementation) throw new Error('Missing cache backend');
  writeBrowserCache.mockImplementationOnce(async (key, value) => { await pending; await implementation(key, value); });
  const item = makeItem();
  const write = writePredictionsCache({ items: [item], view: { ts: item.ts, from: item.from, to: item.to, optionIds: [1] } });
  const clear = clearPredictionsCache();
  release();
  expect(await write).toBe(true);
  expect(await clear).toBe(true);
  expect(await readPredictionsCache()).toEqual({ items: [] });
});

test.each(['not-json', '{"items":{}}'])('ignores malformed legacy cache %s', async raw => {
  localStorage.setItem('leaguePredictions_v3', raw);
  expect(await readPredictionsCache()).toEqual({ items: [] });
});


test('cleans only expired auxiliary caches and preserves current cache data and personal records', async () => {
  const now = Date.now();
  localStorage.setItem('leaguesCache_v1', JSON.stringify({ ts: now - 8 * 24 * 3_600_000, data: [] }));
  const currentStandings = { leagueId: 2, season: 2026, ts: now, data: { response: [], errors: [] } };
  localStorage.setItem('standingsCache_v2', JSON.stringify({ items: [
    { leagueId: 1, ts: now - PREDICTION_CACHE_TTL, data: {} }, currentStandings,
  ] }));
  localStorage.setItem('favoritePredictions_v1', '[1]');
  localStorage.setItem('paperTracking_v1', '{"selections":[]}');
  localStorage.setItem('user-session', 'keep');
  await writePredictionsCache({ items: [makeItem()] });
  expect(localStorage.getItem('leaguesCache_v1')).toBeNull();
  expect(JSON.parse(localStorage.getItem('standingsCache_v2')!).items).toEqual([currentStandings]);
  expect(localStorage.getItem('favoritePredictions_v1')).toBe('[1]');
  expect(localStorage.getItem('paperTracking_v1')).toBe('{"selections":[]}');
  expect(localStorage.getItem('user-session')).toBe('keep');
});
