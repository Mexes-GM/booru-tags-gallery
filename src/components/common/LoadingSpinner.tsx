import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'blue' | 'gray' | 'green' | 'red';
  className?: string;
  variant?: 'spinner' | 'pulse';
  ariaLabel?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  color = 'blue', 
  className = '', 
  variant = 'spinner',
  ariaLabel = 'Loading'
}) => {
  const sizeClasses: { [key: string]: string } = {
    sm: 'h-3 w-3',
    md: 'h-6 w-6', 
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  }

  const colorClasses: { [key: string]: string } = {
    blue: 'border-blue-500 border-t-transparent',
    gray: 'border-gray-400 border-t-transparent',
    green: 'border-green-500 border-t-transparent',
    red: 'border-red-500 border-t-transparent'
  }

  const baseClasses = `rounded-full border-2 ${sizeClasses[size]} ${colorClasses[color]} ${className}`

  const commonProps = {
    role: 'status',
    'aria-label': ariaLabel,
    'aria-live': 'polite'
  } as const;

  if (variant === 'pulse') {
    return <div {...commonProps} className={`animate-pulse ${baseClasses}`}></div>
  }

  return <div {...commonProps} className={`animate-spin ${baseClasses}`}></div>
}

export default LoadingSpinner 