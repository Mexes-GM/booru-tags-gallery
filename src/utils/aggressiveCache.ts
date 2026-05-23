/**
 * Sistema de caché agresivo con persistencia de 7 días
 * Optimiza el almacenamiento y reduce solicitudes redundantes al servidor
 */

import { 
  AGGRESSIVE_CACHE_CONFIG, 
  AggressiveCacheEntry, 
  CacheMetrics, 
  CacheStats,
  CACHE_VERSION,
  DEBUG_CONFIG
} from '../config/aggressiveCacheConfig';

// Utilidad de compresión simple (usando LZ-string si está disponible)
const compress = (data: string): string => {
  try {
    // Usar LZ-string si está disponible, sino devolver sin comprimir
    if (typeof window !== 'undefined' && (window as any).LZString) {
      return (window as any).LZString.compress(data);
    }
    return data;
  } catch {
    return data;
  }
};

const decompress = (data: string): string => {
  try {
    if (typeof window !== 'undefined' && (window as any).LZString) {
      const decompressed = (window as any).LZString.decompress(data);
      return decompressed || data;
    }
    return data;
  } catch {
    return data;
  }
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

  private memoryFallback = new Map<string, AggressiveCacheEntry>();
  private broadcastChannel?: BroadcastChannel;
  private cleanupInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  constructor() {
    this.initializeBroadcastChannel();
    this.startAutoCleanup();
    this.startMetricsTracking();
    this.loadMetrics();
  }

  private initializeBroadcastChannel(): void {
    if (AGGRESSIVE_CACHE_CONFIG.SYNC.ENABLED && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(AGGRESSIVE_CACHE_CONFIG.SYNC.BROADCAST_CHANNEL);
        this.broadcastChannel.onmessage = (event) => {
          this.handleSyncMessage(event.data);
        };
      } catch (error) {
        if (DEBUG_CONFIG.ENABLED) {
          // BroadcastChannel not available
        }
      }
    }
  }

  private handleSyncMessage(data: any): void {
    switch (data.type) {
      case AGGRESSIVE_CACHE_CONFIG.SYNC.EVENTS.CACHE_UPDATE:
        // Sincronizar actualización de caché entre pestañas
        break;
      case AGGRESSIVE_CACHE_CONFIG.SYNC.EVENTS.CACHE_CLEAR:
        this.clearAll();
        break;
      case AGGRESSIVE_CACHE_CONFIG.SYNC.EVENTS.CACHE_CLEANUP:
        // No ejecutar cleanup automáticamente para evitar bucles infinitos
        // Solo notificar que otra pestaña hizo limpieza
        if (DEBUG_CONFIG.ENABLED) {
          // Cleanup notification received from another tab
        }
        break;
    }
  }

  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, AGGRESSIVE_CACHE_CONFIG.CLEANUP.AUTO_CLEANUP_INTERVAL);
  }

  private startMetricsTracking(): void {
    if (AGGRESSIVE_CACHE_CONFIG.METRICS.ENABLED) {
      this.metricsInterval = setInterval(() => {
        this.saveMetrics();
      }, AGGRESSIVE_CACHE_CONFIG.METRICS.SAVE_INTERVAL);
    }
  }

  private generateKey(prefix: string, key: string): string {
    return `${prefix}${key}_v${CACHE_VERSION}`;
  }

  private getStorageSize(): number {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && this.isCacheKey(key)) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
          }
        }
      }
      return totalSize;
    } catch {
      return 0;
    }
  }

  private isCacheKey(key: string): boolean {
    return Object.values(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES)
      .some(prefix => key.startsWith(prefix));
  }

  private shouldCompress(data: string): boolean {
    return AGGRESSIVE_CACHE_CONFIG.COMPRESSION.ENABLED && 
           data.length >= AGGRESSIVE_CACHE_CONFIG.COMPRESSION.MIN_SIZE_TO_COMPRESS;
  }

  private createCacheEntry<T>(data: T, ttl: number): AggressiveCacheEntry<T> {
    const serialized = JSON.stringify(data);
    const shouldCompress = this.shouldCompress(serialized);
    const finalData = shouldCompress ? compress(serialized) : serialized;
    
    return {
      data: shouldCompress ? (finalData as T) : data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
      lastAccessed: Date.now(),
      size: finalData.length,
      compressed: shouldCompress,
      version: CACHE_VERSION,
    };
  }

  private deserializeCacheEntry<T>(entry: AggressiveCacheEntry): T | null {
    try {
      if (entry.compressed && typeof entry.data === 'string') {
        const decompressed = decompress(entry.data);
        return JSON.parse(decompressed);
      }
      return entry.data;
    } catch (error) {
      if (DEBUG_CONFIG.ENABLED) {
        // Failed to deserialize entry
      }
      return null;
    }
  }

  /**
   * Almacena un valor en el caché con TTL específico
   */
  set<T>(prefix: string, key: string, data: T, ttl?: number): boolean {
    // const _startTime = performance.now();
    const cacheKey = this.generateKey(prefix, key);
    const cacheTTL = ttl || AGGRESSIVE_CACHE_CONFIG.DEFAULT_TTL;
    const entry = this.createCacheEntry(data, cacheTTL);

    try {
      // Verificar límites de almacenamiento
      const currentSize = this.getStorageSize();
      if (entry.size > AGGRESSIVE_CACHE_CONFIG.STORAGE.MAX_ENTRY_SIZE) {
        if (DEBUG_CONFIG.ENABLED) {
          // Entry too large, skipping
        }
        return false;
      }

      // Limpiar si es necesario
      if (currentSize > 0 && 
          (currentSize + entry.size) / (5 * 1024 * 1024) > AGGRESSIVE_CACHE_CONFIG.STORAGE.CLEANUP_THRESHOLD) {
        this.cleanup();
      }

      // Intentar almacenar en localStorage
      localStorage.setItem(cacheKey, JSON.stringify(entry));
      
      // Actualizar métricas
      this.metrics.sets++;
      this.metrics.totalSize += entry.size;
      this.metrics.entryCount++;
      
      if (DEBUG_CONFIG.LOG_CACHE_OPERATIONS) {
        // Set cache entry
      }

      return true;
    } catch (error) {
      // Fallback a memoria
      if (AGGRESSIVE_CACHE_CONFIG.ERROR_RECOVERY.MEMORY_FALLBACK) {
        this.memoryFallback.set(cacheKey, entry);
        if (DEBUG_CONFIG.ENABLED) {
          // localStorage failed, using memory fallback
        }
        return true;
      }
      
      if (DEBUG_CONFIG.ENABLED) {
        // Failed to set cache entry
      }
      return false;
    } finally {
      if (DEBUG_CONFIG.LOG_PERFORMANCE) {
        // const duration = performance.now() - startTime;
        // Set operation completed
      }
    }
  }

  /**
   * Recupera un valor del caché
   */
  get<T>(prefix: string, key: string): T | null {
    const _startTime = performance.now();
    const cacheKey = this.generateKey(prefix, key);

    try {
      // Intentar desde localStorage primero
      let entryData = localStorage.getItem(cacheKey);
      let entry: AggressiveCacheEntry | null = null;

      if (entryData) {
        entry = JSON.parse(entryData);
      } else if (this.memoryFallback.has(cacheKey)) {
        // Fallback a memoria
        entry = this.memoryFallback.get(cacheKey) || null;
      }

      if (!entry) {
        this.metrics.misses++;
        return null;
      }

      // Verificar TTL
      const now = Date.now();
      if (now > entry.timestamp + entry.ttl) {
        // Entrada expirada
        this.delete(prefix, key);
        this.metrics.misses++;
        return null;
      }

      // Verificar versión
      if (entry.version !== CACHE_VERSION) {
        this.delete(prefix, key);
        this.metrics.misses++;
        return null;
      }

      // Actualizar estadísticas de acceso
      entry.accessCount++;
      entry.lastAccessed = now;
      
      // Guardar estadísticas actualizadas
      try {
        localStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch {
        // Si falla, continuar con los datos
      }

      // Deserializar datos
      const data = this.deserializeCacheEntry<T>(entry);
      
      if (data !== null) {
        this.metrics.hits++;
        this.updateHitRate();
        
        if (DEBUG_CONFIG.LOG_CACHE_OPERATIONS) {
          // Cache hit
        }
      } else {
        this.metrics.misses++;
      }

      return data;
    } catch (error) {
      this.metrics.misses++;
      
      if (DEBUG_CONFIG.ENABLED) {
        // Failed to get cache entry
      }
      
      // Auto-limpiar entrada corrupta
      if (AGGRESSIVE_CACHE_CONFIG.ERROR_RECOVERY.AUTO_CLEAR_CORRUPTED) {
        this.delete(prefix, key);
      }
      
      return null;
    } finally {
      if (DEBUG_CONFIG.LOG_PERFORMANCE) {
        const _duration = performance.now() - _startTime;
           this.metrics.averageAccessTime = 
             (this.metrics.averageAccessTime + _duration) / 2;
      }
    }
  }

  /**
   * Elimina una entrada específica del caché
   */
  delete(prefix: string, key: string): boolean {
    const cacheKey = this.generateKey(prefix, key);
    
    try {
      const existed = localStorage.getItem(cacheKey) !== null || 
                     this.memoryFallback.has(cacheKey);
      
      localStorage.removeItem(cacheKey);
      this.memoryFallback.delete(cacheKey);
      
      if (existed) {
        this.metrics.deletes++;
        this.metrics.entryCount = Math.max(0, this.metrics.entryCount - 1);
        
        if (DEBUG_CONFIG.LOG_CACHE_OPERATIONS) {
          // Cache entry deleted
        }
      }
      
      return existed;
    } catch (error) {
      if (DEBUG_CONFIG.ENABLED) {
        // Failed to delete cache entry
      }
      return false;
    }
  }

  /**
   * Verifica si existe una entrada en el caché (sin deserializar)
   */
  has(prefix: string, key: string): boolean {
    const cacheKey = this.generateKey(prefix, key);
    
    try {
      const entryData = localStorage.getItem(cacheKey) || 
                       this.memoryFallback.has(cacheKey);
      
      if (!entryData) return false;
      
      if (typeof entryData === 'string') {
        const entry = JSON.parse(entryData);
        const now = Date.now();
        
        // Verificar TTL y versión
        return now <= entry.timestamp + entry.ttl && 
               entry.version === CACHE_VERSION;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Limpia entradas expiradas y optimiza el almacenamiento
   */
  cleanup(): void {
    // const startTime = performance.now();
    let cleanedCount = 0;
    
    try {
      const now = Date.now();
      const keysToDelete: string[] = [];
      
      // Limpiar localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && this.isCacheKey(key)) {
          try {
            const entryData = localStorage.getItem(key);
            if (entryData) {
              const entry = JSON.parse(entryData);
              
              // Eliminar si está expirado o es versión antigua
              if (now > entry.timestamp + entry.ttl || 
                  entry.version !== CACHE_VERSION) {
                keysToDelete.push(key);
              }
            }
          } catch {
            // Eliminar entradas corruptas
            keysToDelete.push(key);
          }
        }
      }
      
      // Eliminar entradas marcadas
      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
        cleanedCount++;
      });
      
      // Limpiar memoria fallback
      for (const [key, entry] of this.memoryFallback.entries()) {
        if (now > entry.timestamp + entry.ttl || 
            entry.version !== CACHE_VERSION) {
          this.memoryFallback.delete(key);
          cleanedCount++;
        }
      }
      
      this.metrics.cleanups++;
      this.metrics.entryCount = Math.max(0, this.metrics.entryCount - cleanedCount);
      
      if (DEBUG_CONFIG.LOG_CLEANUP) {
        // const _duration = performance.now() - startTime;
        // Cleanup completed
      }
      
      // Solo sincronizar limpieza entre pestañas si realmente se eliminaron entradas
      if (this.broadcastChannel && cleanedCount > 0) {
        this.broadcastChannel.postMessage({
          type: AGGRESSIVE_CACHE_CONFIG.SYNC.EVENTS.CACHE_CLEANUP,
          cleanedCount
        });
      }
    } catch (error) {
      if (DEBUG_CONFIG.ENABLED) {
        // Cleanup failed
      }
    }
  }

  /**
   * Limpia todo el caché
   */
  clearAll(): void {
    try {
      const keysToDelete: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && this.isCacheKey(key)) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => localStorage.removeItem(key));
      this.memoryFallback.clear();
      
      // Resetear métricas
      this.metrics = {
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
      
      if (DEBUG_CONFIG.LOG_CACHE_OPERATIONS) {
        // All cache cleared
      }
      
      // Sincronizar limpieza entre pestañas
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: AGGRESSIVE_CACHE_CONFIG.SYNC.EVENTS.CACHE_CLEAR
        });
      }
    } catch (error) {
      if (DEBUG_CONFIG.ENABLED) {
        // Failed to clear all cache
      }
    }
  }

  /**
   * Obtiene estadísticas del caché
   */
  getStats(): CacheStats {
    const stats: CacheStats = {};
    
    try {
      Object.entries(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES).forEach(([type, prefix]) => {
        let entries = 0;
        let totalSize = 0;
        let hits = 0;
        let accesses = 0;
        let oldestEntry = Date.now();
        let newestEntry = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            try {
              const entryData = localStorage.getItem(key);
              if (entryData) {
                const entry = JSON.parse(entryData);
                entries++;
                totalSize += entry.size || 0;
                accesses += entry.accessCount || 0;
                hits += entry.accessCount || 0;
                oldestEntry = Math.min(oldestEntry, entry.timestamp);
                newestEntry = Math.max(newestEntry, entry.timestamp);
              }
            } catch {
              // Ignorar entradas corruptas
            }
          }
        }
        
        stats[type] = {
          entries,
          totalSize,
          hitRate: accesses > 0 ? hits / accesses : 0,
          oldestEntry,
          newestEntry,
        };
      });
    } catch (error) {
      if (DEBUG_CONFIG.ENABLED) {
        // Failed to get stats
      }
    }
    
    return stats;
  }

  /**
   * Obtiene métricas generales
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  private saveMetrics(): void {
    if (AGGRESSIVE_CACHE_CONFIG.METRICS.ENABLED) {
      try {
        localStorage.setItem('aggressive_cache_metrics', JSON.stringify(this.metrics));
      } catch {
        // Ignorar errores de almacenamiento de métricas
      }
    }
  }

  private loadMetrics(): void {
    if (AGGRESSIVE_CACHE_CONFIG.METRICS.ENABLED) {
      try {
        const stored = localStorage.getItem('aggressive_cache_metrics');
        if (stored) {
          this.metrics = { ...this.metrics, ...JSON.parse(stored) };
        }
      } catch {
        // Ignorar errores de carga de métricas
      }
    }
  }

  /**
   * Destructor para limpiar recursos
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
  }
}

// Instancia singleton
const aggressiveCache = new AggressiveCache();

// Métodos de conveniencia para diferentes tipos de caché
export const cacheAPI = {
  set: <T>(key: string, data: T, ttl?: number) => 
    aggressiveCache.set(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.API_CACHE, key, data, ttl),
  get: <T>(key: string) => 
    aggressiveCache.get<T>(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.API_CACHE, key),
  has: (key: string) => 
    aggressiveCache.has(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.API_CACHE, key),
  delete: (key: string) => 
    aggressiveCache.delete(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.API_CACHE, key),
};

export const cacheSearch = {
  set: <T>(key: string, data: T, ttl?: number) => 
    aggressiveCache.set(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.SEARCH_CACHE, key, data, ttl),
  get: <T>(key: string) => 
    aggressiveCache.get<T>(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.SEARCH_CACHE, key),
  has: (key: string) => 
    aggressiveCache.has(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.SEARCH_CACHE, key),
  delete: (key: string) => 
    aggressiveCache.delete(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.SEARCH_CACHE, key),
};

export const cacheImage = {
  set: <T>(key: string, data: T, ttl?: number) => 
    aggressiveCache.set(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.IMAGE_CACHE, key, data, ttl),
  get: <T>(key: string) => 
    aggressiveCache.get<T>(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.IMAGE_CACHE, key),
  has: (key: string) => 
    aggressiveCache.has(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.IMAGE_CACHE, key),
  delete: (key: string) => 
    aggressiveCache.delete(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.IMAGE_CACHE, key),
};

export const cacheTranslation = {
  set: <T>(key: string, data: T, ttl?: number) => 
    aggressiveCache.set(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.TRANSLATION_CACHE, key, data, ttl),
  get: <T>(key: string) => 
    aggressiveCache.get<T>(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.TRANSLATION_CACHE, key),
  has: (key: string) => 
    aggressiveCache.has(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.TRANSLATION_CACHE, key),
  delete: (key: string) => 
    aggressiveCache.delete(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.TRANSLATION_CACHE, key),
};

export const cacheMetadata = {
  set: <T>(key: string, data: T, ttl?: number) => 
    aggressiveCache.set(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.METADATA_CACHE, key, data, ttl),
  get: <T>(key: string) => 
    aggressiveCache.get<T>(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.METADATA_CACHE, key),
  has: (key: string) => 
    aggressiveCache.has(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.METADATA_CACHE, key),
  delete: (key: string) => 
    aggressiveCache.delete(AGGRESSIVE_CACHE_CONFIG.STORAGE.PREFIXES.METADATA_CACHE, key),
};

// Exportar instancia principal y métodos de utilidad
export { aggressiveCache };
export default aggressiveCache;

// Limpiar recursos al cerrar la página
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    aggressiveCache.destroy();
  });
}