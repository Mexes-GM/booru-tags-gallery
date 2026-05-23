import React from 'react'
import { useTranslation } from 'react-i18next'
import { LocalTagData } from '../types'

interface SearchInfoProps {
  searchTerm: string;
  searchResults: LocalTagData[];
  isLoading: boolean;
  selectedCategory: string;
  // New optional props for feedback
  isTranslating?: boolean;
  translatedTerm?: string;
  lastTranslatedFor?: string;
  resolvedCanonicalTerm?: string;
  originalInputTerm?: string;
}

const Badge: React.FC<{ children: React.ReactNode; variant?: 'default' | 'muted' }>
  = ({ children, variant = 'default' }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
    variant === 'default'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
  }`}>
    {children}
  </span>
)

const SearchInfo: React.FC<SearchInfoProps> = ({
  searchTerm,
  searchResults,
  isLoading,
  selectedCategory,
  isTranslating,
  translatedTerm,
  lastTranslatedFor,
  resolvedCanonicalTerm,
  originalInputTerm,
}) => {
  const { t } = useTranslation();
  const showBar = !!searchTerm
  if (!showBar) return null

  const showTranslation = !!translatedTerm && lastTranslatedFor === searchTerm && translatedTerm !== searchTerm
  const showAlias = !!resolvedCanonicalTerm && resolvedCanonicalTerm.toLowerCase() !== (translatedTerm || searchTerm).toLowerCase()

  // Traducir categoría seleccionada (las categorías vienen como valores internos)
  const categoryLabel = (() => {
    if (!selectedCategory) return ''
    const key = selectedCategory.toLowerCase()
    if (key === 'tag_groups' || key === 'tag-groups') return t('search.categories.tagGroups')
    return t(`search.categories.${key}` as any)
  })()

  return (
    <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">{t('search.searching')}</span>
        <Badge>
          {(translatedTerm || searchTerm).replace(/\s+/g, '_')}
        </Badge>
        <span className="text-gray-400">{t('search.in')}</span>
  <Badge variant="muted">{categoryLabel || selectedCategory}</Badge>
        {!isLoading && (
          <span className="text-gray-400">· {searchResults.length} {t(`search.${searchResults.length === 1 ? 'result' : 'results'}`)}</span>
        )}
        {isLoading && (
          <span className="text-gray-400">· {t('search.loading')}</span>
        )}
      </div>

      {(isTranslating || showTranslation || showAlias) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isTranslating && (
            <Badge variant="muted">{t('search.translating')}</Badge>
          )}
          {showTranslation && (
            <span>
              {t('search.translationOf')} "{originalInputTerm || searchTerm}" → <span className="font-medium">{translatedTerm}</span>
            </span>
          )}
          {showAlias && (
            <span>
              {t('search.aliasResolved')} → <span className="font-medium">{resolvedCanonicalTerm}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default SearchInfo