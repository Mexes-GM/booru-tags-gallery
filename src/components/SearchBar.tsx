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
import useHoverEffects from '../hooks/useHoverEffects'
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
  onToggleAliasResolver?: (enabled: boolean) => void;
}

interface Category {
  value: string;
  label: string;
  color: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  searchTerm, 
  onSearchChange, 
  onClearSearch,
  suggestions, 
  synonymSuggestions,
  selectedCategory, 
  onCategoryChange,
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

  const categories: Category[] = useMemo(() => {
    const stripBadge = (cls: string) => cls.replace(/\bcat-badge\s*/,'').trim();
    return [
      { value: 'all', label: t('search.categories.all'), color: 'bg-surface-alt dark:bg-elevated text-secondary' },
      { value: 'general', label: t('search.categories.general'), color: stripBadge(getCategoryClass(0)) },
      { value: 'artist', label: t('search.categories.artist'), color: stripBadge(getCategoryClass(1)) },
      { value: 'copyright', label: t('search.categories.copyright'), color: stripBadge(getCategoryClass(3)) },
      { value: 'character', label: t('search.categories.character'), color: stripBadge(getCategoryClass(4)) },
      { value: 'meta', label: t('search.categories.meta'), color: stripBadge(getCategoryClass(5)) },
      { value: 'tag_groups', label: t('search.categories.tagGroups'), color: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200' }
    ];
  }, [t])

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

  // Hover effects for suggestion items
  const suggestionHoverEffects = useHoverEffects({
    baseClasses: 'px-4 py-3 cursor-pointer',
    customHoverClasses: 'hover:bg-gray-50 dark:hover:bg-slate-700',
    transitionDuration: 'fast'
  })

  // Hover effects for category buttons
  const categoryButtonHoverEffects = useHoverEffects({
    baseClasses: 'px-4 py-2 text-sm font-medium rounded-lg',
    customHoverClasses: 'hover:bg-gray-200 dark:hover:bg-slate-600',
    transitionDuration: 'fast'
  })

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

  return (
    <div className="w-full relative" ref={suggestionsRef}>
      {/* Floating Search Input with Categories */}
      <div className="rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700">
        {/* Search Input */}
        <div className="p-3 sm:p-4 bg-[var(--color-searchcard)] dark:bg-[var(--color-searchcard)] rounded-t-2xl">
          <div className="relative flex items-stretch">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                id="search-input"
                name="search"
                aria-label={t('search.placeholder') || 'Buscar tags'}
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={handleInputChange}
                onFocus={() => isWorkerReady && setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder={isWorkerReady ? t('search.placeholder') : t('search.loadingWorker')}
                disabled={!isWorkerReady}
                className={`w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-r-0 rounded-l-xl transition-all duration-200 bg-surface-alt dark:bg-surface focus:bg-white dark:focus:bg-elevated text-primary dark:text-primary placeholder-text-subtle focus:border-accent dark:focus:border-accent border-subtle dark:border-subtle ${
                  !isWorkerReady ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
              <div className="absolute inset-y-0 right-0 pr-3 sm:pr-4 flex items-center gap-2">
                {isTranslating && (
                  <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full">
                    <LoadingSpinner size="sm" />
                  </div>
                )}
                {searchTerm && onClearSearch && (
                  <button
                    onClick={onClearSearch}
                    className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-full transition-all duration-200"
                    title={t('search.clear')}
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-shrink-0">
              <NSFWFilterToggle />
            </div>
          </div>
        </div>
        
        {showSuggestions && searchTerm.trim().length > 0 && isWorkerReady && (
          <div className="absolute z-50 left-3 sm:left-4 right-3 sm:right-4 top-20 sm:top-20 bg-surface dark:bg-surface border border-subtle rounded-2xl shadow-xl max-h-80 overflow-y-auto">
            {isSuggestionsLoading ? (
              <div className="p-4 text-center text-gray-500 dark:text-slate-400">
                <div className="flex items-center justify-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  <span>{t('search.searchingSuggestions')}</span>
                </div>
              </div>
            ) : suggestions && suggestions.length > 0 ? (
              <>
                {suggestions.slice(0, 4).map((tag, index) => (
                  <div
                    key={tag.id || `${tag.name}-${index}`}
                    onClick={() => handleSuggestionClick(tag)}
                    className={`${suggestionHoverEffects.hoverClasses} ${
                      index === selectedSuggestionIndex ? 'accent-bg/10 border-accent' : ''
                    } ${index === 0 ? 'rounded-t-2xl' : ''} ${index === Math.min(3, suggestions.length - 1) ? 'rounded-b-2xl' : ''} ${
                      index < Math.min(3, suggestions.length - 1) ? 'border-b border-subtle' : ''
                    }`}
                    onMouseEnter={suggestionHoverEffects.handleMouseEnter}
                    onMouseLeave={suggestionHoverEffects.handleMouseLeave}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-primary truncate text-sm sm:text-base">
                          {highlightSearchMatch(tag.name, effectiveHighlightTerm)}
                        </div>
                        <div className="text-xs sm:text-sm text-subtle truncate">
                          <span className="mr-2">
                            {formatPostCount(tag.post_count || 0)}
                          </span>
                        </div>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full cursor-pointer ${getCategoryClass(tag.category)}`}
                          title={t('ui.rightClickCopyCategory')}
                          onContextMenu={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const now = Date.now();
                            if ((e.currentTarget as any).lastLongPress && now - (e.currentTarget as any).lastLongPress < 700) return;
                            const ok = await copyToClipboard(getCategoryLabel(tag.category));
                            showCopyFeedbackBubble(ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'), e.clientX, e.clientY, ok);
                            const el = e.currentTarget as HTMLElement;
                            el.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
                            setTimeout(()=>el.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
                          }}
                          onTouchStart={(e) => {
                            const el = e.currentTarget as any;
                            const firstTouch = e.touches[0];
                            const startX = firstTouch?.clientX ?? 0;
                            const startY = firstTouch?.clientY ?? 0;
                            el._pressTimer = setTimeout(async () => {
                              const ok = await copyToClipboard(getCategoryLabel(tag.category));
                              el.classList.add('ring-2', ok ? 'ring-green-400':'ring-red-400');
                              showCopyFeedbackBubble(
                                ok ? t('clipboard.copySuccess') : t('clipboard.copyFail'),
                                startX,
                                startY,
                                ok
                              );
                              el.lastLongPress = Date.now();
                              setTimeout(()=>el.classList.remove('ring-2','ring-green-400','ring-red-400'),700);
                            }, 550);
                          }}
                          onTouchEnd={(e) => {
                            const el = e.currentTarget as any;
                            if (el._pressTimer) { clearTimeout(el._pressTimer); el._pressTimer=null; }
                          }}
                          onTouchCancel={(e) => {
                            const el = e.currentTarget as any;
                            if (el._pressTimer) { clearTimeout(el._pressTimer); el._pressTimer=null; }
                          }}
                        >
                          {getCategoryLabel(tag.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-slate-400">
                <span>{t('search.noSuggestionsFound')}</span>
              </div>
            )}
          </div>
        )}

        {/* ¿Quisiste decir? Versión compacta y menos intrusiva */}
        {/* Panel flotante "¿Quisiste decir?" superpuesto (estilo antiguo) */}
        {showSynonymBanner && synonymSuggestions && synonymSuggestions.length > 0 && synonymSuggestions.some(s => normalizeForComparison(s) !== normalizeForComparison(searchTerm)) && (
          <div
            className="absolute left-3 sm:left-4 top-20 sm:top-20 z-40 max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-2rem)]"
            style={{ pointerEvents: 'auto' }}
            aria-live="polite"
          >
            <div className="inline-flex items-start">
              <div className="rounded-2xl bg-neutral-50/95 dark:bg-slate-800/95 border border-neutral-200 dark:border-slate-600 shadow-lg backdrop-blur supports-[backdrop-filter]:backdrop-blur-sm px-3 py-1.5 sm:px-4 sm:py-2 animate-fadeIn relative overflow-hidden w-auto max-w-full">
                <div className="flex items-center gap-2 pr-5">
                  <svg className="w-3.5 h-3.5 text-neutral-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2 2m7-4a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[11px] sm:text-xs font-medium text-neutral-700 dark:text-slate-200 whitespace-nowrap">{t('search.didYouMean')}</span>
                  {synonymSuggestions
                    .filter(s => normalizeForComparison(s) !== normalizeForComparison(searchTerm))
                    .slice(0,1)
                    .map((s,i) => (
                      <button
                        key={i}
                        onClick={() => handleSynonymClick(s)}
                        className="ml-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-700 text-neutral-700 dark:text-slate-100 text-[11px] sm:text-xs font-medium shadow hover:bg-neutral-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-accent transition"
                      >
                        {s.replace(/_/g,' ')}
                      </button>
                    ))}
                </div>
                <button
                  aria-label={t('search.closeSuggestion')}
                  onClick={() => setShowSynonymBanner(false)}
                  className="absolute top-1 right-1 p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-neutral-200/60 dark:hover:bg-slate-600/60 transition"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Categories */}
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 bg-[var(--color-searchcard)] dark:bg-[var(--color-searchcard)]">
          <div className="flex items-center justify-center">
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {categories.map((category) => (
                <button
                  key={category.value}
                  onClick={() => onCategoryChange(category.value)}
                  className={`${categoryButtonHoverEffects.hoverClasses} ${
                    selectedCategory === category.value
                      ? category.color + ' ring-1 ring-accent'
                      : 'bg-surface-alt dark:bg-elevated text-secondary'
                  } text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2 font-medium rounded-lg transition-colors`}
                  onMouseEnter={categoryButtonHoverEffects.handleMouseEnter}
                  onMouseLeave={categoryButtonHoverEffects.handleMouseLeave}
          title={t('search.tooltips.category', { category: category.label })}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Translation Settings */}
        <div className="px-3 sm:px-4 py-3 sm:py-4 bg-[var(--color-searchcard)] dark:bg-[var(--color-searchcard)] border-t border-subtle rounded-b-2xl flex items-center min-h-[4rem]">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600 dark:text-slate-300 w-full">
            {/* Alias resolver toggle */}
            <div className="inline-flex items-center gap-3 select-none">
              <button
                type="button"
                role="switch"
                aria-checked={aliasResolverEnabled}
                aria-label={t('search.aliasResolver') || 'Resolver de alias'}
                onClick={() => onToggleAliasResolver?.(!aliasResolverEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                  aliasResolverEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-slate-700'
                }`}
                title={t('search.tooltips.aliasResolver')}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-1 ring-black/5 transition-transform ${
                    aliasResolverEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="font-medium whitespace-nowrap">
                {t('search.aliasResolver') || 'Resolver de alias'}
              </span>
            </div>
            {/* Auto-translate toggle - improved switch */}
            <div className="inline-flex items-center gap-3 select-none">
              <button
                type="button"
                role="switch"
                aria-checked={autoTranslateEnabled}
                aria-label={t('search.autoTranslate') || 'Traducción automática'}
                onClick={() => onToggleAutoTranslate?.(!autoTranslateEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  autoTranslateEnabled
                    ? 'bg-blue-600'
                    : 'bg-gray-300 dark:bg-slate-700'
                }`}
                title={t('search.tooltips.autoTranslate')}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-1 ring-black/5 transition-transform ${
                    autoTranslateEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="font-medium">
                {t('search.autoTranslate') || 'Traducción automática'}
                {isTranslating && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400">
                    ({t('search.translating') || 'Traduciendo...'})
                  </span>
                )}
              </span>
            </div>
            {/* Language selector - improved button and dropdown */}
            <div className="inline-flex items-center gap-2">
              <span className="text-gray-500 dark:text-slate-400">
                {t('search.inputLanguage') || 'Idioma de entrada:'}
              </span>
              <div className="relative" ref={langDropdownRef}>
                <button
                  type="button"
                  disabled={!autoTranslateEnabled}
                  onClick={() => setIsLangMenuOpen((v) => !v)}
                  className={`group flex items-center justify-between gap-2 pl-2 pr-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs sm:text-sm transition-all min-w-[11rem] shadow-sm ${
                    autoTranslateEnabled
                      ? 'hover:bg-gray-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                      : 'opacity-60 cursor-not-allowed'
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={isLangMenuOpen}
                  title={
                    !autoTranslateEnabled
                      ? (t('search.enableAutoTranslateFirst') || 'Activa la traducción automática para cambiar el idioma')
                      : t('search.tooltips.inputLanguage')
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {/* Globe icon */}
                    <span className="text-base leading-none flex-shrink-0" aria-hidden="true">{getFlagEmoji(inputLanguage)}</span>
                    <span className="truncate">{currentLanguageLabel}</span>
                  </span>
                  {/* Chevron */}
                  <svg
                    className={`w-3.5 h-3.5 text-gray-500 dark:text-slate-400 flex-shrink-0 transition-transform ${isLangMenuOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.11l3.71-3.88a.75.75 0 111.08 1.04l-4.24 4.43a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {isLangMenuOpen && (
                  <div className="absolute right-0 mt-1 z-30 w-48 sm:w-56 max-h-56 overflow-y-auto rounded-xl border border-subtle bg-surface dark:bg-surface shadow-lg">
                    {isLoadingLanguages ? (
                      <div className="p-3 text-xs text-gray-600 dark:text-slate-300">
                        {t('search.loadingLanguages') || 'Cargando idiomas...'}
                      </div>
                    ) : (
                      <ul role="listbox" aria-label={t('search.inputLanguage') || 'Idioma de entrada'}>
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
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm transition-colors hover:bg-surface-alt dark:hover:bg-elevated ${
                                  isSelected
                                    ? 'accent-bg/20 text-accent'
                                    : 'text-secondary'
                                }`}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm" aria-hidden="true">{getFlagEmoji(lang.language)}</span>
                                  <span className="truncate">{displayName}</span>
                                </span>
                                {isSelected && (
                                  <svg
                                    className="w-4 h-4 text-accent flex-shrink-0"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                )}
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
      </div>
    </div>
  )
}

export default SearchBar