import React, { createContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { track } from '@vercel/analytics';
import { DanbooruTag } from '../types';
import { useModalZIndex } from './ModalZIndexContext';

interface TagModalContextType {
  selectedTag: DanbooruTag | null;
  isModalOpen: boolean;
  isLoading: boolean;
  openModal: (tag: DanbooruTag) => void;
  openModalByTagName: (tagName: string) => Promise<void>;
  closeModal: () => void;
  // Historial de navegación
  history: DanbooruTag[];
  historyIndex: number;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

const TagModalContext = createContext<TagModalContextType | undefined>(undefined);

export { TagModalContext };
export type { TagModalContextType };

interface TagModalProviderProps {
  children: ReactNode;
}

// Constantes de configuración
const DEBOUNCE_DELAY = 300;
const MAX_CACHE_SIZE = 50;
const CACHE_CLEANUP_INTERVAL = 60000; // 1 minuto

/**
 * Proveedor de contexto para el modal de tags.
 * Gestiona el estado del modal, cache de tags y navegación por historial.
 */
export const TagModalProvider: React.FC<TagModalProviderProps> = ({ children }) => {
  const [selectedTag, setSelectedTag] = useState<DanbooruTag | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [tagCache, setTagCache] = useState<Map<string, DanbooruTag>>(new Map());
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  
  // Historial de navegación
  const [history, setHistory] = useState<DanbooruTag[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const { setActiveModal } = useModalZIndex();

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  /**
   * Abre el modal con un tag específico y actualiza el historial
   * @param tag - Tag a mostrar en el modal
   */
  const openModal = useCallback((tag: DanbooruTag) => {
    setSelectedTag(tag);
    setIsModalOpen(true);
    setIsLoading(false);
    setActiveModal('tag');
    try {
      track('tag_modal_open', { tag: tag.name, category: tag.category });
    } catch {}
    
    setHistory(prevHistory => {
      // Si estamos en medio del historial, truncar hacia adelante
      const newHistory = historyIndex >= 0 ? prevHistory.slice(0, historyIndex + 1) : prevHistory;
      // Evitar duplicados consecutivos
      if (newHistory.length > 0 && newHistory[newHistory.length - 1].name === tag.name) {
        return newHistory;
      }
      return [...newHistory, tag];
    });
    
    setHistoryIndex(() => {
      return historyIndex >= 0 ? Math.min(historyIndex + 1, history.length) : 0;
    });
  }, [historyIndex, history.length, setActiveModal]);

  /**
   * Crea un tag de respaldo cuando no se encuentra información en la API
   * @param tagName - Nombre del tag normalizado
   * @returns Tag de respaldo con información básica
   */
  const createFallbackTag = useCallback((tagName: string): DanbooruTag => ({
    id: 0,
    name: tagName,
    category: 0, // General
    post_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deprecated: false,
    is_locked: false,
    version: 1,
    words: []
  }), []);

  /**
   * Abre el modal buscando un tag por nombre
   * @param tagName - Nombre del tag a buscar
   */
  const openModalByTagName = useCallback(async (tagName: string) => {
    // Debounce para evitar múltiples clics rápidos
    const now = Date.now();
    if (now - lastClickTime < DEBOUNCE_DELAY) {
      return;
    }
    setLastClickTime(now);
    
    try {
      const normalizedTagName = tagName.trim().replace(/\s+/g, '_');
      
      // Verificar cache
  if (tagCache.has(normalizedTagName)) {
        const cachedTag = tagCache.get(normalizedTagName)!;
        openModal(cachedTag);
        return;
      }
      
      // Verificar peticiones pendientes
      if (pendingRequests.has(normalizedTagName)) {
        return;
      }
      
      // Marcar como petición pendiente
      setPendingRequests(prev => new Set(prev).add(normalizedTagName));
      setIsLoading(true);
      
      // Obtener información del tag desde la API
      const { default: danbooruApi } = await import('../services/danbooruApi');
      const tagInfo = await danbooruApi.getTag(normalizedTagName);
      
      // Limpiar petición pendiente
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(normalizedTagName);
        return newSet;
      });
      setIsLoading(false);
      
  const finalTag = tagInfo || createFallbackTag(normalizedTagName);
      
      // Guardar en cache
      setTagCache(prev => new Map(prev).set(normalizedTagName, finalTag));
      openModal(finalTag);
  try { track('tag_modal_fetch', { tag: normalizedTagName, fetched: Boolean(tagInfo) }); } catch {}
      
    } catch (error) {
      // Limpiar estado de error
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(tagName.trim().replace(/\s+/g, '_'));
        return newSet;
      });
      setIsLoading(false);
      
      // Silently handle error opening modal
      
      // Crear tag de respaldo en caso de error
      const fallbackTag = createFallbackTag(tagName.trim().replace(/\s+/g, '_'));
      setTagCache(prev => new Map(prev).set(tagName.trim().replace(/\s+/g, '_'), fallbackTag));
      openModal(fallbackTag);
    }
  }, [openModal, tagCache, pendingRequests, lastClickTime, createFallbackTag]);

  /**
   * Cierra el modal con animación
   */
  const closeModal = useCallback(() => {
    // Forzar ocultar tooltips de badges de post que puedan quedar visibles
    try {
      const leaveEvent = new CustomEvent('postBadgeLeave', { bubbles: true, cancelable: false });
      document.dispatchEvent(leaveEvent);
    } catch (_) {
      // ignorar
    }
    setIsModalOpen(false);
    try { if (selectedTag) track('tag_modal_close', { tag: selectedTag.name }); } catch {}
    setTimeout(() => {
      setSelectedTag(null);
    }, 300);
  }, [selectedTag]);

  /**
   * Navega hacia atrás en el historial
   */
  const goBack = useCallback(() => {
    setHistoryIndex(prevIndex => {
      if (prevIndex > 0) {
        const newIndex = prevIndex - 1;
        setSelectedTag(history[newIndex]);
        return newIndex;
      }
      return prevIndex;
    });
  }, [history]);

  /**
   * Navega hacia adelante en el historial
   */
  const goForward = useCallback(() => {
    setHistoryIndex(prevIndex => {
      if (prevIndex < history.length - 1) {
        const newIndex = prevIndex + 1;
        setSelectedTag(history[newIndex]);
        return newIndex;
      }
      return prevIndex;
    });
  }, [history]);

  // Sincronizar selectedTag cuando cambia el índice del historial
  useEffect(() => {
    if (historyIndex >= 0 && history[historyIndex]) {
      setSelectedTag(history[historyIndex]);
    }
  }, [historyIndex, history]);

  // Limpiar cache periódicamente para evitar problemas de memoria - solo cuando sea necesario
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    const startCleanupIfNeeded = () => {
      if (tagCache.size > MAX_CACHE_SIZE * 0.8) { // Iniciar limpieza cuando esté al 80% de capacidad
        if (!interval) {
          interval = setInterval(() => {
            setTagCache(prev => {
              if (prev.size > MAX_CACHE_SIZE) {
                const entries = Array.from(prev.entries());
                const recentEntries = entries.slice(-MAX_CACHE_SIZE);
                return new Map(recentEntries);
              }
              // Si el cache está por debajo del límite, detener el intervalo
              if (prev.size < MAX_CACHE_SIZE * 0.7 && interval) {
                clearInterval(interval);
                interval = null;
              }
              return prev;
            });
          }, CACHE_CLEANUP_INTERVAL);
        }
      }
    };
    
    startCleanupIfNeeded();
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [tagCache.size]);

  const value: TagModalContextType = {
    selectedTag,
    isModalOpen,
    isLoading,
    openModal,
    openModalByTagName,
    closeModal,
    history,
    historyIndex,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  };

  return (
    <TagModalContext.Provider value={value}>
      {children}
    </TagModalContext.Provider>
  );
};