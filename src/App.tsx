import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useEffect, Suspense, lazy } from 'react';
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
const SettingsButton = lazy(() => import('./components/SettingsButton'));
import { setupImageLinkHandler } from './utils/imageLinkHandler';
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';
import { Analytics, PerformanceDebugPanel } from './components/analytics/Analytics';
import './App.css';

export default function App() {
  const { t } = useTranslation();
  // Configurar el manejador global de clics en imágenes
  useEffect(() => {
    const cleanup = setupImageLinkHandler();
    // Listener global para click derecho en enlaces de tags generados dinámicamente (.tag-link)
    const handleContextMenu = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tagLink = target.closest('.tag-link') as HTMLElement | null;
      if (tagLink) {
        e.preventDefault();
        e.stopPropagation();
        // Evitar doble copia si acaba de ocurrir un long press
        const now = Date.now();
        const last = (lastLongPressRef as any).t as number | undefined;
        if (last && now - last < 700) {
          return; // suprimir copia duplicada
        }
        const tagName = tagLink.getAttribute('data-tag-name');
        if (tagName) {
          const ok = await copyToClipboard(tagName);
          showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
          tagLink.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
          setTimeout(()=>tagLink.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
        }
      }
    };
    document.addEventListener('contextmenu', handleContextMenu, true);
    // Long press móvil genérico para enlaces .tag-link
    let touchTimer: number | null = null;
    let touchTarget: HTMLElement | null = null;
    const LONG_PRESS = 550;
  const lastLongPressRef: { t?: number } = {};
  const onTouchStart = (e: TouchEvent) => {
      const targetEl = e.target as HTMLElement;
      const link = targetEl.closest('.tag-link') as HTMLElement | null;
      if (!link) return;
      touchTarget = link;
      const firstTouch = e.touches[0];
      // Guardar coordenadas inmediatamente (algunos navegadores invalidan el objeto Touch tras el timeout)
      const startX = firstTouch?.clientX ?? 0;
      const startY = firstTouch?.clientY ?? 0;
      touchTimer = window.setTimeout(async () => {
        if (!touchTarget) return;
        const tagName = touchTarget.getAttribute('data-tag-name');
        if (tagName) {
          const ok = await copyToClipboard(tagName);
          showCopyFeedbackBubble(
            ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
            startX,
            startY,
            ok
          );
          touchTarget.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
          setTimeout(()=>touchTarget?.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
          lastLongPressRef.t = Date.now();
        }
      }, LONG_PRESS);
    };
  const clearTouch = () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      touchTarget = null;
    };
  document.addEventListener('touchstart', onTouchStart, true);
    document.addEventListener('touchend', clearTouch, true);
    document.addEventListener('touchcancel', clearTouch, true);
    return cleanup;
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
                  <div className="min-h-screen bg-gray-100 dark:bg-gray-950 transition-colors duration-200">
                    <main className="w-full">
                      <ErrorBoundary>
                        <Suspense fallback={
                          <div className="min-h-[50vh] flex items-center justify-center">
                            <LoadingSpinner size="lg" className="text-blue-600 dark:text-blue-400" ariaLabel="Loading page" />
                          </div>
                        }>
                          <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/tags/:tagName" element={<TagDetailPage />} />
                          </Routes>
                        </Suspense>
                      </ErrorBoundary>
                    </main>
                    <ErrorBoundary>
                      <Suspense fallback={null}>
                        <SettingsButton />
                      </Suspense>
                    </ErrorBoundary>
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