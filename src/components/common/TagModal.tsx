import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { getCategoryName, getCategoryBaseClass } from '../../utils/categoryUtils';
import { formatPostCount } from '../../utils/formatUtils';
import LoadingSpinner from './LoadingSpinner';
import InfinitePostGallery from './InfinitePostGallery';
import { useTagModal } from '../../context/useTagModal';
import { useTagModalEventListener } from '../../utils/tagLinkHandler';
import { useTagModalData } from '../../hooks/useTagModalData';
import { useModalZIndex } from '../../context/ModalZIndexContext';

import '../../styles/modalAnimations.css';
import { acquireScrollLock } from '../../utils/scrollLock';
import { ensureTagCategoryMap, applyCategoryClassesToLinks } from '../../utils/tagCategoryMap';
import { copyToClipboard } from '../../utils/copyUtils';
import { showCopyFeedbackBubble } from '../../utils/copyFeedbackBubble'; // Utilidad para mostrar feedback de copia

// Marca global para suprimir apertura tras copiar por long press
let lastWikiLongPressTime = 0;
// const DEBUG_WIKI_LONGPRESS = true; // Cambia a false para silenciar logs

const TagModal: React.FC = () => {
  const { 
    selectedTag, 
    isModalOpen, 
    closeModal, 
    openModalByTagName,
    goBack, 
    goForward, 
    canGoBack, 
    canGoForward 
  } = useTagModal();
  const { getModalZIndex, setActiveModal, releaseModal, activeModal } = useModalZIndex();
  const { t } = useTranslation();
  
  const modalRef = useRef<HTMLDivElement>(null);
  const [zIndex, setZIndex] = useState<number>(9000);

  const {
    wikiInfo,
    isLoadingWiki,
    isLoadingGallery,
    nsfwBlockedPosts,
    formattedWikiHtml,
    error,
    allPosts,
    hasMorePosts,
    isLoadingMorePosts,
    loadMorePosts,
    infiniteScrollError
  } = useTagModalData(selectedTag?.name);

  // Gestionar z-index cuando el modal se abre/cierra
  useEffect(() => {
    if (isModalOpen) {
      setActiveModal('tag');
      setZIndex(getModalZIndex('tag'));
    } else {
      releaseModal('tag');
    }
  }, [isModalOpen, setActiveModal, releaseModal]);

  // Actualizar z-index cuando cambia el modal activo
  useEffect(() => {
    if (isModalOpen) {
      setZIndex(getModalZIndex('tag'));
    }
  }, [isModalOpen, activeModal]); // Dependemos de activeModal en lugar de getModalZIndex

  // Event listeners para eventos personalizados
  useTagModalEventListener((tagName: string) => {
    openModalByTagName(tagName);
  });

  // Event listener para clics en enlaces de tags (data attributes)
  useEffect(() => {
    const handleTagLinkClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const tagLink = target.closest('.tag-link');
      if (tagLink) {
        const suppressedByDataset = (tagLink as HTMLElement).dataset.longPressed === '1';
        const suppressedByTime = Date.now() - lastWikiLongPressTime < 650;
        if (suppressedByDataset || suppressedByTime) {
          event.preventDefault();
          event.stopPropagation();
          // limpiar flag para futuros clics
          delete (tagLink as HTMLElement).dataset.longPressed;
          return;
        }
            // Apertura normal, se abre el modal
        event.preventDefault();
        event.stopPropagation();
        const tagName = tagLink.getAttribute('data-tag-name');
        if (tagName) openModalByTagName(tagName);
      }
    };
    document.addEventListener('click', handleTagLinkClick, true);
    return () => {
      document.removeEventListener('click', handleTagLinkClick, true);
    };
  }, [openModalByTagName]);

  // Handle escape key
  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isModalOpen, closeModal]);

  // Focus management
  useEffect(() => {
    if (isModalOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isModalOpen]);

  // Body scroll lock centralizado (soporta múltiples modales superpuestos)
  useEffect(() => {
    if (!isModalOpen) return;
    const release = acquireScrollLock();
    return () => release();
  }, [isModalOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  };

  // Colorear enlaces de tags dentro del contenido wiki del modal
  useEffect(() => {
    if (!formattedWikiHtml) return;
    ensureTagCategoryMap();
    requestAnimationFrame(() => {
      if (modalRef.current) {
        const wikiContainers = modalRef.current.querySelectorAll('[data-wiki-modal]');
        wikiContainers.forEach(c => applyCategoryClassesToLinks(c as HTMLElement));
      }
    });
  }, [formattedWikiHtml]);

  // Long press y click derecho para copiar tags dentro del wiki del modal (per-link para mayor fiabilidad)
  useEffect(() => {
    if (!isModalOpen) return;
    const root = modalRef.current;
    if (!root) return;
  const LONG_PRESS_MS = 450; // más corto para evitar menú nativo
    const lastLongPressRef: { t?: number } = {};
    const disposers: Array<() => void> = [];

    const handleContextMenu = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a.tag-link[data-tag-name]') as HTMLElement | null;
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (lastLongPressRef.t && now - lastLongPressRef.t < 700) return;
      const tagName = link.getAttribute('data-tag-name');
      if (!tagName) return;
      const ok = await copyToClipboard(tagName);
      showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
      link.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
      setTimeout(()=>link.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
    };

    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

    const bindLink = (link: HTMLElement) => {
      if (link.dataset.lpBound) return; // evitar duplicados
      link.dataset.lpBound = '1';
      let timer: number | null = null;
      let startX = 0; let startY = 0; let moved = false;
        let startTime = 0; let longPressFired = false;

        const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
        const triggerCopy = async () => {
        const tagName = link.getAttribute('data-tag-name');
        if (!tagName) return;
        const ok = await copyToClipboard(tagName);
        showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), startX, startY, ok);
        link.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
        setTimeout(()=>link.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
        const now = Date.now();
        lastLongPressRef.t = now;
        lastWikiLongPressTime = now;
          longPressFired = true;
          link.dataset.longPressed = '1';
      };

        const schedule = () => {
          clear(); moved = false; longPressFired = false; startTime = Date.now();
          timer = window.setTimeout(() => { if (!moved) { triggerCopy(); } }, LONG_PRESS_MS + 10); // +10ms margen
      };
      const moveCheck = (x:number,y:number) => {
        if (!timer) return;
          if (Math.abs(x - startX) > 18 || Math.abs(y - startY) > 18) { moved = true; clear(); }
      };
        const cancel = () => { clear(); };
      const click = (e: MouseEvent) => {
        if (lastLongPressRef.t && Date.now() - lastLongPressRef.t < 600) { e.preventDefault(); e.stopPropagation(); }
      };

      if (supportsPointer) {
        const pointerDown = (e: PointerEvent) => {
          // Aceptar touch, pen y (opcional) mouse botón primario para permitir mantener click en desktop
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (e.pointerType !== 'touch' && e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
          startX = e.clientX; startY = e.clientY; schedule();
        };
        const pointerMove = (e: PointerEvent) => moveCheck(e.clientX, e.clientY);
  const pointerUp = () => {
          if (!moved && !longPressFired) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= LONG_PRESS_MS) {
              triggerCopy();
            }
          }
          cancel();
        };
  const pointerLeave = () => { if (!longPressFired) cancel(); };
        link.addEventListener('pointerdown', pointerDown, { passive: true });
        link.addEventListener('pointermove', pointerMove, { passive: true });
        link.addEventListener('pointerup', pointerUp, { passive: true });
        link.addEventListener('pointerleave', pointerLeave, { passive: true });
  // No cancel: algunos navegadores disparan pointercancel al iniciar scroll leve
        disposers.push(() => {
          link.removeEventListener('pointerdown', pointerDown as any, true as any);
          link.removeEventListener('pointermove', pointerMove as any, true as any);
          link.removeEventListener('pointerup', pointerUp as any, true as any);
          link.removeEventListener('pointerleave', pointerLeave as any, true as any);
        });
      } else {
        const touchStart = (e: TouchEvent) => {
          const tch = e.touches[0]; if (!tch) return; startX = tch.clientX; startY = tch.clientY; schedule();
        };
        const touchMove = (e: TouchEvent) => { const tch = e.touches[0]; if (!tch) return; moveCheck(tch.clientX, tch.clientY); };
        const touchEnd = () => {
          if (!moved && !longPressFired) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= LONG_PRESS_MS) {
              triggerCopy();
            }
          }
          cancel();
        };
        link.addEventListener('touchstart', touchStart, { passive: true });
        link.addEventListener('touchmove', touchMove, { passive: true });
        link.addEventListener('touchend', touchEnd, { passive: true });
        link.addEventListener('touchcancel', touchEnd, { passive: true });
        disposers.push(() => {
          link.removeEventListener('touchstart', touchStart as any, true as any);
          link.removeEventListener('touchmove', touchMove as any, true as any);
          link.removeEventListener('touchend', touchEnd as any, true as any);
          link.removeEventListener('touchcancel', touchEnd as any, true as any);
        });
      }

      link.addEventListener('click', click, true);
      link.addEventListener('contextmenu', handleContextMenu, true);
      disposers.push(() => {
        link.removeEventListener('click', click, true);
        link.removeEventListener('contextmenu', handleContextMenu, true);
        delete link.dataset.lpBound;
      });
    };

    // Enlazar ya presentes
    root.querySelectorAll('a.tag-link[data-tag-name]').forEach(el => bindLink(el as HTMLElement));

    // Observer por si cambia wiki dinámicamente
  const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n instanceof HTMLElement) {
            if (n.matches?.('a.tag-link[data-tag-name]')) bindLink(n);
            n.querySelectorAll?.('a.tag-link[data-tag-name]').forEach(el => bindLink(el as HTMLElement));
          }
        });
      }
    });
    mo.observe(root, { subtree: true, childList: true });
    disposers.push(() => mo.disconnect());

    return () => {
      disposers.forEach(d => d());
    };
  }, [isModalOpen, formattedWikiHtml, t]);

  if (!isModalOpen || !selectedTag) return null;

  return createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 lg:p-4"
      style={{ zIndex }}
      role="dialog" 
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="modal-shell relative max-w-6xl h-[98vh] lg:h-[95vh] bg-surface dark:bg-[var(--color-searchcard)] rounded-lg shadow-2xl outline-none border border-subtle"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          // En móviles muy pequeños asegurar pequeña separación de bordes
          maxWidth: 'min(100vw, 90rem)',
        }}
      >
        {/* Header */}
  <div className="flex items-center justify-between p-3 lg:p-6 border-b border-subtle flex-shrink-0 bg-surface-alt dark:bg-[var(--color-searchcard)]/60 backdrop-blur-sm">
          {/* Botones de navegación historial */}
          <div className="flex gap-1 lg:gap-2">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              className="rounded-full p-1.5 lg:p-2 border border-subtle bg-surface-alt dark:bg-[var(--color-searchcard)]/70 shadow transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('common.previous')}
              tabIndex={0}
            >
              <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              className="rounded-full p-1.5 lg:p-2 border border-subtle bg-surface-alt dark:bg-[var(--color-searchcard)]/70 shadow transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('common.next')}
              tabIndex={0}
            >
              <svg className="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          {/* Título centrado */}
          <div className="flex items-center gap-2 lg:gap-3 flex-1 justify-center min-w-0">
            <div className={`cat-indicator ${getCategoryBaseClass(selectedTag.category)} w-3 h-3 lg:w-4 lg:h-4`} />
            <div className="text-center min-w-0">
              <h2 className="text-lg lg:text-xl font-semibold text-primary truncate">
                {selectedTag.name.replace(/_/g, ' ')}
              </h2>
              <p className="text-xs lg:text-sm text-subtle truncate">
                {getCategoryName(selectedTag.category)} • {formatPostCount(selectedTag.post_count)}
              </p>
            </div>
          </div>
          
          {/* Botón de cerrar */}
          <div className="w-12 lg:w-20 flex justify-end">
            <button
              onClick={closeModal}
              className="p-1.5 lg:p-2 text-text-secondary hover:text-text bg-transparent hover:bg-surface-alt dark:hover:bg-[var(--color-searchcard)]/50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={t('modal.close')}
            >
              <svg className="w-5 h-5 lg:w-6 lg:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - Scrollable area */}
  <div className="flex-1 overflow-y-auto overscroll-contain p-3 lg:p-6">
          {isLoadingWiki ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-600 dark:text-red-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-lg font-medium">{t('error.loadingFailed')}</p>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">{error}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Wiki Information */}
              {wikiInfo && (
                <div className="bg-surface-alt dark:bg-[var(--color-searchcard)]/40 rounded-lg p-4 lg:p-6 border border-subtle">
                  <h3 className="text-lg font-semibold text-primary mb-4">
                    {t('tag.wikiInformation')}
                  </h3>
                  <div 
                    data-wiki-modal
                    className="prose prose-sm dark:prose-invert max-w-none text-secondary"
                    dangerouslySetInnerHTML={{ __html: formattedWikiHtml }}
                  />
                </div>
              )}

              {/* Gallery Section (oculta para tag groups) */}
              {!selectedTag.name.startsWith('tag_group:') && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-primary">
                      {t('tag.relatedPosts')}
                    </h3>
                    {nsfwBlockedPosts.size > 0 && (
                      <div className="text-sm text-orange-600 dark:text-orange-400">
                        {t('gallery.nsfwBlocked', { count: nsfwBlockedPosts.size })}
                      </div>
                    )}
                  </div>

                  {isLoadingGallery ? (
                    <div className="flex items-center justify-center py-12">
                      <LoadingSpinner size="lg" />
                    </div>
                  ) : allPosts.length > 0 ? (
                    <InfinitePostGallery
                      posts={allPosts}
                      nsfwBlockedPosts={nsfwBlockedPosts}
                      isLoading={false}
                      isLoadingMore={isLoadingMorePosts}
                      hasMore={hasMorePosts}
                      onLoadMore={loadMorePosts}
                      error={infiniteScrollError}
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                      <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-lg font-medium">{t('gallery.noPosts')}</p>
                      <p className="text-sm mt-2">{t('gallery.noPostsDescription')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TagModal;