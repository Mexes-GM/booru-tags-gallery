import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { LocalTagData } from '../types'
import { useRateLimitedImageLoading } from './useRateLimitedImageLoading'

interface UseDanbooruRateLimitedScrollProps {
  searchResults: LocalTagData[]
  searchTerm: string
  selectedCategory: string
  tagsData: LocalTagData[]
  rateLimitInfo?: {
    remaining: number
    limit: number
    resetTime: number
    isRateLimited: boolean
  }
}

interface UseDanbooruRateLimitedScrollReturn {
  displayedTags: LocalTagData[]
  hasMore: boolean
  loadMore: () => void
  resetScroll: () => void
  isLoadingMore: boolean
  visibleRange: { start: number; end: number }
  setVisibleRange: (range: { start: number; end: number }) => void
  rateLimitInfo: {
    remaining: number
    limit: number
    resetTime: number
    isRateLimited: boolean
  }
  imageLoadingConfig: {
    shouldLoadImages: boolean
    imageLoadDelay: number
    maxConcurrentImages: number
    priorityThreshold: number
    isImageLoadingLimited: boolean
  }
}

const ITEMS_PER_PAGE = 20
const RANDOM_TAGS_BATCH_SIZE = 50
const MIN_RATE_LIMIT_BUFFER = 2
const RATE_LIMIT_CHECK_INTERVAL = 1000

