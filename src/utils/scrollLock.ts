// Utilidad centralizada para manejar el bloqueo de scroll cuando hay múltiples modales.
// Evita que un modal libere el scroll mientras otro sigue abierto.

let lockCount = 0;
let originalOverflow: string | null = null;
let originalPaddingRight: string | null = null;
let originalPosition: string | null = null;
let originalTop: string | null = null;
let scrollYBeforeLock = 0;

/** Calcula el ancho de la barra de scroll para compensar layout shift. */
const getScrollbarWidth = (): number => {
  if (typeof window === 'undefined') return 0;
  return window.innerWidth - document.documentElement.clientWidth;
};

/**
 * Bloquea el scroll del documento. Devuelve una función release para liberar este lock.
 * Soporta múltiples adquisiciones anidadas mediante un contador.
 */
export const acquireScrollLock = (): (() => void) => {
  if (typeof document === 'undefined') {
    return () => {};
  }
  lockCount += 1;
  if (lockCount === 1) {
    const body = document.body;
    // Guardar estilos originales solo la primera vez
    originalOverflow = body.style.overflow;
    originalPaddingRight = body.style.paddingRight;
    originalPosition = body.style.position;
    originalTop = body.style.top;
    // Evitar salto de contenido al quitar barra scroll
    const scrollbarWidth = getScrollbarWidth();
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    // Guardar posición de scroll y fijar body
    scrollYBeforeLock = window.scrollY;
    body.style.position = 'fixed';
    body.style.top = `-${scrollYBeforeLock}px`;
    body.style.overflow = 'hidden';
    body.style.width = '100%';
  }
  // Función para liberar ESTE lock
  let released = false;
  return () => {
    if (released) return; // idempotente
    released = true;
    if (lockCount > 0) {
      lockCount -= 1;
      if (lockCount === 0) {
        const body = document.body;
        if (originalOverflow !== null) body.style.overflow = originalOverflow;
        if (originalPaddingRight !== null) body.style.paddingRight = originalPaddingRight;
        if (originalPosition !== null) body.style.position = originalPosition;
        if (originalTop !== null) body.style.top = originalTop;
        body.style.width = '';
        window.scrollTo(0, scrollYBeforeLock);
        originalOverflow = null;
        originalPaddingRight = null;
        originalPosition = null;
        originalTop = null;
      }
    }
  };
};

/** Devuelve el número actual de locks activos (para depuración/tests). */
// Función getActiveScrollLocks eliminada - no se usaba en el proyecto
