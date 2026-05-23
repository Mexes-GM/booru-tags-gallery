import { useCallback, useRef, useState } from 'react';
import { DanbooruPost } from '../types';

interface UsePostImagesOptions {
  nsfwFilter?: boolean;
  allowedRatings?: string[];
}

export function usePostImages() {
  const [imageMap, setImageMap] = useState<Record<number, string>>({});
  const [nsfwBlockedPosts, setNsfwBlockedPosts] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<{ [key: string]: DanbooruPost[] }>({});

  const loadImages = useCallback(
    async (postIds: number[], options?: UsePostImagesOptions) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!postIds || postIds.length === 0) {
          setIsLoading(false);
          return;
        }
        const { nsfwFilter = false, allowedRatings = ['g'] } = options || {};
        const { default: danbooruApi } = await import('../services/danbooruApi');
        
        // Limpiar el estado actual antes de cargar nuevas imágenes
        if (nsfwFilter) {
          // Si el filtro NSFW está activado, marcar todos los posts como bloqueados inicialmente
          const initialBlocked = new Set<number>(postIds);
          setNsfwBlockedPosts(initialBlocked);
          setImageMap({});
        }
        
        // Crear clave de caché con timestamp para evitar problemas de caché
        const cacheKey = `${postIds.sort().join('_')}_${nsfwFilter ? allowedRatings.join(',') : 'all'}_${Date.now()}`;
        let posts: DanbooruPost[] = [];
        
        // Siempre obtener posts frescos cuando cambia el filtro NSFW
        posts = await danbooruApi.getWikiPageManager().getPostsByIds(postIds, nsfwFilter ? { 'search[rating]': allowedRatings.join(',') } : {});
        cacheRef.current[cacheKey] = posts;
        
        const newImageMap: Record<number, string> = {};
        const blocked = new Set<number>();
        
        posts.forEach((post) => {
          if (post.preview_file_url) {
            if (nsfwFilter && !allowedRatings.includes(post.rating)) {
              blocked.add(post.id);
            } else {
              newImageMap[post.id] = post.preview_file_url;
            }
          }
        });
        
        setImageMap(newImageMap); // Reemplazar completamente en lugar de fusionar
        setNsfwBlockedPosts(blocked); // Reemplazar completamente en lugar de fusionar
      } catch (err: any) {
        setError(err?.message || 'Error cargando imágenes');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearCache = useCallback(() => {
    setImageMap({});
    setNsfwBlockedPosts(new Set());
    cacheRef.current = {};
  }, []);

  return {
    imageMap,
    nsfwBlockedPosts,
    isLoading,
    error,
    loadImages,
    clearCache,
  };
}