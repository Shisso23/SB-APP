import { deleteBrowserCache, readBrowserCache, writeBrowserCache } from './browser-cache';

const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'indexedDB', original);
  else Reflect.deleteProperty(globalThis, 'indexedDB');
});
const setup = () => {
  const request = { result: undefined as unknown, error: null as Error | null, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
  const store = { get: jest.fn(() => request), put: jest.fn(() => request), delete: jest.fn(() => request) };
  const transaction = { objectStore: jest.fn(() => store), error: null as Error | null, oncomplete: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, onabort: undefined as (() => void) | undefined };
  const database = { transaction: jest.fn(() => transaction), close: jest.fn(), objectStoreNames: { contains: () => false }, createObjectStore: jest.fn() };
  const opening = { result: database, error: null as Error | null, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, onblocked: undefined as (() => void) | undefined, onupgradeneeded: undefined as (() => void) | undefined };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: jest.fn(() => opening) } });
  return { request, store, transaction, database, opening };
};

test('creates its store and reports a write successful only after the transaction commits', async () => {
  const backend = setup();
  let settled = false;
  const operation = writeBrowserCache('predictions', { items: [] }).then(() => { settled = true; });
  backend.opening.onupgradeneeded?.();
  expect(backend.database.createObjectStore).toHaveBeenCalledWith('snapshots');
  backend.opening.onsuccess?.();
  await Promise.resolve();
  expect(backend.store.put).toHaveBeenCalledWith({ items: [] }, 'predictions');
  backend.request.onsuccess?.();
  await Promise.resolve();
  expect(settled).toBe(false);
  backend.transaction.oncomplete?.();
  await operation;
  expect(settled).toBe(true);
  expect(backend.database.close).toHaveBeenCalled();
});

test('returns stored values and deletes only the requested cache record', async () => {
  const backend = setup();
  const read = readBrowserCache('predictions');
  backend.opening.onsuccess?.(); await Promise.resolve();
  backend.request.result = { items: [1] };
  backend.request.onsuccess?.(); backend.transaction.oncomplete?.();
  expect(await read).toEqual({ items: [1] });
  const clear = deleteBrowserCache('predictions');
  backend.opening.onsuccess?.(); await Promise.resolve();
  expect(backend.store.delete).toHaveBeenCalledWith('predictions');
  backend.transaction.oncomplete?.(); await clear;
});

test('rejects an aborted write even when its request previously succeeded', async () => {
  const backend = setup();
  const write = writeBrowserCache('predictions', {});
  backend.opening.onsuccess?.(); await Promise.resolve();
  backend.request.onsuccess?.();
  backend.transaction.error = new DOMException('Full', 'QuotaExceededError');
  backend.transaction.onabort?.();
  await expect(write).rejects.toThrow('Full');
  expect(backend.database.close).toHaveBeenCalled();
});

test('handles blocked or unavailable IndexedDB without keeping an abandoned connection open', async () => {
  const backend = setup();
  const read = readBrowserCache('predictions');
  backend.opening.onblocked?.();
  await expect(read).rejects.toThrow('blocked');
  backend.opening.onsuccess?.();
  expect(backend.database.close).toHaveBeenCalled();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  await expect(readBrowserCache('predictions')).rejects.toThrow('unavailable');
});
