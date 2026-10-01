/**
 * Cache configuration (TTLs, namespaces and in-memory entry caps).
 * Storage backend: in-memory LRU + IndexedDB (see utils/aggressiveCache and
 * services/danbooruApi/tieredCache). Only the translation cache uses
 * localStorage.
 */

export const AGGRESSIVE_CACHE_CONFIG = {
  // Duración de caché de 7 días (604800000 ms)
  DEFAULT_TTL: 7 * 24 * 60 * 60 * 1000, // 7 días
  
  // Duraciones específicas por tipo de contenido
  CACHE_DURATIONS: {
    // Datos estáticos que raramente cambian
    TAGS: 7 * 24 * 60 * 60 * 1000, // 7 días
    TAG_GROUPS: 7 * 24 * 60 * 60 * 1000, // 7 días
    WIKI_PAGES: 7 * 24 * 60 * 60 * 1000, // 7 días
    
    // Datos semi-estáticos
    POSTS: 3 * 24 * 60 * 60 * 1000, // 3 días
    PREVIEW_IMAGES: 7 * 24 * 60 * 60 * 1000, // 7 días
    
    // Datos de búsqueda y resultados
    SEARCH_RESULTS: 2 * 60 * 60 * 1000, // 2 horas
    AUTOCOMPLETE: 24 * 60 * 60 * 1000, // 1 día
    
    // Traducciones
    TRANSLATIONS: 7 * 24 * 60 * 60 * 1000, // 7 días
    
    // Metadatos de imágenes
    IMAGE_METADATA: 7 * 24 * 60 * 60 * 1000, // 7 días
  },
  
  // Configuración de almacenamiento
  STORAGE: {
    // Prefijos para diferentes tipos de caché
    PREFIXES: {
      API_CACHE: 'danbooru_api_cache_',
      SEARCH_CACHE: 'search_cache_',
      IMAGE_CACHE: 'image_cache_',
      TRANSLATION_CACHE: 'translation_cache_',
      METADATA_CACHE: 'metadata_cache_',
    },
    
    // Max entries kept in memory (LRU) per cache type
    MAX_ENTRIES_PER_TYPE: {
      API_CACHE: 500,
      SEARCH_CACHE: 100,
      IMAGE_CACHE: 1000,
      TRANSLATION_CACHE: 1000,
      METADATA_CACHE: 500,
    },
  },

  // Cross-tab sync (only "clear all" is propagated)
  SYNC: {
    ENABLED: true,
    BROADCAST_CHANNEL: 'danbooru_cache_sync',
    EVENTS: {
      CACHE_UPDATE: 'cache_update',
      CACHE_CLEAR: 'cache_clear',
      CACHE_CLEANUP: 'cache_cleanup',
    },
  },
};

// Tipos para el sistema de caché agresivo
export interface AggressiveCacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  compressed: boolean;
  version: string;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  cleanups: number;
  totalSize: number;
  entryCount: number;
  hitRate: number;
  averageAccessTime: number;
}

export interface CacheStats {
  [key: string]: {
    entries: number;
    totalSize: number;
    hitRate: number;
    oldestEntry: number;
    newestEntry: number;
  };
}

// Configuración de versioning para invalidación de caché
export const CACHE_VERSION = '2.0.0';

// Configuración de debugging
export const DEBUG_CONFIG = {
  ENABLED: process.env.NODE_ENV === 'development',
  LOG_CACHE_OPERATIONS: false,
  LOG_PERFORMANCE: false,
  LOG_CLEANUP: false, // Deshabilitado para evitar logs infinitos
};