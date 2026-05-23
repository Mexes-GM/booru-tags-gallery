import React from "react";
import { useTranslation } from "react-i18next";
import { useNSFWFilter } from "../context/useNSFWFilter";
import LoadingSpinner from "./common/LoadingSpinner";

const NSFWFilterToggle: React.FC = () => {
  const { t } = useTranslation();
  const { isNSFWFilterEnabled, toggleNSFWFilter, isToggling } = useNSFWFilter();

  return (
    <button
      onClick={toggleNSFWFilter}
      disabled={isToggling}
      className={`
  flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 h-full border-2 border-l-0 rounded-r-xl transition-all duration-200 min-w-[80px] sm:min-w-[100px] text-xs sm:text-sm
        ${isToggling
          ? 'bg-surface-alt dark:bg-surface-alt text-subtle cursor-not-allowed'
          : isNSFWFilterEnabled
            ? 'bg-success-tint text-success border-success dark:border-success-strong hover:brightness-110 dark:hover:brightness-110'
            : 'bg-danger-tint text-danger border-danger dark:border-danger-strong hover:brightness-110 dark:hover:brightness-110'}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
      `}
      title={
        isToggling 
          ? t('common.loading')
          : isNSFWFilterEnabled 
            ? t('nsfw.toggleFilter')
            : t('nsfw.toggleFilter')
      }
    >
      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center">
        {isToggling ? (
          <LoadingSpinner size="sm" color="gray" />
        ) : (
          <svg 
            className="w-3.5 h-3.5 sm:w-4 sm:h-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d={isNSFWFilterEnabled 
                ? "M5 13l4 4L19 7" // Checkmark
                : "M6 18L18 6M6 6l12 12" // X
              }
            />
          </svg>
        )}
      </div>
      
      <span className="font-medium whitespace-nowrap hidden sm:inline">
        {isToggling 
          ? "..." 
          : t('nsfw.filter')
        }
      </span>
      
      <span className="font-medium whitespace-nowrap sm:hidden">
        {isToggling 
          ? "..." 
          : t('nsfw.filter')
        }
      </span>
      
      <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0
        ${isToggling ? 'bg-warning animate-pulse' : isNSFWFilterEnabled ? 'bg-success' : 'bg-danger'}
      `} />
    </button>
  );
};

export default NSFWFilterToggle;