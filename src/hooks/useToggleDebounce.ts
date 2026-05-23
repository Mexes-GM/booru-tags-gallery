import { useRef, useCallback, useEffect, useState } from 'react';

interface UseToggleDebounceReturn {
  isToggling: boolean;
  toggle: (toggleFunction: () => any) => boolean | (() => void);
  reset: () => void;
}

export function useToggleDebounce(delay: number = 1000): UseToggleDebounceReturn {
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggle = useCallback((toggleFunction: () => any): boolean | (() => void) => {
    if (isToggling) {
      return false;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsToggling(true);

    toggleFunction();

    timeoutRef.current = setTimeout(() => {
      setIsToggling(false);
      timeoutRef.current = null;
    }, delay);

    const safetyTimeout = setTimeout(() => {
      if (isToggling) {
        setIsToggling(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    }, 5000);

    return () => clearTimeout(safetyTimeout);
  }, [delay, isToggling]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsToggling(false);

  }, []);

  useEffect(() => {
    if (isToggling) {
      const stuckTimeout = setTimeout(() => {
        reset();
      }, 10000);

      return () => clearTimeout(stuckTimeout);
    }
  }, [isToggling, reset]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { isToggling, toggle, reset };
} 