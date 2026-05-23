import { useMemo } from 'react';

const useOptimizedCardAnimation = (isTransitioning: boolean) => {
  return useMemo(() => ({
    animationClasses: '',
    animationStyle: {},
  }), [isTransitioning]);
};

export default useOptimizedCardAnimation; 