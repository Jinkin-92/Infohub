'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

export type FontSize = 'sm' | 'md' | 'lg'
export type CardDensity = 'compact' | 'normal' | 'relaxed'
export type LineHeight = 'compact' | 'normal' | 'relaxed'

export interface DisplaySettings {
  fontSize: FontSize
  cardDensity: CardDensity
  lineHeight: LineHeight
}

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
  displaySettings: DisplaySettings
  setDisplaySettings: (settings: DisplaySettings) => void
}

const defaultDisplaySettings: DisplaySettings = {
  fontSize: 'md',
  cardDensity: 'normal',
  lineHeight: 'normal',
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'infohub-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)
  const [displaySettings, setDisplaySettingsState] = useState<DisplaySettings>(defaultDisplaySettings)

  const displayStorageKey = 'infohub-display-settings'

  // 从 localStorage 读取主题
  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored) {
      setThemeState(stored)
    }
    setMounted(true)
  }, [storageKey])

  // 从 localStorage 读取显示设置
  useEffect(() => {
    const stored = localStorage.getItem(displayStorageKey)
    if (stored) {
      try {
        setDisplaySettingsState(JSON.parse(stored))
      } catch {
        // ignore parse errors
      }
    }
  }, [displayStorageKey])

  // 应用显示设置到 document
  useEffect(() => {
    if (!mounted) return
    const root = window.document.documentElement
    root.style.setProperty('--font-scale', displaySettings.fontSize === 'sm' ? '0.875' : displaySettings.fontSize === 'lg' ? '1.125' : '1')
    root.style.setProperty('--card-density-scale', displaySettings.cardDensity === 'compact' ? '0.75' : displaySettings.cardDensity === 'relaxed' ? '1.25' : '1')
    root.style.setProperty('--line-height-scale', displaySettings.lineHeight === 'compact' ? '0.9' : displaySettings.lineHeight === 'relaxed' ? '1.1' : '1')
  }, [displaySettings, mounted])

  // 计算实际应用的主题
  useEffect(() => {
    if (!mounted) return

    let resolved: 'light' | 'dark'
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } else {
      resolved = theme
    }
    setResolvedTheme(resolved)

    // 应用到 document
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  }, [theme, mounted])

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const resolved = mediaQuery.matches ? 'dark' : 'light'
      setResolvedTheme(resolved)
      const root = window.document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(resolved)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem(storageKey, newTheme)
    setThemeState(newTheme)
  }

  const setDisplaySettings = (settings: DisplaySettings) => {
    localStorage.setItem(displayStorageKey, JSON.stringify(settings))
    setDisplaySettingsState(settings)
  }

  // 防止闪烁，挂载前不渲染
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, displaySettings, setDisplaySettings }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
