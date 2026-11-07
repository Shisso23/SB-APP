/** Large, disposable caches belong in IndexedDB, separately from localStorage preferences. */
const DATABASE = 'betsmart-cache';
const STORE = 'snapshots';

const openCache = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is unavailable')); return; }
  let abandoned = false;
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
  };
  request.onerror = () => reject(request.error ?? new Error('Could not open prediction storage'));
  request.onblocked = () => { abandoned = true; reject(new Error('Prediction storage is blocked by another tab')); };
  request.onsuccess = () => {
    if (abandoned) request.result.close();
    else resolve(request.result);
  };
});

const transact = async (key: string, operation: 'get' | 'put' | 'delete', value?: unknown): Promise<unknown> => {
  const database = await openCache();
  return new Promise((resolve, reject) => {
    let result: unknown;
    try {
      const transaction = database.transaction(STORE, operation === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore(STORE);
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = transaction.onerror = () => {
        database.close(); reject(transaction.error ?? new Error('Prediction storage transaction failed'));
      };
      const request = operation === 'get' ? store.get(key) : operation === 'put' ? store.put(value, key) : store.delete(key);
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => { database.close(); reject(request.error ?? new Error('Prediction storage request failed')); };
    } catch (error) { database.close(); reject(error); }
  });
};

export const readBrowserCache = (key: string): Promise<unknown> => transact(key, 'get');
export const writeBrowserCache = async (key: string, value: unknown): Promise<void> => { await transact(key, 'put', value); };
export const deleteBrowserCache = async (key: string): Promise<void> => { await transact(key, 'delete'); };
