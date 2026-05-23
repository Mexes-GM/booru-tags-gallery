import React, { useState, useEffect, memo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import imagePreloadService from '../services/imagePreloadService';
import { APP_CONFIG, ASPECT_RATIOS } from '../config/appConfig';
import useOptimizedCardAnimation from '../hooks/useOptimizedCardAnimation';
import useImagePreloader from '../hooks/useImagePreloader';
import useHoverEffects from '../hooks/useHoverEffects';
import { useNSFWFilter } from '../context/useNSFWFilter';
import { PERFORMANCE_CONFIG } from '../config/performanceConfig';
import { getCategoryClass, getCategoryName } from '../utils/categoryUtils';
import { highlightShortMatch } from '../utils/highlightUtils';
import { formatPostCount } from '../utils/formatUtils';
import { formatDTextSafe, extractFirstParagraph } from '../utils/dtextFormatter';
import { ensureTagCategoryMap, applyCategoryClassesToLinks } from '../utils/tagCategoryMap';
import { detectContainerTag } from '../utils/containerTagUtils';
import LoadingSpinner from './common/LoadingSpinner';
import { DanbooruTag, DanbooruWikiPage } from '../types';
import { copyToClipboard } from '../utils/copyUtils';
import { showCopyFeedbackBubble } from '../utils/copyFeedbackBubble';



const STACKED_CARDS_CONFIG = {
  middle: {
    transform: 'translate(1%, 0.25%) scale(1.01)',
    hoverTransform: 'translate(1%, 0.25%) translateY(-3px) scale(1.01)',
    bgColor: 'bg-gray-100 dark:bg-[var(--color-searchcard)]',
    borderColor: 'border-gray-300',
    shadow: '0 1px 3px rgba(0,0,0,0.08)',
    hoverShadow: '0 4px 8px -2px rgba(0, 0, 0, 0.12)',
    zIndex: 'z-5',
    delay: 50
  },
  bottom: {
    transform: 'translate(2%, 0.5%) scale(1.02)',
    hoverTransform: 'translate(2%, 0.5%) translateY(-1px) scale(1.02)',
    bgColor: 'bg-gray-200 dark:bg-[var(--color-searchcard)]',
    borderColor: 'border-gray-400',
    shadow: '0 2px 4px rgba(0,0,0,0.12)',
    hoverShadow: '0 3px 6px -1px rgba(0, 0, 0, 0.15)',
    zIndex: 'z-0',
    delay: 100
  },
  main: {
    shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    hoverTransform: 'translateY(-6px)',
    hoverShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
    zIndex: 'z-10'
  }
};

interface TagCardProps {
  tag: DanbooruTag;
  searchTerm?: string;
  isTransitioning?: boolean;
  onTagClick?: (tag: DanbooruTag) => void;
  translatedTerm?: string;
  lastTranslatedFor?: string;
}

/**
 * TagCard - Componente que muestra una tarjeta para un tag de Danbooru
 * Las tarjetas de tipo contenedor tienen un estilo de tarjeta apilada (stacked cards)
 * 
 * TODO: Solucionado el problema de movimiento hacia la derecha durante la búsqueda
 * - El problema real era el scroll vertical que aparecía/desaparecía causando layout shift
 * - Se solucionó agregando `overflow-y: scroll` en el CSS global
 * - Se mantuvieron las transiciones suaves y `transformOrigin: center` para mejor UX
 */
const TagCard = memo<TagCardProps>(({ tag, searchTerm = '', isTransitioning = false, onTagClick, translatedTerm, lastTranslatedFor }) => {

  const { t } = useTranslation();
  const { animationClasses, animationStyle } = useOptimizedCardAnimation(isTransitioning);
  const { isNSFWFilterEnabled, applyFilterToTags } = useNSFWFilter();
  const aspectRatio = APP_CONFIG.preferredAspectRatio;
  const aspectConfig = ASPECT_RATIOS[aspectRatio];

  // Refs for stable function references
  const applyFilterToTagsRef = useRef(applyFilterToTags);

  // Update ref when function changes
  useEffect(() => {
    applyFilterToTagsRef.current = applyFilterToTags;
  }, [applyFilterToTags]);


  // Estados
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [imageKey, setImageKey] = useState<string>(`${tag?.name}-${isNSFWFilterEnabled ? 'general' : 'all'}`);
  const [wikiInfo, setWikiInfo] = useState<DanbooruWikiPage | null>(null);
  const [wikiLoading, setWikiLoading] = useState<boolean>(false);
  const [containerTagInfo, setContainerTagInfo] = useState<{ isContainer: boolean; confidence: number; detectedPatterns: string[] } | null>(null);
  const [exampleCount, setExampleCount] = useState<number>(0);
  const [currentRotationIndex, setCurrentRotationIndex] = useState<number>(0);
  const [autoRotationEnabled, setAutoRotationEnabled] = useState<boolean>(false);
  
  // Estados para animación de deslizamiento
  const [isSliding, setIsSliding] = useState<boolean>(false);
  const [nextImageUrl, setNextImageUrl] = useState<string | null>(null);
  const [slideProgress, setSlideProgress] = useState<number>(0);

  // Estado para detectar contenido NSFW bloqueado
  const [isNSFWBlocked, setIsNSFWBlocked] = useState<boolean>(false);
  
  // Referencias
  const cardRef = useRef<HTMLDivElement>(null);
  const rotationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const middleCardTimeoutRef = useRef<number | null>(null);
  const bottomCardTimeoutRef = useRef<number | null>(null);
  const isHoveringRef = useRef<boolean>(false);
  const middleCardRef = useRef<HTMLElement | null>(null);
  const bottomCardRef = useRef<HTMLElement | null>(null);
  const slideAnimationRef = useRef<number | null>(null);
  const isLoadingWikiRef = useRef<boolean>(false);

  // Colorear enlaces wiki cuando cambia wikiInfo
  useEffect(() => {
    if (!wikiInfo?.body) return;
    ensureTagCategoryMap();
    requestAnimationFrame(() => {
      if (!cardRef.current) return;
      const wikiContainer = cardRef.current.querySelector('[data-wiki-snippet]');
      if (wikiContainer) applyCategoryClassesToLinks(wikiContainer as HTMLElement);
    });
  }, [wikiInfo]);

  // Efectos de hover para los elementos
  const cardHoverEffects = useHoverEffects({
    baseClasses: 'group block bg-[var(--color-searchcard)] dark:bg-[var(--color-searchcard)] rounded-2xl shadow-sm border border-subtle overflow-hidden transition-all duration-200 ease-in-out will-change-transform',
    customHoverClasses: 'hover:shadow-xl hover:border-accent/40 dark:hover:border-accent/40 hover:-translate-y-1 hover:scale-[1.02]',
    scale: false,
    lift: true,
    glow: true,
    transitionDuration: 'fast'
  });

  const imageHoverEffects = useHoverEffects({
    baseClasses: 'w-full h-full object-cover',
    scale: false,
    transitionDuration: 'fast'
  });

  const titleHoverEffects = useHoverEffects({
    baseClasses: 'font-bold text-lg text-primary mb-2 line-clamp-2 tagcard-title',
    customHoverClasses: '',
    transitionDuration: 'fast'
  });

  // Hook para precargar imágenes
  const { isImagePreloaded, queuePreload } = useImagePreloader({
    preloadCount: 2
  });

  // Valores memoizados
  const categoryColor = React.useMemo(() => 
    getCategoryClass(tag?.category), [tag?.category]
  );
  
  const categoryName = React.useMemo(() => 
    getCategoryName(tag?.category), [tag?.category]
  );

  // Highlight logic: if the current search term was translated, use the translated value
  // so that matches like "blue eyes" highlight "eyes" when user typed "ojos".
  const highlightedText = React.useMemo(() => {
    const text = tag?.name?.replace(/_/g, ' ') || '';
    // Prefer translatedTerm only when it corresponds to the current searchTerm to avoid stale highlighting
    const effective = (translatedTerm && lastTranslatedFor === searchTerm) ? translatedTerm : searchTerm;
    return highlightShortMatch(text, effective);
  }, [tag?.name, searchTerm, translatedTerm, lastTranslatedFor]);

  // Copiar texto de badges con click derecho (categoría, palabras relacionadas, etc.)
  const lastLongPressTimeRef = React.useRef(0);
  const copyBadgeText = useCallback(async (e: React.MouseEvent, rawText: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'contextmenu' && Date.now() - lastLongPressTimeRef.current < 700) {
      return; // Evitar doble copia tras long press
    }
    const ok = await copyToClipboard(rawText);
  showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
    const el = e.currentTarget as HTMLElement;
    el.classList.add(ok ? 'ring-green-400' : 'ring-red-400','ring-2');
    setTimeout(() => el.classList.remove('ring-green-400','ring-red-400','ring-2'), 700);
    if (!ok) {
      // Failed to copy text
    }
  }, []);

  // Long press para móviles
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressTriggeredRef = React.useRef(false);
  const LONG_PRESS_MS = 550;

  const handleBadgeTouchStart = (text: string) => (e: React.TouchEvent) => {
    longPressTriggeredRef.current = false;
    const el = e.currentTarget as HTMLElement;
    const firstTouch = e.touches[0];
    const startX = firstTouch?.clientX ?? 0;
    const startY = firstTouch?.clientY ?? 0;
    let moved = false;

    const handleMove = (mv: TouchEvent) => {
      const t = mv.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
        moved = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        el.removeEventListener('touchmove', handleMove as any);
      }
    };
    el.addEventListener('touchmove', handleMove as any, { passive: true });

    longPressTimerRef.current = window.setTimeout(async () => {
      if (moved) return;
      longPressTriggeredRef.current = true;
      const ok = await copyToClipboard(text);
      lastLongPressTimeRef.current = Date.now();
      showCopyFeedbackBubble(
        ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
        startX,
        startY,
        ok
      );
      el.removeEventListener('touchmove', handleMove as any);
    }, LONG_PRESS_MS);
  };

  const handleBadgeTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /**
   * Restablece todas las tarjetas a su estado inicial
   */
  const resetAllCards = useCallback(() => {
    // Limpiar cualquier timeout pendiente
    if (middleCardTimeoutRef.current !== null) {
      window.clearTimeout(middleCardTimeoutRef.current);
      middleCardTimeoutRef.current = null;
    }
    
    if (bottomCardTimeoutRef.current !== null) {
      window.clearTimeout(bottomCardTimeoutRef.current);
      bottomCardTimeoutRef.current = null;
    }
    
    // Restablecer la tarjeta principal
    if (cardRef.current) {
      cardRef.current.style.transform = '';
      cardRef.current.style.boxShadow = STACKED_CARDS_CONFIG.main.shadow;
    }
    
    // Restablecer tarjetas decorativas
    if (middleCardRef.current) {
      middleCardRef.current.style.transform = STACKED_CARDS_CONFIG.middle.transform;
      middleCardRef.current.style.boxShadow = STACKED_CARDS_CONFIG.middle.shadow;
    }
    
    if (bottomCardRef.current) {
      bottomCardRef.current.style.transform = STACKED_CARDS_CONFIG.bottom.transform;
      bottomCardRef.current.style.boxShadow = STACKED_CARDS_CONFIG.bottom.shadow;
    }
  }, []);

  /**
   * Ejecuta la animación de deslizamiento entre imágenes
   */
  const executeSlideAnimation = useCallback((duration: number = 500, onComplete?: () => void) => {
    if (isSliding) return;
    
    setIsSliding(true);
    setSlideProgress(0);
    
    const startTime = performance.now();
    const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeInOutCubic(progress);
      
      setSlideProgress(easedProgress);
      
      if (progress < 1) {
        slideAnimationRef.current = requestAnimationFrame(animate);
      } else {
        setIsSliding(false);
        setSlideProgress(0);
        setNextImageUrl(null);
        slideAnimationRef.current = null;
        onComplete?.();
      }
    };
    
    slideAnimationRef.current = requestAnimationFrame(animate);
  }, [isSliding]);

  /**
   * Manejador de clic en la tarjeta
   */
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (onTagClick) {
      onTagClick(tag);
    }
  }, [onTagClick, tag]);

  /**
   * Manejador de clic derecho para copiar el nombre de la etiqueta
   */
  const handleRightClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const tagName = tag.name || '';
    const success = await copyToClipboard(tagName);
    
    // Mostrar retroalimentación visual
    showCopyFeedbackBubble(
      success ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
      e.clientX,
      e.clientY,
      success
    );
    
    // Agregar efecto visual temporal a la tarjeta
    const cardElement = e.currentTarget as HTMLElement;
    cardElement.classList.add('ring-2', success ? 'ring-green-400' : 'ring-red-400');
    setTimeout(() => {
      cardElement.classList.remove('ring-2', 'ring-green-400', 'ring-red-400');
    }, 700);
  }, [tag.name, t]);

  /**
   * Manejador de hover para las tarjetas apiladas
   */
  const handleStackedCardHover = useCallback((e: React.MouseEvent, isEntering: boolean) => {
    // Actualizar el estado de hover
    isHoveringRef.current = isEntering;
    
    // Llamar al handler original de useHoverEffects
    if (isEntering && cardHoverEffects.handleMouseEnter) {
      cardHoverEffects.handleMouseEnter();
    } else if (!isEntering && cardHoverEffects.handleMouseLeave) {
      cardHoverEffects.handleMouseLeave();
    }
    
    if (!containerTagInfo?.isContainer || !e.currentTarget) return;
    
    // Si estamos saliendo del hover, restablecer las tarjetas
    if (!isEntering) {
      resetAllCards();
      return;
    }
    
    // Estamos entrando en hover
    const mainCard = e.currentTarget as HTMLElement;
    mainCard.style.transform = STACKED_CARDS_CONFIG.main.hoverTransform;
    mainCard.style.boxShadow = STACKED_CARDS_CONFIG.main.hoverShadow;
    
    // Aplicar efectos con retraso escalonado para la tarjeta media
    if (middleCardRef.current) {
      if (middleCardTimeoutRef.current !== null) {
        window.clearTimeout(middleCardTimeoutRef.current);
      }
      
      middleCardTimeoutRef.current = window.setTimeout(() => {
        if (isHoveringRef.current && middleCardRef.current) {
          middleCardRef.current.style.transform = STACKED_CARDS_CONFIG.middle.hoverTransform;
          middleCardRef.current.style.boxShadow = STACKED_CARDS_CONFIG.middle.hoverShadow;
        }
        middleCardTimeoutRef.current = null;
      }, STACKED_CARDS_CONFIG.middle.delay);
    }
    
    // Aplicar efectos con retraso escalonado para la tarjeta inferior
    if (bottomCardRef.current) {
      if (bottomCardTimeoutRef.current !== null) {
        window.clearTimeout(bottomCardTimeoutRef.current);
      }
      
      bottomCardTimeoutRef.current = window.setTimeout(() => {
        if (isHoveringRef.current && bottomCardRef.current) {
          bottomCardRef.current.style.transform = STACKED_CARDS_CONFIG.bottom.hoverTransform;
          bottomCardRef.current.style.boxShadow = STACKED_CARDS_CONFIG.bottom.hoverShadow;
        }
        bottomCardTimeoutRef.current = null;
      }, STACKED_CARDS_CONFIG.bottom.delay);
    }
  }, [cardHoverEffects, containerTagInfo?.isContainer, resetAllCards]);

  /**
   * Obtiene una imagen de vista previa para el tag
   */
  const fetchImage = useCallback(async () => {
    try {
      
      
      setLoading(true);
      setFullImageUrl(null);
      
      // Mantener el estado de bloqueo NSFW si el filtro está activado hasta que se verifique
      if (!isNSFWFilterEnabled) {
        setIsNSFWBlocked(false);
      }
      
      if (!tag || !tag.name || tag.post_count === 0) {
  
        setLoading(false);
        return;
      }
      
      const filteredTagName = applyFilterToTagsRef.current(tag.name);

      
      const aspectRatioNumber = parseFloat(aspectRatio) || null;
      const { default: danbooruApi } = await import('../services/danbooruApi');
      const imageData = await danbooruApi.getTagPreviewImage(filteredTagName, aspectRatioNumber, null, 0, filteredTagName);
      

      
      if (imageData) {

        
        // Validar que la imagen respete el filtro NSFW
        if (isNSFWFilterEnabled && imageData.rating && imageData.rating !== 'g') {

          setLoading(false);
          setIsNSFWBlocked(true); // Marcar que el contenido NSFW está bloqueado
          setFullImageUrl(null); // Asegurarse de que no se muestre ninguna imagen
          return;
        }
        
        // Si llegamos aquí, la imagen es válida independientemente del filtro
        
        setIsNSFWBlocked(false);
        
        setFullImageUrl(imageData.large_url || '');
        setExampleCount(imageData.total_examples || 0);
        
        if (imageData.source === 'wiki_example' && imageData.total_examples && imageData.total_examples > 1) {
          setAutoRotationEnabled(true);
        }
      } else if (isNSFWFilterEnabled && tag.post_count > 0) {

        // Si no hay imagen pero el tag tiene posts y el filtro NSFW está activado,
        // probablemente todas las imágenes son NSFW
        setIsNSFWBlocked(true);
        setFullImageUrl(null); // Asegurarse de que no se muestre ninguna imagen
      } else if (!isNSFWFilterEnabled) {

        // Si el filtro NSFW está desactivado y no hay imagen, resetear estados
        setIsNSFWBlocked(false);
        setFullImageUrl(null);
      }
    } catch (error) {
      // Solo mostrar errores que no sean de cola limpiada (que son esperados)
      if (error instanceof Error && !error.message.includes('Cola limpiada')) {
        console.error(`[TagCard] Error fetching image for ${tag?.name}:`, error);
      }
      // Error silencioso para cola limpiada
      if (isNSFWFilterEnabled) {
        setIsNSFWBlocked(true); // En caso de error con filtro activado, bloquear por seguridad
      } else {
        setIsNSFWBlocked(false); // En caso de error con filtro desactivado, no bloquear
      }
    } finally {
      setLoading(false);
  
    }
  }, [tag?.name, tag?.post_count, isNSFWFilterEnabled, aspectRatio]);

  /**
   * Rota a la siguiente imagen de ejemplo con animación de deslizamiento
   */
  const rotateToNextExample = useCallback(async () => {
    if (!autoRotationEnabled || exampleCount <= 1 || !tag?.name || isSliding) return;
    

    
    const nextIndex = (currentRotationIndex + 1) % exampleCount;
    const aspectRatioNumber = parseFloat(aspectRatio) || null;
    const searchParams = isNSFWFilterEnabled ? { "search[rating]": "g" } : undefined;
    
    // Si el filtro NSFW está activado, marcar como bloqueado hasta verificar
    if (isNSFWFilterEnabled) {
      setIsNSFWBlocked(true);
    }
    
    const nextUrls = await imagePreloadService.preloadNextImages(tag.name, currentRotationIndex, 1, aspectRatioNumber, searchParams);
    
    
    
    if (nextUrls.length > 0 && isImagePreloaded(nextUrls[0])) {
      
      setNextImageUrl(nextUrls[0]);
      
      executeSlideAnimation(600, () => {
        setCurrentRotationIndex(nextIndex);
        setFullImageUrl(nextUrls[0]);
        setImageKey(`${tag.name}-${nextIndex}-${isNSFWFilterEnabled ? 'general' : 'all'}-${Date.now()}`);
        
        // Si llegamos aquí con el filtro activado, es porque la imagen es SFW
        if (isNSFWFilterEnabled) {
          setIsNSFWBlocked(false);
        }
        
      });
      
      const nextNextUrls = await imagePreloadService.preloadNextImages(tag.name, nextIndex, 1, aspectRatioNumber, searchParams);
      if (nextNextUrls.length > 0) {
        queuePreload(nextNextUrls);
      }
    } else {
      
      setCurrentRotationIndex(nextIndex);
      
      try {
        // Aplicar filtro NSFW si está habilitado
        const { default: danbooruApi } = await import('../services/danbooruApi');
        const imageData = await danbooruApi.getWikiExamplePreview(tag.name, nextIndex, searchParams);
        

        
        if (imageData) {
          // Verificar si la imagen respeta el filtro NSFW
          if (isNSFWFilterEnabled && typeof imageData !== 'string' && imageData.rating && imageData.rating !== 'g') {

            setIsNSFWBlocked(true);
            return;
          }
          
          const url = typeof imageData === 'string' ? imageData : (imageData.large_url || '');
          
          setNextImageUrl(url);
          
          executeSlideAnimation(600, () => {
            setFullImageUrl(url);
            setImageKey(`${tag.name}-${Date.now()}-${nextIndex}-${isNSFWFilterEnabled ? 'general' : 'all'}-${Math.random()}`);
            
            // Si llegamos aquí, la imagen es válida independientemente del filtro
            setIsNSFWBlocked(false);
            
          });
        }
      } catch (error) {
        // Solo mostrar errores que no sean de cola limpiada (que son esperados)
        if (error instanceof Error && !error.message.includes('Cola limpiada')) {
          console.error(`[TagCard] Rotation - Error for ${tag.name}:`, error);
        }
        // Error silencioso para cola limpiada
        if (isNSFWFilterEnabled) {
          setIsNSFWBlocked(true); // En caso de error con filtro activado, bloquear por seguridad
        } else {
          setIsNSFWBlocked(false); // En caso de error con filtro desactivado, no bloquear
        }
      }
    }
    

  }, [autoRotationEnabled, exampleCount, currentRotationIndex, tag?.name, aspectRatio, isImagePreloaded, queuePreload, isSliding, executeSlideAnimation, isNSFWFilterEnabled]);

  /**
   * Inicializar referencias a las tarjetas decorativas
   */
  useEffect(() => {
    if (containerTagInfo?.isContainer && cardRef.current) {
      const parent = cardRef.current.parentElement;
      if (parent) {
        const decorativeCards = Array.from(parent.children).filter(
          child => child !== cardRef.current && child.classList.contains('absolute')
        );
        
        if (decorativeCards[1]) middleCardRef.current = decorativeCards[1] as HTMLElement;
        if (decorativeCards[0]) bottomCardRef.current = decorativeCards[0] as HTMLElement;
      }
    }
  }, [containerTagInfo?.isContainer]);

  /**
   * Efecto para cargar la imagen inicial
   */
  useEffect(() => {
    // Crear una key estable basada en el tag y el estado del filtro NSFW
    const stableImageKey = `${tag?.name}-${isNSFWFilterEnabled ? 'general' : 'all'}-${Date.now()}`;
    setImageKey(stableImageKey);
    setCurrentRotationIndex(0);
    setAutoRotationEnabled(false);
    
    // Si el filtro NSFW está activado, marcar como bloqueado hasta verificar
    if (isNSFWFilterEnabled) {
      setIsNSFWBlocked(true);
    } else {
      setIsNSFWBlocked(false);
    }
    
    // Resetear estados de animación
    setIsSliding(false);
    setNextImageUrl(null);
    setSlideProgress(0);
    
    // Cancelar animación en curso
    if (slideAnimationRef.current !== null) {
      cancelAnimationFrame(slideAnimationRef.current);
      slideAnimationRef.current = null;
    }
    
    const timeoutId = setTimeout(() => {
      fetchImage();
    }, 50);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [tag?.name, isNSFWFilterEnabled, fetchImage]);



  /**
   * Efecto para manejar cambios en el filtro NSFW
   */
  useEffect(() => {
    const handleNSFWFilterChange = (event: CustomEvent) => {
      
      
      if (tag?.name) {
        const clearCache = async () => {
          const { default: danbooruApi } = await import('../services/danbooruApi');
          danbooruApi.clearAllCacheForTag(tag.name);
          danbooruApi.clearImageLoadQueueForTag(tag.name);
    
        };
        clearCache();
      }
      
      // Forzar limpieza inmediata de la imagen actual
      setFullImageUrl(null);

      
      // Si se está activando el filtro NSFW, marcar como bloqueado hasta que se verifique
      if (event.detail.enabled) {

        setIsNSFWBlocked(true);
      } else {

        setIsNSFWBlocked(false);
      }
      
      // Usar una key estable para evitar parpadeos
      const stableImageKey = `${event.detail.enabled ? 'general' : 'all'}-${Date.now()}`;
      setImageKey(stableImageKey);
      setLoading(true);

      
      // Resetear estados de animación
      setIsSliding(false);
      setNextImageUrl(null);
      setSlideProgress(0);
      
      // Cancelar animación en curso
      if (slideAnimationRef.current !== null) {
        cancelAnimationFrame(slideAnimationRef.current);
        slideAnimationRef.current = null;
      }
      
      // Recargar imagen después de un pequeño delay
      const timeoutId = setTimeout(() => {

        fetchImage();
      }, 100);
      return () => clearTimeout(timeoutId);
    };
    
    document.addEventListener('nsfwFilterChanged', handleNSFWFilterChange as unknown as EventListener);
    
    return () => {
      document.removeEventListener('nsfwFilterChanged', handleNSFWFilterChange as unknown as EventListener);
    };
  }, [tag?.name, fetchImage]);

  /**
   * Efecto para la rotación automática de imágenes
   */
  useEffect(() => {
    if (!autoRotationEnabled || exampleCount <= 1 || !tag?.name) {
      if (rotationIntervalRef.current) {
        clearInterval(rotationIntervalRef.current);
        rotationIntervalRef.current = null;
      }
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
        preloadTimeoutRef.current = null;
      }
      return;
    }

    // Precargar las siguientes imágenes cuando se habilita la rotación
    const preloadNextImages = async () => {
      const aspectRatioNumber = parseFloat(aspectRatio) || null;
      const searchParams = isNSFWFilterEnabled ? { "search[rating]": "g" } : undefined;
      const nextUrls = await imagePreloadService.preloadNextImages(tag.name, currentRotationIndex, 2, aspectRatioNumber, searchParams);
      if (nextUrls.length > 0) {
        queuePreload(nextUrls);
      }
    };

    preloadNextImages();

    rotationIntervalRef.current = setInterval(rotateToNextExample, 5000);

    return () => {
      if (rotationIntervalRef.current) {
        clearInterval(rotationIntervalRef.current);
        rotationIntervalRef.current = null;
      }
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
        preloadTimeoutRef.current = null;
      }
    };
  }, [autoRotationEnabled, exampleCount, rotateToNextExample, currentRotationIndex, tag?.name, aspectRatio, queuePreload]);

  /**
   * Efecto para preload la siguiente imagen cuando hay múltiples ejemplos
   */
  useEffect(() => {
    if (autoRotationEnabled && exampleCount > 1 && fullImageUrl) {

      const preloadImage = new Image();
      preloadImage.src = fullImageUrl; // Preload la imagen actual para evitar parpadeos
      
      // Preload la siguiente imagen en el background
      if (nextImageUrl) {
        const nextImage = new Image();
        nextImage.src = nextImageUrl;
      }
    }
  }, [autoRotationEnabled, exampleCount, currentRotationIndex, fullImageUrl, nextImageUrl]);

  /**
   * Limpieza de recursos al desmontar
   */
  useEffect(() => {
    return () => {
      // Limpiar todos los timeouts e intervalos
      if (rotationIntervalRef.current) clearInterval(rotationIntervalRef.current);
      if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
      if (middleCardTimeoutRef.current !== null) window.clearTimeout(middleCardTimeoutRef.current);
      if (bottomCardTimeoutRef.current !== null) window.clearTimeout(bottomCardTimeoutRef.current);
      
      // Cancelar animación de deslizamiento
      if (slideAnimationRef.current !== null) {
        cancelAnimationFrame(slideAnimationRef.current);
        slideAnimationRef.current = null;
      }
      
      // Resetear estado de carga de wiki
      isLoadingWikiRef.current = false;
      
      // Restablecer tarjetas
      resetAllCards();
    };
  }, [resetAllCards]);

  /**
   * Efecto para resetear el estado de carga de wiki cuando cambie el tag
   */
  useEffect(() => {
    isLoadingWikiRef.current = false;
    setWikiInfo(null);
    setWikiLoading(false);
    setContainerTagInfo(null);
  }, [tag?.name]);

  /**
   * Efecto para cargar la información del wiki
   */
  useEffect(() => {
    const fetchWikiInfo = async () => {
      if (!tag?.name || isLoadingWikiRef.current) return;
      
      isLoadingWikiRef.current = true;
      setWikiLoading(true);
      try {
        const { default: danbooruApi } = await import('../services/danbooruApi');
        const wikiData = await danbooruApi.getTagWikiInfo(tag.name);
        if (wikiData) {
          const wikiPage: DanbooruWikiPage = {
            id: 0,
            title: wikiData.title,
            body: wikiData.body,
            created_at: wikiData.createdAt,
            updated_at: wikiData.updatedAt,
            is_deleted: wikiData.isDeleted,
            category_name: wikiData.categoryName,
            other_names: [],
            reason: null,
            version: 1
          };
          setWikiInfo(wikiPage);
          
          // Detectar si es un tag contenedor
          const containerInfo = detectContainerTag(wikiData.body);
          setContainerTagInfo(containerInfo);
        } else {
          // Si no hay datos, establecer un objeto vacío para evitar reintentos
          setWikiInfo({
            id: 0,
            title: '',
            body: '',
            created_at: '',
            updated_at: '',
            is_deleted: false,
            category_name: '',
            other_names: [],
            reason: null,
            version: 1
          });
        }
      } catch {
        // En caso de error, establecer un objeto vacío para evitar reintentos
        setWikiInfo({
          id: 0,
          title: '',
          body: '',
          created_at: '',
          updated_at: '',
          is_deleted: false,
          category_name: '',
          other_names: [],
          reason: null,
          version: 1
        });
      } finally {
        setWikiLoading(false);
        isLoadingWikiRef.current = false;
      }
    };

    if (tag?.name && cardRef.current && !wikiInfo) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !wikiInfo && !isLoadingWikiRef.current) {
              fetchWikiInfo();
            }
          });
        },
        {
          root: null,
          rootMargin: PERFORMANCE_CONFIG.LAZY_LOADING.ROOT_MARGIN,
          threshold: PERFORMANCE_CONFIG.LAZY_LOADING.THRESHOLD
        }
      );

      observer.observe(cardRef.current);

      const currentRef = cardRef.current;
      return () => {
        if (currentRef) {
          observer.unobserve(currentRef);
        }
      };
    }
  }, [tag?.name, wikiInfo]); // Removido wikiLoading de las dependencias

  if (!tag) return null;

  // Renderizado del componente
  return (
    <div className={containerTagInfo?.isContainer ? 'relative group w-full' : ''}>
      {containerTagInfo?.isContainer && (
        <>
          {/* Tarjeta inferior (3ra) - más oscura */}
          <div 
            className={`absolute ${STACKED_CARDS_CONFIG.bottom.zIndex} ${STACKED_CARDS_CONFIG.bottom.bgColor} dark:bg-slate-800 rounded-2xl shadow-md border ${STACKED_CARDS_CONFIG.bottom.borderColor} dark:border-slate-600 w-full h-full left-0 top-0 transform-gpu transition-all duration-300 ease-out will-change-transform`}
            style={{ 
              transform: STACKED_CARDS_CONFIG.bottom.transform,
              transitionProperty: 'transform, box-shadow',
              boxShadow: STACKED_CARDS_CONFIG.bottom.shadow,
              transformOrigin: 'center'
            }}
          />
          
          {/* Tarjeta media (2da) - ligeramente más oscura */}
          <div 
            className={`absolute ${STACKED_CARDS_CONFIG.middle.zIndex} ${STACKED_CARDS_CONFIG.middle.bgColor} dark:bg-slate-700 rounded-2xl shadow-sm border ${STACKED_CARDS_CONFIG.middle.borderColor} dark:border-slate-500 w-full h-full left-0 top-0 transform-gpu transition-all duration-300 ease-out will-change-transform`}
            style={{ 
              transform: STACKED_CARDS_CONFIG.middle.transform,
              transitionProperty: 'transform, box-shadow',
              boxShadow: STACKED_CARDS_CONFIG.middle.shadow,
              transformOrigin: 'center'
            }}
          />
        </>
      )}

      <div 
        ref={cardRef}
        className={`${cardHoverEffects.hoverClasses} ${animationClasses} ${containerTagInfo?.isContainer ? `relative ${STACKED_CARDS_CONFIG.main.zIndex} transition-all duration-300 ease-out will-change-transform` : ''} cursor-pointer${!containerTagInfo?.isContainer ? ' transition-all duration-300 ease-out will-change-transform' : ''}`}
        style={{
          ...animationStyle,
          ...(containerTagInfo?.isContainer ? { 
            boxShadow: STACKED_CARDS_CONFIG.main.shadow,
            transitionProperty: 'transform, box-shadow',
            transformOrigin: 'center'
          } : {})
        }}
        onClick={handleCardClick}
        onContextMenu={handleRightClick}
        onMouseEnter={(e) => handleStackedCardHover(e, true)}
        onMouseLeave={(e) => handleStackedCardHover(e, false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick(e as unknown as React.MouseEvent);
          }
        }}
      >
        {/* Sección de la imagen */}
        <div className={`relative w-full ${aspectConfig.cardHeight} image-container`}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center loading-container loading-fade-in">
              <LoadingSpinner size="lg" color="blue" />
            </div>
          ) : fullImageUrl ? (
            <div className="relative w-full h-full overflow-hidden">
              {/* Imagen actual */}
              <img 
                key={`current-${imageKey}`}
                src={fullImageUrl}
                alt={tag.name}
                className={`${imageHoverEffects.hoverClasses} optimized-image gpu-accelerated smooth-transition`}
                style={{
                  transform: isSliding ? `translateX(-${slideProgress * 100}%)` : 'translateX(0)',
                  zIndex: isSliding ? 1 : 2,
                  transition: isSliding ? 'none' : 'transform 0.3s ease-in-out',
                  willChange: isSliding ? 'transform' : 'auto'
                }}
                onError={() => {
                  setFullImageUrl(null);
                }}
                onLoad={() => {
                  setLoading(false);
                }}
                loading="lazy"
                decoding="async"
              />
              
              {/* Imagen siguiente (durante la animación) */}
              {isSliding && nextImageUrl && (
                <img 
                  key={`next-${nextImageUrl}`}
                  src={nextImageUrl}
                  alt={tag.name}
                  className={`${imageHoverEffects.hoverClasses} optimized-image gpu-accelerated image-sliding`}
                  style={{
                    transform: `translateX(${(1 - slideProgress) * 100}%)`,
                    zIndex: 2,
                    transition: 'none',
                    willChange: 'transform'
                  }}
                  loading="eager"
                  decoding="async"
                />
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {isNSFWBlocked ? (
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-red-600">{t('nsfw.blocked')}</span>
                </div>
              ) : (
                <>
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-medium text-gray-400">{t('tags.noPosts')}</span>
                </>
              )}
            </div>
          )}
          
          {/* Badges */}
          <div className="absolute top-2 sm:top-3 left-2 sm:left-3 flex gap-1 z-20">
            <span
              className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold shadow-sm cursor-pointer ${categoryColor}`}
              title={t('tooltips.rightClickCopyCategory')}
              onContextMenu={(e) => copyBadgeText(e, categoryName)}
              onTouchStart={handleBadgeTouchStart(categoryName)}
              onTouchEnd={handleBadgeTouchEnd}
            >
              {categoryName}
            </span>
            {containerTagInfo?.isContainer && (
              <span
                className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold shadow-sm cat-badge cat-character cursor-pointer"
                title={t('tooltips.rightClickCopyCategory')}
                onContextMenu={(e) => copyBadgeText(e, t('tags.category'))}
                onTouchStart={handleBadgeTouchStart(t('tags.category'))}
                onTouchEnd={handleBadgeTouchEnd}
              >
                {t('tags.category')}
              </span>
            )}
          </div>
        </div>
        
        {/* Sección de contenido */}
        <div className="p-3 sm:p-4">
          <h3 className={`${titleHoverEffects.hoverClasses} text-base sm:text-lg`}>
            {highlightedText}
          </h3>
          
          {/* Contador de posts */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 dark:text-gray-400">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v2M7 7h10" />
              </svg>
              <span className="text-xs sm:text-sm font-semibold">
                {formatPostCount(tag.post_count)}
              </span>
            </div>
          </div>

          {/* Sección de sustantivos eliminada según solicitud */}

          {/* Contenido Wiki */}
          {wikiInfo?.body && wikiInfo.body.trim() !== '' && (() => {
            const extractedContent = extractFirstParagraph(wikiInfo.body);
            const hasSubstantialContent = extractedContent && extractedContent.trim() !== '';
            
            return hasSubstantialContent ? (
              <div className="mb-2 p-2 sm:p-3 bg-surface-alt dark:bg-elevated rounded-lg border-l-4 accent border-transparent">
                <div className="text-xs accent font-medium mb-1">Wiki</div>
                <div 
                  data-wiki-snippet
                  className="text-xs sm:text-sm text-secondary dark:text-secondary leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatDTextSafe(extractedContent) }}
                />
              </div>
            ) : null;
          })()}
          
          {/* Estado de carga Wiki */}
          {wikiLoading && (
            <div className="mb-2 p-2 sm:p-3 bg-surface-alt dark:bg-elevated rounded-lg">
              <div className="flex items-center gap-1.5 sm:gap-2 text-subtle">
                <LoadingSpinner size="sm" color="gray" />
                <span className="text-xs">{t('modal.loading')}</span>
              </div>
            </div>
          )}
          
          {/* Sin información Wiki */}
          {!wikiLoading && (!wikiInfo?.body || wikiInfo.body.trim() === '' || !extractFirstParagraph(wikiInfo.body)?.trim()) && (
            <div className="mb-2 p-2 sm:p-3 bg-surface-alt dark:bg-elevated rounded-lg border-l-4 border-subtle">
              <div className="text-xs text-secondary font-medium mb-1">Wiki</div>
              <div className="text-xs sm:text-sm text-subtle italic">
                {t('tags.noWiki')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

TagCard.displayName = 'TagCard';

export default TagCard;