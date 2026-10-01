import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { getCategoryName, getCategoryBaseClass } from '../../utils/categoryUtils';
import { formatNumber } from '../../utils/formatUtils';
import LoadingSpinner from './LoadingSpinner';
import CopyButton from '../ui/CopyButton';
import { AlertTriangle, ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import InfinitePostGallery from './InfinitePostGallery';
import { useTagModal } from '../../context/useTagModal';
import { useTagModalEventListener } from '../../utils/tagLinkHandler';
import { useTagModalData } from '../../hooks/useTagModalData';
import { useModalZIndex } from '../../context/useModalZIndex';

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
  const { getModalZIndex, setActiveModal, releaseModal } = useModalZIndex();
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

  // Registrar/liberar el modal en el gestor de z-index cuando se abre/cierra
  useEffect(() => {
    if (isModalOpen) {
      setActiveModal('tag');
    } else {
      releaseModal('tag');
    }
  }, [isModalOpen, setActiveModal, releaseModal]);

  // Actualizar z-index cuando cambia el modal activo (getModalZIndex se recrea al cambiar activeModal/openModals)
  useEffect(() => {
    if (isModalOpen) {
      setZIndex(getModalZIndex('tag'));
    }
  }, [isModalOpen, getModalZIndex]);

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
      link.classList.add('ring-2', ok ? 'ring-primary':'ring-destructive');
      setTimeout(()=>link.classList.remove('ring-2','ring-primary','ring-destructive'),700);
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
        link.classList.add('ring-2', ok ? 'ring-primary':'ring-destructive');
        setTimeout(()=>link.classList.remove('ring-2','ring-primary','ring-destructive'),700);
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
      className="modal-backdrop fixed inset-0 flex items-center justify-center bg-overlay/60 p-2 lg:p-6"
      style={{ zIndex }}
      role="dialog" 
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="modal-shell modal-content relative h-[98vh] max-w-6xl rounded-xl border border-border bg-background text-foreground shadow-2xl outline-none lg:h-[92vh]"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          // En móviles muy pequeños asegurar pequeña separación de bordes
          maxWidth: 'min(100vw, 90rem)',
        }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-2 py-2 lg:gap-3 lg:px-4">
          <div className="flex gap-1">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label={t('common.previous')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label={t('common.next')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2.5">
            <span className={`cat-dot ${getCategoryBaseClass(selectedTag.category)}`} aria-hidden="true" />
            <div className="min-w-0 text-center">
              <h2 className="truncate text-base font-semibold tracking-tight lg:text-lg">
                {selectedTag.name.replace(/_/g, ' ')}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {getCategoryName(selectedTag.category)}
                <span aria-hidden="true" className="mx-1.5 text-muted-foreground/40">·</span>
                <span className="font-mono tabular-nums">{formatNumber(selectedTag.post_count)}</span> posts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {!selectedTag.name.startsWith('tag_group:') && (
              <CopyButton text={selectedTag.name} label={t('ui.copyTag')} size="sm" className="hidden sm:inline-flex" />
            )}
            <button
              onClick={closeModal}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('modal.close')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
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
              <div className="mb-4">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive-text" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-base font-medium">{t('modal.error')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Wiki Information */}
              {wikiInfo && (
                <div className="rounded-xl bg-card p-4 lg:p-6">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('tag.wikiInformation')}
                  </h3>
                  <div
                    data-wiki-modal
                    className="wiki-prose max-w-none"
                    dangerouslySetInnerHTML={{ __html: formattedWikiHtml }}
                  />
                </div>
              )}

              {/* Gallery Section (oculta para tag groups) */}
              {!selectedTag.name.startsWith('tag_group:') && (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('tag.relatedPosts')}
                    </h3>
                    {nsfwBlockedPosts.size > 0 && (
                      <div className="text-xs text-warning-text">
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
                    <div className="py-12 text-center text-muted-foreground">
                      <ImageOff className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} aria-hidden="true" />
                      <p className="text-base font-medium text-foreground">{t('gallery.noPosts')}</p>
                      <p className="mt-1 text-sm">{t('gallery.noPostsDescription')}</p>
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