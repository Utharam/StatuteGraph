/**
 * Browser-side document storage.
 *
 * Built-in documents ship in `public/data` and are fetched on demand. Documents
 * the user opens or drops in are kept in IndexedDB so the library survives a
 * refresh — the whole point of "open a book" is not having to re-pick it.
 *
 * The file text is stored verbatim rather than a parsed object graph: AKN dumps
 * are large (a single Act runs to several MB) and keeping the bytes means a
 * re-open never depends on our derived model staying compatible.
 *
 * Everything degrades to a no-op when IndexedDB is unavailable (private
 * browsing, SSR, tests) so callers never need to feature-detect.
 */

const DB_NAME = 'akn-legal-reader';
const DB_VERSION = 1;
const STORE_DOCUMENTS = 'documents';

/** Refuse anything absurd rather than locking up the browser tab. */
export const MAX_DOCUMENT_BYTES = 128 * 1024 * 1024;

export interface StoredDocument {
  id: string;
  /** Original file name, shown in the library. */
  name: string;
  sizeBytes: number;
  addedAt: number;
  lastOpenedAt: number;
  /** Verbatim file contents. */
  text: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        const store = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
        store.createIndex('lastOpenedAt', 'lastOpenedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    // A blocked or unavailable database must not break the reader: the library
    // simply becomes session-only.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  }).catch(() => null);

  return dbPromise;
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | null
): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T> | null = null;
        try {
          const tx = db.transaction(storeName, mode);
          request = work(tx.objectStore(storeName));
          tx.oncomplete = () => resolve(request?.result ?? null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

export function makeDocumentId(name: string, sizeBytes: number): string {
  // Deterministic per file+size, so re-dropping the same document replaces the
  // existing entry rather than duplicating it in the library.
  const slug = name
    .replace(/\.json$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  return `local:${slug || 'document'}:${sizeBytes}`;
}

export async function putDocument(document: StoredDocument): Promise<boolean> {
  const result = await runTransaction(STORE_DOCUMENTS, 'readwrite', (store) =>
    store.put(document)
  );
  return result !== null;
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  return runTransaction<StoredDocument>(STORE_DOCUMENTS, 'readonly', (store) => store.get(id));
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const all = await runTransaction<StoredDocument[]>(STORE_DOCUMENTS, 'readonly', (store) =>
    store.getAll()
  );
  if (!all) return [];
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

/** Reads documents without their bodies, for cheap library rendering. */
export async function listDocumentSummaries(): Promise<Omit<StoredDocument, 'text'>[]> {
  const all = await listDocuments();
  return all.map(({ text: _text, ...rest }) => rest);
}

export async function deleteDocument(id: string): Promise<boolean> {
  const result = await runTransaction(STORE_DOCUMENTS, 'readwrite', (store) => store.delete(id));
  return result !== null;
}

/** Records that a document was opened, so the library can show recents. */
export async function markDocumentOpened(id: string, at: number = Date.now()): Promise<void> {
  await runTransaction(STORE_DOCUMENTS, 'readwrite', (store) => {
    const get = store.get(id) as IDBRequest<StoredDocument | undefined>;
    get.onsuccess = () => {
      const doc = get.result;
      if (!doc) return;
      doc.lastOpenedAt = at;
      store.put(doc);
    };
    return null;
  });
}

export async function isStorageAvailable(): Promise<boolean> {
  return (await openDatabase()) !== null;
}