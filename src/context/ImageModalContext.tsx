import React, { createContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';
import { track } from '@vercel/analytics';
import { DanbooruPost } from '../types';
import { IMAGE_MODAL_EVENT, ImageClickEvent } from '../utils';
import { useModalZIndex } from './useModalZIndex';

interface ImageModalContextType {
  selectedPost: DanbooruPost | null;
  isModalOpen: boolean;
  isLoading: boolean;
  openModal: (post: DanbooruPost) => void;
  openModalByPostId: (postId: number) => Promise<void>;
  closeModal: () => void;
  // Historial de navegación
  history: DanbooruPost[];
  historyIndex: number;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

const ImageModalContext = createContext<ImageModalContextType | undefined>(undefined);

export { ImageModalContext };
export type { ImageModalContextType };

interface ImageModalProviderProps {
  children: ReactNode;
}

// Constantes de configuración
const DEBOUNCE_DELAY = 300;

/**
 * Proveedor de contexto para el modal de imágenes.
 * Gestiona el estado del modal, cache de posts y navegación por historial.
 */
export const ImageModalProvider: React.FC<ImageModalProviderProps> = ({ children }) => {
  const [selectedPost, setSelectedPost] = useState<DanbooruPost | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [postCache, setPostCache] = useState<Map<number, DanbooruPost>>(new Map());
  const [pendingRequests, setPendingRequests] = useState<Set<number>>(new Set());
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  
  // Historial de navegación
  const [history, setHistory] = useState<DanbooruPost[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const { setActiveModal } = useModalZIndex();

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  /**
   * Abre el modal con un post específico y actualiza el historial
   * @param post - Post a mostrar en el modal
   */
  const openModal = useCallback((post: DanbooruPost) => {
    setSelectedPost(post);
    setIsModalOpen(true);
    setIsLoading(false);
    setActiveModal('image');
  try { track('image_modal_open', { postId: post.id, rating: post.rating }); } catch {}
    
    setHistory(prevHistory => {
      // Si estamos en medio del historial, truncar hacia adelante
      const newHistory = historyIndex >= 0 ? prevHistory.slice(0, historyIndex + 1) : prevHistory;
      // Evitar duplicados consecutivos
      if (newHistory.length > 0 && newHistory[newHistory.length - 1].id === post.id) {
        return newHistory;
      }
      return [...newHistory, post];
    });
    
    setHistoryIndex(() => {
      return historyIndex >= 0 ? Math.min(historyIndex + 1, history.length) : 0;
    });
  }, [historyIndex, history.length, setActiveModal]);

  /**
   * Abre el modal buscando un post por ID
   * @param postId - ID del post a buscar
   */
  const openModalByPostId = useCallback(async (postId: number) => {
    // Debounce para evitar múltiples clics rápidos
    const now = Date.now();
    if (now - lastClickTime < DEBOUNCE_DELAY) {
      return;
    }
    setLastClickTime(now);
    
    try {
      // Verificar cache
  if (postCache.has(postId)) {
        const cachedPost = postCache.get(postId)!;
        openModal(cachedPost);
        return;
      }
      
      // Verificar peticiones pendientes
      if (pendingRequests.has(postId)) {
        return;
      }
      
      // Marcar como petición pendiente
      setPendingRequests(prev => new Set(prev).add(postId));
      setIsLoading(true);
      
      // Obtener información del post desde la API
      const { default: danbooruApi } = await import('../services/danbooruApi');
      const postInfo = await danbooruApi.getPostsByIds([postId]);
      
      // Limpiar petición pendiente
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
      setIsLoading(false);
      
      if (postInfo && postInfo.length > 0) {
        const post = postInfo[0];
        // Guardar en cache
        setPostCache(prev => new Map(prev).set(postId, post));
        openModal(post);
        try { track('image_modal_fetch', { postId, fetched: true }); } catch {}
      }
    } catch {
      // Limpiar estado de error
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
      setIsLoading(false);
      
      // Silently handle modal opening error
    }
  }, [openModal, postCache, pendingRequests, lastClickTime]);

  /**
   * Cierra el modal con animación
   */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    try { if (selectedPost) track('image_modal_close', { postId: selectedPost.id }); } catch {}
    setTimeout(() => {
      setSelectedPost(null);
    }, 300);
  }, [selectedPost]);

  /**
   * Navega hacia atrás en el historial
   */
  const goBack = useCallback(() => {
    setHistoryIndex(prevIndex => {
      if (prevIndex > 0) {
        const newIndex = prevIndex - 1;
        setSelectedPost(history[newIndex]);
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
        setSelectedPost(history[newIndex]);
        return newIndex;
      }
      return prevIndex;
    });
  }, [history]);

  // Memoizar el valor del contexto para evitar renderizados innecesarios
  const value = useMemo<ImageModalContextType>(() => ({
    selectedPost,
    isModalOpen,
    isLoading,
    openModal,
    openModalByPostId,
    closeModal,
    history,
    historyIndex,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  }), [
    selectedPost,
    isModalOpen,
    isLoading,
    openModal,
    openModalByPostId,
    closeModal,
    history,
    historyIndex,
    goBack,
    goForward,
    canGoBack,
    canGoForward
  ]);

  // Escuchar eventos personalizados de apertura de modal de imagen
  useEffect(() => {
    const handleImageModalEvent = (event: Event) => {
      const imageModalEvent = event as ImageClickEvent;
      const { postId } = imageModalEvent.detail;
      openModalByPostId(postId);
    };

    document.addEventListener(IMAGE_MODAL_EVENT, handleImageModalEvent);

    return () => {
      document.removeEventListener(IMAGE_MODAL_EVENT, handleImageModalEvent);
    };
  }, [openModalByPostId]);

  return (
    <ImageModalContext.Provider value={value}>
      {children}
    </ImageModalContext.Provider>
  );
};