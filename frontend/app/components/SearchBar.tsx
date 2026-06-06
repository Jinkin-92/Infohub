'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'

interface SearchBarProps {
  value?: string
  onSearch: (query: string) => void
  placeholder?: string
  className?: string
}

/**
 * 搜索栏组件
 */
export function SearchBar({
  value = '',
  onSearch,
  placeholder = '搜索内容...',
  className
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 同步外部 value 变化
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== value) {
        onSearch(inputValue)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [inputValue, value, onSearch])

  // 处理输入
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }, [])

  // 清除搜索
  const handleClear = useCallback(() => {
    setInputValue('')
    onSearch('')
    inputRef.current?.focus()
  }, [onSearch])

  // 处理提交
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    onSearch(inputValue)
  }, [inputValue, onSearch])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K 聚焦搜索框
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      // ESC 清除搜索
      if (e.key === 'Escape' && inputValue) {
        setInputValue('')
        onSearch('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [inputValue, onSearch])

  return (
    <form onSubmit={handleSubmit} className={cn('relative', className)}>
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200',
          'bg-bg-tertiary/50 hover:bg-bg-tertiary',
          isFocused
            ? 'border-accent ring-2 ring-accent/20 bg-bg-secondary'
            : 'border-transparent'
        )}
      >
        {/* 搜索图标 */}
        <svg
          className={cn(
            'w-5 h-5 transition-colors',
            isFocused ? 'text-accent' : 'text-text-muted'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-sm"
        />

        {/* 清除按钮 */}
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-full text-text-muted hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* 快捷键提示 */}
        {!inputValue && !isFocused && (
          <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono text-text-muted bg-bg-tertiary rounded border border-border-color">
            <span>Ctrl</span>
            <span>K</span>
          </kbd>
        )}
      </div>
    </form>
  )
}
