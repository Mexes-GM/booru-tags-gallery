import { useContext } from 'react'
import { ImageLoadingContext } from './ImageLoadingContext'

interface ImageLoadingContextType {
  loadImage: (id: string, url: string, priority: number, isVisible: boolean) => void
  cancelImage: (id: string) => void
  updateVisibility: (id: string, isVisible: boolean) => void
  getLoadingQueue: () => unknown[]
}

export const useImageLoading = (): ImageLoadingContextType => {
  const context = useContext(ImageLoadingContext)
  if (!context) {
    throw new Error('useImageLoading must be used within an ImageLoadingProvider')
  }
  return context
} 