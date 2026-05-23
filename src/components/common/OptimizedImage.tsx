import { useState, useCallback, useRef, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  onLoad?: () => void;
  onError?: () => void;
  sizes?: string;
  quality?: number;
  format?: 'webp' | 'avif' | 'auto';
  loading?: 'lazy' | 'eager';
  crossOrigin?: 'anonymous' | 'use-credentials';
  referrerPolicy?: 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url';
}

interface ImageState {
  isLoading: boolean;
  hasError: boolean;
  isIntersecting: boolean;
  currentSrc: string | null;
}

// Utility functions for image optimization
const getOptimizedSrc = (src: string, format: string = 'webp', quality: number = 85): string => {
  // External URLs (Danbooru) have fixed formats,
  // but quality parameters can be appended if supported
  if (src.includes('danbooru.donmai.us') || src.includes('cdn.donmai.us')) {
    return src; // Danbooru handles optimization on their end
  }
  
  // For local images or services that support format conversion
  const url = new URL(src, window.location.origin);
  url.searchParams.set('format', format);
  url.searchParams.set('quality', quality.toString());
  return url.toString();
};

const generateSrcSet = (src: string, format: string = 'webp', quality: number = 85): string => {
  // For external URLs, return as-is
  if (src.includes('danbooru.donmai.us') || src.includes('cdn.donmai.us')) {
    return src;
  }
  
  const sizes = [1, 1.5, 2, 3];
  return sizes
    .map(size => {
      const url = new URL(src, window.location.origin);
      url.searchParams.set('format', format);
      url.searchParams.set('quality', quality.toString());
      url.searchParams.set('dpr', size.toString());
      return `${url.toString()} ${size}x`;
    })
    .join(', ');
};

const supportsFormat = (format: string): boolean => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  
  switch (format) {
    case 'webp':
      return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    case 'avif':
      return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
    default:
      return false;
  }
};

const getPreferredFormat = (requestedFormat: string = 'auto'): string => {
  if (requestedFormat !== 'auto') {
    return supportsFormat(requestedFormat) ? requestedFormat : 'webp';
  }
  
  if (supportsFormat('avif')) return 'avif';
  if (supportsFormat('webp')) return 'webp';
  return 'jpeg';
};

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height,
  priority = false,
  placeholder = 'empty',
  blurDataURL,
  onLoad,
  onError,
  sizes,
  quality = 85,
  format = 'auto',
  loading = 'lazy',
  crossOrigin = 'anonymous',
  referrerPolicy = 'no-referrer-when-downgrade'
}) => {
  const [state, setState] = useState<ImageState>({
    isLoading: true,
    hasError: false,
    isIntersecting: priority, // If priority, start loading immediately
    currentSrc: null
  });
  
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || state.isIntersecting) return;
    
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState(prev => ({ ...prev, isIntersecting: true }));
          observerRef.current?.disconnect();
        }
      },
      {
        rootMargin: '50px', // Start loading 50px before the image enters viewport
        threshold: 0.1
      }
    );
    
    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }
    
    return () => {
      observerRef.current?.disconnect();
    };
  }, [priority, state.isIntersecting]);
  
  // Generate optimized sources
  const preferredFormat = getPreferredFormat(format);
  const optimizedSrc = getOptimizedSrc(src, preferredFormat, quality);
  const srcSet = generateSrcSet(src, preferredFormat, quality);
  
  const handleLoad = useCallback(() => {
    setState(prev => ({ ...prev, isLoading: false, hasError: false }));
    onLoad?.();
  }, [onLoad]);
  
  const handleError = useCallback(() => {
    setState(prev => ({ ...prev, isLoading: false, hasError: true }));
    onError?.();
  }, [onError]);
  
  const shouldShowPlaceholder = state.isLoading && placeholder !== 'empty';
  const shouldShowSpinner = state.isLoading && !shouldShowPlaceholder;
  
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      {/* Blur placeholder */}
      {shouldShowPlaceholder && blurDataURL && (
        <img
          src={blurDataURL}
          alt=""
          className="absolute inset-0 w-full h-full object-cover filter blur-sm scale-110"
          aria-hidden="true"
        />
      )}
      
      {/* Loading spinner */}
      {shouldShowSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <LoadingSpinner size="sm" />
        </div>
      )}
      
      {/* Error state */}
      {state.hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xs">Failed to load</p>
          </div>
        </div>
      )}
      
      {/* Main image */}
      {(state.isIntersecting || priority) && (
        <picture>
          {/* AVIF source */}
          {supportsFormat('avif') && (
            <source
              srcSet={generateSrcSet(src, 'avif', quality)}
              type="image/avif"
              sizes={sizes}
            />
          )}
          
          {/* WebP source */}
          {supportsFormat('webp') && (
            <source
              srcSet={generateSrcSet(src, 'webp', quality)}
              type="image/webp"
              sizes={sizes}
            />
          )}
          
          {/* Fallback image */}
          <img
            ref={imgRef}
            src={optimizedSrc}
            srcSet={srcSet}
            alt={alt}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              state.isLoading ? 'opacity-0' : 'opacity-100'
            }`}
            width={width}
            height={height}
            loading={priority ? 'eager' : loading}
            decoding="async"
            crossOrigin={crossOrigin}
            referrerPolicy={referrerPolicy}
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
          />
        </picture>
      )}
    </div>
  );
};

// Hook for preloading images
export const useImagePreloader = () => {
  const preloadedImages = useRef(new Set<string>());
  
  const preloadImage = useCallback((src: string, format: string = 'auto') => {
    if (preloadedImages.current.has(src)) return;
    
    const preferredFormat = getPreferredFormat(format);
    const optimizedSrc = getOptimizedSrc(src, preferredFormat);
    
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = optimizedSrc;
    
    if (supportsFormat('avif')) {
      link.type = 'image/avif';
    } else if (supportsFormat('webp')) {
      link.type = 'image/webp';
    }
    
    document.head.appendChild(link);
    preloadedImages.current.add(src);
    
    // Clean up after 30 seconds
    setTimeout(() => {
      if (document.head.contains(link)) {
        document.head.removeChild(link);
      }
      preloadedImages.current.delete(src);
    }, 30000);
  }, []);
  
  const preloadImages = useCallback((sources: string[], format: string = 'auto') => {
    sources.forEach(src => preloadImage(src, format));
  }, [preloadImage]);
  
  return { preloadImage, preloadImages };
};

// Utility for generating blur data URLs
export const generateBlurDataURL = (width: number = 10, height: number = 10, color: string = '#f3f4f6'): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return '';
  
  canvas.width = width;
  canvas.height = height;
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  
  return canvas.toDataURL('image/jpeg', 0.1);
};

export default OptimizedImage;