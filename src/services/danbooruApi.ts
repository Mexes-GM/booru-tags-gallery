import axios, { AxiosInstance } from 'axios';
import {
  DanbooruTag,
  DanbooruPost,
  DanbooruWikiPage,
  DanbooruWikiInfo,
  DanbooruPreviewImage
} from '../types';
import { extractFirstParagraph, formatDTextSafe, extractExamplePosts, extractCategorizedExamplePosts } from '../utils/dtextFormatter';
import { PERFORMANCE_CONFIG, scheduleIdleWork } from '../config/performanceConfig';
import { cacheAPI } from '../utils/aggressiveCache';
import { AGGRESSIVE_CACHE_CONFIG } from '../config/aggressiveCacheConfig';
import { apiCache } from '../utils/advancedApiCache';

const DANBOORU_BASE_URL = PERFORMANCE_CONFIG.API_CONFIG.BASE_URL;

// --- Caches y helpers ---
const responseCache = new Map<string, { data: any, headers?: any, timestamp: number }>();
const requestBatcher = new Map<string, Promise<any>>();
const keyCache = new Map<string, string>();

// --- Rate Limiter ---
class RateLimiter {
  maxRequests: number = 10;
  timeWindow: number = 1000;
  requests: number[] = [];
  requestQueue: Array<() => void> = [];
  isProcessing: boolean = false;
  rateLimitInfo: any = null;
  consecutiveErrors: number = 0;
  backoffMultiplier: number = 1;
  _lastCleanup: number = 0;
  _cleanupInterval: number = 100;

