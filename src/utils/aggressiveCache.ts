/**
 * Application cache facade.
 *
 * Public API (cacheAPI / cacheSearch / cacheImage / cacheTranslation /
 * cacheMetadata / aggressiveCache) is unchanged and synchronous, but the
 * storage backend is no longer localStorage:
 *
 * - API / image / metadata entries: in-memory LRU + IndexedDB persistence
 *   (see services/danbooruApi/tieredCache). `get` is memory-only (sync);
 *   use `getAsync` to also consult IndexedDB.
 * - Search results: memory-only LRU (they are derived from the local tag
 *   dataset and cheap to recompute).
 * - Translations: a single small key that must be readable synchronously at
 *   startup, so it stays in localStorage.
 */

import {
  AGGRESSIVE_CACHE_CONFIG,
  CacheMetrics,
  CacheStats,
  CACHE_VERSION,
} from '../config/aggressiveCacheConfig';
import { TieredCache } from '../services/danbooruApi/tieredCache';
import { migrateLegacyCacheStorage } from '../services/danbooruApi/legacyStorageMigration';

type Prefix = string;

const PREFIXES = AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES;
const LIMITS = AGGRESSIVE_CACHE_CONFIG.STORAGE.MAX_ENTRIES_PER_TYPE;

// Remove legacy localStorage cache keys once, before anything reads them.
migrateLegacyCacheStorage();

const tiers = new Map<Prefix, TieredCache>([
  [
    PREFIXES.API_CACHE,
    new TieredCache({ namespace: 'api', maxMemoryEntries: LIMITS.API_CACHE, defaultTtl: AGGRESSIVE_CACHE_CONFIG.DEFAULT_TTL, persist: true }),
  ],
  [
    PREFIXES.SEARCH_CACHE,
    new TieredCache({ namespace: 'search', maxMemoryEntries: LIMITS.SEARCH_CACHE, defaultTtl: AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.SEARCH_RESULTS, persist: false }),
  ],
  [
    PREFIXES.IMAGE_CACHE,
    new TieredCache({ namespace: 'image', maxMemoryEntries: LIMITS.IMAGE_CACHE, defaultTtl: AGGRESSIVE_CACHE_CONFIG.DEFAULT_TTL, persist: true }),
  ],
  [
    PREFIXES.METADATA_CACHE,
    new TieredCache({ namespace: 'metadata', maxMemoryEntries: LIMITS.METADATA_CACHE, defaultTtl: AGGRESSIVE_CACHE_CONFIG.DEFAULT_TTL, persist: true }),
  ],
]);

interface LocalEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  version: string;
}

