import { useEffect, useState } from 'react';
import { performanceMonitor, usePerformanceMonitor } from '../../utils/performanceMonitor';

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
        maxScrollDepth = scrollDepth;
        
        // Record scroll milestones
        if (scrollDepth >= 25 && maxScrollDepth < 25) {
          recordInteraction('scroll', '25%');
        } else if (scrollDepth >= 50 && maxScrollDepth < 50) {
          recordInteraction('scroll', '50%');
        } else if (scrollDepth >= 75 && maxScrollDepth < 75) {
          recordInteraction('scroll', '75%');
        } else if (scrollDepth >= 90 && maxScrollDepth < 90) {
          recordInteraction('scroll', '90%');
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
  const [report, setReport] = useState<any>(null);
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
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={handleGenerateReport}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors"
          title="Generate Performance Report"
        >
          📊 Perf
        </button>
      </div>

      {/* Debug panel modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Performance Report
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleExportMetrics}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                >
                  Export
                </button>
                <button
                  onClick={handleClearMetrics}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors"
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
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                      <h3 className="font-medium text-blue-900 dark:text-blue-100">Resources</h3>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {report.resources.total}
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {report.resources.totalSize} KB total
                      </p>
                    </div>
                    
                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                      <h3 className="font-medium text-green-900 dark:text-green-100">Avg Load Time</h3>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {report.resources.averageLoadTime}ms
                      </p>
                    </div>
                    
                    {report.memory && (
                      <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                        <h3 className="font-medium text-purple-900 dark:text-purple-100">Memory</h3>
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {report.memory.used} MB
                        </p>
                        <p className="text-sm text-purple-700 dark:text-purple-300">
                          of {report.memory.total} MB
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Resources by type */}
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white mb-2">Resources by Type</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(report.resources.byType).map(([type, data]: [string, any]) => (
                        <div key={type} className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-sm">
                          <div className="font-medium capitalize">{type}</div>
                          <div className="text-gray-600 dark:text-gray-300">
                            {data.count} files, {data.size} KB, {data.avgDuration}ms avg
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent metrics */}
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white mb-2">Recent Metrics</h3>
                    <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
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