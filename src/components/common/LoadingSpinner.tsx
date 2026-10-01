import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Kept for API compatibility; the spinner always uses the theme tokens. */
  color?: 'blue' | 'gray' | 'green' | 'red';
  className?: string;
  variant?: 'spinner' | 'pulse';
  ariaLabel?: string;
}

const sizeClasses: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
  xl: 'h-10 w-10'
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color,
  className = '',
  variant = 'spinner',
  ariaLabel = 'Loading'
}) => {
  const tone = color === 'gray' ? 'border-t-muted-foreground' : 'border-t-primary'
  const baseClasses = `rounded-full border-2 border-border ${tone} ${sizeClasses[size]} ${className}`

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      className={`${variant === 'pulse' ? 'animate-pulse' : 'animate-spin'} ${baseClasses}`}
    />
  )
}

export default LoadingSpinner
