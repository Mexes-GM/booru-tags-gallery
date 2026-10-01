import { absoluteUrl } from '../config/site'
import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DanbooruTag, LocalTagData } from '../types'
import useTagSearch from '../hooks/useTagSearch'
import { loadTagsData, getCachedTags } from '../utils/sharedTagDataLoader'
import useDanbooruRateLimitedScroll from '../hooks/useDanbooruRateLimitedScroll'
import SearchBar from './SearchBar'
import SearchInfo from './SearchInfo'
import StableInfiniteScroll from './StableInfiniteScroll'
import LoadingSpinner from './common/LoadingSpinner'
import SEO, { SITE_NAME } from './SEO'
import ScrollToTopButton from './common/ScrollToTopButton'
import { MousePointerClick, Copy, Languages, SearchX, Search } from 'lucide-react'
import PromptFilterMenu from './PromptFilterMenu'
import { PromptFilter, buildTaxonomy, matchesPromptFilter, promptGroupLabel, promptSubLabel } from '../utils/promptTaxonomy'

const SOCIALS = [
  { label: 'CivitAI', href: 'https://civitai.com/user/Mexes' },
  { label: 'Tensor.Art', href: 'https://tensor.art/u/616420638671868313' },
  { label: 'SeaArt', href: 'https://www.seaart.ai/user/e9f2dc73eaf4495fce59838fea87187c?u_code=EUY1AJ3T' },
]

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 0 })

// URL state: ?q=<search>&cat=<category> (cat omitted for "all")
const URL_CATEGORIES = new Set(['all', 'general', 'artist', 'copyright', 'character', 'meta', 'tag_groups'])
const URL_SYNC_DELAY = 400
const readUrlCategory = (value: string | null) => (value && URL_CATEGORIES.has(value) ? value : 'all')

/**
 * HomePage - Componente principal que maneja la página de inicio
 */
