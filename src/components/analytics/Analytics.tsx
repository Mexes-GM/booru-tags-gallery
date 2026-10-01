import { useEffect, useState } from 'react';
import { performanceMonitor, usePerformanceMonitor, type PerformanceReport } from '../../utils/performanceMonitor';

interface AnalyticsProps {
  children: React.ReactNode;
}

// Analytics provider component
export const Analytics: React.FC<AnalyticsProps> = ({ children }) => {
  const { recordInteraction, recordError } = usePerformanceMonitor();

  useEffect(() => {
    // Track page views
    const trackPageView = () => {
      performanceMonitor.recordCustomMetric('pageview', 1, {
        path: window.location.pathname,
        referrer: document.referrer
      });
    };

    // Track initial page view
    trackPageView();

    // Track navigation changes (for SPA)
    const handlePopState = () => {
      trackPageView();
    };

    window.addEventListener('popstate', handlePopState);

    // Track user interactions
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const className = target.className;
      const id = target.id;
      
      let elementIdentifier = tagName;
      if (id) elementIdentifier += `#${id}`;
      if (className && typeof className === 'string') elementIdentifier += `.${className.split(' ')[0]}`;
      
      recordInteraction('click', elementIdentifier);
    };

    // Track form submissions
    const handleSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement;
      const formId = form.id || form.className || 'unknown';
      recordInteraction('form_submit', formId);
    };

    // Track input focus (for engagement)
    const handleFocus = (event: FocusEvent) => {
      const target = event.target as HTMLInputElement;
      if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'textarea') {
        recordInteraction('input_focus', target.type || target.tagName.toLowerCase());
      }
    };

    // Track scroll depth
    let maxScrollDepth = 0;
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      const scrollDepth = Math.round((scrollTop + windowHeight) / documentHeight * 100);
      
      if (scrollDepth > maxScrollDepth) {
        const previousDepth = maxScrollDepth;
        maxScrollDepth = scrollDepth;

        // Record each scroll milestone the first time it is crossed
        for (const milestone of [25, 50, 75, 90]) {
          if (scrollDepth >= milestone && previousDepth < milestone) {
            recordInteraction('scroll', `${milestone}%`);
          }
        }
      }
    };

    // Track time on page
    const startTime = Date.now();
    const handleBeforeUnload = () => {
      const timeOnPage = Date.now() - startTime;
      performanceMonitor.recordCustomMetric('time_on_page', timeOnPage, {
        path: window.location.pathname
      });
    };

    // Track visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordInteraction('page_hidden');
      } else {
        recordInteraction('page_visible');
      }
    };

    // Add event listeners
    document.addEventListener('click', handleClick, { passive: true });
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('focus', handleFocus, { passive: true, capture: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Track unhandled errors
    const handleError = (event: ErrorEvent) => {
      recordError(new Error(event.message), `${event.filename}:${event.lineno}:${event.colno}`);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordError(new Error(String(event.reason)), 'unhandled_promise_rejection');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup
    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('submit', handleSubmit);
      document.removeEventListener('focus', handleFocus);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [recordInteraction, recordError]);

  return <>{children}</>;
};

// Performance debug panel (development only)
export const PerformanceDebugPanel: React.FC = () => {
  const { generateReport } = usePerformanceMonitor();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  const handleGenerateReport = () => {
    const newReport = generateReport();
    setReport(newReport);
    setIsOpen(true);
  };

  const handleClearMetrics = () => {
    localStorage.removeItem('performance-metrics');
    setReport(null);
    alert('Performance metrics cleared!');
  };

  const handleExportMetrics = () => {
    const metrics = localStorage.getItem('performance-metrics');
    if (metrics) {
      const blob = new Blob([metrics], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-metrics-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <>
      {/* Floating debug button */}
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={handleGenerateReport}
          className="h-8 rounded-md border border-border bg-card px-2.5 font-mono text-xs text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          title="Generate Performance Report"
        >
          perf
        </button>
      </div>

      {/* Debug panel modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-overlay/60 z-50 flex items-center justify-center p-4">
          <div className="bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                Performance Report
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleExportMetrics}
                  className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-muted rounded text-sm transition-colors"
                >
                  Export
                </button>
                <button
                  onClick={handleClearMetrics}
                  className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-muted rounded text-sm transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-muted rounded text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {report && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-muted p-3 rounded">
                      <h3 className="font-medium text-foreground">Resources</h3>
                      <p className="text-2xl font-bold text-foreground">
                        {report.resources.total}
                      </p>
                      <p className="text-sm text-foreground">
                        {report.resources.totalSize} KB total
                      </p>
                    </div>
                    
                    <div className="bg-muted p-3 rounded">
                      <h3 className="font-medium text-foreground">Avg Load Time</h3>
                      <p className="text-2xl font-bold text-foreground">
                        {report.resources.averageLoadTime}ms
                      </p>
                    </div>
                    
                    {report.memory && (
                      <div className="bg-muted p-3 rounded">
                        <h3 className="font-medium text-foreground">Memory</h3>
                        <p className="text-2xl font-bold text-foreground">
                          {report.memory.used} MB
                        </p>
                        <p className="text-sm text-foreground">
                          of {report.memory.total} MB
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Resources by type */}
                  <div>
                    <h3 className="font-medium text-foreground mb-2">Resources by Type</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(report.resources.byType).map(([type, data]) => (
                        <div key={type} className="bg-muted p-2 rounded text-sm">
                          <div className="font-medium capitalize">{type}</div>
                          <div className="text-foreground">
                            {data.count} files, {data.size} KB, {data.avgDuration}ms avg
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent metrics */}
                  <div>
                    <h3 className="font-medium text-foreground mb-2">Recent Metrics</h3>
                    <div className="bg-muted p-3 rounded">
                      <pre className="text-xs overflow-x-auto">
                        {JSON.stringify(report.metrics.slice(-10), null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Analytics;