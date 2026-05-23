import { DanbooruPost } from '../types';
import { cacheImage } from '../utils/aggressiveCache'
import { AGGRESSIVE_CACHE_CONFIG } from '../config/aggressiveCacheConfig'

interface PreloadCache {
  tagName: string
  imageUrls: string[]
  aspectRatio: number | null
  timestamp: number
  loadedCount: number
}

/**
 * Servicio para precargar imágenes de ejemplos de wiki para evitar parpadeos en rotaciones
 */
class ImagePreloadService {
  private preloadCache = new Map<string, PreloadCache>()
  private loadingPromises = new Map<string, Promise<string[]>>()
  private maxCacheAge = AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.IMAGE_METADATA // 7 días
  // Cache size is now managed by the aggressive cache system

  /**
   * Obtiene todas las URLs de imágenes de ejemplos para un tag con caché agresivo
   */
  async getWikiExampleUrls(
    tagName: string, 
    aspectRatio: number | null = null,
    searchParams?: Record<string, any>
  ): Promise<string[]> {
    const cacheKey = this.getCacheKey(tagName, aspectRatio, searchParams)
    
    // Verificar caché agresivo primero
    const aggressiveCached = cacheImage.get<string[]>(`wiki_examples_${cacheKey}`);
    if (aggressiveCached) {
      return aggressiveCached;
    }
    
    // Verificar cache local
    const cached = this.preloadCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.maxCacheAge) {
      // Guardar en caché agresivo para futuras consultas
      cacheImage.set(`wiki_examples_${cacheKey}`, cached.imageUrls, AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.PREVIEW_IMAGES);
      return cached.imageUrls
    }

