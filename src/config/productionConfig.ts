/**
 * Configuración de producción para la aplicación
 * Este archivo contiene todas las configuraciones optimizadas para el entorno de producción
 */

export const productionConfig = {
  // Configuración de la aplicación
  app: {
    name: 'Booru Tag Gallery',
    version: '1.0.0',
    environment: 'production',
    isDevelopment: false,
    enableDebugLogs: false,
    enablePerformanceMonitoring: true
  },

  // Configuración de rendimiento
  performance: {
    // Configuración de carga de imágenes
    imageLoading: {
      maxConcurrentRequests: 6,
      retryAttempts: 3,
      retryDelay: 1000,
      preloadCount: 10,
      lazyLoadingThreshold: 100
    },

    // Configuración de búsqueda
    search: {
      debounceDelay: 300,
      maxResults: 100,
      enableFuzzySearch: true,
      fuseThreshold: 0.3
    },

    // Configuración de scroll infinito
    infiniteScroll: {
      threshold: 0.8,
      pageSize: 50,
      maxPages: 20
    },

    // Configuración de cache
    cache: {
  // No se implementó SW real todavía
  enableServiceWorker: false,
      cacheStrategy: 'stale-while-revalidate',
      maxCacheSize: 50 * 1024 * 1024, // 50MB
      cacheDuration: 24 * 60 * 60 * 1000 // 24 horas
    }
  },

  // Configuración de API
  api: {
    danbooru: {
      baseUrl: 'https://danbooru.donmai.us',
      timeout: 10000,
      retryAttempts: 3,
      rateLimit: {
        requestsPerSecond: 2,
        burstLimit: 10
      }
    }
  },

  // Configuración de UI
  ui: {
    theme: {
      enableDarkMode: true,
      defaultTheme: 'system'
    },
    animations: {
      enableTransitions: true,
      reducedMotion: false,
      duration: {
        fast: 150,
        normal: 300,
        slow: 500
      }
    },
    layout: {
      cardColumns: {
        mobile: 2,
        tablet: 3,
        desktop: 4,
        wide: 5
      },
      cardAspectRatio: '3/4'
    }
  },

  // Configuración de internacionalización
  i18n: {
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'es'],
    fallbackLanguage: 'en',
    enableLanguageDetection: false // Disabled to prevent automatic browser language detection
  },

  // Configuración de analytics y monitoreo
  monitoring: {
    enableErrorReporting: true,
    enablePerformanceTracking: true,
    sampleRate: 0.1, // 10% de las sesiones
    enableUserFeedback: true
  },

  // Configuración de seguridad
  security: {
    enableCSP: true,
    enableSRI: true,
    enableHTTPS: true,
    allowedDomains: [
      'danbooru.donmai.us',
      'cdn.donmai.us'
    ]
  },

  // Configuración de features
  features: {
    enableNSFWFilter: true,
    enableTagModal: true,
    enableImageModal: true,
    enableKeyboardShortcuts: true,
    enableOfflineMode: false,
  // PWA deshabilitado hasta implementar manifest y SW
  enablePWA: false
  }
};

export default productionConfig;