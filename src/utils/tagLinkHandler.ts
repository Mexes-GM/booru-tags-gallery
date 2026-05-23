import { useEffect } from 'react';

/**
 * Utilidades para manejar clics en enlaces de tags desde contenido DText
 */

export const TAG_MODAL_EVENT = 'tagModalOpen';

/**
 * Interfaz para el evento personalizado de apertura de modal
 */
export interface TagModalEvent extends CustomEvent {
  detail: {
    tagName: string;
  };
}

/**
 * Dispara un evento personalizado para abrir el modal de un tag
 * @param tagName - Nombre del tag a abrir
 */
export const dispatchTagModalEvent = (tagName: string): void => {
  const event = new CustomEvent(TAG_MODAL_EVENT, {
    detail: { tagName },
    bubbles: true,
    cancelable: true
  });
  
  document.dispatchEvent(event);
};

/**
 * Manejador de clic para enlaces de tags
 * Previene la navegación y dispara el evento para abrir el modal
 * @param event - Evento de clic
 * @param tagName - Nombre del tag
 */
export const handleTagLinkClick = (event: MouseEvent, tagName: string): void => {
  event.preventDefault();
  event.stopPropagation();
  
  dispatchTagModalEvent(tagName);
};

/**
 * Crea un manejador de clic para enlaces de tags
 * @param tagName - Nombre del tag
 * @returns Función manejadora del clic
 */
// Función createTagLinkHandler eliminada - no se usaba en el proyecto

/**
 * Hook para escuchar eventos de apertura de modal de tags
 * @param onTagModalOpen - Callback que se ejecuta cuando se dispara el evento
 */
export const useTagModalEventListener = (onTagModalOpen: (tagName: string) => void): void => {
  useEffect(() => {
    const handleTagModalEvent = (event: Event) => {
      const customEvent = event as TagModalEvent;
      if (customEvent.detail?.tagName) {
        onTagModalOpen(customEvent.detail.tagName);
      }
    };

    document.addEventListener(TAG_MODAL_EVENT, handleTagModalEvent);
    
    return () => {
      document.removeEventListener(TAG_MODAL_EVENT, handleTagModalEvent);
    };
  }, [onTagModalOpen]);
};