    // Verificar si ya está cargando
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!
    }

    // Iniciar carga
    const loadPromise = this.loadWikiExampleUrls(tagName, aspectRatio, searchParams)
    this.loadingPromises.set(cacheKey, loadPromise)

    try {
      const urls = await loadPromise
      this.loadingPromises.delete(cacheKey)
      return urls
    } catch {
      this.loadingPromises.delete(cacheKey)
      return []
    }
  }

  /**
   * Carga las URLs de imágenes de ejemplos desde la API
   */
  private async loadWikiExampleUrls(
    tagName: string, 
    aspectRatio: number | null = null,
    searchParams?: Record<string, any>
  ): Promise<string[]> {
    try {
      // Obtener información de la wiki
      const { default: danbooruApi } = await import('./danbooruApi');
      const wikiInfo = await danbooruApi.getTagWikiInfo(tagName)
      if (!wikiInfo?.examplePosts || wikiInfo.examplePosts.length === 0) {
        return []
      }


      const posts = await danbooruApi.wikiPageManager.getPostsByIds(wikiInfo.examplePosts, searchParams)
      if (posts.length === 0) {
        return []
      }

      // Validar que los posts respeten el filtro NSFW si está habilitado
      const isNSFWFilterEnabled = searchParams && searchParams["search[rating]"] === "g"
      let filteredPosts = posts
      
      if (isNSFWFilterEnabled) {
        filteredPosts = posts.filter((post: DanbooruPost) => post.rating === 'g')
      }

      if (filteredPosts.length === 0) {
        return []
      }

      // Filtrar por aspect ratio si se especifica
      if (aspectRatio) {
        filteredPosts = filteredPosts.filter((post: DanbooruPost) => {
          if (!post.image_width || !post.image_height) return true
          const postRatio = post.image_width / post.image_height
          return Math.abs(postRatio - aspectRatio) < 0.1
        })
      }

      // Extraer URLs de imágenes
      const imageUrls = filteredPosts
        .map((post: DanbooruPost) => post.large_file_url || post.file_url)
        .filter((url: string | undefined): url is string => url !== undefined && url.trim() !== '')

      // Guardar en cache local y agresivo
      const cacheKey = this.getCacheKey(tagName, aspectRatio, searchParams)
      this.preloadCache.set(cacheKey, {
        tagName,
        imageUrls,
        aspectRatio,
        timestamp: Date.now(),
        loadedCount: 0
      })
      
      // Guardar en caché agresivo para persistencia de 7 días
      cacheImage.set(`wiki_examples_${cacheKey}`, imageUrls, AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.PREVIEW_IMAGES);

      return imageUrls
    } catch (error) {
      return []
    }
  }

  /**
   * Precarga las siguientes N imágenes para una rotación suave
   */
  async preloadNextImages(
    tagName: string,
    currentIndex: number,
    count: number = 3,
    aspectRatio: number | null = null,
    searchParams?: Record<string, any>
  ): Promise<string[]> {
    const allUrls = await this.getWikiExampleUrls(tagName, aspectRatio, searchParams)
    if (allUrls.length === 0) return []

    const nextUrls: string[] = []
    for (let i = 1; i <= count; i++) {
      const nextIndex = (currentIndex + i) % allUrls.length
      nextUrls.push(allUrls[nextIndex])
    }

    return nextUrls
  }

  /**
   * Verifica si las siguientes imágenes están precargadas
   */
  async areNextImagesPreloaded(
    tagName: string,
    currentIndex: number,
    count: number = 3,
    aspectRatio: number | null = null,
    searchParams?: Record<string, any>
  ): Promise<boolean> {
    const nextUrls = await this.preloadNextImages(tagName, currentIndex, count, aspectRatio, searchParams)
    if (nextUrls.length === 0) return true

    // Verificar si todas las imágenes están en el cache del navegador
    return Promise.all(
      nextUrls.map(url => this.isImageCached(url))
    ).then(results => results.every(cached => cached))
  }

  /**
   * Verifica si una imagen está en el cache del navegador
   */
  private async isImageCached(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      const startTime = performance.now()
      
      img.onload = () => {
        const loadTime = performance.now() - startTime
        // Si la imagen se carga muy rápido, probablemente está en cache
        resolve(loadTime < 50)
      }
      
      img.onerror = () => resolve(false)
      
      // Intentar cargar la imagen
      img.src = url
      
      // Timeout para evitar esperar demasiado
      setTimeout(() => resolve(false), 1000)
    })
  }

  /**
   * Precarga imágenes específicas
   */
  async preloadSpecificImages(urls: string[]): Promise<void> {
    const preloadPromises = urls.map(url => this.preloadSingleImage(url))
    await Promise.allSettled(preloadPromises)
  }

  /**
   * Precarga una imagen individual
   */
  private async preloadSingleImage(url: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => resolve()
      img.onerror = () => resolve()
      
      img.src = url
      
      // Timeout de seguridad
      setTimeout(() => resolve(), 5000)
    })
  }

  /**
   * Obtiene estadísticas del cache de precarga
   */
  getPreloadStats(): Record<string, any> {
    const stats = {
      totalCachedTags: this.preloadCache.size,
      totalLoadingPromises: this.loadingPromises.size,
      cacheEntries: Array.from(this.preloadCache.entries()).map(([key, value]) => ({
        key,
        tagName: value.tagName,
        imageCount: value.imageUrls.length,
        loadedCount: value.loadedCount,
        age: Date.now() - value.timestamp
      }))
    }

    return stats
  }

  /**
   * Limpia el cache de precarga
   */
  clearCache(): void {
    this.preloadCache.clear()
    this.loadingPromises.clear()
  }

  /**
   * Limpia el cache para un tag específico
   */
  clearCacheForTag(tagName: string): void {
    const normalizedTagName = tagName.trim().replace(/\s+/g, '_')
    
    // Limpiar cache que coincida con el tag (incluyendo versiones con filtro)
    const keysToDelete = Array.from(this.preloadCache.keys()).filter(key => 
      key.startsWith(normalizedTagName)
    )
    
    keysToDelete.forEach(key => {
      this.preloadCache.delete(key)
    })
    
    // Limpiar promesas de carga pendientes
    const promisesToDelete = Array.from(this.loadingPromises.keys()).filter(key => 
      key.startsWith(normalizedTagName)
    )
    
    promisesToDelete.forEach(key => {
      this.loadingPromises.delete(key)
    })
  }

  /**
   * Genera una clave de cache única
   */
  private getCacheKey(tagName: string, aspectRatio: number | null, searchParams?: Record<string, any>): string {
    const normalizedTagName = tagName.trim().replace(/\s+/g, '_')
    const aspectKey = aspectRatio ? `_${aspectRatio}` : '_any'
    const searchParamKey = searchParams ? `_${JSON.stringify(searchParams)}` : ''
    return `${normalizedTagName}${aspectKey}${searchParamKey}`
  }

  /**
   * Limpia entradas antiguas del cache
   */
  cleanupOldCache(): void {
    const now = Date.now()
    const keysToDelete = Array.from(this.preloadCache.entries())
      .filter(([, value]) => now - value.timestamp > this.maxCacheAge)
      .map(([key]) => key)

    keysToDelete.forEach(key => {
      this.preloadCache.delete(key)
    })
  }
}

// Instancia singleton
const imagePreloadService = new ImagePreloadService()

// Limpiar cache antiguo periódicamente - solo si hay elementos en cache
let cleanupInterval: NodeJS.Timeout | null = null

const startCleanupInterval = () => {
  if (cleanupInterval) return // Ya está iniciado
  
  cleanupInterval = setInterval(() => {
    const stats = imagePreloadService.getPreloadStats()
    if (stats.totalCachedTags === 0) {
      // Si no hay nada en cache, detener el intervalo
      if (cleanupInterval) {
        clearInterval(cleanupInterval)
        cleanupInterval = null
      }
      return
    }
    imagePreloadService.cleanupOldCache()
  }, 60000) // Cada minuto
}

// Iniciar limpieza solo cuando sea necesario
const originalGetWikiExampleUrls = imagePreloadService.getWikiExampleUrls.bind(imagePreloadService)
imagePreloadService.getWikiExampleUrls = function(...args) {
  startCleanupInterval()
  return originalGetWikiExampleUrls(...args)
}

// Limpiar intervalo al cerrar la aplicación
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval)
      cleanupInterval = null
    }
  })
}

export default imagePreloadService