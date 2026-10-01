import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import NSFWFilterToggle from './NSFWFilterToggle'
import { 
  getCategoryClass, 
  getCategoryLabel, 
  highlightSearchMatch, 
  formatPostCount, 
  normalizeForComparison,
  copyToClipboard,
  showCopyFeedbackBubble
} from '../utils'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import Switch from './ui/Switch'
import { cn } from '../utils/cn'
import { DanbooruTag, DeepLLanguage } from '../types'
import LoadingSpinner from './common/LoadingSpinner'

interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onClearSearch?: () => void;
  suggestions: DanbooruTag[];
  synonymSuggestions?: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  // Optional category statistics (e.g., counts) passed from parent. Currently unused but accepted to prevent type errors.
  categoryStats?: Record<string, number>;
  isLoading?: boolean;
  isSuggestionsLoading?: boolean;
  isTransitioning?: boolean;
  isWorkerReady?: boolean;
  isTranslating?: boolean;
  // Translation settings - updated for dynamic languages
  autoTranslateEnabled?: boolean;
  onToggleAutoTranslate?: (enabled: boolean) => void;
  inputLanguage?: string; // Changed from union to string for dynamic languages
  onInputLanguageChange?: (lang: string) => void; // Changed from union to string
  availableLanguages?: DeepLLanguage[]; // New prop for language list
  isLoadingLanguages?: boolean; // New prop for loading state
  // Translation state for highlighting
  translatedTerm?: string;
  lastTranslatedFor?: string;
  aliasResolverEnabled?: boolean;
  /** Extra filter controls shown next to the category tabs. */
  extraFilters?: React.ReactNode;
  onToggleAliasResolver?: (enabled: boolean) => void;
}

interface Category {
  value: string;
  label: string;
  /** CSS class that sets --chip-hue for the dot. */
  hue: string;
}

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

