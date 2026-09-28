// Minimalny magazyn IndexedDB: oryginały plików (blob) + rekordy z warstwą tekstową.

const DB_NAME = 'wesa-alaw';
const STORES = ['blobs', 'files'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idb = {
  put: (store: StoreName, key: string, value: unknown) => tx(store, 'readwrite', (s) => s.put(value, key)).catch(() => undefined),
  get: <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key)).catch(() => undefined),
  del: (store: StoreName, key: string) => tx(store, 'readwrite', (s) => s.delete(key)).catch(() => undefined),
  all: <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll()).catch(() => [] as T[]),
};

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* pełny magazyn lub tryb prywatny — stan pozostaje w pamięci */
  }
}