const HomePage: React.FC = () => {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') ?? ''
  const urlCategory = readUrlCategory(searchParams.get('cat'))
  
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
  } = useTagSearch({ initialTerm: urlQuery, initialCategory: urlCategory })

  // Keep ?q= / ?cat= in sync with the search, so searches are shareable and
  // survive reloads and back/forward. lastUrlState is what the URL currently
  // holds, which tells our own URL writes apart from external navigation.
  const lastUrlState = useRef({ q: urlQuery, cat: urlCategory })

  // URL -> state (back/forward, pasted links)
  useEffect(() => {
    const last = lastUrlState.current
    if (urlQuery !== last.q) setSearchTerm(urlQuery)
    if (urlCategory !== last.cat) setSelectedCategory(urlCategory)
    lastUrlState.current = { q: urlQuery, cat: urlCategory }
  }, [urlQuery, urlCategory, setSearchTerm, setSelectedCategory])

  // state -> URL (debounced, replace: no history entry per keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = searchTerm.trim()
      const cat = selectedCategory
      const last = lastUrlState.current
      if (q === last.q && cat === last.cat) return
      lastUrlState.current = { q, cat }
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (q) next.set('q', q)
        else next.delete('q')
        if (cat && cat !== 'all') next.set('cat', cat)
        else next.delete('cat')
        return next
      }, { replace: true })
    }, URL_SYNC_DELAY)
    return () => clearTimeout(timer)
  }, [searchTerm, selectedCategory, setSearchParams])

  const deferredSearchTerm = useDeferredValue(searchTerm)
  const deferredSearchResults = useDeferredValue(searchResults)

  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [tagsData, setTagsData] = useState<LocalTagData[]>([]);

  // Prompt taxonomy filter (Clothing › Headwear…). Those labels only exist on
  // General tags, so the filter is dropped for every other Danbooru category.
  const [promptFilter, setPromptFilter] = useState<PromptFilter | null>(null)
  const promptFilterAvailable = selectedCategory === 'all' || selectedCategory === 'general'
  const activePromptFilter = promptFilterAvailable ? promptFilter : null

  useEffect(() => {
    if (!promptFilterAvailable) setPromptFilter(null)
  }, [promptFilterAvailable])

  const taxonomy = useMemo(() => buildTaxonomy(tagsData), [tagsData])

  const filteredTagsData = useMemo(
    () => (activePromptFilter ? tagsData.filter(tag => matchesPromptFilter(tag, activePromptFilter)) : tagsData),
    [tagsData, activePromptFilter]
  )

  const filteredSearchResults = useMemo(() => {
    if (!activePromptFilter) return deferredSearchResults
    const base = deferredSearchResults.filter(tag => matchesPromptFilter(tag, activePromptFilter))
    // The worker returns only the top ~50 matches across all tags, which a
    // narrow filter would mostly discard. Top it up with substring matches
    // from inside the filter (tags.json is already sorted by post count).
    const effectiveTerm = translatedTerm && lastTranslatedFor === deferredSearchTerm ? translatedTerm : deferredSearchTerm
    const term = effectiveTerm.trim().toLowerCase().replace(/\s+/g, '_')
    if (!term) return base
    const seen = new Set(base.map(tag => tag.name))
    const extra = filteredTagsData
      .filter(tag => !seen.has(tag.name) && (tag.name.includes(term) || tag.aliases?.some(alias => alias.includes(term))))
      .slice(0, 200)
    return [...base, ...extra]
  }, [deferredSearchResults, activePromptFilter, filteredTagsData, deferredSearchTerm, translatedTerm, lastTranslatedFor])

  const {
    displayedTags,
    hasMore,
    loadMore,
    isLoadingMore,
    setVisibleRange,
    resetScroll,
  } = useDanbooruRateLimitedScroll({
    searchResults: filteredSearchResults,
    searchTerm: deferredSearchTerm,
    selectedCategory,
    tagsData: filteredTagsData
  })

  useEffect(() => {
    resetScroll()
  }, [activePromptFilter, resetScroll])

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
    const assign = (data: LocalTagData[] | null | undefined) => { if (!cancelled) setTagsData(Array.isArray(data) ? data : []); };
    const existing = getCachedTags();
    if (existing) assign(existing);
    const schedule = () => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => { if (!cancelled) loadTagsData().then(assign); }, { timeout: 2000 });
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
  const totalTags = Object.entries(categoryStats)
    .filter(([key]) => key !== 'tag_groups')
    .reduce((sum, [, n]) => sum + n, 0)

  if (isWorkerInitializing) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="text-center">
          <LoadingSpinner
            size="lg"
            className="mx-auto"
            ariaLabel={t('common.loadingTags') || 'Loading tags'}
          />
          <p className="mt-4 text-sm font-medium text-foreground">{t('common.initializing')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('common.loadingTags')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-16">
      <SEO 
        title={t('homepage.title')}
  description={t('homepage.description') || 'Search and quickly discover the tag you need for your image generation.'}
        canonical={absoluteUrl("/")}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: SITE_NAME,
          description: t('homepage.description') || 'Search and quickly discover the tag you need for your image generation.',
          inLanguage: 'en'
        }}
      />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="grid gap-6 pb-6 pt-6 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-end lg:gap-14 lg:pb-8">
          <div className="space-y-3 sm:space-y-4">
            <h1 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tighter sm:text-5xl">
              {t('homepage.title')}
            </h1>
            <p className="max-w-xl text-pretty text-base leading-snug text-muted-foreground sm:text-lg">
              {t('homepage.tagline')}
            </p>
            <p className="font-mono text-xs leading-relaxed text-muted-foreground/80">
              Danbooru{totalTags > 0 && <> · <span className="tabular-nums">{compactNumber.format(totalTags)}</span> tags</>} · wiki · aliases · examples
            </p>
            <p className="text-sm text-muted-foreground">
              {t('homepage.by')}
              <span aria-hidden="true" className="mx-2 text-muted-foreground/40">/</span>
              {SOCIALS.map((s, i) => (
                <span key={s.label}>
                  {i > 0 && <span aria-hidden="true" className="mx-1.5 text-muted-foreground/40">·</span>}
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('ui.visitOn', { name: 'Mexes', platform: s.label })}
                    className="rounded-sm underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/60"
                  >
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
          </div>

          {/* How it works: makes the copy gestures discoverable */}
          <aside className="hidden rounded-xl bg-card p-4 lg:block" aria-label={t('homepage.howTo.title')}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('homepage.howTo.title')}
            </h2>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <Languages className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{t('homepage.howTo.search')}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{t('homepage.howTo.open')}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Copy className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden="true" />
                <span>{t('homepage.howTo.copy')}</span>
              </li>
            </ul>
          </aside>
        </section>

        {/* Sticky search panel */}
        <div className="sticky top-0 z-40 -mx-4 bg-background px-4 py-3 sm:-mx-6 sm:px-6">
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
            extraFilters={
              <PromptFilterMenu
                taxonomy={taxonomy}
                value={activePromptFilter}
                onChange={setPromptFilter}
                disabled={!promptFilterAvailable}
              />
            }
          />
        </div>

        <div className="mb-4 mt-3">
          <SearchInfo
            searchTerm={deferredSearchTerm}
            searchResults={filteredSearchResults}
            promptFilterLabel={activePromptFilter ? [promptGroupLabel(activePromptFilter.group), activePromptFilter.sub && promptSubLabel(activePromptFilter.sub)].filter(Boolean).join(' › ') : undefined}
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
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <LoadingSpinner size="lg" className="mx-auto" />
              <p className="mt-4 text-sm text-muted-foreground">{t('common.loading')}</p>
            </div>
          </div>
        )}
        
        {!isLoading && !isTransitioning && filteredSearchResults.length === 0 && searchTerm && hasSearched && (
          <div className="mx-auto max-w-sm px-4 py-16 text-center">
            <SearchX className="mx-auto mb-4 h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="text-balance text-base font-medium">
              {t('search.noResults', { query: searchTerm })}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('search.tryGeneral').replace(/^\p{Extended_Pictographic}\s*/u, '')}</p>
          </div>
        )}
        
        {/* Mostrar resultados si hay displayedTags O si hay searchResults pero displayedTags está temporalmente vacío */}
        {(displayedTags.length > 0 || (filteredSearchResults.length > 0 && !isLoading && !isTransitioning)) && (
          <StableInfiniteScroll
            tags={displayedTags.length > 0 ? displayedTags : filteredSearchResults.slice(0, 20)}
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
          <div className="px-4 py-16 text-center">
            <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="text-base font-medium">{t('search.startTyping')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('search.exploreTags')}</p>
          </div>
        )}
      </div>
      <ScrollToTopButton />
    </div>
  )
}

export default HomePage