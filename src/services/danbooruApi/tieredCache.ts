/**
 * Two-tier cache: a synchronous in-memory LRU with TTL in front of an
 * (optional) IndexedDB store for persistence across sessions.
 *
 * - Reads from memory are synchronous (`get`), so callers that need a sync
 *   API (e.g. aggressiveCache consumers) keep working.
 * - `getAsync` falls through to IndexedDB on a memory miss and promotes the
 *   entry back into memory.
 * - Writes to IndexedDB are coalesced and flushed in a single transaction.
 * - Persisted entries are capped (entry count) and evicted by TTL / age.
 *
 * Uses the raw indexedDB API so it adds no dependency. If IndexedDB is not
 * available (private mode, SSR, tests) it silently degrades to memory-only.
 */

interface MemoryEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

interface PersistedRecord {
  k: string; // full key (namespace + key)
  v: unknown; // value (structured clone)
  e: number; // expiresAt
  t: number; // storedAt
}

const DB_NAME = 'booru-tag-gallery-cache';
const DB_VERSION = 1;
const STORE = 'entries';

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'k' });
          store.createIndex('e', 'e');
          store.createIndex('t', 't');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab upgrading the schema: close so it can proceed.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
};

const reqToPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/** Global cap for persisted records across all namespaces. */
const MAX_PERSISTED_ENTRIES = 4000;
const FLUSH_DELAY_MS = 400;
const MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;

// Shared write queue so all namespaces flush in one transaction.
const pendingWrites = new Map<string, PersistedRecord | null>(); // null = delete
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushWrites();
  }, FLUSH_DELAY_MS);
};

const flushWrites = async (): Promise<void> => {
  if (pendingWrites.size === 0) return;
  const batch = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [key, rec] of batch) {
      if (rec) store.put(rec);
      else store.delete(key);
    }
    await txDone(tx);
  } catch {
    // Quota or transient error: drop the batch, memory tier still has it.
  }
};

/** Remove expired records and enforce the global entry cap (oldest first). */
export const runPersistentMaintenance = async (): Promise<void> => {
  const db = await openDb();
  if (!db) return;
  try {
    const now = Date.now();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    // 1. TTL eviction via the expiry index.
    const expiredReq = store.index('e').openCursor(IDBKeyRange.upperBound(now));
    await new Promise<void>((resolve) => {
      expiredReq.onsuccess = () => {
        const cursor = expiredReq.result;
        if (!cursor) return resolve();
        cursor.delete();
        cursor.continue();
      };
      expiredReq.onerror = () => resolve();
    });
    // 2. Size cap: delete oldest entries beyond the cap.
    const count = await reqToPromise(store.count());
    let excess = count - MAX_PERSISTED_ENTRIES;
    if (excess > 0) {
      // Trim a little extra so we don't do this on every pass.
      excess += Math.floor(MAX_PERSISTED_ENTRIES * 0.1);
      const oldestReq = store.index('t').openCursor();
      await new Promise<void>((resolve) => {
        oldestReq.onsuccess = () => {
          const cursor = oldestReq.result;
          if (!cursor || excess <= 0) return resolve();
          cursor.delete();
          excess--;
          cursor.continue();
        };
        oldestReq.onerror = () => resolve();
      });
    }
    await txDone(tx);
  } catch {
    // ignore
  }
};

let maintenanceStarted = false;
const startMaintenance = () => {
  if (maintenanceStarted || typeof window === 'undefined') return;
  maintenanceStarted = true;
  const run = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => void runPersistentMaintenance(), { timeout: 5000 });
    else setTimeout(() => void runPersistentMaintenance(), 0);
  };
  setTimeout(run, 3000);
  setInterval(run, MAINTENANCE_INTERVAL_MS);
  window.addEventListener('pagehide', () => void flushWrites());
};

export interface TieredCacheOptions {
  /** Namespace prefix used for persisted keys. */
  namespace: string;
  /** Max entries held in memory (LRU). */
  maxMemoryEntries: number;
  /** Default TTL in ms. */
  defaultTtl: number;
  /** Persist to IndexedDB. */
  persist: boolean;
}

export class TieredCache {
  private memory = new Map<string, MemoryEntry>();
  private readonly opts: TieredCacheOptions;
  private hits = 0;
  private misses = 0;

  constructor(opts: TieredCacheOptions) {
    this.opts = opts;
    if (opts.persist) startMaintenance();
  }

  private fullKey(key: string): string {
    return `${this.opts.namespace}:${key}`;
  }

  private remember(key: string, value: unknown, expiresAt: number) {
    if (this.memory.has(key)) this.memory.delete(key);
    this.memory.set(key, { value, expiresAt });
    while (this.memory.size > this.opts.maxMemoryEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }

  /** Synchronous memory-only lookup. */
  get<T>(key: string): T | undefined {
    const entry = this.memory.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      this.misses++;
      return undefined;
    }
    // LRU bump
    this.memory.delete(key);
    this.memory.set(key, entry);
    this.hits++;
    return entry.value as T;
  }

