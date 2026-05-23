import danbooruApi from '../services/danbooruApi';
import { aggressiveCache } from './aggressiveCache';

/**
 * Limpia todo el cache de la aplicación incluyendo el caché agresivo
 */
export const clearAllCache = (): void => {
  // Limpiar cachés legacy
  danbooruApi.clearCache();
  danbooruApi.clearPreviewCache();
  danbooruApi.clearPostsCache();
  danbooruApi.clearImageLoadQueue();
  
  // Limpiar caché agresivo
  aggressiveCache.clearAll();
};

/**
 * Limpia el cache específico para un tag
 * @param tagName - Nombre del tag
 */
export const clearCacheForTag = (tagName: string): void => {
  if (tagName) {
    danbooruApi.clearAllCacheForTag(tagName);
    danbooruApi.clearImageLoadQueueForTag(tagName);
  }
};

/**
 * Limpia el cache de wiki
 */
export const clearWikiCache = (): void => {
  danbooruApi.clearCache();
  danbooruApi.clearPreviewCache();
};

/**
 * Obtiene estadísticas del cache
 * @returns Estadísticas del cache
 */
export const getCacheStats = (): Record<string, any> => {
  return danbooruApi.getCacheStats();
};

/**
 * Obtiene estadísticas del cache de wiki
 * @returns Estadísticas del cache de wiki
 */
// Eliminado getWikiCacheStats (sin uso)