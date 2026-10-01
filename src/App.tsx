import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useEffect, useRef, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from './utils/copyUtils';
import { showCopyFeedbackBubble } from './utils/copyFeedbackBubble';
// Lazy-loaded routes & heavy UI pieces to shrink initial bundle for faster LCP
const HomePage = lazy(() => import('./components/HomePage'));
const TagDetailPage = lazy(() => import('./components/TagDetailPage'));
import { NSFWFilterProvider } from './context/NSFWFilterContext';
import { ImageLoadingProvider } from './context/ImageLoadingContext';
import { TagModalProvider } from './context/TagModalContext';
import { ImageModalProvider } from './context/ImageModalContext';
import { DarkModeProvider } from './context/DarkModeContext';
import { ModalZIndexProvider } from './context/ModalZIndexContext';
const TagModal = lazy(() => import('./components/common/TagModal'));
const ImageModal = lazy(() => import('./components/common/ImageModal'));
const PostBadgeTooltip = lazy(() => import('./components/common/PostBadgeTooltip'));
import AppHeader from './components/AppHeader';
import { setupImageLinkHandler } from './utils/imageLinkHandler';
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';
import { Analytics, PerformanceDebugPanel } from './components/analytics/Analytics';

export default function App() {
  const { t } = useTranslation();
  // Keep the latest translator in a ref so the global listeners below are registered
  // once, yet always show messages in the current language.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Global handlers: image-link clicks, right-click copy and mobile long-press copy on .tag-link
  useEffect(() => {
    const cleanupImageLinks = setupImageLinkHandler();
    // Timestamp of the last long-press copy, used to suppress the duplicate contextmenu copy
    let lastLongPressAt = 0;

    const flashLink = (link: HTMLElement, ok: boolean) => {
      link.classList.add('ring-2', ok ? 'ring-primary' : 'ring-destructive');
      window.setTimeout(() => link.classList.remove('ring-2', 'ring-primary', 'ring-destructive'), 700);
    };

    const copyTagFromLink = async (link: HTMLElement, x: number, y: number): Promise<boolean> => {
      const tagName = link.getAttribute('data-tag-name');
      if (!tagName) return false;
      const ok = await copyToClipboard(tagName);
      const translate = tRef.current;
      showCopyFeedbackBubble(ok ? translate('clipboard.copySuccess') : translate('clipboard.copyFail'), x, y, ok);
      flashLink(link, ok);
      return true;
    };

    // Right click on dynamically generated tag links (.tag-link) copies the tag name
    const handleContextMenu = (e: MouseEvent) => {
      const tagLink = (e.target as HTMLElement | null)?.closest?.('.tag-link') as HTMLElement | null;
      if (!tagLink) return;
      e.preventDefault();
      e.stopPropagation();
      // Avoid a double copy right after a long press (mobile fires contextmenu too)
      if (lastLongPressAt && Date.now() - lastLongPressAt < 700) return;
      void copyTagFromLink(tagLink, e.clientX, e.clientY);
    };

    // Generic mobile long press on .tag-link
    const LONG_PRESS_MS = 550;
    let touchTimer: number | null = null;
    let touchTarget: HTMLElement | null = null;

    const onTouchStart = (e: TouchEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.('.tag-link') as HTMLElement | null;
      if (!link) return;
      touchTarget = link;
      const firstTouch = e.touches[0];
      // Capture coordinates now (some browsers invalidate the Touch object after the timeout)
      const startX = firstTouch?.clientX ?? 0;
      const startY = firstTouch?.clientY ?? 0;
      touchTimer = window.setTimeout(async () => {
        if (!touchTarget) return;
        if (await copyTagFromLink(touchTarget, startX, startY)) {
          lastLongPressAt = Date.now();
        }
      }, LONG_PRESS_MS);
    };

    const clearTouch = () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      touchTarget = null;
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('touchstart', onTouchStart, true);
    document.addEventListener('touchend', clearTouch, true);
    document.addEventListener('touchcancel', clearTouch, true);

    return () => {
      cleanupImageLinks();
      clearTouch();
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend', clearTouch, true);
      document.removeEventListener('touchcancel', clearTouch, true);
    };
  }, []);

  return (
    <HelmetProvider>
    <Analytics>
    <DarkModeProvider>
      <NSFWFilterProvider>
        <ImageLoadingProvider>
          <ModalZIndexProvider>
            <TagModalProvider>
              <ImageModalProvider>
                <Router>
                  <div className="min-h-screen bg-background text-foreground">
                    <AppHeader />
                    <main className="w-full">
                      <ErrorBoundary>
                        <Suspense fallback={
                          <div className="min-h-[50vh] flex items-center justify-center">
                            <LoadingSpinner size="lg" ariaLabel="Loading page" />
                          </div>
                        }>
                          <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/tags/:tagName" element={<TagDetailPage />} />
                          </Routes>
                        </Suspense>
                      </ErrorBoundary>
                    </main>
                  </div>
                </Router>
                {/* Modals & tooltips lazy-mounted (suspended) so they don't block initial paint */}
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <TagModal />
                    <ImageModal />
                    <PostBadgeTooltip />
                  </Suspense>
                </ErrorBoundary>
              </ImageModalProvider>
            </TagModalProvider>
          </ModalZIndexProvider>
        </ImageLoadingProvider>
      </NSFWFilterProvider>
    </DarkModeProvider>
    <PerformanceDebugPanel />
    </Analytics>
    </HelmetProvider>
  )
}