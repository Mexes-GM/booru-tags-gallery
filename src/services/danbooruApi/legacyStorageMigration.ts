/**
 * One-time cleanup of cache data that older versions stored in localStorage.
 *
 * API responses, search results, per-tag access counters and cache metrics
 * used to be written to localStorage (synchronous, 5 MB quota). They now live
 * in memory + IndexedDB, so the legacy keys are just dead weight. User
 * preferences (darkMode, i18nextLng, autoTranslateEnabled, ...) are untouched.
 */

const MIGRATION_FLAG = 'cache_storage_migrated_v3';

const LEGACY_PREFIXES = ['danbooru_api_cache_', 'search_cache_', 'access_', 'image_cache_', 'metadata_cache_'];
const LEGACY_EXACT_KEYS = ['aggressive_cache_metrics'];

export const migrateLegacyCacheStorage = (): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (LEGACY_EXACT_KEYS.includes(key) || LEGACY_PREFIXES.some((p) => key.startsWith(p))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // localStorage unavailable (privacy mode); nothing to migrate.
  }
};
