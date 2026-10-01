import React, { useState, useEffect, memo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import imagePreloadService from '../services/imagePreloadService';
import { APP_CONFIG, ASPECT_RATIOS } from '../config/appConfig';
import useImagePreloader from '../hooks/useImagePreloader';
import { useNSFWFilter } from '../context/useNSFWFilter';
import { PERFORMANCE_CONFIG } from '../config/performanceConfig';
import { getCategoryBaseClass, getCategoryName } from '../utils/categoryUtils';
import { highlightShortMatch } from '../utils/highlightUtils';
import { formatNumber } from '../utils/formatUtils';

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
import { formatDTextSafe, extractFirstParagraph } from '../utils/dtextFormatter';
import { ensureTagCategoryMap, applyCategoryClassesToLinks } from '../utils/tagCategoryMap';
import { detectContainerTag } from '../utils/containerTagUtils';
import { ImageOff, Images, Layers, ShieldAlert } from 'lucide-react';
import CopyButton from './ui/CopyButton';
import { DanbooruTag, DanbooruWikiPage } from '../types';
import { copyToClipboard } from '../utils/copyUtils';
import { showCopyFeedbackBubble } from '../utils/copyFeedbackBubble';



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
const TagCard = memo<TagCardProps>(({ tag, searchTerm = '', onTagClick, translatedTerm, lastTranslatedFor }) => {

  const { t } = useTranslation();
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

  // Example images only rotate while the card is hovered or focused, so a
  // grid of 30 cards never turns into a wall of moving pictures.
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const prefersReducedMotion = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
  
  // Referencias
  const cardRef = useRef<HTMLDivElement>(null);
  const rotationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const slideAnimationRef = useRef<number | null>(null);
  const isLoadingWikiRef = useRef<boolean>(false);

  // Network work (preview image + wiki snippet) only starts once the card is
  // near the viewport. The danbooruApi batches lookups from all cards that
  // become visible together into a handful of requests.
  const [hasBeenVisible, setHasBeenVisible] = useState<boolean>(false);
  const hasBeenVisibleRef = useRef<boolean>(false);
  useEffect(() => {
    hasBeenVisibleRef.current = false;
    setHasBeenVisible(false);
    setFullImageUrl(null);
    setLoading(true);
    const el = cardRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      hasBeenVisibleRef.current = true;
      setHasBeenVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          hasBeenVisibleRef.current = true;
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: PERFORMANCE_CONFIG.LAZY_LOADING.ROOT_MARGIN,
        threshold: PERFORMANCE_CONFIG.LAZY_LOADING.THRESHOLD
      }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tag?.name]);

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

  // Hook para precargar imágenes
  const { isImagePreloaded, queuePreload } = useImagePreloader({
    preloadCount: 2
  });

  // Valores memoizados
  const categoryHue = React.useMemo(() =>
    getCategoryBaseClass(tag?.category), [tag?.category]
  );
  
  // Cheap i18n lookup; recomputed every render so it follows language changes (useTranslation re-renders us)
  const categoryName = getCategoryName(tag?.category);

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
    el.classList.add(ok ? 'ring-primary' : 'ring-destructive','ring-2');
    setTimeout(() => el.classList.remove('ring-primary','ring-destructive','ring-2'), 700);
  }, [t]);

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
        el.removeEventListener('touchmove', handleMove);
      }
    };
    el.addEventListener('touchmove', handleMove, { passive: true });

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
      el.removeEventListener('touchmove', handleMove);
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
    cardElement.classList.add('ring-2', success ? 'ring-primary' : 'ring-destructive');
    setTimeout(() => {
      cardElement.classList.remove('ring-2', 'ring-primary', 'ring-destructive');
    }, 700);
  }, [tag.name, t]);

  /**
   * Obtiene una imagen de vista previa para el tag
   */
  // Primitive copies so fetchImage only changes when these values change (not on every new tag object)
  const tagName = tag?.name;
  const tagPostCount = tag?.post_count;
  const fetchImage = useCallback(async () => {
    try {
      
      
      setLoading(true);
      setFullImageUrl(null);
      
      // Mantener el estado de bloqueo NSFW si el filtro está activado hasta que se verifique
      if (!isNSFWFilterEnabled) {
        setIsNSFWBlocked(false);
      }
      
      if (!tagName || tagPostCount === 0) {
        setLoading(false);
        return;
      }

      const filteredTagName = applyFilterToTagsRef.current(tagName);

      
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
      } else if (isNSFWFilterEnabled && (tagPostCount ?? 0) > 0) {

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
        console.error(`[TagCard] Error fetching image for ${tagName}:`, error);
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
  }, [tagName, tagPostCount, isNSFWFilterEnabled, aspectRatio]);

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
   * Efecto para cargar la imagen inicial
   */
  useEffect(() => {
    if (!hasBeenVisible) return;
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
  }, [tag?.name, isNSFWFilterEnabled, fetchImage, hasBeenVisible]);



  /**
   * Efecto para manejar cambios en el filtro NSFW
   */
  useEffect(() => {
    const handleNSFWFilterChange = (event: CustomEvent) => {
      
      
      // Cards that never scrolled into view have nothing to refresh.
      if (!hasBeenVisibleRef.current) return;

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
    if (!autoRotationEnabled || exampleCount <= 1 || !tag?.name || !isHovered || prefersReducedMotion) {
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

    rotationIntervalRef.current = setInterval(rotateToNextExample, 2500);

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
  }, [autoRotationEnabled, exampleCount, rotateToNextExample, currentRotationIndex, tag?.name, aspectRatio, queuePreload, isHovered, prefersReducedMotion, isNSFWFilterEnabled]);

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
      
      // Cancelar animación de deslizamiento
      if (slideAnimationRef.current !== null) {
        cancelAnimationFrame(slideAnimationRef.current);
        slideAnimationRef.current = null;
      }
      
      // Resetear estado de carga de wiki
      isLoadingWikiRef.current = false;
    };
  }, []);

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

    if (tag?.name && hasBeenVisible && !wikiInfo && !isLoadingWikiRef.current) {
      fetchWikiInfo();
    }
  }, [tag?.name, wikiInfo, hasBeenVisible]);

  if (!tag) return null;

  const wikiSnippet = wikiInfo?.body ? extractFirstParagraph(wikiInfo.body)?.trim() : '';
  const longPressHandlers = (text: string) => ({
    onContextMenu: (e: React.MouseEvent) => copyBadgeText(e, text),
    onTouchStart: handleBadgeTouchStart(text),
    onTouchEnd: handleBadgeTouchEnd,
  });

  // Renderizado del componente
  return (
    <div
      ref={cardRef}
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl bg-card text-card-foreground outline-none transition-[transform,box-shadow] duration-200 ease-out-expo hover:-translate-y-1 hover:shadow-[0_10px_15px_-3px_color-mix(in_oklab,var(--primary)_8%,transparent),0_4px_6px_-2px_color-mix(in_oklab,var(--primary)_6%,transparent)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0 cursor-pointer`}
      onClick={handleCardClick}
      onContextMenu={handleRightClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={`${t('ui.openTag')}: ${tag.name.replace(/_/g, ' ')}`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e as unknown as React.MouseEvent);
        }
      }}
    >
      {/* Artwork */}
      <div className={`relative w-full ${aspectConfig.cardHeight} overflow-hidden bg-muted image-container`}>
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />
        ) : fullImageUrl ? (
          <div className="relative h-full w-full overflow-hidden">
            <img
              key={`current-${imageKey}`}
              src={fullImageUrl}
              alt={tag.name}
              className="optimized-image gpu-accelerated h-full w-full object-cover object-top"
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
            {isSliding && nextImageUrl && (
              <img
                key={`next-${nextImageUrl}`}
                src={nextImageUrl}
                alt=""
                aria-hidden="true"
                className="optimized-image gpu-accelerated image-sliding absolute inset-0 h-full w-full object-cover object-top"
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
            {isNSFWBlocked ? (
              <>
                <ShieldAlert className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-xs font-medium">{t('nsfw.blocked')}</span>
              </>
            ) : (
              <>
                <ImageOff className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-xs font-medium">{t('tags.noPosts')}</span>
              </>
            )}
          </div>
        )}

        {/* Overlays: Night Scrim only, never colored badges on artwork */}
        <div className="absolute left-2 top-2 z-20 flex flex-wrap gap-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-lg bg-overlay/60 px-1.5 py-0.5 text-xs font-medium text-overlay-foreground/90 shadow-sm"
            title={t('ui.rightClickLongPressCopyCategory')}
            {...longPressHandlers(categoryName)}
          >
            <span className={`cat-dot ${categoryHue}`} aria-hidden="true" />
            {categoryName}
          </span>
          {containerTagInfo?.isContainer && (
            <span
              className="inline-flex items-center gap-1 rounded-lg bg-overlay/60 px-1.5 py-0.5 text-xs font-medium text-overlay-foreground/90 shadow-sm"
              title={t('ui.rightClickLongPressCopy')}
              {...longPressHandlers(t('ui.container'))}
            >
              <Layers className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              {t('ui.container')}
            </span>
          )}
        </div>
        <span
          className="absolute bottom-2 right-2 z-20 inline-flex items-center gap-1 rounded-lg bg-overlay/60 px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums text-overlay-foreground/90 shadow-sm"
          title={`${formatNumber(tag.post_count)} posts`}
        >
          <Images className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          {compactNumber.format(tag.post_count)}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          {highlightedText}
        </h3>

        <div className="rounded-lg bg-muted/50 p-2">
          {wikiLoading ? (
            <div className="space-y-1.5 py-0.5" aria-label={t('modal.loading')}>
              <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
            </div>
          ) : wikiSnippet ? (
            <div
              data-wiki-snippet
              className="wiki-prose line-clamp-3 text-xs leading-relaxed text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: formatDTextSafe(wikiSnippet) }}
            />
          ) : (
            <p className="text-xs italic text-muted-foreground">{t('tags.noWiki')}</p>
          )}
        </div>

        <CopyButton text={tag.name} label={t('ui.copyTag')} className="mt-auto w-full" />
      </div>
    </div>
  );
});

TagCard.displayName = 'TagCard';

export default TagCard;