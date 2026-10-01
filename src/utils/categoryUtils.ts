import i18n from '../i18n'
import { CATEGORY_COLORS } from '../config/appConfig'

const CATEGORY_KEYS: Record<number, string> = {
  0: 'general',
  1: 'artist',
  3: 'copyright',
  4: 'character',
  5: 'meta'
}

export const getCategoryColor = (category: number): string => {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default
}

/** Category label in the active UI language. */
export const getCategoryName = (category: number): string => {
  const key = CATEGORY_KEYS[category]
  return key ? i18n.t(`search.categories.${key}`) : i18n.t('common.none')
}

export const getCategoryClass = (category: number): string => {
  // Clases semánticas definidas en index.css (.cat-badge + matiz por categoría)
  return `cat-badge ${getCategoryBaseClass(category)}`
}

export const getCategoryBaseClass = (category: number): string => {
  // Solo la clase de matiz (sin 'cat-badge') para puntos e indicadores
  const key = CATEGORY_KEYS[category]
  return key ? `cat-${key}` : 'cat-default'
}

export const getCategoryLabel = getCategoryName
