import { useEffect, useRef, useCallback, useState } from 'react'

interface UseIntersectionObserverOptions {
  root?: Element | null
  rootMargin?: string
  threshold?: number | number[]
}

interface UseIntersectionObserverReturn {
  ref: React.RefObject<HTMLElement | null>
  isIntersecting: boolean
  entry: IntersectionObserverEntry | null
}

const useIntersectionObserver = (
  callback?: (entry: IntersectionObserverEntry) => void,
  options: UseIntersectionObserverOptions = {},
  externalRef?: React.RefObject<HTMLElement | null>
): UseIntersectionObserverReturn => {
  const internalRef = useRef<HTMLElement>(null)
  const ref = externalRef || internalRef
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null)
  const callbackRef = useRef(callback)

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries
    setIsIntersecting(entry.isIntersecting)
    setEntry(entry)
    
    if (callbackRef.current) {
      callbackRef.current(entry)
    }
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const defaultOptions: UseIntersectionObserverOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1,
      ...options
    }

    const observer = new IntersectionObserver(handleIntersection, defaultOptions)
    observer.observe(element)

    return () => {
      observer.unobserve(element)
      observer.disconnect()
    }
  }, [handleIntersection, options.root, options.rootMargin, options.threshold, ref])

  return {
    ref,
    isIntersecting,
    entry
  }
}

export default useIntersectionObserver