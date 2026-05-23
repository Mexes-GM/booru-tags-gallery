import { useState, useCallback, useMemo } from 'react'

interface HoverEffects {
  isHovered: boolean
  hoverClasses: string
  handleMouseEnter: () => void
  handleMouseLeave: () => void
}

interface UseHoverEffectsOptions {
  baseClasses?: string
  customHoverClasses?: string
  transitionDuration?: 'fast' | 'normal' | 'slow'
  scale?: boolean
  lift?: boolean
  glow?: boolean
}

const useHoverEffects = (options: UseHoverEffectsOptions = {}): HoverEffects => {
  const {
    baseClasses = '',
    customHoverClasses = '',
    transitionDuration = 'normal',
    scale = false,
    lift = false,
    glow = false
  } = options

  const [isHovered, setIsHovered] = useState(false)

  const getTransitionClasses = useCallback(() => {
    const durationMap = {
      fast: 'duration-100',
      normal: 'duration-200',
      slow: 'duration-300'
    }
    
    return `transition-all ${durationMap[transitionDuration]} ease-out`
  }, [transitionDuration])

  const getHoverEffectClasses = useCallback(() => {
    const effects = []
    
    if (scale) {
      effects.push('hover:scale-105')
    }
    
    if (lift) {
      effects.push('hover:-translate-y-1')
    }
    
    if (glow) {
      effects.push('hover:shadow-xl')
    }
    
    return effects.join(' ')
  }, [scale, lift, glow])

  const hoverClasses = useMemo(() => {
    const transitionClasses = getTransitionClasses()
    const effectClasses = getHoverEffectClasses()
    
    return `${baseClasses} ${transitionClasses} ${effectClasses} ${customHoverClasses}`.trim()
  }, [baseClasses, getTransitionClasses, getHoverEffectClasses, customHoverClasses])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
  }, [])

  return {
    isHovered,
    hoverClasses,
    handleMouseEnter,
    handleMouseLeave
  }
}

export default useHoverEffects 