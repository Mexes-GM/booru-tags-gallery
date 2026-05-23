import React, { useState, useRef, useEffect, memo } from 'react'
import { DanbooruTag } from '../types'
import { useImageLoading } from '../context/useImageLoading'
import TagCard from './TagCard'
import TagGroupCard from './TagGroupCard'
import useIntersectionObserver from '../hooks/useIntersectionObserver'

interface OptimizedTagCardProps {
  tag: DanbooruTag
  searchTerm: string
  isTransitioning: boolean
  onTagClick?: (tag: DanbooruTag) => void
  // Translation props for highlighting
  translatedTerm?: string
  lastTranslatedFor?: string
  selectedCategory?: string
}

/**
 * OptimizedTagCard - A wrapper component that optimizes image loading
 * for TagCard components by using intersection observer to load images
 * only when they become visible in the viewport.
 */
const OptimizedTagCard: React.FC<OptimizedTagCardProps> = memo(({ 
  tag, 
  searchTerm, 
  isTransitioning,
  onTagClick,
  translatedTerm,
  lastTranslatedFor,
  selectedCategory
}) => {
  const divRef = useRef<HTMLDivElement>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  
  // Setup intersection observer to detect when the card is visible
  const { isIntersecting } = useIntersectionObserver(
    undefined, 
    { 
      root: null, 
      rootMargin: '50px', // Load images 50px before they become visible
      threshold: 0.1 
    }, 
    divRef
  )
  
  const { loadImage, cancelImage } = useImageLoading()

  // Get image URL from tag data
  const isTagGroup = !!tag.name && tag.name.startsWith('tag_group:')
  const imageUrl = !isTagGroup && tag.words && tag.words.length > 0 ? tag.words[0] : undefined

  useEffect(() => {
    // Load the image when the card becomes visible and hasn't been loaded yet
    if (imageUrl && isIntersecting && !hasLoaded) {
      loadImage(tag.id.toString(), imageUrl, 1, true)
      setHasLoaded(true)
    }
    
    // Clean up by canceling the image loading when the component unmounts
    return () => {
      if (imageUrl && hasLoaded) {
        cancelImage(tag.id.toString())
      }
    }
  }, [isIntersecting, imageUrl, tag.id, hasLoaded, loadImage, cancelImage])

  return (
    <div ref={divRef} style={{ position: 'relative', overflow: 'visible' }}>
      {tag.name?.startsWith('tag_group:') ? (
        <TagGroupCard
          tag={tag}
          searchTerm={searchTerm}
          isTransitioning={isTransitioning}
          onTagClick={onTagClick}
          translatedTerm={translatedTerm}
          lastTranslatedFor={lastTranslatedFor}
          isInTagGroupsContext={selectedCategory === 'tag_groups'}
        />
      ) : (
        <TagCard 
          tag={tag} 
          searchTerm={searchTerm} 
          isTransitioning={isTransitioning}
          onTagClick={onTagClick}
          translatedTerm={translatedTerm}
          lastTranslatedFor={lastTranslatedFor}
        />
      )}
    </div>
  )
})

OptimizedTagCard.displayName = 'OptimizedTagCard'

export default OptimizedTagCard