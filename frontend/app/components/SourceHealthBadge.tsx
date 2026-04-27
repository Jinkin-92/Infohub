'use client'

import { cn } from '../lib/utils'

type SourceHealthTone = 'active' | 'stale' | 'interrupted' | 'error' | 'disabled'

interface SourceHealthBadgeProps {
  tone: SourceHealthTone
  label?: string
  className?: string
}

const BADGE_STYLES: Record<SourceHealthTone, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stale: 'border-slate-200 bg-slate-50 text-slate-600',
  interrupted: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-red-200 bg-red-50 text-red-700',
  disabled: 'border-slate-200 bg-slate-100 text-slate-500',
}

const BADGE_LABELS: Record<SourceHealthTone, string> = {
  active: '采集正常',
  stale: '等待刷新',
  interrupted: '采集中断',
  error: '采集失败',
  disabled: '已停用',
}

export function SourceHealthBadge({ tone, label, className }: SourceHealthBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        BADGE_STYLES[tone],
        className
      )}
    >
      {label ?? BADGE_LABELS[tone]}
    </span>
  )
}
