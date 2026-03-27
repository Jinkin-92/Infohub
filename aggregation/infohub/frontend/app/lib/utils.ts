import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
