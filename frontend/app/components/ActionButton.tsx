'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

type ActionButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger'
type ActionButtonSize = 'sm' | 'md'

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant
  size?: ActionButtonSize
  icon?: ReactNode
}

const VARIANT_STYLES: Record<ActionButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover border border-transparent',
  secondary:
    'bg-bg-secondary text-text-primary border border-border-color hover:bg-bg-tertiary',
  subtle:
    'bg-bg-tertiary text-text-secondary border border-transparent hover:bg-bg-secondary hover:text-text-primary',
  danger:
    'bg-red-500 text-white border border-transparent hover:bg-red-600',
}

const SIZE_STYLES: Record<ActionButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
}

export function ActionButton({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}
