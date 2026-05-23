/**
 * Translation Cache Utility
 * Provides persistent local caching for DeepL translations with aggressive 7-day TTL support
 */

import { cacheTranslation } from './aggressiveCache';
import { AGGRESSIVE_CACHE_CONFIG } from '../config/aggressiveCacheConfig';

interface CacheEntry {
  text: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface CacheStorage {
  [key: string]: CacheEntry;
}

class TranslationCache {
  private static readonly CACHE_KEY = 'deepl_translation_cache';
  private static readonly DEFAULT_TTL = AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.TRANSLATIONS; // 7 días
  private cache: CacheStorage = {};

  constructor() {
    this.loadFromStorage();
    this.cleanExpiredEntries();
  }

  /**
   * Generate cache key from translation parameters
   */
  private generateKey(text: string, sourceLang: string, targetLang: string): string {
    const normalizedText = text.trim().toLowerCase();
    return `${sourceLang}:${targetLang}:${normalizedText}`;
  }

  /**
   * Load cache from aggressive cache system
   */
  private loadFromStorage(): void {
    try {
      const stored = cacheTranslation.get<CacheStorage>(TranslationCache.CACHE_KEY);
      if (stored) {
        this.cache = stored;
      }
    } catch (error) {
      // Failed to load from storage
      this.cache = {};
    }
  }

  /**
   * Save cache to aggressive cache system
   */
  private saveToStorage(): void {
    try {
      cacheTranslation.set(TranslationCache.CACHE_KEY, this.cache, TranslationCache.DEFAULT_TTL);
    } catch (error) {
      // Failed to save to storage
    }
  }

  /**
   * Remove expired entries from cache
   */
  private cleanExpiredEntries(): void {
    const now = Date.now();
    let hasExpired = false;

    for (const key in this.cache) {
      const entry = this.cache[key];
      if (now > entry.timestamp + entry.ttl) {
        delete this.cache[key];
        hasExpired = true;
      }
    }

    if (hasExpired) {
      this.saveToStorage();
    }
  }

  /**
   * Check if a translation exists in cache and is not expired
   */
  has(text: string, sourceLang: string = 'auto', targetLang: string = 'EN'): boolean {
    const key = this.generateKey(text, sourceLang, targetLang);
    const entry = this.cache[key];
    
    if (!entry) return false;
    
    const now = Date.now();
    if (now > entry.timestamp + entry.ttl) {
      delete this.cache[key];
      this.saveToStorage();
      return false;
    }
    
    return true;
  }

  /**
   * Get cached translation
   */
  get(text: string, sourceLang: string = 'auto', targetLang: string = 'EN'): string | null {
    if (!this.has(text, sourceLang, targetLang)) {
      return null;
    }
    
    const key = this.generateKey(text, sourceLang, targetLang);
    return this.cache[key].translatedText;
  }

  /**
   * Store translation in cache
   */
  set(
    text: string, 
    translatedText: string, 
    sourceLang: string = 'auto', 
    targetLang: string = 'EN',
    ttl: number = TranslationCache.DEFAULT_TTL
  ): void {
    const key = this.generateKey(text, sourceLang, targetLang);
    
    this.cache[key] = {
      text: text.trim(),
      translatedText,
      sourceLang,
      targetLang,
      timestamp: Date.now(),
      ttl
    };
    
    this.saveToStorage();
  }

  /**
   * Clear all cached translations
   */
  clear(): void {
    this.cache = {};
    this.saveToStorage();
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalEntries: number; totalSize: number } {
    const totalEntries = Object.keys(this.cache).length;
    const totalSize = JSON.stringify(this.cache).length;
    
    return { totalEntries, totalSize };
  }

  /**
   * Remove entries older than specified age
   */
  cleanOlderThan(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    let hasChanges = false;

    for (const key in this.cache) {
      const entry = this.cache[key];
      if (entry.timestamp < cutoff) {
        delete this.cache[key];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveToStorage();
    }
  }
}

// Export singleton instance
export const translationCache = new TranslationCache();
export default translationCache;