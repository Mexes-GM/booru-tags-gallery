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
  /** Active prompt filter, e.g. "Clothing › Headwear". */
  promptFilterLabel?: string;
}

const Badge: React.FC<{ children: React.ReactNode; mono?: boolean }>
  = ({ children, mono = false }) => (
  <span className={`inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground ${mono ? 'font-mono' : ''}`}>
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
  promptFilterLabel,
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
    return t(`search.categories.${key}`)
  })()

  return (
    <div className="flex flex-col gap-1.5 text-sm text-muted-foreground" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span>{t('search.searching')}</span>
        <Badge mono>{(translatedTerm || searchTerm).replace(/\s+/g, '_')}</Badge>
        <span>{t('search.in')}</span>
        <Badge>{categoryLabel || selectedCategory}</Badge>
        {promptFilterLabel && (
          <>
            <span aria-hidden="true" className="text-muted-foreground/60">›</span>
            <Badge>{promptFilterLabel}</Badge>
          </>
        )}
        <span aria-hidden="true" className="text-muted-foreground/40">·</span>
        {isLoading ? (
          <span>{t('search.loading')}</span>
        ) : (
          <span>
            <span className="font-mono tabular-nums text-foreground">{searchResults.length}</span>{' '}
            {t(`search.${searchResults.length === 1 ? 'result' : 'results'}`)}
          </span>
        )}
      </div>

      {(isTranslating || showTranslation || showAlias) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {isTranslating && <span>{t('search.translating')}</span>}
          {showTranslation && (
            <span>
              {t('search.translationOf')} &ldquo;{originalInputTerm || searchTerm}&rdquo; &rarr; <span className="font-medium text-foreground">{translatedTerm}</span>
            </span>
          )}
          {showAlias && (
            <span>
              {t('search.aliasResolved')} &rarr; <span className="font-medium text-foreground">{resolvedCanonicalTerm}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default SearchInfo