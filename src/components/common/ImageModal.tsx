import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useNSFWFilter } from '../../context/useNSFWFilter';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useImageModal } from '../../context/useImageModal';
import { useTagModal } from '../../context/useTagModal';
import { useModalZIndex } from '../../context/useModalZIndex';
import LoadingSpinner from './LoadingSpinner';
import CopyButton from '../ui/CopyButton';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, ShieldAlert, X } from 'lucide-react';
import { getCategoryClass } from '../../utils/categoryUtils';
import { DanbooruPost, LocalTagData } from '../../types';
import { loadTagsData, getCachedTags } from '../../utils/sharedTagDataLoader';
import { copyToClipboard } from '../../utils/copyUtils';

import '../../styles/modalAnimations.css';
import { acquireScrollLock } from '../../utils/scrollLock';

const ImageModal: React.FC = () => {
  const { 
    selectedPost, 
    isModalOpen, 
    isLoading, 
    closeModal, 
    goBack, 
    goForward, 
    canGoBack, 
    canGoForward 
  } = useImageModal();
  // NSFW filter context (tolerante si provider no está montado todavía)
  let nsfwFilterEnabled = false; let allowedRatings: string[] | undefined;
  try { const ctx = useNSFWFilter(); nsfwFilterEnabled = ctx.isNSFWFilterEnabled; allowedRatings = ctx.getRatingParams().allowedRatings; } catch {}
  const { openModalByTagName } = useTagModal();
  const { getModalZIndex, setActiveModal, releaseModal } = useModalZIndex();
  const { t } = useTranslation();
  
  const modalRef = useRef<HTMLDivElement>(null);
  const [zIndex, setZIndex] = useState<number>(9000);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [tagsData, setTagsData] = useState<LocalTagData[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<{ show: boolean; text: string; x: number; y: number }>({ 
    show: false, 
    text: '', 
    x: 0, 
    y: 0 
  });

  // Function to find tag in local data - memoizado para mejor rendimiento
  const findTagByName = useMemo(() => {
    return (tagName: string): LocalTagData | undefined => {
      return tagsData.find(tag => 
        tag.name.toLowerCase() === tagName.toLowerCase()
      );
    };
  }, [tagsData]);

  // Load tags data
  useEffect(() => {
    let cancelled = false;
    const existing = getCachedTags();
    if (existing) setTagsData(existing);
    loadTagsData().then(data => { if (!cancelled) setTagsData(data); });
    return () => { cancelled = true; };
  }, []);

  // Registrar/liberar el modal en el gestor de z-index cuando se abre/cierra
  useEffect(() => {
    if (isModalOpen) {
      setActiveModal('image');
    } else {
      releaseModal('image');
    }
  }, [isModalOpen, setActiveModal, releaseModal]);

  // Actualizar z-index cuando cambia el modal activo (getModalZIndex se recrea al cambiar activeModal/openModals)
  useEffect(() => {
    if (isModalOpen) {
      setZIndex(getModalZIndex('image'));
    }
  }, [isModalOpen, getModalZIndex]);

  // Reset image states when post changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [selectedPost?.id]);

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

  const handleTagClick = (tagName: string) => {
    openModalByTagName(tagName);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  };

  // Función para mostrar feedback de copia
  const showCopyFeedback = (text: string, event?: { clientX: number; clientY: number } | React.MouseEvent | MouseEvent) => {
    let x = 0;
    let y = 0;
    
    if (event) {
      x = event.clientX;
      y = event.clientY;
    } else {
      // Si no hay evento (como en el botón), usar una posición por defecto
      x = window.innerWidth / 2;
      y = window.innerHeight / 2;
    }
    
    setCopyFeedback({ show: true, text, x, y });
    
    // Ocultar después de 2 segundos
    setTimeout(() => {
      setCopyFeedback({ show: false, text: '', x: 0, y: 0 });
    }, 2000);
  };

  // Función para copiar un tag individual
  const copyIndividualTag = async (tagName: string, event?: MouseEvent | { clientX: number; clientY: number }) => {
    const ok = await copyToClipboard(tagName);
    if (event && 'clientX' in event && 'clientY' in event) {
      showCopyFeedback(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), {
        clientX: event.clientX,
        clientY: event.clientY
      });
    } else {
      showCopyFeedback(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'));
    }
    return ok;
  };

  // Manejar click derecho en tags
  const handleTagRightClick = (e: React.MouseEvent, tagName: string) => {
    e.preventDefault();
    e.stopPropagation();
    copyIndividualTag(tagName, e);
  };

  // Manejar long press en móviles
  const handleTagLongPress = (tagName: string, event?: { clientX: number; clientY: number }) => {
    copyIndividualTag(tagName, event);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  // Get the best available image URL
  const getImageUrl = (post: DanbooruPost): string => {
    const urls = [
      post.file_url,
      post.large_file_url,
      post.preview_file_url
    ].filter(Boolean);
    
    return urls[0] || '';
  };

  // (Removed formatDate & formatFileSize: no longer needed after hiding file/stats/date info)

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'g': return 'cat-character';
      case 's': return 'cat-meta';
      case 'q': return 'cat-artist';
      case 'e': return 'cat-artist';
      default: return 'cat-default';
    }
  };

  const getRatingText = (rating: string) => {
    switch (rating) {
      case 'g': return 'General';
      case 's': return 'Sensitive';
      case 'q': return 'Questionable';
      case 'e': return 'Explicit';
      default: return 'Unknown';
    }
  };

  if (!isModalOpen) return null;

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
  className="modal-shell modal-content relative h-[98vh] max-w-7xl rounded-xl border border-border bg-background text-foreground shadow-2xl outline-none lg:h-[92vh]"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 'min(100vw, 95rem)' }}
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

          <div className="flex min-w-0 flex-1 items-center justify-center">
            <h2 className="truncate font-mono text-sm font-medium tabular-nums lg:text-base">
              {selectedPost ? `Post #${selectedPost.id}` : t('common.loading')}
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={closeModal}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('modal.close')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
  <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center w-full">
              <LoadingSpinner size="lg" />
            </div>
          ) : selectedPost ? (
            <>
              {/* Imagen - Arriba en móvil, izquierda en desktop */}
              <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-hidden bg-muted/40 p-2 lg:min-h-0 lg:p-4">
                <div className="relative w-full h-full flex items-center justify-center">
                  {!imageLoaded && !imageError && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <LoadingSpinner size="lg" />
                    </div>
                  )}
                  {imageError ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
                      <AlertTriangle className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
                      <p className="text-sm">Error loading image</p>
                    </div>
                  ) : selectedPost ? (
                    (() => {
                      const rating = selectedPost.rating;
                      const blocked = !!(nsfwFilterEnabled && rating && allowedRatings && !allowedRatings.includes(rating));
                      if (blocked) {
                        return (
                          <div className="relative w-full h-80 image-container">
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
                                <ShieldAlert className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
                                <span className="text-sm font-medium">{t('nsfw.blocked')}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <img
                          src={getImageUrl(selectedPost)}
                          alt={`Post ${selectedPost.id}`}
                          className="max-w-full max-h-full object-contain"
                          onLoad={handleImageLoad}
                          onError={handleImageError}
                          style={{ display: imageLoaded ? 'block' : 'none' }}
                        />
                      );
                    })()
                  ) : null}
                </div>
              </div>

              {/* Información - Abajo en móvil, derecha en desktop */}
              <div className="max-h-[50vh] w-full overflow-y-auto border-t border-border bg-card lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
                <div className="space-y-5 p-4 lg:p-5">
                  {/* Rating */}
                  <div>
                    <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rating</h3>
                    <span className={`cat-badge ${getRatingColor(selectedPost.rating)}`}>
                      {getRatingText(selectedPost.rating)}
                    </span>
                  </div>

                  {/* (Removed File Information, Statistics, and Dates sections as requested) */}

                  {/* Tags */}
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</h3>
                      <CopyButton
                        text={selectedPost.tag_string.split(' ').filter(tag => tag.trim() !== '').join(', ')}
                        label={t('ui.copyAllTags')}
                        size="sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedPost.tag_string.split(' ').map((tag, index) => {
                        const tagData = findTagByName(tag);
                        // Asegurar clase base cat-badge y consistencia de hover con wiki modal
                        const categoryClass = tagData?.category !== undefined
                          ? getCategoryClass(tagData.category)
                          : 'cat-badge cat-default';

                        return (
                          <TagButton
                            key={index}
                            tag={tag}
                            categoryClass={categoryClass}
                            onLeftClick={() => handleTagClick(tag)}
                            onRightClick={(e) => handleTagRightClick(e, tag)}
                            onLongPress={(event) => handleTagLongPress(tag, event)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Source */}
                  <div>
                    <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</h3>
                    <a
                      href={`https://danbooru.donmai.us/posts/${selectedPost.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary-text underline decoration-primary-text/40 underline-offset-[3px] hover:decoration-primary-text"
                    >
                      {t('tags.viewOnDanbooru')}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>

                  </div>

                  {/* Uploader */}
                  {selectedPost.uploader_name && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Uploader</h3>
                      <div className="text-sm">
                        {selectedPost.uploader_name}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex w-full items-center justify-center text-muted-foreground">
              No post selected
            </div>
          )}
        </div>
      </div>
      
      {/* Feedback visual de copia */}
      {copyFeedback.show && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: copyFeedback.x,
            top: copyFeedback.y - 50,
            transform: 'translateX(-50%)',
            zIndex: zIndex + 1000
          }}
        >
          <div className="copy-bubble">
            {copyFeedback.text}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

// Componente TagButton con soporte para long press y click derecho
interface TagButtonProps {
  tag: string;
  categoryClass: string;
  onLeftClick: () => void;
  onRightClick: (e: React.MouseEvent) => void;
  onLongPress: (event?: { clientX: number; clientY: number }) => void;
}

const TagButton: React.FC<TagButtonProps> = ({ tag, categoryClass, onLeftClick, onRightClick, onLongPress }) => {
  const { t } = useTranslation();
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    touchStartTimeRef.current = Date.now();
    setIsLongPressing(false);
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressing(true);
      onLongPress({ clientX: startPosRef.current.x, clientY: startPosRef.current.y });
    }, 500);
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
    const touchDuration = Date.now() - touchStartTimeRef.current;
    if (!isLongPressing && touchDuration < 500) {
      onLeftClick();
    }
    setIsLongPressing(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressing(true);
      onLongPress({ clientX: startPosRef.current.x, clientY: startPosRef.current.y });
    }, 500);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0) {
      clearLongPressTimer();
      setIsLongPressing(false);
      return;
    }
    clearLongPressTimer();
    if (!isLongPressing) {
      onLeftClick();
    }
    setIsLongPressing(false);
  };

  const handleMouseLeave = () => {
    clearLongPressTimer();
    setIsLongPressing(false);
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return (
    <button
      className={`${categoryClass} whitespace-nowrap ${isLongPressing ? 'ring-2 ring-ring' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={onRightClick}
      title={t('ui.tagButtonTooltip', { tag: tag.replace(/_/g, ' ') })}
    >
      {tag.replace(/_/g, ' ')}
    </button>
  );
};

export default ImageModal;