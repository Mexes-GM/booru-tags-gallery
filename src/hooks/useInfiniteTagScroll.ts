import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { LocalTagData } from '../types'

interface UseInfiniteTagScrollProps {
  searchResults: LocalTagData[]
  searchTerm: string
  selectedCategory: string
  isLoading: boolean
  tagsData: LocalTagData[]
}

interface UseInfiniteTagScrollReturn {
  displayedTags: LocalTagData[]
  hasMore: boolean
  loadMore: () => void
  resetScroll: () => void
  isLoadingMore: boolean
  visibleRange: { start: number; end: number }
  setVisibleRange: (range: { start: number; end: number }) => void
}

const ITEMS_PER_PAGE = 20
const RANDOM_TAGS_BATCH_SIZE = 50

const useInfiniteTagScroll = ({
  searchResults,
  searchTerm,
  selectedCategory,
  isLoading,
  tagsData
}: UseInfiniteTagScrollProps): UseInfiniteTagScrollReturn => {
  const [displayedTags, setDisplayedTags] = useState<LocalTagData[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [randomTagsIndex, setRandomTagsIndex] = useState(0)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 })
  const [isAtEnd, setIsAtEnd] = useState(false)
  const randomTagsRef = useRef<LocalTagData[]>([])
  const allTagsRef = useRef<LocalTagData[]>([])
  const loadMoreTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get popular tags for the selected category
  const popularTags = useMemo(() => {
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

    return tagsData
      .filter(categoryFilter)
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 1000)
  }, [selectedCategory, tagsData])

  // Get random tags for when search results are exhausted
  useMemo(() => {
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
    
    // Create a shuffled array of indices for random access
    const indices = Array.from({ length: filteredTags.length }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    
    const shuffledTags = indices.map(index => filteredTags[index])
    randomTagsRef.current = shuffledTags
  }, [selectedCategory, tagsData])

  // Build complete tag list based on search state
  const buildCompleteTagList = useCallback(() => {
    if (searchTerm.trim()) {
      const safeSearchResults = Array.isArray(searchResults) ? searchResults : []
      const searchResultsCount = safeSearchResults.length
      const totalRequested = currentPage * ITEMS_PER_PAGE
      
      if (totalRequested <= searchResultsCount) {
        return safeSearchResults.slice(0, totalRequested)
      } else {
        const searchResultsToShow = safeSearchResults
        const randomTagsNeeded = totalRequested - searchResultsCount
        const randomTagsToShow = randomTagsRef.current.slice(randomTagsIndex, randomTagsIndex + randomTagsNeeded)
        
        return [...searchResultsToShow, ...randomTagsToShow]
      }
    } else {
      return popularTags.slice(0, currentPage * ITEMS_PER_PAGE)
    }
  }, [searchResults, searchTerm, currentPage, popularTags, randomTagsIndex])

  // Check if there are more items to load
  const hasMore = useMemo(() => {
    if (isAtEnd) return false
    
    if (searchTerm.trim()) {
      // When searching, we always have more (random tags) unless we've reached the end
      return true
    } else {
      // When not searching, check if we have more popular tags
      return currentPage * ITEMS_PER_PAGE < popularTags.length
    }
  }, [searchTerm, currentPage, popularTags.length, isAtEnd])

  // Load more items with better control
  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore || isAtEnd) return

    // Clear any existing timeout
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current)
    }

    setIsLoadingMore(true)
    
    loadMoreTimeoutRef.current = setTimeout(() => {
      setCurrentPage(prev => prev + 1)
      
      if (searchTerm.trim()) {
        const searchResultsCount = searchResults.length
        const totalRequested = (currentPage + 1) * ITEMS_PER_PAGE
        
        if (totalRequested > searchResultsCount) {
          setRandomTagsIndex(prev => prev + RANDOM_TAGS_BATCH_SIZE)
        }
      }
      
      setIsLoadingMore(false)
    }, 500) // Increased delay to prevent rapid loading
  }, [isLoadingMore, hasMore, searchTerm, searchResults.length, currentPage, isAtEnd])

  // Reset scroll state
  const resetScroll = useCallback(() => {
    setDisplayedTags([])
    setCurrentPage(1)
    setRandomTagsIndex(0)
    setIsLoadingMore(false)
    setVisibleRange({ start: 0, end: 0 })
    setIsAtEnd(false)
    
    // Clear any pending timeouts
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current)
      loadMoreTimeoutRef.current = null
    }
  }, [])

  // Update complete tag list when dependencies change
  useEffect(() => {
    if (!isLoading) {
      const completeList = buildCompleteTagList()
      allTagsRef.current = completeList
      setDisplayedTags(completeList)
      
      // Check if we've reached the end for popular tags
      if (!searchTerm.trim() && completeList.length >= popularTags.length) {
        setIsAtEnd(true)
      }
    }
  }, [buildCompleteTagList, isLoading, searchTerm, popularTags.length])

  // Reset scroll when search term or category changes
  useEffect(() => {
    resetScroll()
  }, [searchTerm, selectedCategory, resetScroll])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current)
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
    setVisibleRange
  }
}

export default useInfiniteTagScroll