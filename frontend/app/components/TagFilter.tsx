'use client'

import { useState, useRef, useEffect } from 'react'
import { Tag } from '../types'
import { cn } from '../lib/utils'

interface TagFilterProps {
  tags: Tag[]
  selectedTagId: number | null
  onSelectTag: (tagId: number | null) => void
  className?: string
}

/**
 * 标签筛选组件
 */
export function TagFilter({ tags, selectedTagId, onSelectTag, className }: TagFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedTag = tags.find(t => t.id === selectedTagId)

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* 筛选按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
          'border border-border-color transition-colors',
          selectedTagId
            ? 'bg-accent/10 text-accent border-accent/30'
            : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
        )}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span>{selectedTag ? selectedTag.name : '标签筛选'}</span>
        {selectedTagId && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: selectedTag?.color }}
          />
        )}
        <svg
          className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div
          className={cn(
            'absolute left-0 top-full mt-1 z-50',
            'min-w-[180px] max-h-[280px] overflow-y-auto',
            'bg-bg-primary rounded-lg shadow-lg border border-border-color',
            'py-1'
          )}
        >
          {/* 清除筛选 */}
          <button
            onClick={() => {
              onSelectTag(null)
              setIsOpen(false)
            }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-left',
              'hover:bg-bg-secondary transition-colors',
              !selectedTagId && 'bg-accent/5'
            )}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="text-sm text-text-secondary">全部标签</span>
          </button>

          {/* 分隔线 */}
          {tags.length > 0 && <div className="h-px bg-border-color my-1" />}

          {/* 标签列表 */}
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => {
                onSelectTag(tag.id)
                setIsOpen(false)
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left',
                'hover:bg-bg-secondary transition-colors',
                selectedTagId === tag.id && 'bg-accent/5'
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-sm text-text-secondary truncate">{tag.name}</span>
            </button>
          ))}

          {/* 空状态 */}
          {tags.length === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-text-muted">暂无标签</p>
              <p className="text-xs text-text-tertiary mt-1">在设置中创建标签</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
