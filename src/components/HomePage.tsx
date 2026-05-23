import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react'
import { useTranslation } from 'react-i18next'
import { DanbooruTag, LocalTagData } from '../types'
import useTagSearch from '../hooks/useTagSearch'
import { loadTagsData, getCachedTags } from '../utils/sharedTagDataLoader'
import useDanbooruRateLimitedScroll from '../hooks/useDanbooruRateLimitedScroll'
import SearchBar from './SearchBar'
import SearchInfo from './SearchInfo'
import StableInfiniteScroll from './StableInfiniteScroll'
import LoadingSpinner from './common/LoadingSpinner'
import SEO from './SEO'
import ScrollToTopButton from './common/ScrollToTopButton'

/**
 * HomePage - Componente principal que maneja la página de inicio
 */
const HomePage: React.FC = () => {
  const { t } = useTranslation()
  
  const {
    searchTerm,
    selectedCategory,
    searchResults,
    suggestions,
    synonymSuggestions,
    isLoading,
    isSuggestionsLoading,
    isTransitioning,
    isWorkerReady,
    isWorkerInitializing,
    hasSearched,
    isTranslating,
    // Translation settings
    autoTranslateEnabled,
    setAutoTranslateEnabled,
    inputLanguage,
    setInputLanguage,
    setSearchTerm,
    setSelectedCategory,
    getCategoryStats,
    availableLanguages,
    isLoadingLanguages,
    translatedTerm,
    lastTranslatedFor,
    resolvedCanonicalTerm,
  aliasResolverEnabled,
  setAliasResolverEnabled,
  } = useTagSearch()

  const deferredSearchTerm = useDeferredValue(searchTerm)
  const deferredSearchResults = useDeferredValue(searchResults)

  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [tagsData, setTagsData] = useState<LocalTagData[]>([]);

  const {
    displayedTags,
    hasMore,
    loadMore,
    isLoadingMore,
    setVisibleRange,
  } = useDanbooruRateLimitedScroll({
    searchResults: deferredSearchResults,
    searchTerm: deferredSearchTerm,
    selectedCategory,
    tagsData: tagsData || []
  })

  useEffect(() => {
    if (isWorkerReady) {
      getCategoryStats().then(stats => {
        setCategoryStats(stats);
      }).catch(_error => {
        // Error loading category stats
      });
    }
  }, [isWorkerReady, getCategoryStats]);

  // Cargar tags.json solo después de que el worker esté listo y tras el primer paint
  useEffect(() => {
    if (!isWorkerReady) return;
    let cancelled = false;
    const assign = (data: any) => { if (!cancelled) setTagsData(Array.isArray(data) ? data : []); };
    const existing = getCachedTags();
    if (existing) assign(existing);
    const schedule = () => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => !cancelled && loadTagsData().then(assign), { timeout: 2000 });
      } else {
        setTimeout(() => !cancelled && loadTagsData().then(assign), 50);
      }
    };
    setTimeout(schedule, 0);
    return () => { cancelled = true; };
  }, [isWorkerReady])

  const convertToDanbooruTag = useCallback((localTag: LocalTagData): DanbooruTag => ({
    id: localTag.id,
    name: localTag.name,
    category: localTag.category,
    post_count: localTag.postCount,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deprecated: false,
    is_locked: false,
    version: 1,
    words: localTag.aliases
  }), [])

  const danbooruSuggestions = useMemo(() => 
    suggestions.map(convertToDanbooruTag), 
    [suggestions, convertToDanbooruTag]
  )

  const handleClearSearch = useCallback(() => {
    setSearchTerm('')
    setSelectedCategory('all')
  }, [setSearchTerm, setSelectedCategory])

  // Mostrar estado de inicialización del worker
  if (isWorkerInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner 
            size="xl" 
            variant="spinner"
            className="mx-auto"
            ariaLabel={t('common.loadingTags') || 'Loading tags'}
          />
          <p className="mt-6 text-gray-600 dark:text-gray-400 text-lg">
            {t('common.initializing')}
          </p>
          <p className="mt-2 text-gray-500 dark:text-gray-500 text-sm">
            {t('common.loadingTags')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <SEO 
        title={t('homepage.title')}
  description={t('homepage.description') || 'Search and quickly discover the tag you need for your image generation.'}
        canonical="https://danbooru-tags-explorer.netlify.app/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Danbooru Tag Explorer Home',
          description: t('homepage.description') || 'Search and quickly discover the tag you need for your image generation.',
          inLanguage: 'en'
        }}
      />
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold mb-2 sm:mb-4 inline-block relative">
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {t('homepage.title')}
            </span>
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-lg blur opacity-5 -z-10"></div>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            {t('homepage.description')}
          </p>
          {/* Badge autor */}
          <div className="mt-3">
            <span className="author-badge" aria-label="Author">By Mexes</span>
          </div>
          <div className="pt-4 space-y-3">
            <p className="text-gray-600 dark:text-gray-400 text-sm">{t('ui.moreOfMyWorkHere')}</p>
            <div className="flex items-center justify-center space-x-4">
              <a href="https://civitai.com/user/Mexes" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" aria-label={t('ui.visitOn', { name: 'Mexes', platform: 'CivitAI' })} data-state="closed">
                <img src="https://www.google.com/s2/favicons?domain=civitai.com&sz=32" alt="CivitAI" className="w-6 h-6 filter grayscale hover:grayscale-0 transition-all duration-200" />
              </a>
              <a href="https://tensor.art/u/616420638671868313" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" aria-label={t('ui.visitOn', { name: 'Mexes', platform: 'Tensor.Art' })} data-state="closed">
                <img src="https://www.google.com/s2/favicons?domain=tensor.art&sz=32" alt="Tensor.Art" className="w-6 h-6 filter grayscale hover:grayscale-0 transition-all duration-200" />
              </a>
              <a href="https://www.seaart.ai/user/e9f2dc73eaf4495fce59838fea87187c?u_code=EUY1AJ3T" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" aria-label={t('ui.visitOn', { name: 'Mexes', platform: 'SeaArt AI' })} data-state="closed">
                <img src="https://www.google.com/s2/favicons?domain=seaart.ai&sz=32" alt="SeaArt AI" className="w-6 h-6 filter grayscale hover:grayscale-0 transition-all duration-200" />
              </a>
            </div>
            <div className="flex items-center justify-center mt-3">
              <a href="https://ko-fi.com/mexes" target="_blank" rel="noopener noreferrer" className="kofi-btn inline-flex items-center px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white text-sm font-bold rounded-full transition-colors duration-200" aria-label={t('ui.supportOnKofi')}>
                <img src="https://www.google.com/s2/favicons?domain=ko-fi.com&sz=32" alt="Ko-fi" className="w-4 h-4 mr-2" />
                {t('ui.supportOnKofi')}
              </a>
            </div>
          </div>
        </div>
        
        <div className="sticky top-0 z-40 pt-2 sm:pt-4 pb-2 sm:pb-4 -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <SearchBar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onClearSearch={handleClearSearch}
              suggestions={danbooruSuggestions}
              synonymSuggestions={synonymSuggestions}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categoryStats={categoryStats}
              isLoading={isLoading}
              isTransitioning={isTransitioning}
              isWorkerReady={isWorkerReady}
              isSuggestionsLoading={isSuggestionsLoading}
              isTranslating={isTranslating}
              // Translation settings
              autoTranslateEnabled={autoTranslateEnabled}
              onToggleAutoTranslate={setAutoTranslateEnabled}
              inputLanguage={inputLanguage}
              onInputLanguageChange={setInputLanguage}
              availableLanguages={availableLanguages}
              isLoadingLanguages={isLoadingLanguages}
              translatedTerm={translatedTerm}
              lastTranslatedFor={lastTranslatedFor}
              aliasResolverEnabled={aliasResolverEnabled}
              onToggleAliasResolver={setAliasResolverEnabled}
            />
          </div>
        </div>

        <div className="max-w-4xl mx-auto mb-4 sm:mb-6 mt-4 sm:mt-8">
          <SearchInfo
            searchTerm={deferredSearchTerm}
            searchResults={deferredSearchResults}
            isLoading={isLoading}
            selectedCategory={selectedCategory}
            isTranslating={isTranslating}
            translatedTerm={translatedTerm}
            lastTranslatedFor={lastTranslatedFor}
            resolvedCanonicalTerm={resolvedCanonicalTerm}
            originalInputTerm={searchTerm}
          />
        </div>

        {/* Solo mostrar loading cuando realmente hay una búsqueda en progreso */}
        {(isLoading || isTransitioning) && searchResults.length === 0 && hasSearched && (
          <div className="flex justify-center items-center py-12 sm:py-16">
            <div className="text-center">
              <LoadingSpinner 
                size="xl" 
                variant={isTransitioning ? 'pulse' : 'spinner'}
                className="mx-auto"
              />
              <p className="mt-4 sm:mt-6 text-gray-600 dark:text-gray-400 text-base sm:text-lg transition-opacity duration-200">
                {t('common.loading')}
              </p>
            </div>
          </div>
        )}
        
        {!isLoading && !isTransitioning && searchResults.length === 0 && searchTerm && hasSearched && (
          <div className="text-center py-12 sm:py-16 px-4">
            <div className="text-gray-400 mb-4 sm:mb-6">
              <svg className="mx-auto h-12 w-12 sm:h-16 sm:w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.034 0-3.9.785-5.291 2.09m6.582 0A7.962 7.962 0 0118 15c-2.034 0-3.9.785-5.291 2.09M15 11V9a6 6 0 00-12 0v2c0 .558.45 1.008 1.006 1.037C4.56 12.02 5 12.448 5 12.954V16c0 .552.448 1 1 1h3.5M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg sm:text-xl font-medium text-primary mb-3 sm:mb-4">
              {t('search.noResults', { query: searchTerm })}
            </h3>
            <div className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-center">
              <p className="font-medium mb-2 sm:mb-3">{t('search.tryGeneral')}</p>
            </div>
          </div>
        )}
        
        {/* Mostrar resultados si hay displayedTags O si hay searchResults pero displayedTags está temporalmente vacío */}
        {(displayedTags.length > 0 || (searchResults.length > 0 && !isLoading && !isTransitioning)) && (
          <StableInfiniteScroll
            tags={displayedTags.length > 0 ? displayedTags : searchResults.slice(0, 20)}
            searchTerm={deferredSearchTerm}
            isTransitioning={isTransitioning}
            hasMore={hasMore}
            loadMore={loadMore}
            isLoadingMore={isLoadingMore}
            onVisibleRangeChange={setVisibleRange}
            translatedTerm={translatedTerm}
            lastTranslatedFor={lastTranslatedFor}
            selectedCategory={selectedCategory}
          />
        )}

        {/* Mostrar mensaje cuando no hay búsqueda y el worker está listo */}
        {!searchTerm && !isLoading && !isTransitioning && displayedTags.length === 0 && isWorkerReady && (
          <div className="text-center py-12 sm:py-16 px-4">
            <div className="text-gray-400 mb-4 sm:mb-6">
              <svg className="mx-auto h-12 w-12 sm:h-16 sm:w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg sm:text-xl font-medium text-primary mb-2">
              {t('search.startTyping')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('search.exploreTags')}
            </p>
          </div>
        )}
      </div>
      <ScrollToTopButton />
    </div>
  )
}

export default HomePage