const useDanbooruRateLimitedScroll = ({
  searchResults,
  searchTerm,
  selectedCategory,
  tagsData,
  rateLimitInfo: externalRateLimitInfo
}: UseDanbooruRateLimitedScrollProps): UseDanbooruRateLimitedScrollReturn => {
  const [displayedTags, setDisplayedTags] = useState<LocalTagData[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [randomTagsIndex, setRandomTagsIndex] = useState(0)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 })
  const [internalRateLimitInfo, setInternalRateLimitInfo] = useState({
    remaining: 10,
    limit: 10,
    resetTime: Date.now() + 60000,
    isRateLimited: false
  })
  
  const rateLimitInfo = externalRateLimitInfo || internalRateLimitInfo
  
  const randomTagsRef = useRef<LocalTagData[]>([])
  const loadMoreTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const rateLimitCheckRef = useRef<NodeJS.Timeout | null>(null)

  const imageLoadingParams = useRateLimitedImageLoading()
  
  const imageLoadingConfig = useMemo(() => ({
    shouldLoadImages: !imageLoadingParams.pauseLoading,
    imageLoadDelay: imageLoadingParams.delayBetweenImages,
    maxConcurrentImages: imageLoadingParams.maxConcurrentImages,
    priorityThreshold: imageLoadingParams.batchSize,
    isImageLoadingLimited: imageLoadingParams.pauseLoading
  }), [imageLoadingParams])

  useMemo(() => {
    // Si la categoría es 'tag_groups', no preparamos tags aleatorios (no aplica)
    if (selectedCategory === 'tag_groups') {
      randomTagsRef.current = []
      return
    }

    const categoryMap: { [key: string]: number } = {
      'general': 0,
      'artist': 1,
      'copyright': 3,
      'character': 4,
      'meta': 5
    }

    const categoryFilter = selectedCategory === 'all' 
      ? () => true 
      : (tag: LocalTagData) => tag.category === categoryMap[selectedCategory]

    const filteredTags = tagsData.filter(categoryFilter)
    
    const indices = Array.from({ length: filteredTags.length }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    
    const shuffledTags = indices.map(index => filteredTags[index])
    randomTagsRef.current = shuffledTags
  }, [selectedCategory, tagsData])

  const updateRateLimitInfo = useCallback(async () => {
    try {
      const { default: danbooruApi } = await import('../services/danbooruApi');
      const stats = danbooruApi.getRateLimitStats()
      if (stats && stats.rateLimitInfo) {
        setInternalRateLimitInfo(prev => ({
          ...prev,
          remaining: stats.rateLimitInfo.remaining || prev.remaining,
          limit: stats.rateLimitInfo.limit || prev.limit,
          resetTime: stats.rateLimitInfo.reset || prev.resetTime,
          isRateLimited: stats.rateLimitInfo.remaining <= MIN_RATE_LIMIT_BUFFER
        }))
      }
    } catch {
      // Silently handle rate limit info error
    }
  }, [])

  useEffect(() => {
    let isActive = true
    
    const checkRateLimit = () => {
      if (!isActive) return
      
      updateRateLimitInfo()
      
      // Solo continuar verificando si hay actividad reciente o estamos cerca del límite
      if (rateLimitInfo.isRateLimited || rateLimitInfo.remaining < MIN_RATE_LIMIT_BUFFER * 2) {
        rateLimitCheckRef.current = setTimeout(checkRateLimit, RATE_LIMIT_CHECK_INTERVAL)
      } else {
        // Verificar menos frecuentemente si no hay problemas de límite
        rateLimitCheckRef.current = setTimeout(checkRateLimit, RATE_LIMIT_CHECK_INTERVAL * 5)
      }
    }
    
    checkRateLimit()
    
    return () => {
      isActive = false
      if (rateLimitCheckRef.current) {
        clearTimeout(rateLimitCheckRef.current)
      }
    }
  }, [updateRateLimitInfo, rateLimitInfo.isRateLimited, rateLimitInfo.remaining])

  const buildCompleteTagList = useCallback(() => {
    // Defensive: ensure we always work with an array (worker may emit a non-array object if mis-handled)
    const safeSearchResults = Array.isArray(searchResults) ? searchResults : []
    const searchResultsCount = safeSearchResults.length
    const totalRequested = currentPage * ITEMS_PER_PAGE

    // Para 'tag_groups', siempre usamos solo los resultados de búsqueda (grupos)
    if (selectedCategory === 'tag_groups') {
      if (searchResultsCount === 0) return []
      return searchResults.slice(0, Math.min(totalRequested, searchResultsCount))
    }
    
    if (searchResultsCount === 0 && !searchTerm.trim()) {
      const categoryMap: { [key: string]: number } = {
        'general': 0,
        'artist': 1,
        'copyright': 3,
        'character': 4,
        'meta': 5
      }

      const categoryFilter = selectedCategory === 'all' 
        ? () => true 
        : (tag: LocalTagData) => tag.category === categoryMap[selectedCategory]

      const allTags = tagsData
      const filteredTags = allTags.filter(categoryFilter)
      
      const popularTags = filteredTags
        .sort((a, b) => b.postCount - a.postCount)
        .slice(0, totalRequested)
      
      return popularTags
    }
    
    if (searchResultsCount === 0) {
      return []
    }
    
    if (totalRequested <= searchResultsCount) {
      return safeSearchResults.slice(0, totalRequested)
    } else {
      const searchResultsToShow = safeSearchResults
      const randomTagsNeeded = totalRequested - searchResultsCount
      const randomTagsToShow = randomTagsRef.current.slice(randomTagsIndex, randomTagsIndex + randomTagsNeeded)
      
      return [...searchResultsToShow, ...randomTagsToShow]
    }
  }, [searchResults, searchTerm, selectedCategory, currentPage, randomTagsIndex, tagsData])

  const hasMore = useMemo(() => {
    if (rateLimitInfo.isRateLimited) return false
    
    const searchResultsCount = searchResults.length
    const totalRequested = currentPage * ITEMS_PER_PAGE

    // En 'tag_groups', hasMore depende solo de los resultados (no mezclar con tags aleatorios)
    if (selectedCategory === 'tag_groups') {
      return totalRequested < searchResultsCount
    }
    
    if (!searchTerm.trim()) {
      const categoryMap: { [key: string]: number } = {
        'general': 0,
        'artist': 1,
        'copyright': 3,
        'character': 4,
        'meta': 5
      }

      const categoryFilter = selectedCategory === 'all' 
        ? () => true 
        : (tag: LocalTagData) => tag.category === categoryMap[selectedCategory]

      const filteredTags = tagsData.filter(categoryFilter)
      return totalRequested < filteredTags.length
    }
    
    return totalRequested < searchResultsCount + randomTagsRef.current.length
  }, [searchResults, searchTerm, selectedCategory, currentPage, tagsData, rateLimitInfo.isRateLimited])

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore || rateLimitInfo.isRateLimited) return

    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current)
    }

    setIsLoadingMore(true)
    
    const delay = rateLimitInfo.remaining <= 5 ? 1000 : 100
    
    loadMoreTimeoutRef.current = setTimeout(() => {
      const searchResultsCount = searchResults.length
      const totalRequested = currentPage * ITEMS_PER_PAGE
      
      // Para 'tag_groups' no hay random tags que agregar
      if (selectedCategory !== 'tag_groups' && totalRequested > searchResultsCount) {
        setRandomTagsIndex(prev => prev + RANDOM_TAGS_BATCH_SIZE)
      }
      
      setCurrentPage(prev => prev + 1)
      setIsLoadingMore(false)
    }, delay)
  }, [isLoadingMore, hasMore, rateLimitInfo, searchResults.length, currentPage, selectedCategory])

  const resetScroll = useCallback(() => {
    setCurrentPage(1)
    setRandomTagsIndex(0)
    // No need to clear displayedTags: it is rebuilt from the inputs above. Clearing
    // it here left the grid empty when the page was already 1 (nothing to rebuild).
    setIsLoadingMore(false)
    
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const newDisplayedTags = buildCompleteTagList()
    setDisplayedTags(newDisplayedTags)
  }, [buildCompleteTagList])

  useEffect(() => {
    if (!searchTerm.trim()) {
      if (selectedCategory === 'tag_groups') {
        // Ajustar currentPage en función del total de grupos disponibles
        const totalRequested = currentPage * ITEMS_PER_PAGE
        if (totalRequested >= searchResults.length) {
          setCurrentPage(Math.ceil((searchResults.length || 1) / ITEMS_PER_PAGE))
        }
        return
      }

      const categoryMap: { [key: string]: number } = {
        'general': 0,
        'artist': 1,
        'copyright': 3,
        'character': 4,
        'meta': 5
      }

      const categoryFilter = selectedCategory === 'all' 
        ? () => true 
        : (tag: LocalTagData) => tag.category === categoryMap[selectedCategory]

      const filteredTags = tagsData.filter(categoryFilter)
      const totalRequested = currentPage * ITEMS_PER_PAGE
      
      if (totalRequested >= filteredTags.length) {
        setCurrentPage(Math.ceil(filteredTags.length / ITEMS_PER_PAGE))
      }
    }
  }, [searchTerm, selectedCategory, tagsData, currentPage, searchResults.length])

  useEffect(() => {
    resetScroll()
  }, [searchTerm, selectedCategory, resetScroll])

  useEffect(() => {
    return () => {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current)
      }
      if (rateLimitCheckRef.current) {
        clearTimeout(rateLimitCheckRef.current)
      }
    }
  }, [])

  return {
    displayedTags,
    hasMore,
    loadMore,
    resetScroll,
    isLoadingMore,
    visibleRange,
    setVisibleRange,
    rateLimitInfo,
    imageLoadingConfig
  }
}

export default useDanbooruRateLimitedScroll