  async waitIfNeeded(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.requestQueue.push(resolve);
      setTimeout(() => this.processQueue(), 0);
    });
  }

  updateRateLimitInfo(headers: any) {
    const rateLimitHeader = headers['x-rate-limit'];
    if (!rateLimitHeader) return;
    
    try {
      this.rateLimitInfo = JSON.parse(rateLimitHeader);
      
      // Según la documentación oficial de Danbooru:
      // - Global rate limit: 10 requests per second para lecturas
      // - Burst pool size y recharge rate vienen en el header
      
      if (this.rateLimitInfo.remaining !== undefined) {
        // Ajustar límites según la documentación oficial
        if (this.rateLimitInfo.remaining <= 2) {
          // Crítico: mantener al menos 2 requests disponibles
          this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.5));
        } else if (this.rateLimitInfo.remaining <= 5) {
          // Bajo: reducir requests
          this.maxRequests = Math.max(2, Math.floor(this.maxRequests * 0.8));
        } else if (this.rateLimitInfo.remaining >= 8) {
          // Alto: acercarse al límite oficial de 10
          this.maxRequests = Math.min(10, Math.floor(this.maxRequests * 1.1));
        }
      }
      
      // Resetear contadores de error si tenemos información válida del rate limit
      this.consecutiveErrors = 0;
      this.backoffMultiplier = 1;
    } catch (error) {
  // Failed to parse rate limit header
    }
  }

  handleRateLimitExceeded() {
    this.consecutiveErrors++;
    // Backoff exponencial según la documentación
    this.backoffMultiplier = Math.min(10, Math.pow(2, this.consecutiveErrors));
    this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.5));
    this.requests = [];
  }

  // Nuevo método para manejar códigos de estado HTTP específicos de Danbooru
  handleHttpStatus(status: number, headers?: any) {
    switch (status) {
      case 429: // User Throttled
        this.handleRateLimitExceeded();
  // User throttled by Danbooru API - rate limit exceeded
        break;
        
      case 502: // Bad Gateway - Server overloaded
        this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.7));
  // Danbooru server overloaded - reducing request rate
        break;
        
      case 503: // Service Unavailable - Downbooru
        this.maxRequests = 1; // Mínimo durante downbooru
  // Danbooru service unavailable - minimal request rate
        break;
        
      case 410: // Gone - Pagination limit
  // Pagination limit reached
        break;
        
      case 420: // Invalid Record
      case 422: // Locked
      case 423: // Already Exists
      case 424: // Invalid Parameters
  // Danbooru API error: Request parameters invalid
        break;
        
      default:
        if (status >= 500) {
          // Server errors - reduce rate
          this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.8));
        }
        break;
    }
    
    // Actualizar rate limit info si hay headers
    if (headers) {
      this.updateRateLimitInfo(headers);
    }
  }

  getStats() {
    return {
      maxRequests: this.maxRequests,
      currentRequests: this.requests.length,
      queueLength: this.requestQueue.length,
      rateLimitInfo: this.rateLimitInfo,
      consecutiveErrors: this.consecutiveErrors,
      backoffMultiplier: this.backoffMultiplier
    };
  }

  reset() {
    this.maxRequests = 10;
    this.consecutiveErrors = 0;
    this.backoffMultiplier = 1;
    this.requests = [];
    this.requestQueue = [];
    this.rateLimitInfo = null;
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    this.isProcessing = true;
    try {
      while (this.requestQueue.length > 0) {
        const now = Date.now();
        if (now - this._lastCleanup > this._cleanupInterval) {
          this.requests = this.requests.filter(time => now - time < this.timeWindow);
          this._lastCleanup = now;
        }
        let effectiveLimit = this.maxRequests;
        if (this.rateLimitInfo && this.rateLimitInfo.remaining !== undefined) {
          effectiveLimit = Math.min(this.maxRequests, this.rateLimitInfo.remaining);
        }
        if (this.consecutiveErrors > 0) {
          effectiveLimit = Math.max(1, Math.floor(effectiveLimit / this.backoffMultiplier));
        }
        if (this.requests.length >= effectiveLimit) {
          const oldestRequest = Math.min(...this.requests);
          const baseWaitTime = this.timeWindow - (now - oldestRequest);
          const waitTime = Math.min(10000, baseWaitTime * this.backoffMultiplier + 100);
          await new Promise<void>(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        this.requests.push(now);
        const resolve = this.requestQueue.shift();
        if (resolve) resolve();
        const delay = Math.max(50, 100 * this.backoffMultiplier);
        await new Promise<void>(resolve => setTimeout(resolve, delay));
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

// --- ImageLoadQueue ---
class ImageLoadQueue {
  maxConcurrent: number;
  priorityQueue: any[];
  requestMap: Map<string, any>;
  activeRequests: Set<any>;
  visibleElements: Set<string>;
  isProcessing: boolean;
  intersectionObserver: any;
  performanceMonitor: { totalRequests: number; averageTime: number };

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.priorityQueue = [];
    this.requestMap = new Map();
    this.activeRequests = new Set();
    this.visibleElements = new Set();
    this.isProcessing = false;
    this.intersectionObserver = null;
    this.performanceMonitor = { totalRequests: 0, averageTime: 0 };
    this.initIntersectionObserver();
  }

  initIntersectionObserver() {
    if (typeof IntersectionObserver === 'undefined') return;
    
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const tagName = (entry.target as HTMLElement).dataset.tagName;
          if (!tagName) return;
          
          if (entry.isIntersecting) {
            this.visibleElements.add(tagName);
          } else {
            this.visibleElements.delete(tagName);
          }
          
          this.reprioritizeQueue();
        });
      },
      {
        threshold: PERFORMANCE_CONFIG.IMAGE_LOADING.INTERSECTION_THRESHOLD,
        rootMargin: PERFORMANCE_CONFIG.IMAGE_LOADING.ROOT_MARGIN
      }
    );
  }

  async enqueue(tagName: string, fetchFunction: () => Promise<any>, priority = 0, isVisible = false): Promise<any> {
    const requestKey = tagName;
    
    if (this.requestMap.has(requestKey)) {
      const existingRequest = this.requestMap.get(requestKey);
      if (existingRequest.promise) {
        return existingRequest.promise;
      }
    }

    const finalPriority = this.calculatePriority(priority, isVisible, tagName);

    const request = {
      tagName,
      fetchFunction,
      priority: finalPriority,
      timestamp: Date.now(),
      isVisible,
      resolve: null as any,
      reject: null as any,
      promise: null as any
    };

    const promise = new Promise<void>((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });
    
    request.promise = promise;

    this.priorityQueue.push(request);
    this.requestMap.set(requestKey, request);

    this.sortQueue();
    scheduleIdleWork(() => this.processQueue(), { timeout: PERFORMANCE_CONFIG.IDLE_CALLBACK.TIMEOUT }) as unknown as Promise<void>;

    return promise;
  }

  calculatePriority(basePriority: number, isVisible: boolean, tagName: string): number {
    let priority = basePriority;

    if (isVisible || this.visibleElements.has(tagName)) {
      priority += PERFORMANCE_CONFIG.IMAGE_LOADING.PRIORITY_WEIGHT.VISIBLE;
    }

    const accessCount = this.getAccessCount(tagName);
    priority += accessCount * PERFORMANCE_CONFIG.IMAGE_LOADING.PRIORITY_WEIGHT.ACCESS_COUNT;

    priority += (PERFORMANCE_CONFIG.IMAGE_LOADING.PRIORITY_WEIGHT.BASE - (tagName.charCodeAt(0) % PERFORMANCE_CONFIG.IMAGE_LOADING.PRIORITY_WEIGHT.BASE));

    return priority;
  }

  getAccessCount(tagName: string): number {
    if (typeof localStorage === 'undefined') return 0;
    
    const key = `access_${tagName}`;
    try {
      const count = parseInt(localStorage.getItem(key) || '0', 10);
      localStorage.setItem(key, (count + 1).toString());
      return count;
    } catch (error) {
      // Handle QuotaExceededError or other localStorage errors
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn(`[ImageLoadQueue] localStorage quota exceeded for ${tagName}, clearing old access counts`);
        // Try to clear old access count entries to free up space
        this.clearOldAccessCounts();
        // Return a default count without storing
        return 0;
      }
      console.warn(`[ImageLoadQueue] Error accessing localStorage for ${tagName}:`, error);
      return 0;
    }
  }

  private clearOldAccessCounts(): void {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('access_')) {
          keysToRemove.push(key);
        }
      }
      
      // Remove half of the access count entries to free up space
      const toRemove = keysToRemove.slice(0, Math.ceil(keysToRemove.length / 2));
      toRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // Ignore errors when removing items
        }
      });
      

    } catch (error) {
      console.warn('[ImageLoadQueue] Error clearing old access counts:', error);
    }
  }

  observeElement(element: HTMLElement, tagName: string) {
    if (this.intersectionObserver && element) {
      (element as HTMLElement).dataset.tagName = tagName;
      this.intersectionObserver.observe(element);
    }
  }

  unobserveElement(element: HTMLElement) {
    if (this.intersectionObserver && element) {
      this.intersectionObserver.unobserve(element);
    }
  }

  reprioritizeQueue() {
    this.priorityQueue.forEach(request => {
      request.priority = this.calculatePriority(
        request.priority % 1000,
        this.visibleElements.has(request.tagName),
        request.tagName
      );
    });

    this.sortQueue();
  }

  sortQueue() {
    this.priorityQueue.sort((a, b) => b.priority - a.priority);
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.priorityQueue.length > 0 && this.activeRequests.size < this.maxConcurrent) {
      const request = this.priorityQueue.shift();
      
      if (!request || this.requestMap.get(request.tagName) !== request) {
        continue;
      }

      this.activeRequests.add(request.tagName);
      this.executeRequest(request);
      
      await new Promise<void>(resolve => scheduleIdleWork(() => resolve(), { timeout: PERFORMANCE_CONFIG.IDLE_CALLBACK.TIMEOUT }) as unknown as Promise<void>);
    }

    this.isProcessing = false;
  }

  async executeRequest(request: any) {
    const startTime = Date.now();
    
    try {
      const result = await request.fetchFunction();
      
      const duration = Date.now() - startTime;
      this.updatePerformanceStats(duration);
      
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }

    this.activeRequests.delete(request.tagName);
    this.requestMap.delete(request.tagName);

    await new Promise<void>(resolve => setTimeout(resolve, 200));

    scheduleIdleWork(() => this.processQueue(), { timeout: PERFORMANCE_CONFIG.IDLE_CALLBACK.TIMEOUT }) as unknown as Promise<void>;
  }

  updatePerformanceStats(duration: number) {
    this.performanceMonitor.totalRequests++;
    const total = this.performanceMonitor.totalRequests;
    const avg = this.performanceMonitor.averageTime;
    
    this.performanceMonitor.averageTime = (avg * (total - 1) + duration) / total;
  }

  cancelRequest(tagName: string) {
    const request = this.requestMap.get(tagName);
    if (request) {
      request.reject(new Error('Request cancelado'));
      this.requestMap.delete(tagName);
      
      const index = this.priorityQueue.indexOf(request);
      if (index !== -1) {
        this.priorityQueue.splice(index, 1);
      }
    }
  }

  getStats() {
    return {
      queueLength: this.priorityQueue.length,
      activeRequests: this.activeRequests.size,
      maxConcurrent: this.maxConcurrent,
      visibleElements: this.visibleElements.size,
      totalTracked: this.requestMap.size,
      averageTime: Math.round(this.performanceMonitor.averageTime),
      totalRequests: this.performanceMonitor.totalRequests
    };
  }

  clear() {
    this.priorityQueue.forEach(request => {
      request.reject(new Error('Cola limpiada'));
    });

    this.priorityQueue = [];
    this.requestMap.clear();
    this.activeRequests.clear();
    this.visibleElements.clear();
  }
}

