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
import { TieredCache } from './danbooruApi/tieredCache';
import { KeyedBatcher } from './danbooruApi/keyedBatcher';
import { migrateLegacyCacheStorage } from './danbooruApi/legacyStorageMigration';

const DANBOORU_BASE_URL = PERFORMANCE_CONFIG.API_CONFIG.BASE_URL;

migrateLegacyCacheStorage();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// --- Field selection (`only=`) -------------------------------------------
// Card previews / example rotation only need these post fields.
const LITE_POST_FIELDS = 'id,rating,score,image_width,image_height,file_ext,preview_file_url,large_file_url,file_url';
// Wiki fields used by cards, tag groups and the tag modal.
const WIKI_FIELDS = 'id,title,body,other_names,is_deleted,created_at,updated_at';
const NON_IMAGE_EXTS = new Set(['mp4', 'webm', 'zip', 'swf']);

// --- Batching configuration ----------------------------------------------
const BATCH_WINDOW_MS = 50;
const WIKI_BATCH_SIZE = 50;
const POST_ID_BATCH_SIZE = 100;

// --- Caches ---------------------------------------------------------------
// Raw entities are persisted (IndexedDB) and are independent of the NSFW
// filter; filtering happens client-side on read, so toggling the filter or
// opening a modal never needs to refetch them.
type RawWikiPage = Pick<DanbooruWikiPage, 'id' | 'title' | 'body' | 'other_names' | 'is_deleted' | 'created_at' | 'updated_at'> & { category_name?: string };
type LitePost = Pick<DanbooruPost, 'id' | 'rating' | 'score' | 'image_width' | 'image_height' | 'file_ext' | 'preview_file_url' | 'large_file_url' | 'file_url'>;

const wikiStore = new TieredCache({ namespace: 'wiki', maxMemoryEntries: 1500, defaultTtl: 7 * DAY, persist: true });
const litePostStore = new TieredCache({ namespace: 'post', maxMemoryEntries: 3000, defaultTtl: 3 * DAY, persist: true });
// Full post objects (modal, tooltips) are larger: keep them in memory only.
const fullPostStore = new TieredCache({ namespace: 'post_full', maxMemoryEntries: 400, defaultTtl: 30 * MINUTE, persist: false });
// Generic GET responses (tags, wiki search, related tags, per-tag preview searches).
const httpCache = new TieredCache({ namespace: 'http', maxMemoryEntries: 400, defaultTtl: HOUR, persist: true });
// Derived values, cheap to recompute from the caches above.
const previewCache = new TieredCache({ namespace: 'preview', maxMemoryEntries: 1500, defaultTtl: DAY, persist: false });
const wikiInfoCache = new Map<string, DanbooruWikiInfo | null>();

const inflightGets = new Map<string, Promise<any>>();

const normalizeTitle = (tagName: string) => tagName.trim().replace(/\s+/g, '_').toLowerCase();

// --- Rate Limiter ---
class RateLimiter {
  maxRequests: number = PERFORMANCE_CONFIG.RATE_LIMIT.MAX_REQUESTS;
  timeWindow: number = PERFORMANCE_CONFIG.RATE_LIMIT.TIME_WINDOW;
  requests: number[] = [];
  requestQueue: Array<() => void> = [];
  isProcessing: boolean = false;
  rateLimitInfo: any = null;
  consecutiveErrors: number = 0;
  backoffMultiplier: number = 1;
  /** Hard pause (epoch ms) requested by a Retry-After header. */
  pausedUntil: number = 0;
  totalRequests: number = 0;

