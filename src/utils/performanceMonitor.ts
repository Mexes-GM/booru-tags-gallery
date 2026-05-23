// Performance monitoring and analytics utilities

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  url?: string;
  userAgent?: string;
}

interface NavigationTiming {
  dns: number;
  tcp: number;
  request: number;
  response: number;
  dom: number;
  load: number;
  total: number;
}

interface ResourceTiming {
  name: string;
  duration: number;
  size: number;
  type: string;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private observer: PerformanceObserver | null = null;
  private isEnabled: boolean = false;

  constructor() {
    this.isEnabled = import.meta.env.PROD;
    if (this.isEnabled && typeof window !== 'undefined') {
      this.init();
    }
  }

  private init(): void {
    // Initialize performance observer
    if ('PerformanceObserver' in window) {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric({
            name: entry.name,
            value: entry.duration || entry.startTime,
            timestamp: Date.now(),
            url: window.location.href
          });
        }
      });

      try {
        this.observer.observe({ entryTypes: ['navigation', 'resource', 'paint', 'largest-contentful-paint'] });
      } catch (e) {
        // Performance observer not fully supported
      }
    }

    // Record initial page load metrics
    this.recordPageLoadMetrics();

    // Record Core Web Vitals
    this.recordCoreWebVitals();

    // Send metrics periodically
    setInterval(() => this.sendMetrics(), 30000); // Every 30 seconds

    // Send metrics before page unload
    window.addEventListener('beforeunload', () => this.sendMetrics());
  }

  private recordMetric(metric: PerformanceMetric): void {
    if (!this.isEnabled) return;
    
    this.metrics.push({
      ...metric,
      userAgent: navigator.userAgent
    });

    // Keep only last 100 metrics to prevent memory issues
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }
  }

  private recordPageLoadMetrics(): void {
    if (!('performance' in window) || !window.performance.timing) return;

    const timing = window.performance.timing;
    const navigationStart = timing.navigationStart;

    const metrics: NavigationTiming = {
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      request: timing.responseStart - timing.requestStart,
      response: timing.responseEnd - timing.responseStart,
      dom: timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart,
      load: timing.loadEventEnd - timing.loadEventStart,
      total: timing.loadEventEnd - navigationStart
    };

    Object.entries(metrics).forEach(([key, value]) => {
      if (value > 0) {
        this.recordMetric({
          name: `navigation.${key}`,
          value,
          timestamp: Date.now()
        });
      }
    });
  }

  private recordCoreWebVitals(): void {
    // First Contentful Paint
    if ('PerformanceObserver' in window) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric({
            name: 'core-web-vitals.fcp',
            value: entry.startTime,
            timestamp: Date.now()
          });
        }
      }).observe({ entryTypes: ['paint'] });

      // Largest Contentful Paint
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.recordMetric({
          name: 'core-web-vitals.lcp',
          value: lastEntry.startTime,
          timestamp: Date.now()
        });
      }).observe({ entryTypes: ['largest-contentful-paint'] });

      // Cumulative Layout Shift
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        this.recordMetric({
          name: 'core-web-vitals.cls',
          value: clsValue,
          timestamp: Date.now()
        });
      }).observe({ entryTypes: ['layout-shift'] });
    }
  }

  public recordCustomMetric(name: string, value: number, metadata?: Record<string, any>): void {
    this.recordMetric({
      name: `custom.${name}`,
      value,
      timestamp: Date.now(),
      ...metadata
    });
  }

  public recordError(_error: Error, _context?: string): void {
    this.recordMetric({
      name: 'error',
      value: 1,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    });

    // In a real app, you might want to send this to an error tracking service
  }

  public recordUserInteraction(action: string, _target?: string): void {
    this.recordMetric({
      name: `interaction.${action}`,
      value: 1,
      timestamp: Date.now(),
      url: window.location.href
    });
  }

  private async sendMetrics(): Promise<void> {
    if (!this.isEnabled || this.metrics.length === 0) return;

    const metricsToSend = [...this.metrics];
    this.metrics = [];

    try {
      // In a real application, you would send these to your analytics service

      // Example: Send to analytics service
      // await fetch('/api/analytics', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ metrics: metricsToSend })
      // });

      // Store in localStorage for debugging (development only)
      if (import.meta.env.DEV) {
        const existingMetrics = JSON.parse(localStorage.getItem('performance-metrics') || '[]');
        const allMetrics = [...existingMetrics, ...metricsToSend].slice(-500); // Keep last 500
        localStorage.setItem('performance-metrics', JSON.stringify(allMetrics));
      }
    } catch (error) {
      // Re-add metrics to queue for retry
      this.metrics.unshift(...metricsToSend.slice(-50)); // Keep only last 50 for retry
    }
  }

  public getResourceTimings(): ResourceTiming[] {
    if (!('performance' in window)) return [];

    return window.performance.getEntriesByType('resource').map((entry: any) => ({
      name: entry.name,
      duration: entry.duration,
      size: entry.transferSize || 0,
      type: this.getResourceType(entry.name)
    }));
  }

  private getResourceType(url: string): string {
    if (url.match(/\.(js|mjs)$/)) return 'script';
    if (url.match(/\.(css)$/)) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|webp|avif|svg)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  public generateReport(): any {
    const resourceTimings = this.getResourceTimings();
    const totalSize = resourceTimings.reduce((sum, resource) => sum + resource.size, 0);
    const avgLoadTime = resourceTimings.reduce((sum, resource) => sum + resource.duration, 0) / resourceTimings.length;

    return {
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      metrics: this.metrics,
      resources: {
        total: resourceTimings.length,
        totalSize: Math.round(totalSize / 1024), // KB
        averageLoadTime: Math.round(avgLoadTime),
        byType: this.groupResourcesByType(resourceTimings)
      },
      memory: (performance as any).memory ? {
        used: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024), // MB
        total: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024), // MB
        limit: Math.round((performance as any).memory.jsHeapSizeLimit / 1024 / 1024) // MB
      } : null
    };
  }

  private groupResourcesByType(resources: ResourceTiming[]): Record<string, { count: number; size: number; avgDuration: number }> {
    const grouped: Record<string, ResourceTiming[]> = {};
    
    resources.forEach(resource => {
      if (!grouped[resource.type]) grouped[resource.type] = [];
      grouped[resource.type].push(resource);
    });

    const result: Record<string, { count: number; size: number; avgDuration: number }> = {};
    
    Object.entries(grouped).forEach(([type, typeResources]) => {
      result[type] = {
        count: typeResources.length,
        size: Math.round(typeResources.reduce((sum, r) => sum + r.size, 0) / 1024), // KB
        avgDuration: Math.round(typeResources.reduce((sum, r) => sum + r.duration, 0) / typeResources.length)
      };
    });

    return result;
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.sendMetrics(); // Send final metrics
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Utility functions for common performance measurements
export const measureAsync = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const start = performance.now();
  try {
    const result = await fn();
    performanceMonitor.recordCustomMetric(name, performance.now() - start);
    return result;
  } catch (error) {
    performanceMonitor.recordCustomMetric(`${name}.error`, performance.now() - start);
    throw error;
  }
};

export const measureSync = <T>(name: string, fn: () => T): T => {
  const start = performance.now();
  try {
    const result = fn();
    performanceMonitor.recordCustomMetric(name, performance.now() - start);
    return result;
  } catch (error) {
    performanceMonitor.recordCustomMetric(`${name}.error`, performance.now() - start);
    throw error;
  }
};

// React hook for performance monitoring
export const usePerformanceMonitor = () => {
  return {
    recordMetric: (name: string, value: number) => performanceMonitor.recordCustomMetric(name, value),
    recordError: (error: Error, context?: string) => performanceMonitor.recordError(error, context),
    recordInteraction: (action: string, target?: string) => performanceMonitor.recordUserInteraction(action, target),
    generateReport: () => performanceMonitor.generateReport()
  };
};