/** Minimal localStorage store used only for the translation cache. */
const localStore = {
  key: (prefix: string, key: string) => `${prefix}${key}_v${CACHE_VERSION}`,
  get<T>(prefix: string, key: string): T | null {
    try {
      const raw = localStorage.getItem(this.key(prefix, key));
      if (!raw) return null;
      const entry = JSON.parse(raw) as LocalEntry<T>;
      if (entry.version !== CACHE_VERSION || Date.now() > entry.timestamp + entry.ttl) {
        localStorage.removeItem(this.key(prefix, key));
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  },
  set<T>(prefix: string, key: string, data: T, ttl: number): boolean {
    try {
      const entry: LocalEntry<T> = { data, timestamp: Date.now(), ttl, version: CACHE_VERSION };
      localStorage.setItem(this.key(prefix, key), JSON.stringify(entry));
      return true;
    } catch {
      return false;
    }
  },
  delete(prefix: string, key: string): boolean {
    try {
      const k = this.key(prefix, key);
      const existed = localStorage.getItem(k) !== null;
      localStorage.removeItem(k);
      return existed;
    } catch {
      return false;
    }
  },
  clear(prefix: string) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  },
};

class AggressiveCache {
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    cleanups: 0,
    totalSize: 0,
    entryCount: 0,
    hitRate: 0,
    averageAccessTime: 0,
  };

  private broadcastChannel?: BroadcastChannel;

  constructor() {
    if (AGGRESSIVE_CACHE_CONFIG.SYNC.ENABLED && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(AGGRESSIVE_CACHE_CONFIG.SYNC.BROADCAST_CHANNEL);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === AGGRESSIVE_CACHE_CONFIG.SYNC.EVENTS.CACHE_CLEAR) {
            this.clearAll(false);
          }
        };
      } catch {
        // BroadcastChannel not available
      }
    }
  }

  private tier(prefix: Prefix): TieredCache | undefined {
    return tiers.get(prefix);
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  set<T>(prefix: string, key: string, data: T, ttl?: number): boolean {
    const cacheTTL = ttl || AGGRESSIVE_CACHE_CONFIG.DEFAULT_TTL;
    this.metrics.sets++;
    const tier = this.tier(prefix);
    if (tier) {
      tier.set(key, data, cacheTTL);
      return true;
    }
    return localStore.set(prefix, key, data, cacheTTL);
  }

  get<T>(prefix: string, key: string): T | null {
    const tier = this.tier(prefix);
    const value = tier ? tier.get<T>(key) ?? null : localStore.get<T>(prefix, key);
    if (value === null || value === undefined) this.metrics.misses++;
    else this.metrics.hits++;
    this.updateHitRate();
    return value ?? null;
  }

  /** Async variant that also consults IndexedDB for persisted tiers. */
  async getAsync<T>(prefix: string, key: string): Promise<T | null> {
    const tier = this.tier(prefix);
    if (!tier) return this.get<T>(prefix, key);
    const value = await tier.getAsync<T>(key);
    if (value === undefined) this.metrics.misses++;
    else this.metrics.hits++;
    this.updateHitRate();
    return value ?? null;
  }

  delete(prefix: string, key: string): boolean {
    this.metrics.deletes++;
    const tier = this.tier(prefix);
    return tier ? tier.delete(key) : localStore.delete(prefix, key);
  }

  has(prefix: string, key: string): boolean {
    const tier = this.tier(prefix);
    return tier ? tier.has(key) : localStore.get(prefix, key) !== null;
  }

  /** Expiry is handled lazily on read and by the IndexedDB maintenance task. */
  cleanup(): void {
    this.metrics.cleanups++;
  }

  clearAll(broadcast = true): void {
    tiers.forEach((tier) => tier.clear());
    localStore.clear(PREFIXES.TRANSLATION_CACHE);
    this.metrics = { ...this.metrics, hits: 0, misses: 0, sets: 0, deletes: 0, hitRate: 0 };
    if (broadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: AGGRESSIVE_CACHE_CONFIG.SYNC.EVENTS.CACHE_CLEAR });
      } catch {
        // ignore
      }
    }
  }

  getStats(): CacheStats {
    const stats: CacheStats = {};
    Object.entries(PREFIXES).forEach(([type, prefix]) => {
      const tier = this.tier(prefix);
      const s = tier?.stats();
      stats[type] = {
        entries: s?.memoryEntries ?? 0,
        totalSize: 0,
        hitRate: s?.hitRate ?? 0,
        oldestEntry: 0,
        newestEntry: 0,
      };
    });
    return stats;
  }

  getMetrics(): CacheMetrics {
    let entryCount = 0;
    tiers.forEach((tier) => {
      entryCount += tier.stats().memoryEntries;
    });
    return { ...this.metrics, entryCount };
  }

  destroy(): void {
    if (this.broadcastChannel) this.broadcastChannel.close();
  }
}

const aggressiveCache = new AggressiveCache();

const makeFacade = (prefix: string) => ({
  set: <T>(key: string, data: T, ttl?: number) => aggressiveCache.set(prefix, key, data, ttl),
  get: <T>(key: string) => aggressiveCache.get<T>(prefix, key),
  getAsync: <T>(key: string) => aggressiveCache.getAsync<T>(prefix, key),
  has: (key: string) => aggressiveCache.has(prefix, key),
  delete: (key: string) => aggressiveCache.delete(prefix, key),
});

export const cacheAPI = makeFacade(PREFIXES.API_CACHE);
export const cacheSearch = makeFacade(PREFIXES.SEARCH_CACHE);
export const cacheImage = makeFacade(PREFIXES.IMAGE_CACHE);
export const cacheTranslation = makeFacade(PREFIXES.TRANSLATION_CACHE);
export const cacheMetadata = makeFacade(PREFIXES.METADATA_CACHE);

export { aggressiveCache };
export default aggressiveCache;
