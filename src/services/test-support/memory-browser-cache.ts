/** Test backend at the IndexedDB boundary; failures can be injected without changing UI logic. */
const snapshots = new Map<string, unknown>();
const clone = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const readBrowserCache = jest.fn(async (key: string): Promise<unknown> => clone(snapshots.get(key)));
export const writeBrowserCache = jest.fn(async (key: string, value: unknown): Promise<void> => { snapshots.set(key, clone(value)); });
export const deleteBrowserCache = jest.fn(async (key: string): Promise<void> => { snapshots.delete(key); });
export const resetMemoryBrowserCache = () => {
  snapshots.clear();
  readBrowserCache.mockReset().mockImplementation(async key => clone(snapshots.get(key)));
  writeBrowserCache.mockReset().mockImplementation(async (key, value) => { snapshots.set(key, clone(value)); });
  deleteBrowserCache.mockReset().mockImplementation(async key => { snapshots.delete(key); });
};
