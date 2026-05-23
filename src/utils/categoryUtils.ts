import { CATEGORY_COLORS, CATEGORY_NAMES } from '../config/appConfig'

export const getCategoryColor = (category: number): string => {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default
}

export const getCategoryName = (category: number): string => {
  return CATEGORY_NAMES[category] || 'Desconocido'
}

// Eliminadas funciones hex deprecated: se usan clases semánticas + variables.

export const getCategoryClass = (category: number): string => {
  // Clases semánticas definidas en variables CSS (index.css)
  switch(category) {
    case 0: return 'cat-badge cat-general'
    case 1: return 'cat-badge cat-artist'
    case 3: return 'cat-badge cat-copyright'
    case 4: return 'cat-badge cat-character'
    case 5: return 'cat-badge cat-meta'
    default: return 'cat-badge cat-default'
  }
}

export const getCategoryBaseClass = (category: number): string => {
  // Solo la clase base (sin 'cat-badge') para usar en indicadores circulares
  switch(category) {
    case 0: return 'cat-general'
    case 1: return 'cat-artist'
    case 3: return 'cat-copyright'
    case 4: return 'cat-character'
    case 5: return 'cat-meta'
    default: return 'cat-default'
  }
}

export const getCategoryLabel = (category: number): string => {
  switch(category) {
    case 0: return 'General'
    case 1: return 'Artista'
    case 3: return 'Copyright'
    case 4: return 'Personaje'
    case 5: return 'Meta'
    default: return 'Otro'
  }
}