const SearchBar: React.FC<SearchBarProps> = ({ 
  searchTerm, 
  onSearchChange, 
  onClearSearch,
  suggestions, 
  synonymSuggestions,
  selectedCategory, 
  onCategoryChange,
  categoryStats,
  isSuggestionsLoading,
  isWorkerReady = true,
  isTranslating = false,
  // Default now disabled; persistence handled in hook
  autoTranslateEnabled = false,
  onToggleAutoTranslate,
  inputLanguage = 'auto',
  onInputLanguageChange,
  availableLanguages = [],
  isLoadingLanguages = false,
  translatedTerm,
  lastTranslatedFor,
  aliasResolverEnabled = true,
  onToggleAliasResolver,
  extraFilters,
}) => {
  const { t } = useTranslation()
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  // Dropdown for input language selection (limited height with scroll)
  const [isLangMenuOpen, setIsLangMenuOpen] = useState<boolean>(false)
  const langDropdownRef = useRef<HTMLDivElement>(null)
  // Control de visibilidad del banner de sinónimos ("¿Quisiste decir?")
  const [showSynonymBanner, setShowSynonymBanner] = useState<boolean>(true)

  useEffect(() => {
    const handleClickOutsideLang = (event: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutsideLang)
    return () => document.removeEventListener('mousedown', handleClickOutsideLang)
  }, [])

  const categories: Category[] = useMemo(() => [
    { value: 'all', label: t('search.categories.all'), hue: 'cat-default' },
    { value: 'general', label: t('search.categories.general'), hue: 'cat-general' },
    { value: 'artist', label: t('search.categories.artist'), hue: 'cat-artist' },
    { value: 'copyright', label: t('search.categories.copyright'), hue: 'cat-copyright' },
    { value: 'character', label: t('search.categories.character'), hue: 'cat-character' },
    { value: 'meta', label: t('search.categories.meta'), hue: 'cat-meta' },
    { value: 'tag_groups', label: t('search.categories.tagGroups'), hue: 'cat-group' }
  ], [t])

  const categoryCount = useCallback((value: string): number | undefined => {
    if (!categoryStats) return undefined
    if (value === 'all') {
      const total = Object.entries(categoryStats)
        .filter(([key]) => key !== 'tag_groups')
        .reduce((sum, [, n]) => sum + n, 0)
      return total || undefined
    }
    return categoryStats[value]
  }, [categoryStats])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        return
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
        return
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex < 0) return
        
        const selectedTag = suggestions[selectedSuggestionIndex]
        onSearchChange(selectedTag.name)
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        return
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        searchInputRef.current?.blur()
        return
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, onSearchChange])

  const handleSuggestionClick = useCallback((tag: DanbooruTag) => {
    onSearchChange(tag.name)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)
  }, [onSearchChange])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value.length > 100) return
    
    onSearchChange(value)
    // Mostrar sugerencias inmediatamente cuando el usuario empieza a escribir, solo si el worker está listo
    if (value.trim().length > 0 && isWorkerReady) {
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
    setSelectedSuggestionIndex(-1)
  }, [onSearchChange, isWorkerReady])

  const handleSynonymClick = useCallback((suggestedTerm: string) => {
    // Aplicar el tag sin guiones bajos para una mejor experiencia de usuario
    const cleanTerm = suggestedTerm.replace(/_/g, ' ')
    // Si el término ya es igual al actual (ignorando espacios y guiones bajos), igual forzar búsqueda pero sin limpiar
    onSearchChange(cleanTerm)
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)
  }, [onSearchChange])



  // Determine effective term to use for highlighting: prefer translated term if it maps to current input
  const effectiveHighlightTerm = useMemo(() => {
    if (translatedTerm && lastTranslatedFor === searchTerm) {
      return translatedTerm;
    }
    return searchTerm;
  }, [translatedTerm, lastTranslatedFor, searchTerm]);

  // Language options and current label for custom dropdown
  const languageOptions = useMemo<DeepLLanguage[]>(() => {
    if (isLoadingLanguages) return []
    const fallback: DeepLLanguage[] = [
      { language: 'auto', name: t('search.languageAuto') || 'Automático' },
      { language: 'ES', name: 'Español' }
    ]
    const source = availableLanguages.length > 0 ? availableLanguages : fallback
    // Filter out English option if present
    return source.filter(l => l.language !== 'EN')
  }, [availableLanguages, isLoadingLanguages, t])

  const currentLanguageLabel = useMemo(() => {
    if (isLoadingLanguages) return t('search.loadingLanguages') || 'Cargando idiomas...'
    const found = languageOptions.find(l => l.language === inputLanguage)
    if (!found) return inputLanguage
    return found.language === 'auto' ? (t('search.languageAuto') || found.name) : found.name
  }, [inputLanguage, languageOptions, isLoadingLanguages, t])

  // Flag emoji helper. Some DeepL language codes differ from country codes.
  const getFlagEmoji = useCallback((langCode: string): string => {
    if (!langCode) return '🌐'
    const code = langCode.toUpperCase()
    if (code === 'AUTO') return '🌐'
    // Map DeepL language codes to representative ISO country codes
    const map: Record<string, string> = {
      AR: 'SA', // Arabic – Saudi Arabia (could be any Arabic speaking country)
      BG: 'BG',
      CS: 'CZ', // Czech
      DA: 'DK',
      DE: 'DE',
      EL: 'GR', // Greek
      EN: 'US', // English default to US (could be GB)
      ES: 'ES',
      ET: 'EE',
      FI: 'FI',
      FR: 'FR',
      HU: 'HU',
      ID: 'ID',
      IT: 'IT',
      JA: 'JP',
      KO: 'KR',
      LT: 'LT',
      LV: 'LV',
      NB: 'NO', // Norwegian Bokmål
      NL: 'NL',
      PL: 'PL',
      PT: 'PT', // Portuguese (could differentiate BR / PT if available)
      RO: 'RO',
      RU: 'RU',
      SK: 'SK',
      SL: 'SI', // Slovenian
      SV: 'SE', // Swedish
      TR: 'TR',
      UK: 'UA', // Ukrainian language code vs country code
      ZH: 'CN', // Chinese Simplified assumption
    }
    const country = map[code] || (code.length === 2 ? code : '')
    if (!country || country.length !== 2) return '🏳️'
    // Convert country code to regional indicator symbols
    return country
      .toUpperCase()
      .split('')
      .map(c => String.fromCodePoint(127397 + c.charCodeAt(0)))
      .join('')
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reiniciar visibilidad del banner cuando llegan nuevas sugerencias de sinónimo
  useEffect(() => {
    // Mostrar el banner siempre que existan sugerencias válidas
    if (synonymSuggestions && synonymSuggestions.length > 0) {
      setShowSynonymBanner(true)
    } else {
      setShowSynonymBanner(false)
    }
  }, [synonymSuggestions])

  // Ocultar sugerencias cuando el worker no esté listo
  useEffect(() => {
    if (!isWorkerReady) {
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
  }, [isWorkerReady])



  const copyCategoryLabel = useCallback(async (e: React.MouseEvent, category: number) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await copyToClipboard(getCategoryLabel(category))
    showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok)
  }, [t])

  const pendingSynonym = showSynonymBanner && synonymSuggestions
    ? synonymSuggestions.find(s => normalizeForComparison(s) !== normalizeForComparison(searchTerm))
    : undefined
  const suggestionsOpen = showSuggestions && searchTerm.trim().length > 0 && isWorkerReady

  return (
    <div className="w-full space-y-3" ref={suggestionsRef}>
      {/* Search row: input + NSFW switch */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="search-input"
            name="search"
            aria-label={t('search.placeholder') || 'Search tags'}
            ref={searchInputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={() => isWorkerReady && setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={isWorkerReady ? t('search.placeholder') : t('search.loadingWorker')}
            disabled={!isWorkerReady}
            role="combobox"
            aria-expanded={suggestionsOpen}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            className="h-12 w-full rounded-lg border border-input bg-background pl-10 pr-20 text-base text-foreground transition-shadow focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            {isTranslating && <LoadingSpinner size="sm" ariaLabel={t('search.translating')} />}
            {searchTerm && onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('search.clear')}
                title={t('search.clear')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Autocomplete */}
          {suggestionsOpen && (
            <div
              id="search-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[10px] border border-border bg-popover text-popover-foreground shadow-md"
            >
              {isSuggestionsLoading ? (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <LoadingSpinner size="sm" />
                  <span>{t('search.searchingSuggestions')}</span>
                </div>
              ) : suggestions && suggestions.length > 0 ? (
                <ul className="py-1">
                  {suggestions.slice(0, 5).map((tag, index) => (
                    <li
                      key={tag.id || `${tag.name}-${index}`}
                      role="option"
                      aria-selected={index === selectedSuggestionIndex}
                      onClick={() => handleSuggestionClick(tag)}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 px-3 py-2',
                        index === selectedSuggestionIndex && 'bg-muted'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {highlightSearchMatch(tag.name.replace(/_/g, ' '), effectiveHighlightTerm)}
                        </div>
                        <div className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatPostCount(tag.post_count || 0)}
                        </div>
                      </div>
                      <span
                        className={cn(getCategoryClass(tag.category), 'shrink-0')}
                        title={t('ui.rightClickCopyCategory')}
                        onContextMenu={(e) => copyCategoryLabel(e, tag.category)}
                      >
                        {getCategoryLabel(tag.category)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {t('search.noSuggestionsFound')}
                </div>
              )}
            </div>
          )}

          {/* "Did you mean?" - quiet inline suggestion under the input */}
          {!suggestionsOpen && pendingSynonym && (
            <div
              className="absolute left-0 top-[calc(100%+6px)] z-40 flex max-w-full items-center gap-2 rounded-[10px] border border-border bg-popover py-1 pl-3 pr-1 text-xs text-muted-foreground shadow-md"
              aria-live="polite"
            >
              <span className="whitespace-nowrap">{t('search.didYouMean')}</span>
              <button
                type="button"
                onClick={() => handleSynonymClick(pendingSynonym)}
                className="truncate rounded-md bg-secondary px-2 py-1 font-medium text-secondary-foreground transition-colors hover:bg-muted"
              >
                {pendingSynonym.replace(/_/g, ' ')}
              </button>
              <button
                type="button"
                aria-label={t('search.closeSuggestion')}
                onClick={() => setShowSynonymBanner(false)}
                className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <NSFWFilterToggle />
      </div>

      {/* Category filter + search options */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <div className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div role="tablist" aria-label={t('tags.category')} className="inline-flex gap-0.5 rounded-lg bg-muted p-1">
            {categories.map((category) => {
              const active = selectedCategory === category.value
              const count = categoryCount(category.value)
              return (
                <button
                  key={category.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onCategoryChange(category.value)}
                  title={t('search.tooltips.category', { category: category.label })}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm transition-colors',
                    active
                      ? 'bg-card font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {category.value !== 'all' && <span className={cn('cat-dot', category.hue)} aria-hidden="true" />}
                  {category.label}
                  {count !== undefined && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {compactNumber.format(count)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        {/* Rendered outside the scroller so its menu isn't clipped */}
        {extraFilters}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <Switch
            checked={aliasResolverEnabled}
            onChange={(v) => onToggleAliasResolver?.(v)}
            label={t('search.aliasResolver')}
            title={t('search.tooltips.aliasResolver')}
          />
          <Switch
            checked={autoTranslateEnabled}
            onChange={(v) => onToggleAutoTranslate?.(v)}
            label={t('search.autoTranslate')}
            title={t('search.tooltips.autoTranslate')}
          />
          <div className="relative" ref={langDropdownRef}>
            <button
              type="button"
              disabled={!autoTranslateEnabled}
              onClick={() => setIsLangMenuOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              aria-haspopup="listbox"
              aria-expanded={isLangMenuOpen}
              aria-label={t('search.inputLanguage')}
              title={!autoTranslateEnabled ? t('search.enableAutoTranslateFirst') : t('search.tooltips.inputLanguage')}
            >
              <span aria-hidden="true">{getFlagEmoji(inputLanguage)}</span>
              <span className="max-w-[8rem] truncate">{currentLanguageLabel}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isLangMenuOpen && 'rotate-180')} aria-hidden="true" />
            </button>
            {isLangMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-50 max-h-64 w-56 overflow-y-auto rounded-[10px] border border-border bg-popover py-1 shadow-md">
                {isLoadingLanguages ? (
                  <div className="p-3 text-xs text-muted-foreground">{t('search.loadingLanguages')}</div>
                ) : (
                  <ul role="listbox" aria-label={t('search.inputLanguage')}>
                    {languageOptions.map((lang) => {
                      const isSelected = lang.language === inputLanguage
                      const displayName = lang.language === 'auto' ? (t('search.languageAuto') || lang.name) : lang.name
                      return (
                        <li key={lang.language} role="option" aria-selected={isSelected}>
                          <button
                            type="button"
                            onClick={() => {
                              onInputLanguageChange?.(lang.language)
                              setIsLangMenuOpen(false)
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span aria-hidden="true">{getFlagEmoji(lang.language)}</span>
                              <span className="truncate">{displayName}</span>
                            </span>
                            {isSelected && <Check className="h-4 w-4 shrink-0 text-primary-text" aria-hidden="true" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SearchBar
