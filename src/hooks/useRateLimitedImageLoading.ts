import { useState, useCallback, useEffect, useMemo } from "react";

interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetTime: number;
  isRateLimited: boolean;
}

interface ImageLoadingParams {
  maxConcurrentImages: number;
  delayBetweenImages: number;
  batchSize: number;
  pauseLoading: boolean;
}

export const useRateLimitedImageLoading = () => {
  const [imageLoadingParams, setImageLoadingParams] = useState<ImageLoadingParams>({
    maxConcurrentImages: 3,
    delayBetweenImages: 100,
    batchSize: 5,
    pauseLoading: false
  });

  const updateImageLoadingParams = useCallback((rateLimitInfo: RateLimitInfo) => {
    const { remaining, limit } = rateLimitInfo;
    const utilizationRate = remaining / limit;
    
    let newParams: ImageLoadingParams;
    
    if (utilizationRate <= 0.1) {
      newParams = {
        maxConcurrentImages: 1,
        delayBetweenImages: 2000,
        batchSize: 1,
        pauseLoading: true
      };
    } else if (utilizationRate <= 0.3) {
      newParams = {
        maxConcurrentImages: 2,
        delayBetweenImages: 1000,
        batchSize: 2,
        pauseLoading: false
      };
    } else if (utilizationRate <= 0.7) {
      newParams = {
        maxConcurrentImages: 3,
        delayBetweenImages: 500,
        batchSize: 3,
        pauseLoading: false
      };
    } else {
      newParams = {
        maxConcurrentImages: 6,
        delayBetweenImages: 100,
        batchSize: 8,
        pauseLoading: false
      };
    }
    
    setImageLoadingParams(newParams);
  }, []);

  const debouncedUpdateParams = useMemo(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    
    const debouncedFunction = (rateLimitInfo: RateLimitInfo) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        updateImageLoadingParams(rateLimitInfo);
      }, 300);
    };

    debouncedFunction.cancel = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    return debouncedFunction;
  }, [updateImageLoadingParams]);

  useEffect(() => {
    return () => {
      debouncedUpdateParams.cancel();
    };
  }, [debouncedUpdateParams]);

  return imageLoadingParams;
};