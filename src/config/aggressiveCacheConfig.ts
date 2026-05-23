/**
 * Configuración de caché agresivo con persistencia de 7 días
 * Optimiza el almacenamiento en caché para mejorar el rendimiento y reducir solicitudes redundantes
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
    
    // Límites de almacenamiento
    MAX_ENTRIES_PER_TYPE: {
      API_CACHE: 1000,
      SEARCH_CACHE: 500,
      IMAGE_CACHE: 2000,
      TRANSLATION_CACHE: 1000,
      METADATA_CACHE: 1500,
    },
    
    // Tamaño máximo por entrada (en bytes)
    MAX_ENTRY_SIZE: 1024 * 1024, // 1MB
    
    // Umbral para limpieza automática (porcentaje de uso)
    CLEANUP_THRESHOLD: 0.8, // 80%
  },
  
  // Configuración de limpieza
  CLEANUP: {
    // Intervalo de limpieza automática - aumentado para reducir logs
    AUTO_CLEANUP_INTERVAL: 5 * 60 * 60 * 1000, // 5 horas
    
    // Estrategias de limpieza
    STRATEGIES: {
      LRU: 'least_recently_used',
      TTL: 'time_to_live',
      SIZE: 'size_based',
    },
    
    // Porcentaje de entradas a eliminar durante la limpieza
    CLEANUP_PERCENTAGE: 0.2, // 20%
  },
  
  // Configuración de compresión
  COMPRESSION: {
    ENABLED: true,
    // Tamaño mínimo para comprimir (en bytes)
    MIN_SIZE_TO_COMPRESS: 1024, // 1KB
    // Algoritmo de compresión (usando LZ-string para compatibilidad)
    ALGORITHM: 'lz-string',
  },
  
  // Configuración de sincronización entre pestañas
  SYNC: {
    ENABLED: true,
    // Canal de broadcast para sincronización
    BROADCAST_CHANNEL: 'danbooru_cache_sync',
    // Eventos de sincronización
    EVENTS: {
      CACHE_UPDATE: 'cache_update',
      CACHE_CLEAR: 'cache_clear',
      CACHE_CLEANUP: 'cache_cleanup',
    },
  },
  
  // Configuración de métricas
  METRICS: {
    ENABLED: true,
    // Almacenar métricas de rendimiento
    TRACK_PERFORMANCE: true,
    // Almacenar estadísticas de uso
    TRACK_USAGE: true,
    // Intervalo para guardar métricas
    SAVE_INTERVAL: 5 * 60 * 1000, // 5 minutos
  },
  
  // Configuración de recuperación de errores
  ERROR_RECOVERY: {
    // Reintentos automáticos en caso de error de caché
    AUTO_RETRY: true,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 segundo
    
    // Fallback a memoria si localStorage falla
    MEMORY_FALLBACK: true,
    
    // Limpiar caché corrupto automáticamente
    AUTO_CLEAR_CORRUPTED: true,
  },
};

// Tipos para el sistema de caché agresivo
export interface AggressiveCacheEntry<T = any> {
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