// --- WikiPageManager ---
class WikiPageManager {
  pendingRequests: Map<string, Promise<any>> = new Map();
  cache: Map<string, any> = new Map();
  exampleImagesCache: Map<string, any> = new Map();

  async getWikiPage(tagName: string): Promise<DanbooruWikiInfo | null> {
    const normalizedTagName = tagName.trim().replace(/\s+/g, '_');
    const cacheKey = `wiki_${normalizedTagName}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PERFORMANCE_CONFIG.CACHE.DURATIONS.WIKI) {
      return cached.data;
    }
    
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }
    
    const requestPromise = this.fetchWikiPageInternal(normalizedTagName, cacheKey);
    this.pendingRequests.set(cacheKey, requestPromise);
    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  async fetchWikiPageInternal(normalizedTagName: string, cacheKey: string): Promise<DanbooruWikiInfo | null> {
    try {
      const response = await apiClient.get("/wiki_pages.json", {
        params: {
          "search[title]": normalizedTagName,
          limit: 1
        }
      });
      const wikiPages = response.data;
      if (wikiPages && wikiPages.length > 0) {
        const wikiPage = wikiPages[0];
        const firstParagraph = extractFirstParagraph(wikiPage.body);
        const formattedParagraph = formatDTextSafe(firstParagraph);
        const examplePosts = extractExamplePosts(wikiPage.body);
        const categorizedExamplePosts = extractCategorizedExamplePosts(wikiPage.body);
        const wikiInfo: DanbooruWikiInfo = {
          title: wikiPage.title,
          body: wikiPage.body,
          firstParagraph: firstParagraph,
          formattedFirstParagraph: formattedParagraph,
          categoryName: wikiPage.category_name,
          isDeleted: wikiPage.is_deleted,
          createdAt: wikiPage.created_at,
          updatedAt: wikiPage.updated_at,
          examplePosts: examplePosts,
          categorizedExamplePosts: categorizedExamplePosts
        };
        this.cache.set(cacheKey, {
          data: wikiInfo,
          timestamp: Date.now()
        });
        return wikiInfo;
      }
      this.cache.set(cacheKey, {
        data: null,
        timestamp: Date.now()
      });
      return null;
    } catch {
      return null;
    }
  }

  async getWikiExampleImages(tagName: string, rotationIndex = 0, searchParams?: Record<string, any>): Promise<DanbooruPreviewImage | null> {
    const normalizedTagName = tagName.trim().replace(/\s+/g, '_');
    // Incluir parámetros de búsqueda en la clave de cache para diferenciar entre filtrado y no filtrado
    const paramsKey = searchParams ? JSON.stringify(searchParams) : '';
    const cacheKey = `wiki_examples_${normalizedTagName}_${paramsKey}`;
    

    
    const cached = this.exampleImagesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PERFORMANCE_CONFIG.CACHE.DURATIONS.POSTS) {
      const images = cached.data;
      if (images && images.length > 0) {
        const selectedIndex = rotationIndex % images.length;
        return {
          ...images[selectedIndex],
          rotation_index: selectedIndex,
          total_examples: images.length
        };
      }
      return null;
    }
    const wikiInfo = await this.getWikiPage(tagName);
    if (!wikiInfo || !wikiInfo.examplePosts || wikiInfo.examplePosts.length === 0) {
      return null;
    }
    
    const examplePosts = await this.getPostsByIds(wikiInfo.examplePosts, searchParams);
    
    if (examplePosts.length === 0) {
      return null;
    }
    const processedImages = examplePosts.map(post => ({
      preview_url: post.preview_file_url,
      large_url: post.large_file_url || post.file_url || "",
      post_id: post.id,
      rating: post.rating,
      score: post.score,
      dimensions: {
        width: post.image_width || 0,
        height: post.image_height || 0
      },
      source: 'wiki_example'
    }));
    this.exampleImagesCache.set(cacheKey, {
      data: processedImages,
      timestamp: Date.now()
    });
    const selectedIndex = rotationIndex % processedImages.length;
    
    return {
      ...processedImages[selectedIndex],
      rotation_index: selectedIndex,
      total_examples: processedImages.length
    };
  }

  async getPostsByIds(postIds: number[], searchParams?: Record<string, any>): Promise<DanbooruPost[]> {
    if (!postIds || postIds.length === 0) return [];
    
    // Crear una clave de cache que incluya los parámetros de búsqueda
    const paramsKey = searchParams ? JSON.stringify(searchParams) : '';
    const cacheKey = `posts_by_ids_${postIds.sort().join('_')}_${paramsKey}`;
    
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PERFORMANCE_CONFIG.CACHE.DURATIONS.POSTS) {
      return cached.data;
    }
    
    try {
      const queryParams: any = {
        "tags": `id:${postIds.join(',')}`,
        limit: postIds.length
      };
      
      // Agregar parámetros de búsqueda adicionales si se proporcionan
      if (searchParams) {
        Object.assign(queryParams, searchParams);
      }
      
      const response = await apiClient.get("/posts.json", {
        params: queryParams
      });
      const posts = response.data;
      
      // Filtrar posts por rating en el cliente si se especifican parámetros de búsqueda
      let filteredPosts = posts;
      if (searchParams && searchParams['search[rating]']) {
        const allowedRatings = searchParams['search[rating]'].split(',').map((r: string) => r.trim());
        filteredPosts = posts.filter((post: DanbooruPost) => allowedRatings.includes(post.rating));
      }
      
      responseCache.set(cacheKey, {
        data: filteredPosts,
        timestamp: Date.now()
      });
      return filteredPosts;
    } catch (error) {
  // Error in getPostsByIds
      return [];
    }
  }

  clearCache() {
    this.cache.clear();
    this.exampleImagesCache.clear();
  }

  getCacheStats() {
    return {
      wikiPages: this.cache.size,
      exampleImages: this.exampleImagesCache.size,
      pendingRequests: this.pendingRequests.size
    };
  }
}

// Instancia de rate limiter
const rateLimiter = new RateLimiter();

// Crear instancia de axios optimizada según documentación oficial
const apiClient: AxiosInstance = axios.create({
  baseURL: DANBOORU_BASE_URL,
  timeout: PERFORMANCE_CONFIG.API_CONFIG.TIMEOUT,
  maxRedirects: PERFORMANCE_CONFIG.API_CONFIG.MAX_REDIRECTS,
  headers: PERFORMANCE_CONFIG.API_CONFIG.HEADERS
});

// Interceptors optimizados con caché agresivo
apiClient.interceptors.request.use(async (config) => {
  await rateLimiter.waitIfNeeded();
  if (config.method === 'get') {
    const cacheKey = getCacheKey(config.url || '', config.params);
    
    // Intentar desde caché agresivo primero
    const aggressiveCached = cacheAPI.get<{data: any, headers?: any}>(cacheKey);
    if (aggressiveCached) {
      const response = {
        data: aggressiveCached.data,
        status: 200,
        statusText: 'OK (from aggressive cache)',
        headers: aggressiveCached.headers || {},
        config: config
      };
      config.adapter = () => Promise.resolve(response);
      return config;
    }
    
    // Fallback al caché legacy
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PERFORMANCE_CONFIG.CACHE.DURATIONS.PREVIEW) {
      const response = {
        data: cached.data,
        status: 200,
        statusText: 'OK (from legacy cache)',
        headers: cached.headers || {},
        config: config
      };
      config.adapter = () => Promise.resolve(response);
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  response => {
    rateLimiter.updateRateLimitInfo(response.headers);
    if (response.config.method === 'get') {
      const cacheKey = getCacheKey(response.config.url || '', response.config.params);
      
      // Determinar TTL basado en el endpoint
      let ttl = AGGRESSIVE_CACHE_CONFIG.DEFAULT_TTL;
      const url = response.config.url || '';
      
      if (url.includes('/tags')) {
        ttl = AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.TAGS;
      } else if (url.includes('/posts')) {
        ttl = AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.POSTS;
      } else if (url.includes('/wiki')) {
        ttl = AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.WIKI_PAGES;
      } else if (url.includes('/preview')) {
        ttl = AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.PREVIEW_IMAGES;
      }
      
      // Guardar en caché agresivo
      cacheAPI.set(cacheKey, {
        data: response.data,
        headers: response.headers,
        timestamp: Date.now()
      }, ttl);
      
      // Mantener caché legacy para compatibilidad
      responseCache.set(cacheKey, {
        data: response.data,
        headers: response.headers,
        timestamp: Date.now()
      });
    }
    return response;
  },
  async error => {
    const originalRequest = error.config;
    if (error.response) {
      rateLimiter.updateRateLimitInfo(error.response.headers);
    }
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      if (!originalRequest._retry && originalRequest._retryCount < 2) {
        originalRequest._retry = true;
        originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
        await new Promise<void>(resolve => setTimeout(resolve, 1000 * originalRequest._retryCount));
        return apiClient(originalRequest);
      }
      throw new Error('Servidor temporalmente no disponible');
    }
    if (error.response && !originalRequest._retry) {
      const { status } = error.response;
      
      // Usar nuestro nuevo método para manejar códigos de estado específicos de Danbooru
      rateLimiter.handleHttpStatus(status, error.response.headers);
      
      if ([429, 502, 503].includes(status)) {
        originalRequest._retry = true;
        originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
        if (originalRequest._retryCount <= 3) {
          const delay = Math.min(1000 * Math.pow(2, originalRequest._retryCount - 1), 8000);
          await new Promise<void>(resolve => setTimeout(resolve, delay));
          return apiClient(originalRequest);
        }
      }
    }
    if (error.response) {
      const { status } = error.response;
      const errorMessages: Record<number, string> = {
        400: 'Parámetros de búsqueda inválidos',
        401: 'Error de autenticación',
        403: 'Acceso denegado - permisos insuficientes',
        404: 'Recurso no encontrado',
        410: 'Límite de páginas excedido',
        420: 'Datos inválidos',
        422: 'Recurso bloqueado para modificación',
        423: 'El recurso ya existe',
        424: 'Parámetros inválidos',
        429: 'Demasiadas peticiones, intenta más tarde',
        500: 'Error interno del servidor',
        502: 'Servidor temporalmente no disponible',
        503: 'Servidor temporalmente no disponible'
      };
      throw new Error(errorMessages[status] || `Error de API: ${status}`);
    } else if (error.request) {
      throw new Error('Error de conexión con Danbooru');
    } else {
      throw new Error('Error de configuración');
    }
  }
);

const wikiPageManager = new WikiPageManager();
const imageLoadQueue = new ImageLoadQueue();

class DanbooruApiService {
  imageLoadQueue: ImageLoadQueue;
  wikiPageManager: WikiPageManager;
  rotationCounters: Map<string, number>;

  constructor() {
    this.imageLoadQueue = imageLoadQueue;
    this.wikiPageManager = wikiPageManager;
    this.rotationCounters = new Map();
  }

  async searchTags(params: Record<string, any> = {}): Promise<DanbooruTag[]> {
    const cacheKey = `tags_${JSON.stringify(params)}`;
    const cacheTags = ['tags', 'search'];
    
    return apiCache.get(cacheKey, async () => {
      const validatedParams: any = {};
      
      if (params.limit) {
        const limit = Math.min(params.limit, PERFORMANCE_CONFIG.SEARCH.API_LIMITS.OTHER_MAX_LIMIT);
        if (limit > 0) validatedParams.limit = limit;
      } else {
        validatedParams.limit = PERFORMANCE_CONFIG.SEARCH.API_LIMITS.DEFAULT_LIMIT;
      }
      
      if (params.page) {
        if (typeof params.page === 'string' && (params.page.startsWith('b') || params.page.startsWith('a') || /^\d+$/.test(params.page))) {
          validatedParams.page = params.page;
        }
      }
      
      if (params.name_matches) {
        validatedParams.name_matches = escapeWildcards(params.name_matches);
      }
      
      if (params.post_count) {
        if (validateNumericRange(params.post_count)) {
          validatedParams.post_count = params.post_count;
        }
      }
      
      if (params.created_at) {
        if (validateDateRange(params.created_at)) {
          validatedParams.created_at = params.created_at;
        }
      }
      
      if (params.updated_at) {
        if (validateDateRange(params.updated_at)) {
          validatedParams.updated_at = params.updated_at;
        }
      }
      
      if (params.category !== undefined) {
        if (validateNumericRange(params.category)) {
          validatedParams.category = params.category;
        }
      }
      
      if (params.order) {
        validatedParams.order = params.order;
      }
      
      const searchParams = {
        ...validatedParams,
        ...params
      };

      const queryParams: any = {};
      Object.keys(searchParams).forEach(key => {
        if (key === "name_matches" || key === "order" || key === "category" || key === "post_count" || key === "created_at" || key === "updated_at") {
          const value = (key === "name_matches") ? escapeWildcards(searchParams[key]) : searchParams[key];
          queryParams[`search[${key}]`] = value;
        } else if (key === "limit" || key === "page") {
          queryParams[key] = searchParams[key];
        } else {
          queryParams[`search[${key}]`] = searchParams[key];
        }
      });

      const response = await apiClient.get("/tags.json", { params: queryParams });
      return response.data;
    }, { tags: cacheTags });
  }

  async getTags(tagNames: string | string[]): Promise<DanbooruTag[]> {
    const names = Array.isArray(tagNames) ? tagNames : [tagNames];
    
    if (names.length === 0) return [];
    if (names.length === 1) {
      const result = await this.getTag(names[0]);
      return result ? [result] : [];
    }

    const response = await apiClient.get("/tags.json", {
      params: {
        "search[name]": names.join(","),
        limit: Math.min(names.length, 1000)
      }
    });
    return response.data;
  }

  async getTag(tagName: string): Promise<DanbooruTag | null> {
    const cacheKey = `tag_${tagName}`;
    const cacheTags = ['tags', `tag:${tagName}`];
    
    return apiCache.get(cacheKey, async () => {
      const response = await apiClient.get("/tags.json", {
        params: {
          "search[name]": tagName,
          limit: 1
        }
      });
      return response.data[0] || null;
    }, { tags: cacheTags });
  }

  async searchWikiPages(params: Record<string, any> = {}): Promise<DanbooruWikiPage[]> {
    const cacheKey = `wiki_${JSON.stringify(params)}`;
    const cacheTags = ['wiki', 'search'];
    
    return apiCache.get(cacheKey, async () => {
      const queryParams: any = {};
      
      if (params.title) {
        if (params.title.includes('*') || params.exact === false) {
          queryParams["search[title_matches]"] = escapeWildcards(params.title);
        } else {
          queryParams["search[title]"] = params.title;
        }
      }
      if (params.body) {
        queryParams["search[body_matches]"] = params.body;
      }
      if (params.limit) {
        queryParams.limit = Math.min(params.limit, 1000);
      }
      if (params.page) {
        queryParams.page = params.page;
      }
      if (params.order) {
        queryParams.order = params.order;
      }

      const response = await apiClient.get("/wiki_pages.json", { params: queryParams });
      return response.data;
    }, { tags: cacheTags });
  }

  async searchPosts(params: Record<string, any> = {}): Promise<DanbooruPost[]> {
    const cacheKey = `posts_${JSON.stringify(params)}`;
    const cacheTags = ['posts', 'search'];
    
    return apiCache.get(cacheKey, async () => {
      try {
        const queryParams: any = {
          limit: Math.min(params.limit || PERFORMANCE_CONFIG.SEARCH.API_LIMITS.DEFAULT_LIMIT, PERFORMANCE_CONFIG.SEARCH.API_LIMITS.POSTS_MAX_LIMIT)
        };

      if (params.tags) {
        queryParams.tags = params.tags;
      }

      if (params.page) {
        if (typeof params.page === 'string' && (params.page.startsWith('b') || params.page.startsWith('a'))) {
          queryParams.page = params.page;
        } else {
          queryParams.page = params.page;
        }
      }

      if (params.order) {
        queryParams.order = params.order;
      }

      const searchParams = ['rating', 'status', 'file_ext', 'source', 'uploader_id', 'approver_id', 'commenter_id', 'noter_id', 'artcomm_id', 'pool_id', 'favgroup_id', 'updater_id', 'delreason_id', 'parent_id', 'child_id', 'pixiv_id', 'has_children', 'has_active_children', 'has_large', 'has_visible_children', 'is_bounty', 'is_deleted', 'is_flagged', 'is_pending', 'is_rating_locked', 'is_note_locked', 'is_status_locked', 'is_comment_disabled', 'is_shown_in_index', 'is_held', 'is_sequence', 'is_approval_required', 'is_upload_limited', 'is_comment_limited', 'is_note_limited', 'is_artcomm_limited', 'is_pool_limited', 'is_fav_limited', 'is_vote_limited', 'is_rating_limited', 'is_status_limited'];
      
      searchParams.forEach(param => {
        if (params[param] !== undefined) {
          queryParams[`search[${param}]`] = params[param];
        }
      });

      const response = await apiClient.get("/posts.json", { 
        params: queryParams
      });
      
        return response.data;
      } catch {
        return [];
      }
    }, { tags: cacheTags });
  }

  async getPostsForTag(tagName: string, limit = 15, order = "score"): Promise<DanbooruPost[]> {
    try {
      const posts = await this.searchPosts({
        tags: tagName,
        limit: Math.min(limit, PERFORMANCE_CONFIG.SEARCH.API_LIMITS.POSTS_MAX_LIMIT),
        order: order
      });

      // Siempre filtrar por rating 'g' si el tagName incluye 'rating:g'
      // Esto es una validación adicional en caso de que la API no respete el filtro
      if (tagName.includes('rating:g')) {
        const filteredPosts = posts.filter(post => post.rating === 'g');
        return filteredPosts;
      }

      return posts;
    } catch (error) {
      // Error in getPostsForTag
      return [];
    }
  }

  async getPostById(postId: number): Promise<DanbooruPost | null> {
    const batchKey = `post_${postId}`;
    
    return batchRequest(batchKey, async () => {
      try {
        const response = await apiClient.get(`/posts/${postId}.json`);
        return response.data;
      } catch (error) {
        // Error in getPostById
        return null;
      }
    });
  }

  async getPostsByIds(postIds: number[], searchParams?: Record<string, any>): Promise<DanbooruPost[]> {
    return this.wikiPageManager.getPostsByIds(postIds, searchParams);
  }

  async getTagPreviewImage(
    tagName: string,
    preferredRatio: number | null = null,
    element: HTMLElement | null = null,
    priority = 0,
    filteredTagName: string | null = null
  ): Promise<DanbooruPreviewImage | null> {
    const searchTagName = filteredTagName || tagName;
    
    // Detectar si el filtro NSFW está habilitado basándose en el tagName
    const isNSFWFilterEnabled = searchTagName.includes('rating:g');
    

    
    // Incluir el estado del filtro NSFW en la clave de caché para evitar inconsistencias
    const nsfwState = isNSFWFilterEnabled ? 'nsfw_filtered' : 'nsfw_unfiltered';
    const cacheKey = `preview_${searchTagName}_${preferredRatio || 'default'}_${nsfwState}`;
    

    
    const cached = responseCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < PERFORMANCE_CONFIG.CACHE.DURATIONS.PREVIEW) {

      // Validar que la imagen en caché respete el filtro NSFW actual
      if (isNSFWFilterEnabled && cached.data && cached.data.rating !== 'g') {

        responseCache.delete(cacheKey);
      } else {

        return cached.data;
      }
    }

    const isVisible = element ? this.isElementVisible(element) : false;
    
    if (element) {
      this.imageLoadQueue.observeElement(element, tagName);
    }

    const fetchFunction = async () => {

      const result = await this.fetchTagPreviewImageInternal(searchTagName, preferredRatio);
      

      
      // Validar que la imagen obtenida respete el filtro NSFW
      if (result && isNSFWFilterEnabled && result.rating !== 'g') {

        return null;
      }
      
      if (result) {

        responseCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      } else {

      }
      
      return result;
    };

    return await this.imageLoadQueue.enqueue(searchTagName, fetchFunction, priority, isVisible);
  }

  async fetchTagPreviewImageInternal(tagName: string, preferredRatio: number | null = null): Promise<DanbooruPreviewImage | null> {
    try {
      const originalTagName = tagName.includes('rating:g') || tagName.includes('-video') 
        ? tagName.split(' ')[0] 
        : tagName;
      
      // Detectar si el filtro NSFW está habilitado basándose en el tagName
      const isNSFWFilterEnabled = tagName.includes('rating:g');
      const searchParams = isNSFWFilterEnabled ? { "search[rating]": "g" } : undefined;
      

      
      const rotationIndex = this.getRotationIndex(originalTagName, 10);

      
      const wikiExample = await this.getWikiExamplePreview(originalTagName, rotationIndex, searchParams);

      
      if (wikiExample) {
        // Validar que la imagen de ejemplo respete el filtro NSFW
        if (isNSFWFilterEnabled && wikiExample.rating !== 'g') {

          return null;
        } else {

          return wikiExample;
        }
      }
      

      const posts = await this.getPostsForTag(tagName, 5, "score");
      

      
      if (posts.length === 0) {

        return null;
      }

      // Filtrar posts por rating si el filtro NSFW está habilitado
      let validPosts = posts.filter(post => 
        post && (post.large_file_url || post.file_url) && post.preview_file_url
      );
      

      
      if (isNSFWFilterEnabled) {
        validPosts = validPosts.filter(post => post.rating === 'g');
      }

      if (validPosts.length === 0) {

        return null;
      }

      let selectedPost = validPosts[0];
      
      if (preferredRatio) {
        const ratioMatch = validPosts.find(post => {
          if (!post.image_width || !post.image_height) return false;
          const postRatio = post.image_width / post.image_height;
          return Math.abs(postRatio - preferredRatio) < 0.1;
        });
        
        if (ratioMatch) {
          selectedPost = ratioMatch;
        }
      }
      
      const result = {
        preview_url: selectedPost.preview_file_url,
        large_url: selectedPost.large_file_url || selectedPost.file_url || "",
        post_id: selectedPost.id,
        rating: selectedPost.rating,
        score: selectedPost.score,
        dimensions: {
          width: selectedPost.image_width || 0,
          height: selectedPost.image_height || 0
        },
        source: 'search',
        rotation_index: 0,
        total_examples: 1
      };
      
      // Validación final: asegurar que la imagen respete el filtro NSFW
      if (isNSFWFilterEnabled && result.rating !== 'g') {
        return null;
      }
      
      return result;
    } catch (error) {
      // Error in fetchTagPreviewImageInternal
      return null;
    }
  }

  async getTagExamplePosts(tagName: string, limit = 10, ratingParams?: { allowedRatings?: string[] }): Promise<DanbooruPost[]> {
    try {
      let tags = tagName;
      // Si el filtro NSFW está activo, agregar 'rating:g' al string de tags
      if (ratingParams?.allowedRatings && ratingParams.allowedRatings.length === 1 && ratingParams.allowedRatings[0] === 'g') {
        tags = `${tagName} rating:g`;
      }
      const searchParams: any = {
        tags,
        limit: Math.min(limit * 4, PERFORMANCE_CONFIG.SEARCH.API_LIMITS.POSTS_MAX_LIMIT), // Pedir más para filtrar después
        order: "score"
      };



      const posts = await this.searchPosts(searchParams);

      // Filtrar manualmente si el filtro NSFW está activo (por si acaso)
      if (ratingParams?.allowedRatings && ratingParams.allowedRatings.length > 0) {
        const allowed = ratingParams.allowedRatings;
        return posts.filter(post => allowed.includes(post.rating))
          .filter(post => post && post.preview_file_url && (post.large_file_url || post.file_url) && post.image_width && post.image_height)
          .slice(0, limit);
      }

      // Si no hay filtro, solo filtrar por imágenes válidas
      return posts.filter(post => post && post.preview_file_url && (post.large_file_url || post.file_url) && post.image_width && post.image_height).slice(0, limit);
    } catch (error) {
      // Error in getTagExamplePosts
      return [];
    }
  }

  isElementVisible(element: HTMLElement): boolean {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    return (
      rect.top >= -100 &&
      rect.left >= -100 &&
      rect.bottom <= windowHeight + 100 &&
      rect.right <= windowWidth + 100
    );
  }

  getRotationIndex(tagName: string, totalImages: number): number {
    if (totalImages <= 1) return 0;
    
    if (!this.rotationCounters.has(tagName)) {
      this.rotationCounters.set(tagName, 0);
    }
    
    const currentCount = this.rotationCounters.get(tagName)!;
    const result = currentCount % totalImages;
    
    this.rotationCounters.set(tagName, currentCount + 1);
    
    return result;
  }

  resetRotationCounter(tagName: string): void {
    if (tagName) {
      this.rotationCounters.delete(tagName);
    } else {
      this.rotationCounters.clear();
    }
  }

  simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async getTagWikiInfo(tagName: string): Promise<DanbooruWikiInfo | null> {
    return this.wikiPageManager.getWikiPage(tagName);
  }

  async getWikiExamplePreview(
    tagName: string,
    rotationIndex = 0,
    searchParams?: Record<string, any>
  ): Promise<DanbooruPreviewImage | null> {
    return this.wikiPageManager.getWikiExampleImages(tagName, rotationIndex, searchParams);
  }

  async getRelatedTags(tagName: string): Promise<Array<[string, number]>> {
    try {
      const response = await apiClient.get(`/related_tag.json?query=${encodeURIComponent(tagName)}`);
      if (Array.isArray(response.data)) {
        return response.data.map((item: any) => [item.name, item.count || 0]);
      }
      return [];
    } catch {
      return [];
    }
  }

  async getArtist(tagName: string): Promise<any> {
    try {
      const response = await apiClient.get(`/artists.json?search[name]=${encodeURIComponent(tagName)}&limit=1`);
      return Array.isArray(response.data) && response.data.length > 0 ? response.data[0] : null;
    } catch {
      return null;
    }
  }

  clearCache(): void {
    responseCache.clear();
    requestBatcher.clear();
    keyCache.clear();
  }

  clearPreviewCache(): void {
    // Limpiar cache de previews basado en patrones de URL
    const previewKeys = Array.from(responseCache.keys()).filter(key => 
      key.includes('/posts.json') && key.includes('tags')
    );
    previewKeys.forEach(key => responseCache.delete(key));
  }

  clearPostsCache(): void {
    // Limpiar cache de posts
    const postKeys = Array.from(responseCache.keys()).filter(key => 
      key.includes('/posts.json')
    );
    postKeys.forEach(key => responseCache.delete(key));
  }

  clearImageLoadQueue(): void {
    this.imageLoadQueue.clear();
  }

  clearAllCacheForTag(tagName: string): void {
    if (!tagName) return;
    
    // Limpiar cache de response que contenga el tag
    const tagKeys = Array.from(responseCache.keys()).filter(key => 
      key.includes(encodeURIComponent(tagName)) || key.includes(tagName.replace(/\s+/g, '_'))
    );
    tagKeys.forEach(key => responseCache.delete(key));
    
    // Limpiar cache de previews específicamente (incluyendo versiones con filtro NSFW)
    const previewKeys = Array.from(responseCache.keys()).filter(key => 
      key.startsWith(`preview_${tagName}`) || 
      key.startsWith(`preview_${tagName.replace(/\s+/g, '_')}`) ||
      key.includes(`preview_${tagName}_`) ||
      key.includes(`preview_${tagName.replace(/\s+/g, '_')}_`)
    );
    previewKeys.forEach(key => {
      responseCache.delete(key);
    });
    
    // Limpiar cache de wiki para el tag
    this.wikiPageManager.cache.delete(tagName);
    
    // Limpiar cache de imágenes de ejemplo (incluyendo versiones con filtro NSFW)
    const exampleKeys = Array.from(this.wikiPageManager.exampleImagesCache.keys()).filter(key => 
      key.startsWith(`wiki_examples_${tagName.replace(/\s+/g, '_')}`)
    );
    exampleKeys.forEach(key => this.wikiPageManager.exampleImagesCache.delete(key));
    
    // Limpiar cache de image load queue
    this.imageLoadQueue.cancelRequest(tagName);
  }

  clearImageLoadQueueForTag(tagName: string): void {
    this.imageLoadQueue.cancelRequest(tagName);
  }

  clearWikiPageCache(): void {
    this.wikiPageManager.clearCache();
  }

  clearFilterChangeCache(): void {
    // Limpiar cache relacionado con filtros NSFW
    const filterKeys = Array.from(responseCache.keys()).filter(key => 
      key.includes('rating:') || 
      key.includes('rating=g') || 
      key.includes('nsfw_filtered') || 
      key.includes('nsfw_unfiltered') ||
      key.includes('preview_') || // Limpiar todos los previews ya que pueden estar afectados por filtros
      key.includes('large_file_url') || // Limpiar URLs de imágenes grandes
      key.includes('file_url') || // Limpiar URLs de imágenes
      key.includes('post_id') || // Limpiar posts que pueden contener imágenes NSFW
      key.includes('tag_') || // Limpiar cualquier caché relacionada con tags
      key.includes('posts') // Limpiar cualquier caché de posts
    );
    filterKeys.forEach(key => {
      responseCache.delete(key);
    });
    
    // Limpiar todas las claves de caché
    keyCache.clear();
    
    // Limpiar cache de imágenes de ejemplo de wiki que pueden estar afectadas por filtros
    this.wikiPageManager.exampleImagesCache.clear();
    
    // Limpiar cache de image load queue
    this.imageLoadQueue.clear();
    
    // Cancelar todas las solicitudes pendientes
    requestBatcher.clear();
    
    // Notificar a la consola para depuración
    
  }

  getCacheStats(): Record<string, any> {
    return {
      responseCache: responseCache.size,
      requestBatcher: requestBatcher.size,
      keyCache: keyCache.size,
      imageLoadQueue: this.imageLoadQueue.getStats(),
      wikiPageManager: this.wikiPageManager.getCacheStats()
    };
  }

  getWikiPageCacheStats(): Record<string, any> {
    return this.wikiPageManager.getCacheStats();
  }

  getImageLoadQueueStats(): Record<string, any> {
    return this.imageLoadQueue.getStats();
  }

  getRateLimitStats(): Record<string, any> {
    return rateLimiter.getStats();
  }

  resetRateLimiter(): void {
    rateLimiter.reset();
  }

  getWikiPageManager(): WikiPageManager {
    return this.wikiPageManager;
  }
}

const danbooruApi = new DanbooruApiService();

export default danbooruApi;

const batchRequest = (key: string, requestFn: () => Promise<any>): Promise<any> => {
  if (requestBatcher.has(key)) return requestBatcher.get(key)!;
  const promise = new Promise<any>((resolve, reject) => {
    setTimeout(async () => {
      try {
        const result = await requestFn();
        resolve(result);
        requestBatcher.delete(key);
      } catch (error) {
        reject(error);
        requestBatcher.delete(key);
      }
    }, 50);
  });
  requestBatcher.set(key, promise);
  return promise;
};

const escapeWildcards = (value: any): any => {
  if (typeof value === 'string') {
    return value.replace(/\\/g, '\\\\').replace(/\*/g, '\\*');
  }
  return value;
};

const validateNumericRange = (value: any): boolean => {
  if (typeof value === 'string') {
    const rangePattern = /^(>|>=|<|<=)?(\d+)(\.\.(\d+))?$|^(\d+(,\d+)*)$/;
    return rangePattern.test(value);
  }
  return typeof value === 'number' || value === null || value === undefined;
};

const validateDateRange = (value: any): boolean => {
  if (typeof value === 'string') {
    const datePattern = /^(>|>=|<|<=)?(\d{4}-\d{2}-\d{2})(\.\.(\d{4}-\d{2}-\d{2}))?$|^(\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})*)$/;
    return datePattern.test(value);
  }
  return value instanceof Date || value === null || value === undefined;
};

const getCacheKey = (url: string, params: any): string => {
  if (!params || Object.keys(params).length === 0) return url;
  const paramsStr = JSON.stringify(params);
  const cacheKey = `${url}:${paramsStr}`;
  if (keyCache.has(cacheKey)) return keyCache.get(cacheKey)!;
  const keys = Object.keys(params);
  if (keys.length <= 2) {
    const result = `${url}?${paramsStr}`;
    keyCache.set(cacheKey, result);
    return result;
  }
  const sortedParams = keys.sort().reduce((result: any, key) => {
    result[key] = params[key];
    return result;
  }, {});
  const result = `${url}?${JSON.stringify(sortedParams)}`;
  keyCache.set(cacheKey, result);
  return result;
};