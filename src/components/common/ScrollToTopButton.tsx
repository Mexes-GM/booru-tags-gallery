import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * ScrollToTopButton
 * Muestra un botón flotante para volver al inicio cuando el usuario hace scroll hacia abajo.
 * - Se oculta en la parte superior (< THRESHOLD px)
 * - Usa scroll suave nativo
 * - Listener optimizado (raf + passive)
 */
const THRESHOLD = 500; // px desde el top para mostrar el botón

const ScrollToTopButton: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Detectar preferencia de reduce motion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setVisible(window.scrollY > THRESHOLD);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Comprobar estado inicial (p.e. navegación con scroll restaurado)
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    } catch {
      // Fallback
      window.scrollTo(0, 0);
    }
  }, [reducedMotion]);

  // Clases base y estados para animación
  const transitionBase = reducedMotion ? '' : 'transition-opacity transition-transform duration-300 ease-out will-change-transform will-change-opacity';
  const hiddenState = reducedMotion ? 'opacity-0 pointer-events-none' : 'opacity-0 translate-y-3 scale-95 pointer-events-none';
  const visibleState = reducedMotion ? 'opacity-100' : 'opacity-100 translate-y-0 scale-100';
  const stateClasses = visible ? visibleState : hiddenState;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t('ui.scrollToTop')}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      data-state={visible ? 'visible' : 'hidden'}
      className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 group focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 rounded-full shadow-lg shadow-black/10 dark:shadow-black/30 ${transitionBase} ${stateClasses}`}
      style={reducedMotion ? undefined : { transitionProperty: 'opacity, transform', willChange: 'opacity, transform' }}
    >
      <span className={`relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white dark:text-white border border-white/20 dark:border-white/10 ${reducedMotion ? '' : 'transition-transform group-hover:scale-105 group-active:scale-95'}`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6 drop-shadow"
        >
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
  <span className="sr-only">{t('ui.scrollToTop')}</span>
      </span>
    </button>
  );
};

export default ScrollToTopButton;
