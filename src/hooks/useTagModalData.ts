import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DanbooruWikiInfo, DanbooruPost } from '../types';
import { extractExamplePosts, formatDTextAdvanced } from '../utils';
import { useNSFWFilter } from '../context/useNSFWFilter';
import { usePostImages } from './usePostImages';
import { useTagModalInfiniteScroll } from './useTagModalInfiniteScroll';

interface UseTagModalDataResult {
  wikiInfo: DanbooruWikiInfo | null;
  isLoadingWiki: boolean;
  examplePosts: DanbooruPost[];
  isLoadingGallery: boolean;
  postImageMap: Record<number, string>;
  nsfwBlockedPosts: Set<number>;
  formattedWikiHtml: string;
  error: string | null;
  loadWikiInfo: (tagName: string) => void;
  loadExampleGallery: (tagName: string) => void;
  clearImageCache: () => void;
  // Infinite scroll properties
  allPosts: DanbooruPost[];
  hasMorePosts: boolean;
  isLoadingMorePosts: boolean;
  loadMorePosts: () => void;
  resetInfiniteScroll: () => void;
  infiniteScrollError: string | null;
}

export function useTagModalData(selectedTagName: string | undefined) : UseTagModalDataResult {
  const { isNSFWFilterEnabled, getRatingParams } = useNSFWFilter();
  const [wikiInfo, setWikiInfo] = useState<DanbooruWikiInfo | null>(null);
  const [isLoadingWiki, setIsLoadingWiki] = useState(false);
  const [examplePosts, setExamplePosts] = useState<DanbooruPost[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  // Nuevo hook centralizado para imágenes
  const {
    imageMap: postImageMap,
    nsfwBlockedPosts,
    error: imageError,
    loadImages,
    clearCache: clearImageCache,
  } = usePostImages();

  // Hook para infinite scroll
  const {
    posts: allPosts,
    hasMore: hasMorePosts,
    isLoadingMore: isLoadingMorePosts,
    loadMore: loadMorePosts,
    resetScroll: resetInfiniteScroll,
    error: infiniteScrollError
  } = useTagModalInfiniteScroll({
    tagName: selectedTagName,
    initialPosts: examplePosts,
    isInitialLoading: isLoadingGallery
  });

  // Extraer IDs de posts del contenido del wiki
  const extractedPostIds = useMemo(() => {
    if (!wikiInfo?.body) return [];
    return extractExamplePosts(wikiInfo.body);
  }, [wikiInfo?.body]);

  // Formatear HTML del wiki con imágenes de posts
  const formattedWikiHtml = useMemo(() => {
    if (!wikiInfo?.body) return '';
  // Usar siempre el formateador avanzado para incrustar imágenes de ejemplos también en tag groups
  // (el formateador maneja de forma segura los enlaces y contenido)
  return formatDTextAdvanced(wikiInfo.body, postImageMap, nsfwBlockedPosts);
  }, [wikiInfo?.body, postImageMap, nsfwBlockedPosts]);

  // Limpiar caché y cargar wiki/galería al cambiar de tag
  useEffect(() => {
    if (!selectedTagName) return;
    clearImageCache();
    setWikiInfo(null);
    setExamplePosts([]);
    setError(null);
    setIsLoadingWiki(true);
    setIsLoadingGallery(true);
    // Cargar wiki y galería después de limpiar caché
    (async () => {
      try {
        const { default: danbooruApi } = await import('../services/danbooruApi');
        // Limpiar caché específica para este tag
        await danbooruApi.clearAllCacheForTag(selectedTagName);
        const wikiData = await danbooruApi.getWikiPageManager().getWikiPage(selectedTagName);
        setWikiInfo(wikiData);
      } catch {
        setWikiInfo(null);
        setError(t('errors.wikiLoadFailed'));
      } finally {
        setIsLoadingWiki(false);
      }
      try {
        const { default: danbooruApi } = await import('../services/danbooruApi');
        const ratingParams = isNSFWFilterEnabled ? getRatingParams() : undefined;
        // Forzar limpieza de caché para este tag antes de cargar nuevos posts
        if (isNSFWFilterEnabled) {
          await danbooruApi.clearAllCacheForTag(selectedTagName);
        }
        const posts = await danbooruApi.getTagExamplePosts(selectedTagName, 10, ratingParams);
        setExamplePosts(posts);
      } catch {
        setExamplePosts([]);
        setError(t('errors.galleryLoadFailed'));
      } finally {
        setIsLoadingGallery(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTagName, isNSFWFilterEnabled]);
  
  // Efecto para escuchar cambios en el filtro NSFW
  useEffect(() => {
    const handleNSFWFilterChange = () => {
      if (!selectedTagName) return;
      
      // Limpiar caché y recargar datos
      clearImageCache();
      setExamplePosts([]);
      setIsLoadingGallery(true);
      
      (async () => {
        try {
          const { default: danbooruApi } = await import('../services/danbooruApi');
          // Limpiar caché específica para este tag
          await danbooruApi.clearAllCacheForTag(selectedTagName);
          
          const ratingParams = isNSFWFilterEnabled ? getRatingParams() : undefined;
          const posts = await danbooruApi.getTagExamplePosts(selectedTagName, 10, ratingParams);
          setExamplePosts(posts);
        } catch {
          setExamplePosts([]);
          setError(t('errors.galleryLoadFailed'));
        } finally {
          setIsLoadingGallery(false);
        }
      })();
    };
    
    // Agregar event listener para el cambio de filtro NSFW
    window.addEventListener('nsfwFilterChanged', handleNSFWFilterChange);
    
    // Limpiar event listener
    return () => {
      window.removeEventListener('nsfwFilterChanged', handleNSFWFilterChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTagName, isNSFWFilterEnabled]);

  // Cargar imágenes de posts cuando cambie el body del wiki o el filtro NSFW
  useEffect(() => {
    if (extractedPostIds.length > 0) {
      loadImages(
        extractedPostIds,
        isNSFWFilterEnabled ? { nsfwFilter: true, allowedRatings: getRatingParams().allowedRatings } : {}
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedPostIds, isNSFWFilterEnabled]);

  return {
    wikiInfo,
    isLoadingWiki,
    examplePosts,
    isLoadingGallery,
    postImageMap,
    nsfwBlockedPosts,
    formattedWikiHtml,
    error: error || imageError,
    loadWikiInfo: () => {}, // ya no es necesario, la carga es automática
    loadExampleGallery: () => {}, // ya no es necesario, la carga es automática
    clearImageCache,
    // Infinite scroll properties
    allPosts,
    hasMorePosts,
    isLoadingMorePosts,
    loadMorePosts,
    resetInfiniteScroll,
    infiniteScrollError
  };
}