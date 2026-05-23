/**
 * Image optimization configuration for production
 */

export const IMAGE_OPTIMIZATION_CONFIG = {
  // Supported formats in order of preference
  FORMATS: {
    AVIF: 'image/avif',
    WEBP: 'image/webp',
    JPEG: 'image/jpeg',
    PNG: 'image/png'
  },
  
  // Quality settings for different formats
  QUALITY: {
    AVIF: 75,
    WEBP: 85,
    JPEG: 90,
    PNG: 100
  },
  
  // Responsive breakpoints
  BREAKPOINTS: {
    SM: 640,
    MD: 768,
    LG: 1024,
    XL: 1280,
    '2XL': 1536
  },
  
  // Device pixel ratios to support
  DPR: [1, 1.5, 2, 3],
  
  // Lazy loading configuration
  LAZY_LOADING: {
    ROOT_MARGIN: '50px',
    THRESHOLD: 0.1,
    PLACEHOLDER_BLUR: 10
  },
  
  // Preloading configuration
  PRELOAD: {
    CRITICAL_IMAGES: 3, // Number of critical images to preload
    CLEANUP_DELAY: 30000, // 30 seconds
    MAX_PRELOAD_SIZE: 500 * 1024 // 500KB max per preloaded image
  },
  
  // Cache configuration
  CACHE: {
    MAX_AGE: 31536000, // 1 year in seconds
    STALE_WHILE_REVALIDATE: 86400, // 1 day in seconds
    MAX_ENTRIES: 100
  },
  
  // Compression settings
  COMPRESSION: {
    ENABLE_BROTLI: true,
    ENABLE_GZIP: true,
    MIN_SIZE: 1024 // Only compress files larger than 1KB
  },
  
  // Error handling
  ERROR_HANDLING: {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    FALLBACK_IMAGE: '/images/placeholder.svg'
  }
};

// Utility functions for image optimization
export class ImageOptimizer {
  private static formatSupport = new Map<string, boolean>();
  
