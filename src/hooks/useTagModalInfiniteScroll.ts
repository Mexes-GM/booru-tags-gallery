import { useState, useCallback, useEffect, useRef } from 'react';
import { DanbooruPost } from '../types';
import { useNSFWFilter } from '../context/useNSFWFilter';

interface UseTagModalInfiniteScrollProps {
  tagName: string | undefined;
  initialPosts: DanbooruPost[];
  isInitialLoading: boolean;
}

interface UseTagModalInfiniteScrollReturn {
  posts: DanbooruPost[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  resetScroll: () => void;
  error: string | null;
}

export function useTagModalInfiniteScroll({
  tagName,
  initialPosts,
  isInitialLoading
}: UseTagModalInfiniteScrollProps): UseTagModalInfiniteScrollReturn {
  const { isNSFWFilterEnabled, getRatingParams } = useNSFWFilter();
  const [posts, setPosts] = useState<DanbooruPost[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPostId, setLastPostId] = useState<number | null>(null);
  
  const loadingRef = useRef(false);
  const postsPerPage = 20;

  // Reset when tag changes or initial posts change
  useEffect(() => {
    if (!isInitialLoading && initialPosts.length > 0) {
      setPosts(initialPosts);
      setHasMore(initialPosts.length >= 10); // Si hay menos de 10 posts iniciales, probablemente no hay más
      setError(null);
      setLastPostId(initialPosts[initialPosts.length - 1]?.id || null);
    }
  }, [initialPosts, isInitialLoading, tagName]);

  // Reset when tag changes
  useEffect(() => {
    if (tagName) {
      setPosts([]);
      setHasMore(true);
      setError(null);
      setLastPostId(null);
      loadingRef.current = false;
    }
  }, [tagName]);

  const loadMore = useCallback(async () => {
    if (!tagName || isLoadingMore || !hasMore || loadingRef.current || isInitialLoading) {
      return;
    }

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      const { default: danbooruApi } = await import('../services/danbooruApi');
      
      // Construir parámetros de búsqueda
      let tags = tagName;
      const ratingParams = isNSFWFilterEnabled ? getRatingParams() : undefined;
      
      // Si el filtro NSFW está activo, agregar 'rating:g' al string de tags
      if (ratingParams?.allowedRatings && ratingParams.allowedRatings.length === 1 && ratingParams.allowedRatings[0] === 'g') {
        tags = `${tagName} rating:g`;
      }

      const searchParams: any = {
        tags,
        limit: postsPerPage,
        order: "score"
      };

      // Para paginación, usar el ID del último post
      if (lastPostId) {
        searchParams.page = `b${lastPostId}`;
      }

      const newPosts = await danbooruApi.searchPosts(searchParams);

      if (newPosts.length === 0) {
        setHasMore(false);
      } else {
        // Filtrar posts válidos
        const validPosts = newPosts.filter(post => 
          post && 
          post.preview_file_url && 
          (post.large_file_url || post.file_url) && 
          post.image_width && 
          post.image_height
        );

        // Filtrar manualmente si el filtro NSFW está activo
        let filteredPosts = validPosts;
        if (ratingParams?.allowedRatings && ratingParams.allowedRatings.length > 0) {
          const allowed = ratingParams.allowedRatings;
          filteredPosts = validPosts.filter(post => allowed.includes(post.rating));
        }

        // Evitar duplicados
        const existingIds = new Set(posts.map(p => p.id));
        const uniqueNewPosts = filteredPosts.filter(post => !existingIds.has(post.id));

        if (uniqueNewPosts.length > 0) {
          setPosts(prevPosts => [...prevPosts, ...uniqueNewPosts]);
          setLastPostId(uniqueNewPosts[uniqueNewPosts.length - 1].id);
        }

        // Si obtuvimos menos posts de los solicitados, probablemente no hay más
        if (newPosts.length < postsPerPage) {
          setHasMore(false);
        }
      }
    } catch {
      // Silently handle error loading more posts
      setError('Error al cargar más imágenes');
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, [tagName, isLoadingMore, hasMore, lastPostId, posts, isNSFWFilterEnabled, getRatingParams, isInitialLoading]);

  const resetScroll = useCallback(() => {
    setPosts([]);
    setHasMore(true);
    setError(null);
    setLastPostId(null);
    loadingRef.current = false;
  }, []);

  return {
    posts,
    hasMore,
    isLoadingMore,
    loadMore,
    resetScroll,
    error
  };
}