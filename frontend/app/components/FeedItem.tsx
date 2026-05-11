'use client'

import { useState, useCallback } from 'react'
import { cn, formatDate, truncate } from '../lib/utils'
import { Item, PLATFORM_CONFIG } from '../types'
import { translateApi } from '../lib/api'

interface FeedItemProps {
  item: Item
  onMarkAsRead?: (id: number) => void
}

export function FeedItem({
  item,
  onMarkAsRead,
}: FeedItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null)
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)

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

  const handleTranslate = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (showTranslation) {
      setShowTranslation(false)
      return
    }
    // 如果已有译文，直接显示
    if (translatedSummary && translatedTitle) {
      setShowTranslation(true)
      return
    }
    setIsTranslating(true)
    try {
      // 并行翻译标题和摘要
      const [titleResult, summaryResult] = await Promise.all([
        translateApi.translate(item.title, 'zh-CN', 'en'),
        translateApi.translate(item.summary || '', 'zh-CN', 'en')
      ])
      if (titleResult.ok && titleResult.translatedText) {
        setTranslatedTitle(titleResult.translatedText)
      }
      if (summaryResult.ok && summaryResult.translatedText) {
        setTranslatedSummary(summaryResult.translatedText)
      }
      setShowTranslation(true)
    } finally {
      setIsTranslating(false)
    }
  }, [item.title, item.summary, translatedSummary, translatedTitle, showTranslation])

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
        {showTranslation && translatedTitle && (
          <span className="ml-2 text-sm font-normal text-text-muted">/ {translatedTitle}</span>
        )}
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
          {showTranslation && translatedSummary ? (
            <div className="space-y-2">
              <p className="text-base leading-relaxed text-text-secondary">
                {isExpanded ? item.summary : truncate(item.summary, 200)}
              </p>
              <p className="text-base leading-relaxed text-text-muted italic border-l-2 border-accent pl-3">
                {isExpanded ? translatedSummary : truncate(translatedSummary, 200)}
              </p>
              {item.summary.length > 200 && !isExpanded && (
                <button
                  onClick={handleExpand}
                  className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  展开阅读
                </button>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 border-t border-border-color pt-3">
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

        {item.summary && (
          <button
            onClick={handleTranslate}
            disabled={isTranslating}
            className="flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-accent disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
              />
            </svg>
            {isTranslating ? '翻译中...' : showTranslation ? '原文' : '翻译'}
          </button>
        )}
      </div>
    </article>
  )
}
