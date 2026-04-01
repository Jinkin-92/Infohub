'use client'

import { useEffect, useState, useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { feedApi, itemTagsApi, sourcesApi, tagsApi } from '../lib/api'
import { Item, Source, Tag, PLATFORM_CONFIG } from '../types'
import { cn, formatDate } from '../lib/utils'

interface FeedListProps {
  platform?: string
  searchQuery?: string
  tagId?: number | null
  refreshTrigger?: number
  sourceUnreadCounts?: Record<string, number>
  onCountsChange?: () => void
}

interface SourceCardGroup {
  source: Source
  title: string
  items: Item[]
}

interface DateSection {
  key: string
  label: string
  subtitle: string
  groups: SourceCardGroup[]
}

const PAGE_SIZE = 20
const CARD_HEIGHT = 420

function getDateKey(value: string): string {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateLabel(value: string): { label: string; subtitle: string } {
  const date = new Date(value)
  const today = new Date()
  const todayKey = getDateKey(today.toISOString())
  const rowKey = getDateKey(value)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayKey = getDateKey(yesterday.toISOString())
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)

  if (rowKey === todayKey) {
    return { label: '今天', subtitle: weekday }
  }

  if (rowKey === yesterdayKey) {
    return { label: '昨天', subtitle: weekday }
  }

  return {
    label: new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date),
    subtitle: weekday,
  }
}

function getFallbackSourceLabel(source: Source): string {
  if (source.platform === 'bilibili' && source.platform_id) {
    return `B站 · ${source.platform_id}`
  }

  if (source.platform === 'zhihu' && source.platform_id) {
    return `知乎 · ${source.platform_id}`
  }

  return source.name || source.platform_id || source.platform
}

function getSourceTone(source: Source, sourceId: number): { header: string; body: string; border: string } {
  const baseColor = PLATFORM_CONFIG[source.platform]?.color ?? '#6B7280'
  const seed = (sourceId * 37) % 100
  const alpha = 0.12 + (seed % 4) * 0.03
  return {
    header: `linear-gradient(135deg, ${baseColor}${Math.round(alpha * 255).toString(16).padStart(2, '0')}, ${baseColor}22)`,
    body: `${baseColor}08`,
    border: `${baseColor}33`,
  }
}

