'use client'

import { useState, useRef, useEffect } from 'react'
import { FavoriteTag } from '../types'
import { cn } from '../lib/utils'

interface FavoriteFilterProps {
  tags: FavoriteTag[]
  selectedTagId: number | null
  onSelectTag: (tagId: number | null) => void
  className?: string
}

/**
 * 收藏筛选组件
 */
export function FavoriteFilter({ tags, selectedTagId, onSelectTag, className }: FavoriteFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
          'border border-border-color transition-colors',
          selectedTagId
            ? 'bg-red-50 text-red-500 border-red-200'
            : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
        )}
      >
        <svg
          className="w-4 h-4"
          fill={selectedTagId ? 'currentColor' : 'none'}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        <span>{selectedTag ? selectedTag.name : '收藏筛选'}</span>
        <svg
          className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 top-full mt-1 z-50',
            'min-w-[180px] max-h-[280px] overflow-y-auto',
            'bg-bg-primary rounded-lg shadow-lg border border-border-color',
            'py-1'
          )}
        >
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
            <span className="text-sm text-text-secondary">全部内容</span>
          </button>

          {tags.length > 0 && <div className="h-px bg-border-color my-1" />}

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
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
              <span className="text-sm text-text-secondary truncate">{tag.name}</span>
            </button>
          ))}

          {tags.length === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-text-muted">暂无收藏标签</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
