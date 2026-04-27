'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

interface SourceChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  accentColor?: string
  dot?: ReactNode
}

export function SourceChip({
  selected = false,
  accentColor,
  dot,
  className,
  children,
  style,
  ...props
}: SourceChipProps) {
  const selectedStyle = accentColor
    ? { backgroundColor: accentColor, borderColor: accentColor, color: '#FFFFFF' }
    : undefined
  const idleStyle =
    !selected && accentColor
      ? { backgroundColor: `${accentColor}15`, color: accentColor, borderColor: `${accentColor}22` }
      : undefined

  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
        selected
          ? 'shadow-sm'
          : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary hover:text-text-primary',
        className
      )}
      style={selected ? { ...style, ...selectedStyle } : { ...style, ...idleStyle }}
      {...props}
    >
      {dot}
      <span>{children}</span>
    </button>
  )
}