  /**
   * Check if a format is supported by the browser
   */
  static supportsFormat(format: string): boolean {
    if (this.formatSupport.has(format)) {
      return this.formatSupport.get(format)!;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    
    let supported = false;
    try {
      const mimeType = IMAGE_OPTIMIZATION_CONFIG.FORMATS[format.toUpperCase() as keyof typeof IMAGE_OPTIMIZATION_CONFIG.FORMATS];
      if (mimeType) {
        supported = canvas.toDataURL(mimeType).indexOf(`data:${mimeType}`) === 0;
      }
    } catch {
      supported = false;
    }
    
    this.formatSupport.set(format, supported);
    return supported;
  }
  
  /**
   * Get the best supported format for the browser
   */
  static getBestFormat(): string {
    if (this.supportsFormat('avif')) return 'avif';
    if (this.supportsFormat('webp')) return 'webp';
    return 'jpeg';
  }
  
  /**
   * Generate srcset for responsive images
   */
  static generateSrcSet(baseSrc: string, format?: string): string {
    const selectedFormat = format || this.getBestFormat();
    const quality = IMAGE_OPTIMIZATION_CONFIG.QUALITY[selectedFormat.toUpperCase() as keyof typeof IMAGE_OPTIMIZATION_CONFIG.QUALITY];
    
    return IMAGE_OPTIMIZATION_CONFIG.DPR
      .map(dpr => {
        const url = this.buildOptimizedUrl(baseSrc, {
          format: selectedFormat,
          quality,
          dpr
        });
        return `${url} ${dpr}x`;
      })
      .join(', ');
  }
  
  /**
   * Generate sizes attribute for responsive images
   */
  static generateSizes(breakpoints?: Partial<typeof IMAGE_OPTIMIZATION_CONFIG.BREAKPOINTS>): string {
    const bp = { ...IMAGE_OPTIMIZATION_CONFIG.BREAKPOINTS, ...breakpoints };
    
    return [
      `(max-width: ${bp.SM}px) 100vw`,
      `(max-width: ${bp.MD}px) 50vw`,
      `(max-width: ${bp.LG}px) 33vw`,
      '25vw'
    ].join(', ');
  }
  
  /**
   * Build optimized URL with parameters
   */
  static buildOptimizedUrl(src: string, options: {
    format?: string;
    quality?: number;
    width?: number;
    height?: number;
    dpr?: number;
  } = {}): string {
    // For external URLs (like Danbooru), return as-is
    if (src.includes('danbooru.donmai.us') || src.includes('cdn.donmai.us')) {
      return src;
    }
    
    try {
      const url = new URL(src, window.location.origin);
      
      if (options.format) {
        url.searchParams.set('format', options.format);
      }
      
      if (options.quality) {
        url.searchParams.set('quality', options.quality.toString());
      }
      
      if (options.width) {
        url.searchParams.set('w', options.width.toString());
      }
      
      if (options.height) {
        url.searchParams.set('h', options.height.toString());
      }
      
      if (options.dpr) {
        url.searchParams.set('dpr', options.dpr.toString());
      }
      
      return url.toString();
    } catch {
      return src; // Return original if URL parsing fails
    }
  }
  
  /**
   * Generate blur placeholder data URL
   */
  static generateBlurPlaceholder(
    width: number = 10,
    height: number = 10,
    color: string = '#f3f4f6'
  ): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return '';
    
    canvas.width = width;
    canvas.height = height;
    
    // Create gradient for more realistic blur effect
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, this.adjustBrightness(color, -10));
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    return canvas.toDataURL('image/jpeg', 0.1);
  }
  
  /**
   * Adjust color brightness
   */
  private static adjustBrightness(color: string, amount: number): string {
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    
    const num = parseInt(col, 16);
    let r = (num >> 16) + amount;
    let g = (num >> 8 & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    
    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;
    
    return (usePound ? '#' : '') + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
  }
  
  /**
   * Preload critical images
   */
  static preloadImage(src: string, options: {
    format?: string;
    priority?: boolean;
    crossOrigin?: string;
  } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const format = options.format || this.getBestFormat();
      const optimizedSrc = this.buildOptimizedUrl(src, { format });
      
      const link = document.createElement('link');
      link.rel = options.priority ? 'preload' : 'prefetch';
      link.as = 'image';
      link.href = optimizedSrc;
      
      if (options.crossOrigin) {
        link.crossOrigin = options.crossOrigin;
      }
      
      const mimeType = IMAGE_OPTIMIZATION_CONFIG.FORMATS[format.toUpperCase() as keyof typeof IMAGE_OPTIMIZATION_CONFIG.FORMATS];
      if (mimeType) {
        link.type = mimeType;
      }
      
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to preload image: ${src}`));
      
      document.head.appendChild(link);
      
      // Cleanup after delay
      setTimeout(() => {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      }, IMAGE_OPTIMIZATION_CONFIG.PRELOAD.CLEANUP_DELAY);
    });
  }
  
  /**
   * Get image dimensions from URL or element
   */
  static getImageDimensions(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${src}`));
      };
      img.src = src;
    });
  }
  
  /**
   * Calculate optimal image size based on container and DPR
   */
  static calculateOptimalSize(
    containerWidth: number,
    containerHeight: number,
    devicePixelRatio: number = window.devicePixelRatio || 1
  ): { width: number; height: number } {
    return {
      width: Math.ceil(containerWidth * devicePixelRatio),
      height: Math.ceil(containerHeight * devicePixelRatio)
    };
  }
}

// Performance monitoring for images
export class ImagePerformanceMonitor {
  private static metrics = new Map<string, {
    loadTime: number;
    size: number;
    format: string;
    cached: boolean;
  }>();
  
  static recordImageLoad(
    src: string,
    loadTime: number,
    size: number,
    format: string,
    cached: boolean = false
  ): void {
    this.metrics.set(src, {
      loadTime,
      size,
      format,
      cached
    });
  }
  
  static getMetrics(): Array<{
    src: string;
    loadTime: number;
    size: number;
    format: string;
    cached: boolean;
  }> {
    return Array.from(this.metrics.entries()).map(([src, metrics]) => ({
      src,
      ...metrics
    }));
  }
  
  static getAverageLoadTime(): number {
    const metrics = Array.from(this.metrics.values());
    if (metrics.length === 0) return 0;
    
    const totalTime = metrics.reduce((sum, metric) => sum + metric.loadTime, 0);
    return totalTime / metrics.length;
  }
  
  static getTotalDataTransfer(): number {
    return Array.from(this.metrics.values())
      .filter(metric => !metric.cached)
      .reduce((sum, metric) => sum + metric.size, 0);
  }
  
  static clearMetrics(): void {
    this.metrics.clear();
  }
}

export default IMAGE_OPTIMIZATION_CONFIG;