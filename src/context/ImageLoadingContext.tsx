import React, { createContext, ReactNode, useCallback, useRef } from 'react'

interface ImageLoadRequest {
  id: string
  url: string
  priority: number
  isVisible: boolean
  timestamp: number
}

interface ImageLoadingContextType {
  loadImage: (id: string, url: string, priority: number, isVisible: boolean) => void
  cancelImage: (id: string) => void
  updateVisibility: (id: string, isVisible: boolean) => void
  getLoadingQueue: () => ImageLoadRequest[]
}

const ImageLoadingContext = createContext<ImageLoadingContextType | null>(null)

export { ImageLoadingContext }
export type { ImageLoadingContextType }

interface ImageLoadingProviderProps {
  children: ReactNode
}

export const ImageLoadingProvider: React.FC<ImageLoadingProviderProps> = ({ children }) => {
  const queueRef = useRef<ImageLoadRequest[]>([])
  const activeLoadsRef = useRef<Set<string>>(new Set())

  const loadImage = useCallback((id: string, url: string, priority: number, isVisible: boolean) => {
    const existingIndex = queueRef.current.findIndex(item => item.id === id)
    const newRequest: ImageLoadRequest = {
      id,
      url,
      priority,
      isVisible,
      timestamp: Date.now()
    }

    if (existingIndex >= 0) {
      queueRef.current[existingIndex] = newRequest
    } else {
      queueRef.current.push(newRequest)
    }
  }, [])

  const cancelImage = useCallback((id: string) => {
    if (activeLoadsRef.current.has(id)) {
      activeLoadsRef.current.delete(id)
    }
    queueRef.current = queueRef.current.filter(item => item.id !== id)
  }, [])

  const updateVisibility = useCallback((id: string, isVisible: boolean) => {
    const itemIndex = queueRef.current.findIndex(item => item.id === id)
    if (itemIndex >= 0) {
      queueRef.current[itemIndex].isVisible = isVisible
    }
  }, [])

  const getLoadingQueue = useCallback(() => {
    return queueRef.current
  }, [])

  const contextValue: ImageLoadingContextType = {
    loadImage,
    cancelImage,
    updateVisibility,
    getLoadingQueue
  }

  return (
    <ImageLoadingContext.Provider value={contextValue}>
      {children}
    </ImageLoadingContext.Provider>
  )
} 