  async waitIfNeeded(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.requestQueue.push(resolve);
      void this.processQueue();
    });
  }

  updateRateLimitInfo(headers: any) {
    const rateLimitHeader = headers?.['x-rate-limit'];
    if (!rateLimitHeader) return;
    try {
      this.rateLimitInfo = JSON.parse(rateLimitHeader);
      if (this.rateLimitInfo.remaining !== undefined) {
        if (this.rateLimitInfo.remaining <= 2) {
          this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.5));
        } else if (this.rateLimitInfo.remaining <= 5) {
          this.maxRequests = Math.max(2, Math.floor(this.maxRequests * 0.8));
        } else if (this.rateLimitInfo.remaining >= 8) {
          this.maxRequests = Math.min(10, Math.ceil(this.maxRequests * 1.1));
        }
      }
    } catch {
      // Failed to parse rate limit header
    }
  }

  onSuccess() {
    if (this.consecutiveErrors > 0) {
      this.consecutiveErrors = 0;
      this.backoffMultiplier = 1;
    }
  }

  handleRateLimitExceeded(retryAfterMs?: number) {
    this.consecutiveErrors++;
    this.backoffMultiplier = Math.min(10, Math.pow(2, this.consecutiveErrors));
    this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.5));
    const pause = retryAfterMs ?? Math.min(10000, 1000 * this.backoffMultiplier);
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + pause);
  }

  handleHttpStatus(status: number, headers?: any) {
    switch (status) {
      case 429: {
        const retryAfter = Number(headers?.['retry-after']);
        this.handleRateLimitExceeded(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
        break;
      }
      case 502:
        this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.7));
        break;
      case 503:
        this.maxRequests = 1;
        break;
      default:
        if (status >= 500) {
          this.maxRequests = Math.max(1, Math.floor(this.maxRequests * 0.8));
        }
        break;
    }
    if (headers) this.updateRateLimitInfo(headers);
  }

  getStats() {
    return {
      maxRequests: this.maxRequests,
      currentRequests: this.requests.length,
      queueLength: this.requestQueue.length,
      rateLimitInfo: this.rateLimitInfo,
      consecutiveErrors: this.consecutiveErrors,
      backoffMultiplier: this.backoffMultiplier,
      totalRequests: this.totalRequests
    };
  }

  reset() {
    this.maxRequests = PERFORMANCE_CONFIG.RATE_LIMIT.MAX_REQUESTS;
    this.consecutiveErrors = 0;
    this.backoffMultiplier = 1;
    this.requests = [];
    this.rateLimitInfo = null;
    this.pausedUntil = 0;
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    this.isProcessing = true;
    try {
      while (this.requestQueue.length > 0) {
        const now = Date.now();
        if (this.pausedUntil > now) {
          await new Promise<void>(resolve => setTimeout(resolve, this.pausedUntil - now));
          continue;
        }
        this.requests = this.requests.filter(time => now - time < this.timeWindow);
        let effectiveLimit = this.maxRequests;
        if (this.rateLimitInfo && this.rateLimitInfo.remaining !== undefined) {
          effectiveLimit = Math.max(1, Math.min(this.maxRequests, this.rateLimitInfo.remaining));
        }
        if (this.consecutiveErrors > 0) {
          effectiveLimit = Math.max(1, Math.floor(effectiveLimit / this.backoffMultiplier));
        }
        if (this.requests.length >= effectiveLimit) {
          const oldestRequest = this.requests[0];
          const waitTime = Math.max(10, this.timeWindow - (now - oldestRequest)) + 10;
          await new Promise<void>(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        this.requests.push(now);
        this.totalRequests++;
        const resolve = this.requestQueue.shift();
        if (resolve) resolve();
        // Spread requests evenly across the window instead of bursting.
        const spacing = Math.max(50, Math.floor(this.timeWindow / Math.max(1, effectiveLimit)));
        await new Promise<void>(resolve => setTimeout(resolve, spacing));
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

// --- ImageLoadQueue ---
// Prioritises card preview work. Network concurrency is governed by the
// RateLimiter, so this queue allows enough parallelism for the wiki/post
// batchers to coalesce lookups from many cards into single requests.
class ImageLoadQueue {
  maxConcurrent: number;
  priorityQueue: any[];
  requestMap: Map<string, any>;
  activeRequests: Set<any>;
  visibleElements: Set<string>;
  isProcessing: boolean;
  intersectionObserver: any;
  performanceMonitor: { totalRequests: number; averageTime: number };
  /** In-memory access counts (used for prioritisation only). */
  accessCounts: Map<string, number>;

  constructor(maxConcurrent = 16) {
    this.maxConcurrent = maxConcurrent;
    this.priorityQueue = [];
    this.requestMap = new Map();
    this.activeRequests = new Set();
    this.visibleElements = new Set();
    this.isProcessing = false;
    this.intersectionObserver = null;
    this.performanceMonitor = { totalRequests: 0, averageTime: 0 };
    this.accessCounts = new Map();
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
        });
        this.reprioritizeQueue();
      },
      {
        threshold: PERFORMANCE_CONFIG.IMAGE_LOADING.INTERSECTION_THRESHOLD,
        rootMargin: PERFORMANCE_CONFIG.IMAGE_LOADING.ROOT_MARGIN
      }
    );
  }

  async enqueue(tagName: string, fetchFunction: () => Promise<any>, priority = 0, isVisible = false): Promise<any> {
    const existingRequest = this.requestMap.get(tagName);
    if (existingRequest?.promise) {
      return existingRequest.promise;
    }

    this.accessCounts.set(tagName, (this.accessCounts.get(tagName) || 0) + 1);
    if (this.accessCounts.size > 5000) this.accessCounts.clear();

    const request = {
      tagName,
      fetchFunction,
      basePriority: priority,
      priority: this.calculatePriority(priority, isVisible, tagName),
      timestamp: Date.now(),
      isVisible,
      resolve: null as any,
      reject: null as any,
      promise: null as any
    };

    request.promise = new Promise<any>((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });

    this.priorityQueue.push(request);
    this.requestMap.set(tagName, request);
    this.sortQueue();
    void this.processQueue();

    return request.promise;
  }

  calculatePriority(basePriority: number, isVisible: boolean, tagName: string): number {
    let priority = basePriority;
    if (isVisible || this.visibleElements.has(tagName)) {
      priority += PERFORMANCE_CONFIG.IMAGE_LOADING.PRIORITY_WEIGHT.VISIBLE;
    }
    priority += this.getAccessCount(tagName) * PERFORMANCE_CONFIG.IMAGE_LOADING.PRIORITY_WEIGHT.ACCESS_COUNT;
    return priority;
  }

  getAccessCount(tagName: string): number {
    return this.accessCounts.get(tagName) || 0;
  }

  observeElement(element: HTMLElement, tagName: string) {
    if (this.intersectionObserver && element) {
      element.dataset.tagName = tagName;
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
        request.basePriority,
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
    try {
      while (this.priorityQueue.length > 0 && this.activeRequests.size < this.maxConcurrent) {
        const request = this.priorityQueue.shift();
        if (!request || this.requestMap.get(request.tagName) !== request) continue;
        this.activeRequests.add(request.tagName);
        void this.executeRequest(request);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async executeRequest(request: any) {
    const startTime = Date.now();
    try {
      const result = await request.fetchFunction();
      this.updatePerformanceStats(Date.now() - startTime);
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }
    this.activeRequests.delete(request.tagName);
    if (this.requestMap.get(request.tagName) === request) {
      this.requestMap.delete(request.tagName);
    }
    scheduleIdleWork(() => this.processQueue(), { timeout: PERFORMANCE_CONFIG.IDLE_CALLBACK.TIMEOUT });
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
      const index = this.priorityQueue.indexOf(request);
      // Only cancel work that has not started; running fetches finish and
      // populate the shared caches.
      if (index !== -1) {
        this.priorityQueue.splice(index, 1);
        request.reject(new Error('Request cancelado'));
        this.requestMap.delete(tagName);
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
      this.requestMap.delete(request.tagName);
    });
    this.priorityQueue = [];
    this.visibleElements.clear();
  }
}

// --- Axios client ---------------------------------------------------------
const rateLimiter = new RateLimiter();

const apiClient: AxiosInstance = axios.create({
  baseURL: DANBOORU_BASE_URL,
  timeout: PERFORMANCE_CONFIG.API_CONFIG.TIMEOUT,
  maxRedirects: PERFORMANCE_CONFIG.API_CONFIG.MAX_REDIRECTS,
  headers: PERFORMANCE_CONFIG.API_CONFIG.HEADERS
});

// Every request that reaches axios goes over the network, so every one of
// them (including retries) waits for a rate-limiter slot. Cache hits never
// get here (see cachedGet) and therefore never consume a slot.
apiClient.interceptors.request.use(async (config) => {
  await rateLimiter.waitIfNeeded();
  return config;
});

const MAX_RETRIES = 3;

apiClient.interceptors.response.use(
  response => {
    rateLimiter.updateRateLimitInfo(response.headers);
    rateLimiter.onSuccess();
    return response;
  },
  async error => {
    const originalRequest = error.config || {};
    const retryCount: number = originalRequest._retryCount || 0;

    if (error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'))) {
      if (retryCount < 2) {
        originalRequest._retryCount = retryCount + 1;
        await new Promise<void>(resolve => setTimeout(resolve, 1000 * originalRequest._retryCount));
        return apiClient(originalRequest);
      }
      throw new Error('Servidor temporalmente no disponible');
    }

    if (error.response) {
      const { status, headers } = error.response;
      rateLimiter.handleHttpStatus(status, headers);

      if ([429, 502, 503].includes(status) && retryCount < MAX_RETRIES) {
        originalRequest._retryCount = retryCount + 1;
        const retryAfter = Number(headers?.['retry-after']);
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(1000 * Math.pow(2, retryCount), 8000);
        await new Promise<void>(resolve => setTimeout(resolve, delay));
        return apiClient(originalRequest);
      }

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
    }
    throw new Error('Error de configuración');
  }
);

const getCacheKey = (url: string, params: any): string => {
  if (!params || Object.keys(params).length === 0) return url;
  const sorted = Object.keys(params).sort().reduce((acc: Record<string, any>, key) => {
    if (params[key] !== undefined) acc[key] = params[key];
    return acc;
  }, {});
  return `${url}?${JSON.stringify(sorted)}`;
};

interface CachedGetOptions {
  ttl?: number;
  /** Persist the response in IndexedDB (default true). */
  persist?: boolean;
  /** Skip caching entirely (still dedupes in-flight requests). */
  noCache?: boolean;
}

/**
 * GET with memory/IndexedDB caching and in-flight de-duplication.
 * Only cache misses reach the network (and the rate limiter).
 */
async function cachedGet<T = any>(url: string, params?: Record<string, any>, options: CachedGetOptions = {}): Promise<T> {
  const key = getCacheKey(url, params);
  const { ttl, persist = true, noCache = false } = options;

  if (!noCache) {
    const mem = httpCache.get<T>(key);
    if (mem !== undefined) return mem;
  }

  const existing = inflightGets.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (!noCache && persist) {
      const stored = await httpCache.getAsync<T>(key);
      if (stored !== undefined) return stored;
    }
    const response = await apiClient.get(url, { params });
    if (!noCache) {
      if (persist) httpCache.set(key, response.data, ttl);
      else memoryOnlyHttpSet(key, response.data, ttl);
    }
    return response.data as T;
  })();

  inflightGets.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightGets.delete(key);
  }
}

// Responses we don't want on disk (large, paginated full-post lists).
const volatileHttpCache = new TieredCache({ namespace: 'http_volatile', maxMemoryEntries: 100, defaultTtl: 10 * MINUTE, persist: false });
const memoryOnlyHttpSet = (key: string, data: unknown, ttl?: number) => volatileHttpCache.set(key, data, ttl);

async function volatileGet<T = any>(url: string, params?: Record<string, any>, ttl = 10 * MINUTE): Promise<T> {
  const key = getCacheKey(url, params);
  const mem = volatileHttpCache.get<T>(key);
  if (mem !== undefined) return mem;
  return cachedGet<T>(url, params, { persist: false, ttl });
}

// --- Batchers -------------------------------------------------------------
const toLitePost = (post: any): LitePost => ({
  id: post.id,
  rating: post.rating,
  score: post.score,
  image_width: post.image_width,
  image_height: post.image_height,
  file_ext: post.file_ext,
  preview_file_url: post.preview_file_url,
  large_file_url: post.large_file_url,
  file_url: post.file_url
});

const wikiBatcher = new KeyedBatcher<string, RawWikiPage | null>({
  windowMs: BATCH_WINDOW_MS,
  maxBatchSize: WIKI_BATCH_SIZE,
  missing: null,
  fetchBatch: async (titles) => {
    const result = new Map<string, RawWikiPage | null>();
    // 1. Persisted cache (single IndexedDB transaction).
    const stored = await wikiStore.getManyAsync<RawWikiPage | null>(titles);
    stored.forEach((v, k) => result.set(k, v));
    const missing = titles.filter(t => !result.has(t));
    if (missing.length === 0) return result;

    // 2. Network. Titles containing commas can't go through title_comma.
    const commaSafe = missing.filter(t => !t.includes(','));
    const withComma = missing.filter(t => t.includes(','));
    const pages: RawWikiPage[] = [];
    if (commaSafe.length > 0) {
      const res = await apiClient.get('/wiki_pages.json', {
        params: {
          'search[title_comma]': commaSafe.join(','),
          only: WIKI_FIELDS,
          limit: commaSafe.length
        }
      });
      if (Array.isArray(res.data)) pages.push(...res.data);
    }
    for (const title of withComma) {
      const res = await apiClient.get('/wiki_pages.json', {
        params: { 'search[title]': title, only: WIKI_FIELDS, limit: 1 }
      });
      if (Array.isArray(res.data)) pages.push(...res.data);
    }
    const byTitle = new Map(pages.map(p => [String(p.title).toLowerCase(), p]));
    for (const title of missing) {
      const page = byTitle.get(title) ?? null;
      // Negative results expire sooner so newly created wikis show up.
      wikiStore.set(title, page, page ? 7 * DAY : DAY);
      result.set(title, page);
    }
    return result;
  }
});

const litePostBatcher = new KeyedBatcher<number, LitePost | null>({
  windowMs: BATCH_WINDOW_MS,
  maxBatchSize: POST_ID_BATCH_SIZE,
  missing: null,
  fetchBatch: async (ids) => {
    const result = new Map<number, LitePost | null>();
    const keys = ids.map(String);
    const stored = await litePostStore.getManyAsync<LitePost | null>(keys);
    stored.forEach((v, k) => result.set(Number(k), v));
    const missing = ids.filter(id => !result.has(id));
    if (missing.length === 0) return result;

    const res = await apiClient.get('/posts.json', {
      params: { tags: `id:${missing.join(',')}`, limit: missing.length, only: LITE_POST_FIELDS }
    });
    const posts: any[] = Array.isArray(res.data) ? res.data : [];
    const byId = new Map(posts.map(p => [p.id, toLitePost(p)]));
    for (const id of missing) {
      const post = byId.get(id) ?? null;
      // Deleted / hidden posts: remember briefly to avoid refetching.
      litePostStore.set(String(id), post, post ? 3 * DAY : 6 * HOUR);
      result.set(id, post);
    }
    return result;
  }
});

const fullPostBatcher = new KeyedBatcher<number, DanbooruPost | null>({
  windowMs: BATCH_WINDOW_MS,
  maxBatchSize: POST_ID_BATCH_SIZE,
  missing: null,
  fetchBatch: async (ids) => {
    const res = await apiClient.get('/posts.json', {
      params: { tags: `id:${ids.join(',')}`, limit: ids.length }
    });
    const posts: DanbooruPost[] = Array.isArray(res.data) ? res.data : [];
    const result = new Map<number, DanbooruPost | null>();
    posts.forEach(p => rememberFullPost(p));
    const byId = new Map(posts.map(p => [p.id, p]));
    ids.forEach(id => result.set(id, byId.get(id) ?? null));
    return result;
  }
});

/** Store a full post and its lite projection (lite one is persisted). */
const rememberFullPost = (post: DanbooruPost) => {
  if (!post || typeof post.id !== 'number') return;
  fullPostStore.set(String(post.id), post);
  litePostStore.set(String(post.id), toLitePost(post));
};

const filterByRatingParams = <T extends { rating: string }>(posts: T[], searchParams?: Record<string, any>): T[] => {
  const ratingParam = searchParams?.['search[rating]'];
  if (!ratingParam) return posts;
  const allowed = String(ratingParam).split(',').map(r => r.trim());
  return posts.filter(p => allowed.includes(p.rating));
};

const buildWikiInfo = (page: RawWikiPage): DanbooruWikiInfo => {
  const firstParagraph = extractFirstParagraph(page.body);
  return {
    title: page.title,
    body: page.body,
    firstParagraph,
    formattedFirstParagraph: formatDTextSafe(firstParagraph),
    categoryName: page.category_name,
    isDeleted: page.is_deleted,
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    examplePosts: extractExamplePosts(page.body),
    categorizedExamplePosts: extractCategorizedExamplePosts(page.body)
  };
};

// --- WikiPageManager ---
class WikiPageManager {
  /** Derived wiki info by normalized title (null = no wiki page). */
  get cache(): Map<string, DanbooruWikiInfo | null> {
    return wikiInfoCache;
  }

  async getWikiPage(tagName: string): Promise<DanbooruWikiInfo | null> {
    const title = normalizeTitle(tagName);
    if (!title) return null;
    if (wikiInfoCache.has(title)) return wikiInfoCache.get(title)!;

    let raw = wikiStore.get<RawWikiPage | null>(title);
    if (raw === undefined) {
      try {
        raw = await wikiBatcher.load(title);
      } catch {
        return null; // network error: don't cache, allow retry later
      }
    }
    const info = raw ? buildWikiInfo(raw) : null;
    wikiInfoCache.set(title, info);
    if (wikiInfoCache.size > 2000) {
      const oldest = wikiInfoCache.keys().next().value;
      if (oldest !== undefined) wikiInfoCache.delete(oldest);
    }
    return info;
  }

  async getWikiExampleImages(tagName: string, rotationIndex = 0, searchParams?: Record<string, any>): Promise<DanbooruPreviewImage | null> {
    const wikiInfo = await this.getWikiPage(tagName);
    if (!wikiInfo || !wikiInfo.examplePosts || wikiInfo.examplePosts.length === 0) {
      return null;
    }

    const posts = await this.getPostsByIds(wikiInfo.examplePosts, searchParams);
    const usable = posts.filter(p =>
      p.preview_file_url && (p.large_file_url || p.file_url) && !NON_IMAGE_EXTS.has(p.file_ext)
    );
    if (usable.length === 0) return null;

    const selectedIndex = rotationIndex % usable.length;
    const post = usable[selectedIndex];
    return {
      preview_url: post.preview_file_url,
      large_url: post.large_file_url || post.file_url || '',
      post_id: post.id,
      rating: post.rating,
      score: post.score,
      dimensions: { width: post.image_width || 0, height: post.image_height || 0 },
      source: 'wiki_example',
      rotation_index: selectedIndex,
      total_examples: usable.length
    };
  }

  /**
   * Lightweight posts (id, rating, score, dimensions, file urls) by id, in
   * the requested order. Batched across callers and persisted per id.
   * `searchParams['search[rating]']` (comma list) is applied client-side.
   */
  async getPostsByIds(postIds: number[], searchParams?: Record<string, any>): Promise<DanbooruPost[]> {
    if (!postIds || postIds.length === 0) return [];
    const ids = Array.from(new Set(postIds.filter(id => Number.isFinite(id))));
    try {
      const posts = await Promise.all(ids.map(id => {
        const mem = litePostStore.get<LitePost | null>(String(id));
        return mem !== undefined ? mem : litePostBatcher.load(id);
      }));
      const found = posts.filter((p): p is LitePost => !!p) as unknown as DanbooruPost[];
      return filterByRatingParams(found, searchParams);
    } catch {
      return [];
    }
  }

  clearCache() {
    wikiInfoCache.clear();
    previewCache.clear();
  }

  getCacheStats() {
    return {
      wikiPages: wikiInfoCache.size,
      wikiStore: wikiStore.stats(),
      litePosts: litePostStore.stats(),
      pendingRequests: wikiBatcher.pending,
      wikiBatchRequests: wikiBatcher.requestCount,
      postBatchRequests: litePostBatcher.requestCount
    };
  }
}

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
    if (params.name_matches) validatedParams.name_matches = escapeWildcards(params.name_matches);
    if (params.post_count && validateNumericRange(params.post_count)) validatedParams.post_count = params.post_count;
    if (params.created_at && validateDateRange(params.created_at)) validatedParams.created_at = params.created_at;
    if (params.updated_at && validateDateRange(params.updated_at)) validatedParams.updated_at = params.updated_at;
    if (params.category !== undefined && validateNumericRange(params.category)) validatedParams.category = params.category;
    if (params.order) validatedParams.order = params.order;

    const searchParams = { ...validatedParams, ...params };
    const queryParams: any = {};
    Object.keys(searchParams).forEach(key => {
      if (key === "limit" || key === "page" || key === "only") {
        queryParams[key] = searchParams[key];
      } else {
        const value = (key === "name_matches") ? escapeWildcards(searchParams[key]) : searchParams[key];
        queryParams[`search[${key}]`] = value;
      }
    });

    return cachedGet<DanbooruTag[]>("/tags.json", queryParams, { ttl: DAY });
  }

  async getTags(tagNames: string | string[]): Promise<DanbooruTag[]> {
    const names = Array.isArray(tagNames) ? tagNames : [tagNames];
    if (names.length === 0) return [];
    if (names.length === 1) {
      const result = await this.getTag(names[0]);
      return result ? [result] : [];
    }
    return cachedGet<DanbooruTag[]>("/tags.json", {
      "search[name_comma]": names.join(","),
      limit: Math.min(names.length, 1000)
    }, { ttl: DAY });
  }

  async getTag(tagName: string): Promise<DanbooruTag | null> {
    const data = await cachedGet<DanbooruTag[]>("/tags.json", {
      "search[name]": tagName,
      limit: 1
    }, { ttl: DAY });
    return (Array.isArray(data) && data[0]) || null;
  }

  async searchWikiPages(params: Record<string, any> = {}): Promise<DanbooruWikiPage[]> {
    const queryParams: any = {};
    if (params.title) {
      if (params.title.includes('*') || params.exact === false) {
        queryParams["search[title_matches]"] = escapeWildcards(params.title);
      } else {
        queryParams["search[title]"] = params.title;
      }
    }
    if (params.body) queryParams["search[body_matches]"] = params.body;
    if (params.limit) queryParams.limit = Math.min(params.limit, 1000);
    if (params.page) queryParams.page = params.page;
    if (params.order) queryParams.order = params.order;

    return cachedGet<DanbooruWikiPage[]>("/wiki_pages.json", queryParams, { ttl: DAY });
  }

  async searchPosts(params: Record<string, any> = {}): Promise<DanbooruPost[]> {
    try {
      const queryParams: any = {
        limit: Math.min(params.limit || PERFORMANCE_CONFIG.SEARCH.API_LIMITS.DEFAULT_LIMIT, PERFORMANCE_CONFIG.SEARCH.API_LIMITS.POSTS_MAX_LIMIT)
      };
      if (params.tags) queryParams.tags = params.tags;
      if (params.page) queryParams.page = params.page;
      if (params.order) queryParams.order = params.order;
      if (params.only) queryParams.only = params.only;

      const postSearchParams = ['rating', 'status', 'file_ext', 'source', 'uploader_id', 'approver_id', 'commenter_id', 'noter_id', 'artcomm_id', 'pool_id', 'favgroup_id', 'updater_id', 'delreason_id', 'parent_id', 'child_id', 'pixiv_id', 'has_children', 'has_active_children', 'has_large', 'has_visible_children', 'is_bounty', 'is_deleted', 'is_flagged', 'is_pending', 'is_rating_locked', 'is_note_locked', 'is_status_locked', 'is_comment_disabled', 'is_shown_in_index', 'is_held', 'is_sequence', 'is_approval_required', 'is_upload_limited', 'is_comment_limited', 'is_note_limited', 'is_artcomm_limited', 'is_pool_limited', 'is_fav_limited', 'is_vote_limited', 'is_rating_limited', 'is_status_limited'];
      postSearchParams.forEach(param => {
        if (params[param] !== undefined) queryParams[`search[${param}]`] = params[param];
      });

      // Full post lists are big and paginated: keep them in memory only.
      const posts = await volatileGet<DanbooruPost[]>("/posts.json", queryParams);
      if (!queryParams.only && Array.isArray(posts)) posts.forEach(rememberFullPost);
      return Array.isArray(posts) ? posts : [];
    } catch {
      return [];
    }
  }

  async getPostsForTag(tagName: string, limit = 15, order = "score"): Promise<DanbooruPost[]> {
    try {
      const posts = await this.searchPosts({
        tags: tagName,
        limit: Math.min(limit, PERFORMANCE_CONFIG.SEARCH.API_LIMITS.POSTS_MAX_LIMIT),
        order
      });
      if (tagName.includes('rating:g')) {
        return posts.filter(post => post.rating === 'g');
      }
      return posts;
    } catch {
      return [];
    }
  }

  /** Small, persisted per-tag post sample used as card fallback preview. */
  private async getPreviewPostsForTag(tagQuery: string, limit = 5): Promise<LitePost[]> {
    try {
      const posts = await cachedGet<LitePost[]>("/posts.json", {
        tags: tagQuery,
        limit,
        only: LITE_POST_FIELDS
      }, { ttl: DAY });
      return Array.isArray(posts) ? posts : [];
    } catch {
      return [];
    }
  }

  async getPostById(postId: number): Promise<DanbooruPost | null> {
    const mem = fullPostStore.get<DanbooruPost>(String(postId));
    if (mem) return mem;
    try {
      return await fullPostBatcher.load(postId);
    } catch {
      return null;
    }
  }

  /**
   * Full post objects by id (used by the image modal / tooltips). Batched
   * across callers; rating filter from `search[rating]` applied client-side.
   */
  async getPostsByIds(postIds: number[], searchParams?: Record<string, any>): Promise<DanbooruPost[]> {
    if (!postIds || postIds.length === 0) return [];
    const ids = Array.from(new Set(postIds.filter(id => Number.isFinite(id))));
    try {
      const posts = await Promise.all(ids.map(id => {
        const mem = fullPostStore.get<DanbooruPost>(String(id));
        return mem ? mem : fullPostBatcher.load(id);
      }));
      return filterByRatingParams(posts.filter((p): p is DanbooruPost => !!p), searchParams);
    } catch {
      return [];
    }
  }

  async getTagPreviewImage(
    tagName: string,
    preferredRatio: number | null = null,
    element: HTMLElement | null = null,
    priority = 0,
    filteredTagName: string | null = null
  ): Promise<DanbooruPreviewImage | null> {
    const searchTagName = filteredTagName || tagName;
    const isNSFWFilterEnabled = searchTagName.includes('rating:g');
    const nsfwState = isNSFWFilterEnabled ? 'nsfw_filtered' : 'nsfw_unfiltered';
    const cacheKey = `preview_${searchTagName}_${preferredRatio || 'default'}_${nsfwState}`;

    const cached = previewCache.get<DanbooruPreviewImage | null>(cacheKey);
    if (cached !== undefined) {
      if (!(isNSFWFilterEnabled && cached && cached.rating !== 'g')) return cached;
      previewCache.delete(cacheKey);
    }

    const isVisible = element ? this.isElementVisible(element) : false;
    if (element) this.imageLoadQueue.observeElement(element, tagName);

    const fetchFunction = async () => {
      let result = await this.fetchTagPreviewImageInternal(searchTagName, preferredRatio);
      if (result && isNSFWFilterEnabled && result.rating !== 'g') result = null;
      previewCache.set(cacheKey, result);
      return result;
    };

    return this.imageLoadQueue.enqueue(searchTagName, fetchFunction, priority, isVisible);
  }

  async fetchTagPreviewImageInternal(tagName: string, preferredRatio: number | null = null): Promise<DanbooruPreviewImage | null> {
    try {
      const originalTagName = tagName.includes('rating:g') || tagName.includes('-video')
        ? tagName.split(' ')[0]
        : tagName;
      const isNSFWFilterEnabled = tagName.includes('rating:g');
      const searchParams = isNSFWFilterEnabled ? { "search[rating]": "g" } : undefined;

      const rotationIndex = this.getRotationIndex(originalTagName, 10);
      const wikiExample = await this.getWikiExamplePreview(originalTagName, rotationIndex, searchParams);
      if (wikiExample) {
        return isNSFWFilterEnabled && wikiExample.rating !== 'g' ? null : wikiExample;
      }

      // Fallback: a small, field-limited sample of the tag's posts.
      let validPosts = (await this.getPreviewPostsForTag(tagName, 5)).filter(post =>
        post && (post.large_file_url || post.file_url) && post.preview_file_url && !NON_IMAGE_EXTS.has(post.file_ext)
      );
      if (isNSFWFilterEnabled) validPosts = validPosts.filter(post => post.rating === 'g');
      if (validPosts.length === 0) return null;

      let selectedPost = validPosts[0];
      if (preferredRatio) {
        const ratioMatch = validPosts.find(post => {
          if (!post.image_width || !post.image_height) return false;
          return Math.abs(post.image_width / post.image_height - preferredRatio) < 0.1;
        });
        if (ratioMatch) selectedPost = ratioMatch;
      }

      return {
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
    } catch {
      return null;
    }
  }

  async getTagExamplePosts(tagName: string, limit = 10, ratingParams?: { allowedRatings?: string[] }): Promise<DanbooruPost[]> {
    try {
      let tags = tagName;
      if (ratingParams?.allowedRatings && ratingParams.allowedRatings.length === 1 && ratingParams.allowedRatings[0] === 'g') {
        tags = `${tagName} rating:g`;
      }
      const posts = await this.searchPosts({
        tags,
        limit: Math.min(limit * 4, PERFORMANCE_CONFIG.SEARCH.API_LIMITS.POSTS_MAX_LIMIT),
        order: "score"
      });
      const isValid = (post: DanbooruPost) => post && post.preview_file_url && (post.large_file_url || post.file_url) && post.image_width && post.image_height;
      if (ratingParams?.allowedRatings && ratingParams.allowedRatings.length > 0) {
        const allowed = ratingParams.allowedRatings;
        return posts.filter(post => allowed.includes(post.rating)).filter(isValid).slice(0, limit);
      }
      return posts.filter(isValid).slice(0, limit);
    } catch {
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
    const currentCount = this.rotationCounters.get(tagName) ?? 0;
    this.rotationCounters.set(tagName, currentCount + 1);
    return currentCount % totalImages;
  }

  resetRotationCounter(tagName: string): void {
    if (tagName) this.rotationCounters.delete(tagName);
    else this.rotationCounters.clear();
  }

  simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
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
      const data = await cachedGet<any>('/related_tag.json', { query: tagName }, { ttl: DAY });
      if (Array.isArray(data)) {
        return data.map((item: any) => [item.name, item.count || 0]);
      }
      return [];
    } catch {
      return [];
    }
  }

  async getArtist(tagName: string): Promise<any> {
    try {
      const data = await cachedGet<any[]>('/artists.json', { 'search[name]': tagName, limit: 1 }, { ttl: DAY });
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch {
      return null;
    }
  }

  /** Clears in-memory derived/response caches (persisted entities are kept). */
  clearCache(): void {
    previewCache.clear();
    volatileHttpCache.clear();
    wikiInfoCache.clear();
  }

  clearPreviewCache(): void {
    previewCache.clear();
  }

  clearPostsCache(): void {
    volatileHttpCache.clear();
    fullPostStore.clear();
  }

  clearImageLoadQueue(): void {
    this.imageLoadQueue.clear();
  }

  /**
   * Drops derived state for a tag (preview selection, queued work). Raw wiki
   * pages and posts are rating-agnostic (the NSFW filter is applied on read),
   * so they are kept: this is called on every modal open / filter toggle.
   */
  clearAllCacheForTag(tagName: string): void {
    if (!tagName) return;
    const underscored = tagName.replace(/\s+/g, '_');
    previewCache.deleteWhere(key =>
      key.startsWith(`preview_${tagName}`) || key.startsWith(`preview_${underscored}`)
    );
    this.imageLoadQueue.cancelRequest(tagName);
  }

  clearImageLoadQueueForTag(tagName: string): void {
    this.imageLoadQueue.cancelRequest(tagName);
  }

  clearWikiPageCache(): void {
    this.wikiPageManager.clearCache();
  }

  clearFilterChangeCache(): void {
    previewCache.clear();
    this.imageLoadQueue.clear();
  }

  getCacheStats(): Record<string, any> {
    return {
      httpCache: httpCache.stats(),
      volatileHttpCache: volatileHttpCache.stats(),
      previewCache: previewCache.stats(),
      fullPosts: fullPostStore.stats(),
      inflight: inflightGets.size,
      imageLoadQueue: this.imageLoadQueue.getStats(),
      wikiPageManager: this.wikiPageManager.getCacheStats(),
      networkRequests: rateLimiter.totalRequests
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

const danbooruApi = new DanbooruApiService();

export default danbooruApi;
