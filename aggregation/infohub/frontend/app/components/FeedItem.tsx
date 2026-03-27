'use client'

import { useState } from 'react'
import { cn, formatDate, truncate } from '../lib/utils'
import { Item, PLATFORM_CONFIG } from '../types'
import { TagSelector } from './TagSelector'

interface FeedItemProps {
  item: Item
  availableTags?: import('../types').Tag[]
  onMarkAsRead?: (id: number) => void
  onAddTag?: (itemId: number, tagId: number) => Promise<void>
  onRemoveTag?: (itemId: number, tagId: number) => Promise<void>
}

export function FeedItem({
  item,
  availableTags = [],
  onMarkAsRead,
  onAddTag,
  onRemoveTag,
}: FeedItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [imageError, setImageError] = useState(false)

  const platform = PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.custom
  const isRead = item.is_read

  const handleClick = () => {
    if (!isRead && onMarkAsRead) {
      onMarkAsRead(item.id)
    }
  }

  const handleExpand = (event: React.MouseEvent) => {
    event.stopPropagation()
    setIsExpanded(!isExpanded)
    if (!isRead && onMarkAsRead) {
      onMarkAsRead(item.id)
    }
  }

  return (
    <article
      onClick={handleClick}
      className={cn(
        'group cursor-pointer rounded-card bg-bg-secondary p-4 shadow-card transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-card-hover',
        isRead && 'opacity-60'
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: platform.color }}
          />
          <span className="text-sm font-medium text-text-secondary">{platform.name}</span>
        </div>

        <span className="text-text-muted">·</span>

        {item.author && (
          <span className="max-w-[120px] truncate text-sm text-text-tertiary">{item.author}</span>
        )}

        <span className="ml-auto text-xs text-text-muted">{formatDate(item.published_at)}</span>

        {!isRead && <span className="h-2 w-2 rounded-full bg-unread" />}
      </div>

      <h3
        className={cn(
          'mb-2 text-lg font-semibold leading-tight transition-colors',
          isRead ? 'text-text-tertiary' : 'text-text-primary group-hover:text-accent'
        )}
      >
        {item.title}
      </h3>

      {item.cover_url && !imageError && (
        <div className="relative mb-3 overflow-hidden rounded-lg bg-bg-tertiary">
          <img
            src={item.cover_url}
            alt={item.title}
            onError={() => setImageError(true)}
            className="h-48 w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {item.summary && (
        <div className="relative">
          <p
            className={cn(
              'text-base leading-relaxed text-text-secondary',
              !isExpanded && 'line-clamp-3'
            )}
          >
            {isExpanded ? item.summary : truncate(item.summary, 200)}
          </p>

          {item.summary.length > 200 && (
            <button
              onClick={handleExpand}
              className="mt-2 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              {isExpanded ? '收起' : '展开阅读'}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 border-t border-border-color pt-3">
        {availableTags.length > 0 && onAddTag && onRemoveTag && (
          <TagSelector
            itemId={item.id}
            tags={item.tags || []}
            availableTags={availableTags}
            onAddTag={onAddTag}
            onRemoveTag={onRemoveTag}
            className="flex-1"
          />
        )}

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-accent"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          阅读原文
        </a>

        {!isRead && (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onMarkAsRead?.(item.id)
            }}
            className="flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-success"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            标记已读
          </button>
        )}
      </div>
    </article>
  )
}