  has(key: string): boolean {
    const entry = this.memory.get(key);
    return !!entry && Date.now() <= entry.expiresAt;
  }

  /** Memory first, then IndexedDB (promoting the hit into memory). */
  async getAsync<T>(key: string): Promise<T | undefined> {
    const mem = this.get<T>(key);
    if (mem !== undefined) return mem;
    if (!this.opts.persist) return undefined;
    const db = await openDb();
    if (!db) return undefined;
    try {
      const tx = db.transaction(STORE, 'readonly');
      const rec = (await reqToPromise(tx.objectStore(STORE).get(this.fullKey(key)))) as
        | PersistedRecord
        | undefined;
      if (!rec) return undefined;
      if (Date.now() > rec.e) {
        this.queueWrite(this.fullKey(key), null);
        return undefined;
      }
      this.remember(key, rec.v, rec.e);
      return rec.v as T;
    } catch {
      return undefined;
    }
  }

  /** Look up many keys at once (single IDB transaction for the misses). */
  async getManyAsync<T>(keys: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    const missing: string[] = [];
    for (const k of keys) {
      const v = this.get<T>(k);
      if (v !== undefined) out.set(k, v);
      else missing.push(k);
    }
    if (missing.length === 0 || !this.opts.persist) return out;
    const db = await openDb();
    if (!db) return out;
    try {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const now = Date.now();
      const recs = await Promise.all(
        missing.map((k) =>
          reqToPromise(store.get(this.fullKey(k))).catch(() => undefined) as Promise<
            PersistedRecord | undefined
          >
        )
      );
      recs.forEach((rec, i) => {
        if (rec && now <= rec.e) {
          this.remember(missing[i], rec.v, rec.e);
          out.set(missing[i], rec.v as T);
        }
      });
    } catch {
      // ignore
    }
    return out;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const expiresAt = now + (ttl ?? this.opts.defaultTtl);
    this.remember(key, value, expiresAt);
    if (this.opts.persist) {
      this.queueWrite(this.fullKey(key), { k: this.fullKey(key), v: value, e: expiresAt, t: now });
    }
  }

  delete(key: string): boolean {
    const existed = this.memory.delete(key);
    if (this.opts.persist) this.queueWrite(this.fullKey(key), null);
    return existed;
  }

  /** Delete memory entries (and persisted ones) whose key matches. */
  deleteWhere(predicate: (key: string) => boolean): void {
    for (const key of Array.from(this.memory.keys())) {
      if (predicate(key)) this.memory.delete(key);
    }
    if (!this.opts.persist) return;
    const prefix = `${this.opts.namespace}:`;
    void this.forEachPersistedKey((fullKey) => {
      const key = fullKey.slice(prefix.length);
      return predicate(key);
    });
  }

  private async forEachPersistedKey(shouldDelete: (fullKey: string) => boolean): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try {
      const prefix = `${this.opts.namespace}:`;
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const req = store.openKeyCursor(range);
      await new Promise<void>((resolve) => {
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return resolve();
          if (shouldDelete(String(cursor.primaryKey))) store.delete(cursor.primaryKey);
          cursor.continue();
        };
        req.onerror = () => resolve();
      });
      await txDone(tx);
    } catch {
      // ignore
    }
  }

  /** Load unexpired persisted entries of this namespace into memory. */
  async hydrate(limit = this.opts.maxMemoryEntries): Promise<void> {
    if (!this.opts.persist) return;
    const db = await openDb();
    if (!db) return;
    try {
      const prefix = `${this.opts.namespace}:`;
      const tx = db.transaction(STORE, 'readonly');
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const recs = (await reqToPromise(tx.objectStore(STORE).getAll(range, limit))) as PersistedRecord[];
      const now = Date.now();
      for (const rec of recs) {
        const key = rec.k.slice(prefix.length);
        if (now <= rec.e && !this.memory.has(key)) this.remember(key, rec.v, rec.e);
      }
    } catch {
      // ignore
    }
  }

  clear(): void {
    this.memory.clear();
    if (this.opts.persist) void this.forEachPersistedKey(() => true);
  }

  private queueWrite(fullKey: string, rec: PersistedRecord | null) {
    pendingWrites.set(fullKey, rec);
    scheduleFlush();
  }

  stats() {
    let expired = 0;
    const now = Date.now();
    this.memory.forEach((e) => {
      if (now > e.expiresAt) expired++;
    });
    const total = this.hits + this.misses;
    return {
      namespace: this.opts.namespace,
      memoryEntries: this.memory.size,
      expiredInMemory: expired,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      persist: this.opts.persist,
    };
  }
}
