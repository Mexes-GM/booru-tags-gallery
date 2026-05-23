/**
 * Configuración de rendimiento para optimizar la aplicación
 * Reduce violaciones del scheduler y mejora la fluidez
 */

export const PERFORMANCE_CONFIG = {
  // Configuración de requestIdleCallback
  IDLE_CALLBACK: {
    TIMEOUT: 8, // Timeout más agresivo (8ms = medio frame)
    MIN_DELAY: 1, // Delay mínimo entre operaciones
  },

  // Configuración de debouncing
  DEBOUNCE: {
    SEARCH: 100, // Reducir debounce para mejor responsividad
    SCROLL: 100, // Debounce para scroll
    RESIZE: 150, // Debounce para resize
    INPUT: 30, // Debounce específico para input más responsivo
  },

  // Configuración de rate limiting
  RATE_LIMIT: {
    MAX_REQUESTS: 10, // Límite oficial de Danbooru: 10 requests por segundo
    TIME_WINDOW: 1000, // 1 segundo
    ADAPTIVE_THROTTLING: true,
  },

  // Configuración de carga de imágenes
  IMAGE_LOADING: {
    MAX_CONCURRENT: 6, // Aumentar concurrencia para mejor rendimiento
    PRIORITY_WEIGHT: {
      VISIBLE: 10000,
      ACCESS_COUNT: 100,
      BASE: 1000,
    },
    INTERSECTION_THRESHOLD: 0.1,
    ROOT_MARGIN: '100px', // Aumentar margen
  },

  // Configuración de cache - Integrado con sistema agresivo de 7 días
  CACHE: {
    CLEANUP_INTERVAL: 60000, // 1 minuto - más frecuente para optimización
    MAX_KEYS: 1000, // Aumentado para aprovechar caché agresivo
    // Duración de cache según tipo de endpoint - Extendido para mejor rendimiento
    DURATIONS: {
      TAGS: 7 * 24 * 60 * 60 * 1000, // 7 días para tags (datos estáticos)
      POSTS: 3 * 24 * 60 * 60 * 1000, // 3 días para posts
      WIKI: 7 * 24 * 60 * 60 * 1000, // 7 días para wiki (datos estáticos)
      PREVIEW: 7 * 24 * 60 * 60 * 1000, // 7 días para previews
      SEARCH_RESULTS: 2 * 60 * 60 * 1000, // 2 horas para resultados de búsqueda
      TRANSLATIONS: 7 * 24 * 60 * 60 * 1000, // 7 días para traducciones
    }
  },

  // Configuración de animaciones
  ANIMATIONS: {
    TRANSITION_DURATION: 150, // Reducir duración
    STAGGER_DELAY: 10, // Reducir delay entre animaciones
    MAX_STAGGER: 200, // Reducir máximo delay total
  },

  // Configuración de búsqueda optimizada para 100k tags
  SEARCH: {
    MAX_RESULTS: 50, // Aumentar para mejor UX
    MAX_SUGGESTIONS: 8, // Aumentar sugerencias
    MAX_SYNONYMS: 3, // Aumentar sinónimos
    FUZZY_LIMIT: 50, // Aumentar límite fuzzy
    PARTIAL_LIMIT: 25, // Aumentar límite parcial
    BATCH_SIZE: 5000, // Procesar en lotes más grandes para 100k tags
    CHUNK_SIZE: 5000, // Tamaño de chunk para búsqueda paralela
    // Límites según documentación de API
    API_LIMITS: {
      POSTS_MAX_LIMIT: 200, // Máximo 200 para /posts.json
      OTHER_MAX_LIMIT: 1000, // Máximo 1000 para otros endpoints
      DEFAULT_LIMIT: 100, // Límite por defecto
    }
  },

  // Configuración de virtual scrolling
  VIRTUAL_SCROLL: {
    INITIAL_ITEMS: 15, // Reducir items iniciales
    LOAD_MORE_INCREMENT: 15, // Reducir incremento
    BUFFER_SIZE: 3, // Reducir buffer
  },

  // Configuración de error handling
  ERROR_HANDLING: {
    SILENT_ERRORS: true, // Usar console.debug en lugar de console.error
    MAX_RETRIES: 1, // Reducir reintentos
    RETRY_DELAY: 2000, // Aumentar delay entre reintentos
    // Códigos de estado según documentación de API
    STATUS_CODES: {
      OK: 200,
      NO_CONTENT: 204,
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      GONE: 410, // Pagination limit
      INVALID_RECORD: 420,
      LOCKED: 422,
      ALREADY_EXISTS: 423,
      INVALID_PARAMETERS: 424,
      USER_THROTTLED: 429, // Rate limit exceeded
      INTERNAL_ERROR: 500,
      BAD_GATEWAY: 502, // Heavy load
      SERVICE_UNAVAILABLE: 503, // Downbooru
    }
  },

  // Configuración de lazy loading
  LAZY_LOADING: {
    ENABLED: true,
    THRESHOLD: 0.05, // Reducir threshold
    ROOT_MARGIN: '200px', // Aumentar margen
  },

  // Configuración de memoria
  MEMORY: {
    MAX_CACHE_SIZE: 50, // Reducir tamaño de cache
    CLEANUP_THRESHOLD: 70, // Limpiar cuando llegue al 70%
  },

  // Configuración de procesamiento por lotes
  BATCH_PROCESSING: {
    ENABLED: true,
    MAX_BATCH_SIZE: 5, // Procesar máximo 5 elementos por lote
    BATCH_DELAY: 16, // Delay entre lotes (1 frame)
  },

  // Configuración específica de API según documentación
  API_CONFIG: {
    BASE_URL: 'https://danbooru.donmai.us',
    TEST_URL: 'https://testbooru.donmai.us', // Para testing
    TIMEOUT: 15000, // 15 segundos timeout
    MAX_REDIRECTS: 3,
    HEADERS: {
      'Accept': 'application/json'
      // Removido Content-Type para evitar problemas de CORS en requests GET
    }
  }
};

// Función para obtener configuración específica
export const getPerformanceConfig = (key: string): any => {
  const keys = key.split('.');
  let config: any = PERFORMANCE_CONFIG;
  
  for (const k of keys) {
    if (config && typeof config === 'object' && k in config) {
      config = config[k];
    } else {
      return null;
    }
  }
  
  return config;
};

// Función para verificar si requestIdleCallback está disponible
export const hasIdleCallback = (): boolean => {
  return 'requestIdleCallback' in window;
};

// Función para programar trabajo con fallback
export const scheduleIdleWork = (callback: () => void, options: { timeout?: number } = {}): ReturnType<typeof setTimeout> => {
  const { timeout = PERFORMANCE_CONFIG.IDLE_CALLBACK.TIMEOUT } = options;
  
  if (hasIdleCallback()) {
    return requestIdleCallback(callback, { timeout }) as unknown as ReturnType<typeof setTimeout>;
  } else {
    return setTimeout(callback, PERFORMANCE_CONFIG.IDLE_CALLBACK.MIN_DELAY);
  }
};

// Función para debounce optimizado
export const createDebounce = <T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void => {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// Función para throttle optimizado
export const createThrottle = <T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void => {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
};

export default PERFORMANCE_CONFIG;