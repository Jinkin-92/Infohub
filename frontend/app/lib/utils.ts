import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { PLATFORM_CONFIG, PUBLIC_CATEGORY_CONFIG } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const target = new Date(date)
  const now = new Date()
  const diff = now.getTime() - target.getTime()

  if (diff < 60_000) {
    return '刚刚'
  }

  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} 分钟前`
  }

  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} 小时前`
  }

  if (diff < 604_800_000) {
    return `${Math.floor(diff / 86_400_000)} 天前`
  }

  if (target.getFullYear() === now.getFullYear()) {
    return `${target.getMonth() + 1}月${target.getDate()}日`
  }

  return `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`
}

/**
 * 统一样式颜色获取
 * 公开源优先使用 category 颜色，定制源使用 platform 颜色
 */
export function getSourceColor(source: { is_public?: boolean; category?: string; platform: string }): string {
  if (source.is_public && source.category) {
    return PUBLIC_CATEGORY_CONFIG[source.category]?.color ?? '#6B7280'
  }
  return PLATFORM_CONFIG[source.platform]?.color ?? '#6B7280'
}

/**
 * 获取样式色调（用于卡片头部背景渐变）
 */
export function getSourceTone(source: { is_public?: boolean; category?: string; platform: string }, seed: number = 0) {
  const baseColor = getSourceColor(source)
  const alpha = 0.12 + ((seed * 37) % 4) * 0.03
  return {
    header: `linear-gradient(135deg, ${baseColor}${Math.round(alpha * 255).toString(16).padStart(2, '0')}, ${baseColor}22)`,
    body: `${baseColor}08`,
    border: `${baseColor}66`,
  }
}

export function truncate(text: string, length: number): string {
  if (!text || text.length <= length) {
    return text
  }

  return `${text.slice(0, length)}...`
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => fn(...args), delay)
  }
}

export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (inThrottle) {
      return
    }

    fn(...args)
    inThrottle = true
    setTimeout(() => {
      inThrottle = false
    }, limit)
  }
}
