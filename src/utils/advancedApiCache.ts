/**
 * Advanced API caching system with request deduplication, stale-while-revalidate,
 * and intelligent cache invalidation for production optimization
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  staleAt: number;
  etag?: string;
  lastModified?: string;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  staleTime?: number; // Time after which data is considered stale
  maxAge?: number; // Maximum age before forced refresh
  tags?: string[]; // Cache tags for invalidation
}

interface RequestOptions extends CacheOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class AdvancedApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private tagMap = new Map<string, Set<string>>(); // tag -> cache keys
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes
  private readonly defaultStaleTime = 2 * 60 * 1000; // 2 minutes
  private readonly maxCacheSize = 1000;

  constructor() {
    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), 60 * 1000); // Every minute
  }

  /**
   * Get data from cache or fetch if not available/stale
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(key);
    const { ttl = this.defaultTTL, staleTime = this.defaultStaleTime, tags = [] } = options;

    // Return fresh data if available
    if (entry && now < entry.staleAt) {
      return entry.data;
    }

    // Return stale data while revalidating in background
    if (entry && now < entry.expiresAt) {
      // Start background revalidation
      this.revalidateInBackground(key, fetcher, options);
      return entry.data;
    }

    // Data is expired or doesn't exist, fetch fresh data
    return this.fetchAndCache(key, fetcher, { ttl, staleTime, tags });
  }

  /**
   * Fetch data with request deduplication
   */
  private async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    // Check if request is already pending
    const pendingRequest = this.pendingRequests.get(key);
    if (pendingRequest) {
      return pendingRequest;
    }

    // Create new request
    const request = this.executeFetch(key, fetcher, options);
    this.pendingRequests.set(key, request);

    try {
      const data = await request;
      return data;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Execute the actual fetch and cache the result
   */
  private async executeFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    const { ttl = this.defaultTTL, staleTime = this.defaultStaleTime, tags = [] } = options;
    const now = Date.now();

    try {
      const data = await fetcher();
      
      // Cache the result
      const entry: CacheEntry<T> = {
        data,
        timestamp: now,
        staleAt: now + staleTime,
        expiresAt: now + ttl
      };

      this.cache.set(key, entry);
      
      // Update tag mappings
      tags.forEach(tag => {
        if (!this.tagMap.has(tag)) {
          this.tagMap.set(tag, new Set());
        }
        this.tagMap.get(tag)!.add(key);
      });

      // Ensure cache doesn't grow too large
      this.enforceMaxSize();

      return data;
    } catch (error) {
      // If we have stale data, return it on error
      const staleEntry = this.cache.get(key);
      if (staleEntry) {
        return staleEntry.data;
      }
      throw error;
    }
  }

  /**
   * Revalidate data in the background
   */
  private async revalidateInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<void> {
    try {
      await this.fetchAndCache(key, fetcher, options);
    } catch (error) {
      // Silently fail background revalidation
      // The stale data will continue to be served
    }
  }

  /**
   * Invalidate cache entries by key or tag
   */
  invalidate(keyOrTag: string, isTag = false): void {
    if (isTag) {
      const keys = this.tagMap.get(keyOrTag);
      if (keys) {
        keys.forEach(key => {
          this.cache.delete(key);
          this.pendingRequests.delete(key);
        });
        this.tagMap.delete(keyOrTag);
      }
    } else {
      this.cache.delete(keyOrTag);
      this.pendingRequests.delete(keyOrTag);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
    this.tagMap.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let fresh = 0;
    let stale = 0;
    let expired = 0;

    this.cache.forEach(entry => {
      if (now < entry.staleAt) {
        fresh++;
      } else if (now < entry.expiresAt) {
        stale++;
      } else {
        expired++;
      }
    });

    return {
      total: this.cache.size,
      fresh,
      stale,
      expired,
      pending: this.pendingRequests.size,
      tags: this.tagMap.size
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      // Clean up tag mappings
      this.tagMap.forEach((keys, tag) => {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagMap.delete(tag);
        }
      });
    });
  }

  /**
   * Enforce maximum cache size by removing oldest entries
   */
  private enforceMaxSize(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    const toRemove = entries.slice(0, this.cache.size - this.maxCacheSize);
    toRemove.forEach(([key]) => {
      this.cache.delete(key);
    });
  }
}

// Global cache instance
export const apiCache = new AdvancedApiCache();

// Utility functions for common use cases
export const cachedFetch = async <T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> => {
  const { headers, signal, ...cacheOptions } = options;
  
  return apiCache.get(
    url,
    async () => {
      const response = await fetch(url, { headers, signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    cacheOptions
  );
};

// Debounced cache invalidation for batch operations
let invalidationTimeout: NodeJS.Timeout | null = null;
const pendingInvalidations = new Set<string>();

export const debouncedInvalidate = (keyOrTag: string, isTag = false): void => {
  pendingInvalidations.add(isTag ? `tag:${keyOrTag}` : `key:${keyOrTag}`);
  
  if (invalidationTimeout) {
    clearTimeout(invalidationTimeout);
  }
  
  invalidationTimeout = setTimeout(() => {
    pendingInvalidations.forEach(item => {
      const [type, value] = item.split(':');
      apiCache.invalidate(value, type === 'tag');
    });
    pendingInvalidations.clear();
    invalidationTimeout = null;
  }, 100); // 100ms debounce
};