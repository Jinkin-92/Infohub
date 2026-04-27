'use client'

import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface DropdownMenuProps {
  children: ReactNode
  className?: string
}

export function DropdownMenu({ children, className }: DropdownMenuProps) {
  return (
    <div
      className={cn(
        'absolute left-0 top-full z-50 mt-1 min-w-[180px] max-h-[280px] overflow-y-auto rounded-xl border border-border-color bg-bg-secondary py-1 shadow-lg',
        className
      )}
    >
      {children}
    </div>
  )
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border-color" />
}
