'use client'

import { cn } from '../lib/utils'

export type StatusBannerVariant = 'info' | 'success' | 'warning' | 'error'

interface StatusBannerProps {
  variant: StatusBannerVariant
  title: string
  description: string
  actionLabel?: string
  actionDisabled?: boolean
  onAction?: () => void
  className?: string
}

const STYLES: Record<
  StatusBannerVariant,
  {
    wrapper: string
    title: string
    description: string
    button: string
  }
> = {
  info: {
    wrapper: 'border-sky-200 bg-sky-50 text-sky-950',
    title: 'text-sky-950',
    description: 'text-sky-800',
    button: 'bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60',
  },
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    title: 'text-emerald-950',
    description: 'text-emerald-800',
    button: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60',
  },
  warning: {
    wrapper: 'border-amber-300 bg-amber-50 text-amber-950',
    title: 'text-amber-900',
    description: 'text-amber-800',
    button: 'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60',
  },
  error: {
    wrapper: 'border-red-200 bg-red-50 text-red-950',
    title: 'text-red-900',
    description: 'text-red-800',
    button: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60',
  },
}

export function StatusBanner({
  variant,
  title,
  description,
  actionLabel,
  actionDisabled,
  onAction,
  className,
}: StatusBannerProps) {
  const tone = STYLES[variant]

  return (
    <div className={cn('rounded-2xl border px-4 py-4 shadow-sm', tone.wrapper, className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', tone.title)}>{title}</p>
          <p className={cn('mt-1 text-sm', tone.description)}>{description}</p>
        </div>

        {actionLabel && onAction && (
          <button
            onClick={onAction}
            disabled={actionDisabled}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
              tone.button
            )}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
