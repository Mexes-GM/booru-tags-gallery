/**
 * Utilidades para manejar clics en imágenes desde contenido DText
 * Proporciona funcionalidad para abrir el modal de imagen al hacer clic en imágenes
 */

// Evento personalizado para abrir modal de imagen
export const IMAGE_MODAL_EVENT = 'imageModalOpen';

/**
 * Interfaz para el evento personalizado de apertura de modal de imagen
 */
export interface ImageClickEvent extends CustomEvent {
  detail: {
    postId: number;
  };
}

export const dispatchImageClick = (postId: number) => {
  const event = new CustomEvent(IMAGE_MODAL_EVENT, {
    detail: { postId },
    bubbles: true,
    cancelable: true
  }) as ImageClickEvent;
  
  document.dispatchEvent(event);
};

/**
 * Maneja el clic en un enlace de imagen desde contenido DText
 * @param event - Evento de clic del mouse
 * @param postId - ID del post
 */
export const handleImageLinkClick = (event: MouseEvent, postId: number): void => {
  event.preventDefault();
  event.stopPropagation();
  
  dispatchImageClick(postId);
};

/**
 * Configura el listener global para clics en imágenes con data-post-id
 * Debe ser llamado una vez al inicializar la aplicación
 */
export const setupImageLinkHandler = (): (() => void) => {
  const handleClick = (event: MouseEvent) => {
    const target = event.target as unknown as HTMLElement | null;
    if (!target || !(target instanceof HTMLElement)) return;
    // Imagen directa
    if (target.tagName === 'IMG' && target.hasAttribute?.('data-post-id')) {
      const postId = parseInt(target.getAttribute('data-post-id') || '0', 10);
      if (postId > 0) {
        handleImageLinkClick(event, postId);
      }
      return;
    }
    // Badge de post dentro de notas
    if (target.hasAttribute?.('data-post-badge') && target.hasAttribute?.('data-post-id')) {
      const postId = parseInt(target.getAttribute('data-post-id') || '0', 10);
      if (postId > 0) {
        handleImageLinkClick(event, postId);
      }
    }
  };

  const handleMouseEnter = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target && target instanceof HTMLElement && target.hasAttribute && target.hasAttribute('data-post-badge') && target.hasAttribute('data-post-id')) {
      const postId = parseInt(target.getAttribute('data-post-id') || '0', 10);
      if (postId > 0) {
        // Despachar evento para que algún componente React pueda mostrar tooltip con la miniatura
        const hoverEvent = new CustomEvent('postBadgeHover', {
          detail: { postId, element: target },
          bubbles: true,
          cancelable: false
        });
        document.dispatchEvent(hoverEvent);
      }
    }
  };

  const handleMouseLeave = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target && target instanceof HTMLElement && target.hasAttribute && target.hasAttribute('data-post-badge')) {
      const leaveEvent = new CustomEvent('postBadgeLeave', {
        detail: { element: target },
        bubbles: true,
        cancelable: false
      });
      document.dispatchEvent(leaveEvent);
    }
  };

  document.addEventListener('click', handleClick, true);
  document.addEventListener('mouseenter', handleMouseEnter, true);
  document.addEventListener('mouseleave', handleMouseLeave, true);

  return () => {
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('mouseenter', handleMouseEnter, true);
    document.removeEventListener('mouseleave', handleMouseLeave, true);
  };
};