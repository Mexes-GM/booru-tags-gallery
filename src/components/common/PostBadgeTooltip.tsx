import React, { useEffect, useState, useRef } from 'react';
import { DanbooruPost } from '../../types';
import { useNSFWFilter } from '../../context/useNSFWFilter';

interface TooltipState {
  postId: number;
  x: number;
  y: number; // reference y (top of badge)
  visible: boolean;
  loading: boolean;
  post?: DanbooruPost | null;
  direction: 'above' | 'below';
}

// Eventos personalizados disparados desde imageLinkHandler
const HOVER_EVENT = 'postBadgeHover';
const LEAVE_EVENT = 'postBadgeLeave';

// Utilidad para obtener bounding rect y posicionar tooltip
const computePosition = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top; // top of badge
  return { x, y };
};

export const PostBadgeTooltip: React.FC = () => {
  const [state, setState] = useState<TooltipState>({ postId: 0, x: 0, y: 0, visible: false, loading: false, direction: 'above' });
  const timeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  let nsfwFilterEnabled = false;
  let allowedRatings: string[] | undefined;
  try {
  const ctx = useNSFWFilter();
  nsfwFilterEnabled = ctx.isNSFWFilterEnabled;
  const params = ctx.getRatingParams();
  allowedRatings = params.allowedRatings;
  } catch {
    nsfwFilterEnabled = false;
  }

  useEffect(() => {
    const handleHover = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { postId: number; element: HTMLElement };
      const { postId, element } = detail;
      if (!postId || !element) return;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
  const { x, y } = computePosition(element);
  const direction: 'above' | 'below' = y < 120 ? 'below' : 'above';
      // Mostrar tooltip inmediatamente como loading
  setState(prev => ({ ...prev, postId, x, y, visible: true, loading: true, post: undefined, direction }));
      try {
        // Intentar usar cache global (si ImageModal ya lo bajó)
        // Dinámicamente importar API para no aumentar bundle inicial
        const { default: danbooruApi } = await import('../../services/danbooruApi');
        const posts = await danbooruApi.getPostsByIds([postId]);
        const post = posts && posts.length > 0 ? posts[0] : null;
        // Anotar rating en el badge para posibles estilos / lógica externa
        if (post && element) {
          try { element.setAttribute('data-rating', post.rating || ''); } catch { /* ignore */ }
        }
        setState(prev => ({ ...prev, loading: false, post }));
      } catch (_err) {
  setState(prev => ({ ...prev, loading: false, post: null }));
      }
    };

    const handleLeave = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // pequeño delay para permitir mover el mouse al tooltip
      timeoutRef.current = window.setTimeout(() => {
        setState(prev => ({ ...prev, visible: false }));
      }, 120);
    };

    document.addEventListener(HOVER_EVENT, handleHover as EventListener);
    document.addEventListener(LEAVE_EVENT, handleLeave as EventListener);
    // Seguridad adicional: ocultar inmediatamente al cerrar cualquier modal con Escape o clic fuera
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setState(prev => ({ ...prev, visible: false }));
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      document.removeEventListener(HOVER_EVENT, handleHover as EventListener);
      document.removeEventListener(LEAVE_EVENT, handleLeave as EventListener);
      document.removeEventListener('keydown', handleGlobalKeyDown, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Reposicionar si la ventana se desplaza
  useEffect(() => {
    const handleScroll = () => {
      if (!state.visible) return;
      const activeEl = document.querySelector(`[data-post-badge][data-post-id='${state.postId}']`) as HTMLElement | null;
      if (activeEl) {
  const { x, y } = computePosition(activeEl);
  const direction: 'above' | 'below' = y < 120 ? 'below' : 'above';
  setState(prev => ({ ...prev, x, y, direction }));
      } else {
        // Si el elemento desapareció del DOM (por cierre de modal u otro motivo), ocultar tooltip
        setState(prev => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [state.visible, state.postId]);

  // Observer para detectar eliminación del badge del DOM sin mouseleave (ej: cierre veloz de modal)
  useEffect(() => {
    if (!state.visible || !state.postId) return;
    const badge = document.querySelector(`[data-post-badge][data-post-id='${state.postId}']`);
    if (!badge) return;
    const observer = new MutationObserver(() => {
      const stillExists = document.querySelector(`[data-post-badge][data-post-id='${state.postId}']`);
      if (!stillExists) {
        setState(prev => ({ ...prev, visible: false }));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [state.visible, state.postId]);

  if (!state.visible) return null;

  const { x, y, loading, post, direction } = state;
  const previewUrl = post?.preview_file_url || post?.large_file_url || post?.file_url;
  const rating = post?.rating; // 's', 'q', 'e'
  const blockedByNSFW = !!(nsfwFilterEnabled && rating && allowedRatings && !allowedRatings.includes(rating));

  // Posición base: usamos y como top si below (badge top) o como top si above y aplicamos transform -translate-y-full
  const gap = 8; // separación de la badge
  const styleTop = direction === 'above' ? Math.max(4, y - gap) : y + gap;
  const translateY = direction === 'above' ? '-translate-y-full' : 'translate-y-0';

  return (
    <div
      ref={containerRef}
      key={`${state.postId}-${loading ? 'loading' : 'loaded'}`}
      className={`pointer-events-none fixed z-[4000] -translate-x-1/2 ${translateY} transform transition-opacity duration-75`}
      style={{ top: styleTop, left: x }}
    >
    {/* Fondo: antes bg-white parecía "transparente" en light (se perdía contra el body).
      Usamos capa semántica + leve blur y reforzamos opacidad para contraste consistente. */}
    <div className="relative bg-surface dark:bg-slate-800/95 border border-gray-200 dark:border-slate-600 rounded-md shadow-lg p-2 w-48 sm:w-56 backdrop-blur supports-[backdrop-filter]:bg-surface/95 dark:supports-[backdrop-filter]:bg-slate-800/90">
        {loading && (
          <div className="flex items-center justify-center h-24 text-xs text-gray-500 dark:text-gray-400 animate-pulse">Cargando…</div>
        )}
        {!loading && post === null && (
          <div className="flex items-center justify-center h-24 text-xs text-gray-500 dark:text-gray-400">Sin datos</div>
        )}
        {!loading && post && previewUrl && !blockedByNSFW && (
          <img
            src={previewUrl}
            alt={`Post #${post.id}`}
            className="w-full h-auto max-h-48 object-contain rounded"
            draggable={false}
          />
        )}
        {!loading && post && blockedByNSFW && (
          <div className="relative w-full h-24 image-container">
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="flex flex-col items-center justify-center text-center p-2">
                <svg className="w-6 h-6 mx-auto mb-1 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-[10px] font-medium text-red-600">Content blocked by NSFW filter</span>
              </div>
            </div>
          </div>
        )}
        {!loading && post && (
          <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-400 flex justify-between gap-2">
            <span>#{post.id}</span>
            <span className="truncate max-w-[60%]">{blockedByNSFW ? '—' : `Score ${post.score}`}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostBadgeTooltip;
