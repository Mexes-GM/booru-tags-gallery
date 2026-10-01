import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OptimizedTagCard from './OptimizedTagCard'
import LoadingSpinner from './common/LoadingSpinner'
import { useTagModal } from '../context/useTagModal'
import { LocalTagData, DanbooruTag } from '../types'
import { useTranslation } from 'react-i18next'

/**
 * StableInfiniteScroll - Componente que maneja el scroll infinito de tarjetas de tags
 */

interface StableInfiniteScrollProps {
  tags: LocalTagData[]
  searchTerm: string
  isTransitioning: boolean
  hasMore: boolean
  loadMore: () => void
  isLoadingMore: boolean
  onVisibleRangeChange: (range: { start: number; end: number }) => void
  rateLimitInfo?: {
    remaining: number
    limit: number
    resetTime: number
    isRateLimited: boolean
  }
  translatedTerm?: string
  lastTranslatedFor?: string
  selectedCategory?: string
}

const StableInfiniteScroll: React.FC<StableInfiniteScrollProps> = ({
  tags,
  searchTerm,
  isTransitioning,
  hasMore,
  loadMore,
  isLoadingMore,
  rateLimitInfo,
  translatedTerm,
  lastTranslatedFor,
  selectedCategory
}) => {
  const { openModal } = useTagModal();
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef<HTMLDivElement>(null)
  const [isNearBottom, setIsNearBottom] = useState(false)

  // Convert LocalTagData to DanbooruTag
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

  // Check if we're near the bottom
  const checkIfNearBottom = useCallback(() => {
    if (!loadingRef.current) return
    
    const rect = loadingRef.current.getBoundingClientRect()
    const isVisible = rect.top <= window.innerHeight + 200 // 200px buffer
    
    if (isVisible && !isNearBottom && hasMore && !isLoadingMore) {
      setIsNearBottom(true)
      loadMore()
    } else if (!isVisible && isNearBottom) {
      setIsNearBottom(false)
    }
  }, [hasMore, isLoadingMore, loadMore, isNearBottom])

  // Handle scroll events
  useEffect(() => {
    const handleScroll = () => {
      requestAnimationFrame(checkIfNearBottom)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [checkIfNearBottom])

  // Initial check
  useEffect(() => {
    checkIfNearBottom()
  }, [checkIfNearBottom])

  // Render tag cards
  const renderTagCards = useMemo(() => {
    return tags.map((tag, index) => (
      <OptimizedTagCard
        key={`${tag.id}-${tag.name}-${index}`}
        tag={convertToDanbooruTag(tag)}
        searchTerm={searchTerm}
        isTransitioning={isTransitioning}
        onTagClick={openModal}
        translatedTerm={translatedTerm}
        lastTranslatedFor={lastTranslatedFor}
        selectedCategory={selectedCategory}
      />
    ))
  }, [tags, searchTerm, isTransitioning, convertToDanbooruTag, openModal, translatedTerm, lastTranslatedFor, selectedCategory])

  // Calculate time until rate limit reset
  const getTimeUntilReset = useCallback(() => {
    if (!rateLimitInfo) return null
    
    const timeUntilReset = Math.max(0, rateLimitInfo.resetTime - Date.now())
    return Math.ceil(timeUntilReset / 60000)
  }, [rateLimitInfo])

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className={`grid w-full grid-cols-2 gap-3 transition-opacity duration-200 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 ${
          isTransitioning ? 'opacity-50' : 'opacity-100'
        }`}
      >
        {renderTagCards}
      </div>

      <div ref={loadingRef} className="mt-8">
        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <LoadingSpinner size="sm" />
            <span>{t('homepage.loadingMoreTags')}</span>
          </div>
        )}

        {!hasMore && !searchTerm.trim() && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('homepage.allTagsSeen')}</p>
        )}

        {rateLimitInfo?.isRateLimited && hasMore && (
          <div className="mx-auto max-w-md rounded-xl border border-warning-border bg-warning-soft p-4 text-center">
            <p className="text-sm font-medium text-warning-text">{t('homepage.rateLimitTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('homepage.rateLimitDescription')}</p>
            {getTimeUntilReset() && (
              <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                {t('homepage.rateLimitReset', { minutes: getTimeUntilReset() })}
              </p>
            )}
          </div>
        )}

        {rateLimitInfo && !rateLimitInfo.isRateLimited && rateLimitInfo.remaining <= 3 && hasMore && (
          <p className="mx-auto max-w-md rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-center text-xs text-warning-text">
            {t('homepage.lowRateLimit', { remaining: rateLimitInfo.remaining, limit: rateLimitInfo.limit })}
          </p>
        )}
      </div>
    </div>
  )
}

export default StableInfiniteScroll