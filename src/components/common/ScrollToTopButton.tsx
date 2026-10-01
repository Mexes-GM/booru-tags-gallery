import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp } from 'lucide-react';

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

  const stateClasses = visible
    ? 'opacity-100 translate-y-0'
    : 'pointer-events-none opacity-0 translate-y-2';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t('ui.scrollToTop')}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      data-state={visible ? 'visible' : 'hidden'}
      className={`fixed bottom-5 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-[opacity,transform,color] duration-200 ease-out-expo hover:text-foreground active:scale-[0.97] motion-reduce:transition-none sm:bottom-6 sm:right-6 ${stateClasses}`}
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
};

export default ScrollToTopButton;
