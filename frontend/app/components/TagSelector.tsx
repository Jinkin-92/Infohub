'use client'

import { useState, useRef, useEffect } from 'react'
import { Tag } from '../types'
import { cn } from '../lib/utils'
import { DropdownMenu } from './DropdownMenu'
import { SourceChip } from './SourceChip'

interface TagSelectorProps {
  itemId: number
  tags: Tag[]
  availableTags: Tag[]
  onAddTag: (itemId: number, tagId: number) => Promise<void>
  onRemoveTag: (itemId: number, tagId: number) => Promise<void>
  className?: string
}

/**
 * 标签选择器组件
 */
export function TagSelector({
  itemId,
  tags,
  availableTags,
  onAddTag,
  onRemoveTag,
  className,
}: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
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

  // 添加标签
  const handleAdd = async (tagId: number) => {
    if (isLoading) return
    setIsLoading(true)
    try {
      await onAddTag(itemId, tagId)
    } finally {
      setIsLoading(false)
      setIsOpen(false)
    }
  }

  // 移除标签
  const handleRemove = async (tagId: number) => {
    if (isLoading) return
    setIsLoading(true)
    try {
      await onRemoveTag(itemId, tagId)
    } finally {
      setIsLoading(false)
    }
  }

  // 获取未添加的标签
  const unselectedTags = availableTags.filter(
    (tag) => !tags.some((t) => t.id === tag.id)
  )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* 已选标签列表 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full',
              'transition-colors hover:opacity-80'
            )}
            style={{ backgroundColor: tag.color + '20', color: tag.color }}
          >
            {tag.name}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(tag.id)
              }}
              disabled={isLoading}
              className="ml-0.5 hover:opacity-70 disabled:opacity-50"
              aria-label={`移除标签 ${tag.name}`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}

        {/* 添加标签按钮 */}
        {unselectedTags.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full',
              'border border-dashed border-text-tertiary text-text-tertiary',
              'hover:border-accent hover:text-accent transition-colors',
              'disabled:opacity-50'
            )}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加标签
          </button>
        )}
      </div>

      {/* 下拉选择面板 */}
      {isOpen && unselectedTags.length > 0 && (
        <DropdownMenu className="min-w-[160px] max-h-[200px]">
          {unselectedTags.map((tag) => (
            <SourceChip
              key={tag.id}
              onClick={(e) => {
                e.stopPropagation()
                handleAdd(tag.id)
              }}
              disabled={isLoading}
              accentColor={tag.color}
              className="w-full justify-start rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              dot={
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
              }
            >
              <span className="truncate">{tag.name}</span>
            </SourceChip>
          ))}
        </DropdownMenu>
      )}
    </div>
  )
}
