'use client'

import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  description?: string
  error?: string | null
}

export function TextAreaField({
  label,
  description,
  error,
  className,
  ...props
}: TextAreaFieldProps) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-text-primary">{label}</span>
      {description && <span className="block text-sm text-text-secondary">{description}</span>}
      <textarea
        className={cn(
          'w-full resize-none rounded-xl border border-border-color bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
          'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error && 'border-error focus:border-error focus:ring-error/20',
          className
        )}
        {...props}
      />
      {error && <span className="block text-sm text-error">{error}</span>}
    </label>
  )
}
