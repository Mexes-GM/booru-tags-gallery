import { useState, useEffect, useRef, useCallback } from 'react'

interface PreloadedImage {
  url: string
  loaded: boolean
  error: boolean
  element: HTMLImageElement | null
}

interface UseImagePreloaderOptions {
  preloadCount?: number
  onImageLoaded?: (url: string) => void
  onImageError?: (url: string) => void
}

/**
 * Hook para precargar imágenes y evitar parpadeos en transiciones
 */
const useImagePreloader = (options: UseImagePreloaderOptions = {}) => {
  const { preloadCount = 3, onImageLoaded, onImageError } = options
  
  const [preloadedImages, setPreloadedImages] = useState<Map<string, PreloadedImage>>(new Map())
  const [loadingQueue, setLoadingQueue] = useState<Set<string>>(new Set())
  const preloadQueueRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)

  /**
   * Precarga una imagen específica
   */
  const preloadImage = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!url || preloadedImages.has(url)) {
        resolve(preloadedImages.get(url)?.loaded || false)
        return
      }

      if (loadingQueue.has(url)) {
        // Si ya está cargando, esperar
        const checkLoaded = () => {
          const image = preloadedImages.get(url)
          if (image && (image.loaded || image.error)) {
            resolve(image.loaded)
          } else {
            setTimeout(checkLoaded, 50)
          }
        }
        checkLoaded()
        return
      }

      setLoadingQueue(prev => new Set(prev).add(url))

      const img = new Image()
      img.crossOrigin = 'anonymous'

      const handleLoad = () => {
        setPreloadedImages(prev => {
          const newMap = new Map(prev)
          newMap.set(url, {
            url,
            loaded: true,
            error: false,
            element: img
          })
          return newMap
        })
        setLoadingQueue(prev => {
          const newSet = new Set(prev)
          newSet.delete(url)
          return newSet
        })
        onImageLoaded?.(url)
        resolve(true)
      }

      const handleError = () => {
        setPreloadedImages(prev => {
          const newMap = new Map(prev)
          newMap.set(url, {
            url,
            loaded: false,
            error: true,
            element: null
          })
          return newMap
        })
        setLoadingQueue(prev => {
          const newSet = new Set(prev)
          newSet.delete(url)
          return newSet
        })
        onImageError?.(url)
        resolve(false)
      }

      img.onload = handleLoad
      img.onerror = handleError
      img.src = url
    })
  }, [preloadedImages, loadingQueue, onImageLoaded, onImageError])

  /**
   * Precarga múltiples imágenes en secuencia
   */
  const preloadImages = useCallback(async (urls: string[]): Promise<Map<string, boolean>> => {
    const results = new Map<string, boolean>()
    
    // Filtrar URLs ya precargadas
    const urlsToLoad = urls.filter(url => !preloadedImages.has(url) || !preloadedImages.get(url)?.loaded)
    
    if (urlsToLoad.length === 0) {
      urls.forEach(url => {
        results.set(url, preloadedImages.get(url)?.loaded || false)
      })
      return results
    }

    // Precargar en paralelo con límite de concurrencia
    const batchSize = Math.min(preloadCount, urlsToLoad.length)
    const batches = []
    
    for (let i = 0; i < urlsToLoad.length; i += batchSize) {
      batches.push(urlsToLoad.slice(i, i + batchSize))
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (url) => {
        const loaded = await preloadImage(url)
        results.set(url, loaded)
        return { url, loaded }
      })
      
      await Promise.all(batchPromises)
    }

    // Agregar resultados de imágenes ya precargadas
    urls.forEach(url => {
      if (!results.has(url)) {
        results.set(url, preloadedImages.get(url)?.loaded || false)
      }
    })

    return results
  }, [preloadedImages, preloadCount, preloadImage])

  /**
   * Verifica si una imagen está precargada
   */
  const isImagePreloaded = useCallback((url: string): boolean => {
    return preloadedImages.get(url)?.loaded || false
  }, [preloadedImages])

  /**
   * Obtiene la imagen precargada
   */
  const getPreloadedImage = useCallback((url: string): PreloadedImage | null => {
    return preloadedImages.get(url) || null
  }, [preloadedImages])

  /**
   * Limpia imágenes precargadas
   */
  const clearPreloadedImages = useCallback(() => {
    setPreloadedImages(new Map())
    setLoadingQueue(new Set())
  }, [])

  /**
   * Elimina una imagen específica del cache
   */
  const removePreloadedImage = useCallback((url: string) => {
    setPreloadedImages(prev => {
      const newMap = new Map(prev)
      newMap.delete(url)
      return newMap
    })
  }, [])

  /**
   * Procesa la cola de precarga
   */
  const processPreloadQueue = useCallback(async () => {
    if (isProcessingRef.current || preloadQueueRef.current.length === 0) {
      return
    }

    isProcessingRef.current = true

    while (preloadQueueRef.current.length > 0) {
      const urls = preloadQueueRef.current.splice(0, preloadCount)
      await preloadImages(urls)
    }

    isProcessingRef.current = false
  }, [preloadCount, preloadImages])

  /**
   * Agrega URLs a la cola de precarga
   */
  const queuePreload = useCallback((urls: string[]) => {
    preloadQueueRef.current.push(...urls.filter(url => 
      !preloadedImages.has(url) && !loadingQueue.has(url)
    ))
    processPreloadQueue()
  }, [preloadedImages, loadingQueue, processPreloadQueue])

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      clearPreloadedImages()
    }
  }, [clearPreloadedImages])

  return {
    preloadImage,
    preloadImages,
    isImagePreloaded,
    getPreloadedImage,
    clearPreloadedImages,
    removePreloadedImage,
    queuePreload,
    preloadedCount: preloadedImages.size,
    loadingCount: loadingQueue.size
  }
}

export default useImagePreloader 