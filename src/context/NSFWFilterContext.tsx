import { useState, useCallback, useMemo, useEffect, useRef, ReactNode } from "react";
import { NSFWFilterContext } from "./NSFWContext";
import { useToggleDebounce } from "../hooks/useToggleDebounce";

interface NSFWFilterProviderProps {
  children: ReactNode;
}

interface NSFWFilterValue {
  isNSFWFilterEnabled: boolean;
  toggleNSFWFilter: () => void;
  applyFilterToTags: (tags?: string) => string;
  getRatingParams: () => { allowedRatings?: string[] };
  isToggling: boolean;
  resetToggle: () => void;
}

export function NSFWFilterProvider({ children }: NSFWFilterProviderProps) {
  const [isNSFWFilterEnabled, setIsNSFWFilterEnabled] = useState<boolean>(true);
  const [isToggling, setIsToggling] = useState<boolean>(false);

  const filterCache = useMemo(() => new Map<string, string>(), []);

  const filterChangeRef = useRef<boolean>(false);
  
  const { reset: resetToggle } = useToggleDebounce(1000);

  const toggleNSFWFilter = useCallback(() => {
    if (isToggling) return;
    
    setIsToggling(true);
    const newValue = !isNSFWFilterEnabled;

    
    setIsNSFWFilterEnabled(newValue);
    
    // Limpiar cache cuando cambia el filtro
    filterCache.clear();
    
    
    // Establecer el flag para que el efecto realice la limpieza de caché
    filterChangeRef.current = true;
    
    // Dispatch custom event para notificar a otros componentes

    window.dispatchEvent(new CustomEvent('nsfwFilterChanged', {
      detail: { enabled: newValue }
    }));
    
    setTimeout(() => {
      setIsToggling(false);
    }, 500);
  }, [isNSFWFilterEnabled, isToggling, filterCache]);

  useEffect(() => {
    if (filterChangeRef.current) {
      (async () => {
        const { default: danbooruApi } = await import('../services/danbooruApi');
        // Limpiar caché de forma más agresiva para asegurar que no queden imágenes NSFW
        await danbooruApi.clearFilterChangeCache();
        
        // Forzar una limpieza completa del caché del navegador para las imágenes
        if ('caches' in window) {
          try {
            const cacheNames = await window.caches.keys();
            await Promise.all(
              cacheNames
                .filter(cacheName => cacheName.includes('image'))
                .map(cacheName => window.caches.delete(cacheName))
            );
          } catch {
            // Error clearing image cache
          }
        }
      })();
      
      filterCache.clear();
      
      window.dispatchEvent(new CustomEvent('nsfwFilterChanged', { detail: { enabled: isNSFWFilterEnabled } }));
      
      filterChangeRef.current = false;
    }
  }, [isNSFWFilterEnabled, filterCache]);

  useEffect(() => {
    return () => {
    };
  }, []);

  const applyFilterToTags = useCallback((tags: string = ""): string => {
    const cacheKey = `${tags}_${isNSFWFilterEnabled}`;
    if (filterCache.has(cacheKey)) {
      return filterCache.get(cacheKey)!;
    }

    if (!isNSFWFilterEnabled) {
      const result = tags;
      filterCache.set(cacheKey, result);
      return result;
    }

    const nsfwFilter = "rating:g";
    const videoFilter = "-video";
    
    if (!tags || tags.trim() === "") {
      const result = `${nsfwFilter} ${videoFilter}`;
      filterCache.set(cacheKey, result);
      return result;
    }

    const cleanTags = tags.trim().replace(/\s+/g, ' ');
    
    if (cleanTags.includes('rating:g')) {
      if (!cleanTags.includes('-video')) {
        const result = `${cleanTags} ${videoFilter}`;
        filterCache.set(cacheKey, result);
        return result;
      }
      filterCache.set(cacheKey, cleanTags);
      return cleanTags;
    }

    const result = `${cleanTags} ${nsfwFilter} ${videoFilter}`;
    filterCache.set(cacheKey, result);
    return result;
  }, [isNSFWFilterEnabled, filterCache]);

  const getRatingParams = useCallback((): { allowedRatings?: string[] } => {
    if (!isNSFWFilterEnabled) {
      return {};
    }

    return {
      allowedRatings: ["g"]
    };
  }, [isNSFWFilterEnabled]);

  const value: NSFWFilterValue = {
    isNSFWFilterEnabled,
    toggleNSFWFilter,
    applyFilterToTags,
    getRatingParams,
    isToggling,
    resetToggle
  };

  return (
    <NSFWFilterContext.Provider value={value}>
      {children}
    </NSFWFilterContext.Provider>
  );
}