function buildSections(items: Item[], sources: Source[]): DateSection[] {
  const sourceMap = new Map(sources.map((source) => [source.id, source]))
  const sourcePrimaryAuthor = new Map<number, string>()

  for (const item of items) {
    if (!item.author || sourcePrimaryAuthor.has(item.source_id)) {
      continue
    }
    sourcePrimaryAuthor.set(item.source_id, item.author)
  }

  const sections = new Map<string, Map<number, Item[]>>()
  for (const item of items) {
    const dateKey = getDateKey(item.published_at)
    const sourceItems = sections.get(dateKey) ?? new Map<number, Item[]>()
    const bucket = sourceItems.get(item.source_id) ?? []
    bucket.push(item)
    sourceItems.set(item.source_id, bucket)
    sections.set(dateKey, sourceItems)
  }

  return Array.from(sections.entries()).map(([key, sourceGroups]) => {
    const formatted = formatDateLabel(`${key}T00:00:00`)
    const groups = Array.from(sourceGroups.entries())
      .map(([sourceId, groupedItems]) => {
        const source = sourceMap.get(sourceId)
        if (!source) {
          return null
        }

        return {
          source,
          title: sourcePrimaryAuthor.get(sourceId) || getFallbackSourceLabel(source),
          items: groupedItems.sort(
            (left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
          ),
        }
      })
      .filter(Boolean) as SourceCardGroup[]

    return {
      key,
      label: formatted.label,
      subtitle: `${key} · ${formatted.subtitle}`,
      groups,
    }
  })
}

export function FeedList({
  platform,
  searchQuery,
  tagId,
  refreshTrigger,
  sourceUnreadCounts = {},
  onCountsChange,
}: FeedListProps) {
  const [items, setItems] = useState<Item[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isTabSwitching, setIsTabSwitching] = useState(false)
  const { cache } = useSWRConfig()

  const { data: tagsData } = useSWR('tags', () => tagsApi.getAll(), {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  })
  const availableTags = tagsData?.tags || []

  const { data: sourcesData } = useSWR(
    ['sources-status', refreshTrigger],
    () => sourcesApi.getAll(),
    {
      revalidateOnFocus: false,
    }
  )
  const sources = (sourcesData?.sources || []).filter(
    (source) => source.enabled && (!platform || source.platform === platform)
  )

  // Only show error if the current platform's sources are ALL in error state
  // This prevents showing stale errors when switching tabs
  const allSourcesErrored = sources.length > 0 && sources.every((source: Source) => source.status === 'error')
  const erroredSources = allSourcesErrored ? sources : []

  const { data, error, isLoading, mutate } = useSWR(
    ['feed', platform, searchQuery, tagId, offset],
    () => {
      if (tagId) {
        return tagsApi.getItems(tagId, { limit: PAGE_SIZE, offset })
      }

      return feedApi.getFeed({
        platform,
        search: searchQuery,
        limit: PAGE_SIZE,
        offset,
      })
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 0,
    }
  )

  useEffect(() => {
    if (!data?.items) {
      return
    }

    if (offset === 0) {
      setItems(data.items)
    } else {
      setItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        const newItems = data.items.filter((item) => !existingIds.has(item.id))
        return [...prev, ...newItems]
      })
    }

    setHasMore(data.pagination.hasMore)
  }, [data, offset])

  useEffect(() => {
    setItems([])
    setOffset(0)
    setHasMore(true)
    setIsTabSwitching(true)
    // Clear SWR cache for this key to ensure fresh fetch, not cached error/empty state
    const cacheKey = ['feed', platform, searchQuery, tagId, 0]
    cache.delete(cacheKey)
    // Trigger revalidation and wait for it to complete before clearing the switching state
    mutate()
      .catch(() => {}) // Ignore errors, they'll be handled by SWR's error state
      .finally(() => setIsTabSwitching(false))
  }, [platform, searchQuery, tagId, mutate, cache])

  useEffect(() => {
    if (!refreshTrigger || refreshTrigger <= 0) {
      return
    }

    setItems([])
    setOffset(0)
    setHasMore(true)
    void mutate()
  }, [refreshTrigger, mutate])

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setOffset((prev) => prev + PAGE_SIZE)
    setIsLoadingMore(false)
  }, [hasMore, isLoadingMore])

  const handleMarkAsRead = useCallback(
    async (id: number) => {
      const item = items.find((candidate) => candidate.id === id)
      if (!item || item.is_read) {
        return
      }

      setItems((prev) =>
        prev.map((candidate) =>
          candidate.id === id ? { ...candidate, is_read: true } : candidate
        )
      )

      try {
        await feedApi.markAsRead(id)
        onCountsChange?.()
      } catch (readError) {
        console.error('Failed to mark item as read:', readError)
        setItems((prev) =>
          prev.map((candidate) =>
            candidate.id === id ? { ...candidate, is_read: false } : candidate
          )
        )
      }
    },
    [items, onCountsChange]
  )

  const handleMarkAllAsRead = useCallback(async () => {
    const unreadItems = items.filter((item) => !item.is_read)
    if (unreadItems.length === 0) {
      return
    }

    setItems((prev) => prev.map((item) => ({ ...item, is_read: true })))

    try {
      await feedApi.markAllAsRead(platform)
      onCountsChange?.()
    } catch (readError) {
      console.error('Failed to mark all items as read:', readError)
      void mutate()
    }
  }, [items, mutate, onCountsChange, platform])

  const handleAddTag = useCallback(
    async (itemId: number, targetTagId: number) => {
      const tag = availableTags.find((candidate) => candidate.id === targetTagId)
      if (!tag) {
        return
      }

      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) {
            return item
          }

          const currentTags = item.tags || []
          if (currentTags.some((candidate) => candidate.id === targetTagId)) {
            return item
          }

          return { ...item, tags: [...currentTags, tag] }
        })
      )

      try {
        await itemTagsApi.addTag(itemId, targetTagId)
      } catch (tagError) {
        console.error('Failed to add tag:', tagError)
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  tags: (item.tags || []).filter((candidate) => candidate.id !== targetTagId),
                }
              : item
          )
        )
      }
    },
    [availableTags]
  )

  const handleRemoveTag = useCallback(async (itemId: number, targetTagId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, tags: (item.tags || []).filter((candidate) => candidate.id !== targetTagId) }
          : item
      )
    )

    try {
      await itemTagsApi.removeTag(itemId, targetTagId)
    } catch (tagError) {
      console.error('Failed to remove tag:', tagError)

      try {
        const response = await itemTagsApi.getTags(itemId)
        setItems((prev) =>
          prev.map((item) => (item.id === itemId ? { ...item, tags: response.tags } : item))
        )
      } catch {
        // Ignore rollback failures.
      }
    }
  }, [])

  if ((isLoading || isTabSwitching) && items.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-[420px] animate-pulse rounded-2xl bg-white p-4 shadow-card"
          >
            <div className="mb-4 h-12 rounded-xl bg-gray-200" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((__, childIndex) => (
                <div key={childIndex} className="h-20 rounded-xl bg-gray-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 h-16 w-16 text-gray-300">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-medium text-text-primary">加载失败</h3>
        <p className="mb-4 text-text-secondary">请检查网络连接后重试</p>
        <button
          onClick={() => void mutate()}
          className="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover"
        >
          重试
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    const primaryError = erroredSources[0]

    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 h-16 w-16 text-text-muted">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-medium text-text-primary">
          {searchQuery ? '没有找到相关内容' : primaryError ? '订阅源采集失败' : '暂无内容'}
        </h3>
        <p className="max-w-xl text-center text-text-secondary">
          {searchQuery
            ? `搜索 "${searchQuery}" 没有结果`
            : primaryError
              ? primaryError.last_error || '当前订阅源抓取失败，请在设置中查看错误详情。'
              : '该订阅源暂时没有新内容'}
        </p>
        {!searchQuery && primaryError && (
          <p className="mt-2 text-sm text-text-muted">最近失败源：{primaryError.name}</p>
        )}
      </div>
    )
  }

  const unreadCount = items.filter((item) => !item.is_read).length
  const sections = buildSections(items, sources).filter((section) => section.groups.length > 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 py-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-text-secondary">
            {searchQuery ? (
              <>
                搜索 "<span className="font-medium text-text-primary">{searchQuery}</span>" 找到 {items.length} 条结果
              </>
            ) : (
              <>
                共 {items.length} 条内容，分布在 {sections.length} 个日期分组中
              </>
            )}
            {!searchQuery && unreadCount > 0 && (
              <span className="ml-2 font-medium text-accent">{unreadCount} 条待处理</span>
            )}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            同一天的动态会聚合成统一卡片墙，只展示当天有更新的 up 主。
          </p>
        </div>

        {!searchQuery && unreadCount > 0 && (
          <button
            onClick={() => void handleMarkAllAsRead()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-accent/10 hover:text-accent"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            全部标记已读
          </button>
        )}
      </div>

      {sections.map((section) => (
        <section key={section.key} className="space-y-4">
          <div className="flex items-end justify-between border-b border-border-color pb-3">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">{section.label}</h2>
              <p className="mt-1 text-sm text-text-muted">{section.subtitle}</p>
            </div>
            <span className="rounded-full bg-bg-secondary px-3 py-1 text-xs font-medium text-text-secondary shadow-card">
              {section.groups.length} 个订阅源有更新
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {section.groups.map((group) => {
              const tone = getSourceTone(group.source, group.source.id)
              const updateCount = sourceUnreadCounts[String(group.source.id)] ?? 0

              return (
                <article
                  key={`${section.key}-${group.source.id}`}
                  className="overflow-hidden rounded-2xl border shadow-card transition-shadow hover:shadow-card-hover"
                  style={{
                    height: `${CARD_HEIGHT}px`,
                    borderColor: tone.border,
                    backgroundColor: tone.body,
                  }}
                >
                  <header
                    className="flex items-start justify-between gap-3 border-b border-white/50 px-4 py-4"
                    style={{ background: tone.header }}
                  >
                    <div>
                      <h3 className="text-base font-semibold text-text-primary">{group.title}</h3>
                      <p className="mt-1 text-xs text-text-secondary">{group.source.platform}</p>
                    </div>
                    <span className="rounded-full bg-white/75 px-2 py-1 text-xs font-semibold text-text-primary">
                      {group.items.length} 条
                    </span>
                  </header>

                  <div className="flex items-center justify-between px-4 py-3 text-xs text-text-secondary">
                    <span>总更新 {updateCount}</span>
                    <span>{group.source.status === 'active' ? '采集正常' : '采集中断'}</span>
                  </div>

                  <div className="h-[calc(100%-112px)] overflow-y-auto px-3 pb-3">
                    <div className="space-y-3">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'rounded-xl border bg-white/85 p-3 transition-all',
                            !item.is_read && 'border-accent/30 shadow-sm',
                            item.is_read && 'opacity-70'
                          )}
                        >
                          <div className="mb-2 flex items-start gap-2">
                            {!item.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-unread" />}
                            <button
                              onClick={() => void handleMarkAsRead(item.id)}
                              className="flex-1 text-left text-sm font-semibold leading-6 text-text-primary transition-colors hover:text-accent"
                            >
                              {item.title}
                            </button>
                          </div>

                          {item.summary && (
                            <p className="line-clamp-3 text-sm leading-6 text-text-secondary">
                              {item.summary}
                            </p>
                          )}

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs text-text-muted">{formatDate(item.published_at)}</span>
                            <div className="flex items-center gap-2">
                              {availableTags.length > 0 && (
                                <select
                                  className="rounded-lg border border-border-color bg-white px-2 py-1 text-xs text-text-secondary"
                                  defaultValue=""
                                  onChange={(event) => {
                                    const value = Number(event.target.value)
                                    if (value) {
                                      void handleAddTag(item.id, value)
                                      event.target.value = ''
                                    }
                                  }}
                                >
                                  <option value="">加标签</option>
                                  {availableTags
                                    .filter(
                                      (tag: Tag) => !(item.tags || []).some((current) => current.id === tag.id)
                                    )
                                    .map((tag: Tag) => (
                                      <option key={tag.id} value={tag.id}>
                                        {tag.name}
                                      </option>
                                    ))}
                                </select>
                              )}
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                              >
                                查看原文
                              </a>
                            </div>
                          </div>

                          {(item.tags || []).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(item.tags || []).map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => void handleRemoveTag(item.id, tag.id)}
                                  className="rounded-full px-2 py-1 text-xs font-medium"
                                  style={{
                                    backgroundColor: `${tag.color}20`,
                                    color: tag.color,
                                  }}
                                >
                                  {tag.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}

      {hasMore && (
        <div className="flex justify-center py-8">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className={cn(
              'rounded-lg border border-gray-200 bg-white px-6 py-3 font-medium text-text-secondary shadow-card transition-all hover:border-gray-300 hover:shadow-card-hover',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {isLoadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="py-8 text-center text-sm text-text-muted">已经到底了</div>
      )}
    </div>
  )
}
