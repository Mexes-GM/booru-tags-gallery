import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useNSFWFilter } from '../../context/useNSFWFilter';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useImageModal } from '../../context/useImageModal';
import { useTagModal } from '../../context/useTagModal';
import { useModalZIndex } from '../../context/ModalZIndexContext';
import LoadingSpinner from './LoadingSpinner';
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
  const { getModalZIndex, setActiveModal, releaseModal, activeModal } = useModalZIndex();
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

  // Gestionar z-index cuando el modal se abre/cierra
  useEffect(() => {
    if (isModalOpen) {
      setActiveModal('image');
      setZIndex(getModalZIndex('image'));
    } else {
      releaseModal('image');
    }
  }, [isModalOpen, setActiveModal, releaseModal]);

  // Actualizar z-index cuando cambia el modal activo
  useEffect(() => {
    if (isModalOpen) {
      setZIndex(getModalZIndex('image'));
    }
  }, [isModalOpen, activeModal]); // Dependemos de activeModal en lugar de getModalZIndex

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

  // Función para copiar todos los tags (usa utilidad centralizada)
  const copyAllTags = async (event?: React.MouseEvent) => {
    if (!selectedPost?.tag_string) return;
    const tags = selectedPost.tag_string.split(' ').filter(tag => tag.trim() !== '');
    const tagsText = tags.join(', '); // copyToClipboard ya formatea underscores
  const ok = await copyToClipboard(tagsText);
  showCopyFeedback(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), event);
  };

  // Función para copiar un tag individual
  const copyIndividualTag = async (tagName: string, event?: MouseEvent | { clientX: number; clientY: number }) => {
    const ok = await copyToClipboard(tagName);
    if (event && 'clientX' in event && 'clientY' in event) {
      showCopyFeedback(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), {
        clientX: event.clientX,
        clientY: event.clientY
      } as any);
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
  case 'g': return 'status-success';
      case 's': return 'text-yellow-600 dark:text-yellow-400';
      case 'q': return 'text-orange-600 dark:text-orange-400';
      case 'e': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
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
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 lg:p-4"
      style={{ zIndex }}
      role="dialog" 
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
  className="modal-shell relative max-w-7xl h-[98vh] lg:h-[95vh] bg-surface dark:bg-[var(--color-searchcard)] rounded-lg shadow-2xl outline-none border border-subtle"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 'min(100vw, 95rem)' }}
      >
        {/* Header */}
  <div className="flex items-center justify-between p-3 lg:p-4 border-b border-subtle flex-shrink-0 bg-surface-alt dark:bg-[var(--color-searchcard)]/60 backdrop-blur-sm">
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
            <div className="text-center">
              <h2 className="text-lg lg:text-xl font-semibold text-primary truncate">
                {selectedPost ? `Post #${selectedPost.id}` : 'Loading...'}
              </h2>
              {/* (Removed resolution and score line as requested) */}
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

        {/* Content */}
  <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center w-full">
              <LoadingSpinner size="lg" />
            </div>
          ) : selectedPost ? (
            <>
              {/* Imagen - Arriba en móvil, izquierda en desktop */}
              <div className="flex-1 lg:flex-1 flex items-center justify-center bg-surface-alt dark:bg-[var(--color-searchcard)]/40 p-2 lg:p-4 overflow-hidden min-h-[40vh] lg:min-h-0">
                <div className="relative w-full h-full flex items-center justify-center">
                  {!imageLoaded && !imageError && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <LoadingSpinner size="lg" />
                    </div>
                  )}
                  {imageError ? (
                    <div className="flex flex-col items-center justify-center p-4 lg:p-8 text-gray-500 dark:text-slate-400">
                      <svg className="w-12 h-12 lg:w-16 lg:h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <p className="text-sm lg:text-base">Error loading image</p>
                    </div>
                  ) : selectedPost ? (
                    (() => {
                      const rating = selectedPost.rating;
                      const blocked = !!(nsfwFilterEnabled && rating && allowedRatings && !allowedRatings.includes(rating));
                      if (blocked) {
                        return (
                          <div className="relative w-full h-80 image-container">
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <div className="flex flex-col items-center justify-center text-center p-4">
                                <svg className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span className="text-xs sm:text-sm font-medium text-red-600">Content blocked by NSFW filter</span>
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
              <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-subtle overflow-y-auto max-h-[50vh] lg:max-h-none bg-surface/60 dark:bg-[var(--color-searchcard)]/30 backdrop-blur-sm">
                <div className="p-3 lg:p-6 space-y-3 lg:space-y-6">
                  {/* Rating */}
                  <div>
                    <h3 className="text-sm font-medium text-primary mb-1 lg:mb-2">Rating</h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRatingColor(selectedPost.rating)}`}>
                      {getRatingText(selectedPost.rating)}
                    </span>
                  </div>

                  {/* (Removed File Information, Statistics, and Dates sections as requested) */}

                  {/* Tags */}
                  <div>
                    <div className="flex items-center justify-between mb-1 lg:mb-2">
                      <h3 className="text-sm font-medium text-primary">Tags</h3>
                      <button
                        onClick={(e) => copyAllTags(e)}
                        /* btn-subtle asegura un fondo perceptible en ambos temas */
                        className="px-2 lg:px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1 btn-subtle shadow-sm hover:shadow focus-ring"
                        title={t('ui.copyAllTags')}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs">{t('ui.copy')}</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-0.5 md:gap-1">
                      {selectedPost.tag_string.split(' ').map((tag, index) => {
                        const tagData = findTagByName(tag);
                        // Asegurar clase base cat-badge y consistencia de hover con wiki modal
                        const baseInteractive = 'hover:opacity-80 active:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-400/40';
                        const categoryClass = tagData?.category !== undefined
                          ? `${getCategoryClass(tagData.category)} ${baseInteractive}`
                          : `cat-badge bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-300 ${baseInteractive}`;

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
                    <h3 className="text-sm font-medium text-primary mb-1 lg:mb-2">Source</h3>
                    <a
                      href={`https://danbooru.donmai.us/posts/${selectedPost.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                    >
                      View on Danbooru
                    </a>

                  </div>

                  {/* Uploader */}
                  {selectedPost.uploader_name && (
                    <div>
                      <h3 className="text-sm font-medium text-primary mb-1 lg:mb-2">Uploader</h3>
                      <div className="text-sm text-secondary">
                        {selectedPost.uploader_name}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center w-full text-gray-500 dark:text-slate-400">
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
          <div className="bg-green-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium animate-pulse">
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
      className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[11px] sm:text-xs leading-tight font-medium whitespace-nowrap transition-colors duration-150 ${categoryClass} ${isLongPressing ? 'ring-2 ring-accent' : ''}`}
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