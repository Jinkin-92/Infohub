'use client'

import { useEffect, useState, useCallback } from 'react'
import useSWR from 'swr'
import { feedApi, favoritesApi, sourcesApi } from '../lib/api'
import { Item, Source, FavoriteTag } from '../types'
import { cn, formatDate, getSourceColor, getSourceTone } from '../lib/utils'
import { useDisplaySettings } from './DisplaySettingsContext'

interface FeedListProps {
  platform?: string
  isPublic?: boolean
  category?: string
  searchQuery?: string
  tagId?: number | null
  refreshTrigger?: number
  tabVersion?: number
  sourceUnreadCounts?: Record<string, number>
  onCountsChange?: () => void
  selectedSourceId?: number
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

const PAGE_SIZE = 300
const CARD_HEIGHT = 380
const INITIAL_DAY_WINDOW = 3
const MAX_DAY_WINDOW = 30

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
          title: source.name || sourcePrimaryAuthor.get(sourceId) || getFallbackSourceLabel(source),
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
  isPublic = false,
  category,
  searchQuery,
  tagId,
  refreshTrigger,
  tabVersion = 0,
  sourceUnreadCounts = {},
  onCountsChange,
  selectedSourceId,
}: FeedListProps) {
  const [items, setItems] = useState<Item[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isTabSwitching, setIsTabSwitching] = useState(false)
  // dayWindow: 当前加载的天数窗口（3天起步，每次+3，直到30天）
  const [dayWindow, setDayWindow] = useState(INITIAL_DAY_WINDOW)
  // 是否在扩展窗口模式（窗口扩展阶段不用offset，每次从最新开始）
  const [isExpanding, setIsExpanding] = useState(true)
  // 展开的条目ID集合
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(new Set())

  const { settings: displaySettings } = useDisplaySettings()

  const { data: tagsData } = useSWR('favorites', () => favoritesApi.getTags(), {
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
    (source) => source.enabled && (!platform || source.platform === platform) && (!selectedSourceId || source.id === selectedSourceId)
  )

  // 所有当前栏目下的订阅源（用于下拉选择器）
  // 定制源：按 platform 过滤；公开源：按 category 过滤
  const allSourcesForTab = (sourcesData?.sources || []).filter(
    (source) => source.enabled &&
      (!platform || source.platform === platform) &&
      (isPublic ? source.is_public && (!category || source.category === category) : !source.is_public)
  )

  // Only show error if the current platform's sources are ALL in error state
  // This prevents showing stale errors when switching tabs
  const allSourcesErrored = sources.length > 0 && sources.every((source: Source) => source.status === 'error')
  const erroredSources = allSourcesErrored ? sources : []

  const { data, error, isLoading, mutate } = useSWR(
    ['feed', platform, isPublic, category, selectedSourceId, searchQuery, tagId, offset, dayWindow, isExpanding, tabVersion, refreshTrigger],
    () => {
      if (tagId) {
        return favoritesApi.getItemsByTag(tagId, {
          limit: PAGE_SIZE,
          offset,
        })
      }

      // 扩展模式(isExpanding=true): dayWindow不断扩大, offset=0
      // 翻页模式(isExpanding=false): dayWindow固定30, offset递增
      const days = isExpanding ? dayWindow : MAX_DAY_WINDOW

      return feedApi.getFeed({
        platform,
        sourceId: selectedSourceId,
        is_public: isPublic ? 'true' : 'false',
        category: isPublic ? (category ?? undefined) : undefined,
        search: searchQuery,
        limit: PAGE_SIZE,
        offset: isExpanding ? 0 : offset,
        days,
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
      setItems(data.items as Item[])
    } else {
      setItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        const newItems = (data.items as Item[]).filter((item: Item) => !existingIds.has(item.id))
        return [...prev, ...newItems]
      })
    }

    // 扩展模式：用户点击"加载更多"后扩大窗口（由 loadMore 处理）
    // 翻页模式：继续翻页
    // 只有当内容不足一页时才结束
    if (tagId) {
      setHasMore(Boolean(data.pagination?.hasMore))
    } else if (isExpanding) {
      setHasMore(dayWindow < MAX_DAY_WINDOW)
    } else {
      setHasMore(Boolean(data.pagination?.hasMore))
    }
  }, [data, offset, dayWindow, isExpanding, tagId])

  useEffect(() => {
    if (tagId || !isExpanding || offset !== 0 || searchQuery) {
      return
    }

    if ((data?.items?.length ?? 0) !== 0 || dayWindow >= MAX_DAY_WINDOW) {
      return
    }

    setDayWindow(MAX_DAY_WINDOW)
  }, [data?.items?.length, dayWindow, isExpanding, offset, searchQuery, tagId])

  useEffect(() => {
    setItems([])
    setOffset(0)
    setHasMore(false)
    setDayWindow(3) // 重置为初始 3 天窗口
    setIsExpanding(true) // 重置为扩展模式
    setIsTabSwitching(true)
    // State changes will trigger useSWR to re-fetch with new offset=0
    // Just need to wait for the fetch to complete
    const timer = setTimeout(() => setIsTabSwitching(false), 1000)
    return () => clearTimeout(timer)
  }, [platform, category, searchQuery, tagId, tabVersion])

  useEffect(() => {
    setDayWindow(INITIAL_DAY_WINDOW)
    setIsExpanding(true)
    setIsTabSwitching(true)

    const timer = setTimeout(() => setIsTabSwitching(false), 1000)
    return () => clearTimeout(timer)
  }, [platform, category, searchQuery, tagId, tabVersion])

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

    if (isExpanding) {
      // 扩展模式：扩大天数窗口
      setDayWindow((prev) => {
        const next = prev + 3
        if (next >= 30) {
          setIsExpanding(false) // 达到30天，切到翻页模式
          return 30
        }
        return next
      })
    } else {
      // 翻页模式：增加 offset
      setOffset((prev) => prev + PAGE_SIZE)
    }

    setIsLoadingMore(false)
  }, [hasMore, isLoadingMore, isExpanding])

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

  const handleToggleFavorite = useCallback(
    async (item: Item, tagId?: number) => {
      if (item.favorite) {
        // 取消收藏
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, favorite: undefined } : i))
        )
        try {
          await favoritesApi.removeFavorite(item.id)
        } catch (err) {
          console.error('Failed to remove favorite:', err)
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, favorite: item.favorite } : i))
          )
        }
      } else {
        // 添加收藏（默认"稍后阅读"）
        const targetTagId = tagId ?? availableTags.find((t) => t.name === '稍后阅读')?.id
        if (!targetTagId) return

        const tag = availableTags.find((t) => t.id === targetTagId)
        if (!tag) return

        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, favorite: tag } : i))
        )
        try {
          await favoritesApi.setFavorite(item.id, targetTagId)
        } catch (err) {
          console.error('Failed to add favorite:', err)
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, favorite: undefined } : i))
          )
        }
      }
    },
    [availableTags]
  )

  const handleToggleExpand = useCallback((itemId: number) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }, [])

  if ((isLoading || isTabSwitching) && items.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-[420px] animate-pulse rounded-2xl bg-bg-secondary p-4 shadow-card"
          >
            <div className="mb-4 h-12 rounded-xl bg-bg-tertiary" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((__, childIndex) => (
                <div key={childIndex} className="h-20 rounded-xl bg-bg-tertiary" />
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
        <div className="mb-4 h-16 w-16 text-text-muted">
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
        <p className="mb-2 text-center text-text-secondary">
          {error instanceof Error ? error.message : '本地服务暂时不可用，请稍后重试。'}
        </p>
        <p className="mb-4 text-center text-sm text-text-muted">
          可先检查后端健康页：http://127.0.0.1:3002/health
        </p>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {section.groups.map((group) => {
              const tone = getSourceTone(group.source, group.source.id)
              const updateCount = sourceUnreadCounts[String(group.source.id)] ?? 0

              // Display settings applied as classes
              const densityClass = {
                compact: 'py-1.5 px-2',
                normal: 'py-2 px-3',
                spacious: 'py-3 px-4',
              }[displaySettings.card_density]
              const spacingClass = {
                tight: 'leading-tight',
                normal: 'leading-normal',
                relaxed: 'leading-relaxed',
              }[displaySettings.line_spacing]
              const fontClass = {
                small: 'text-xs',
                medium: 'text-sm',
                large: 'text-base',
              }[displaySettings.font_size]

              return (
                <article
                  key={`${section.key}-${group.source.id}`}
                  className={`relative overflow-hidden rounded-2xl border shadow-card transition-all duration-150 hover:shadow-card-hover hover:-translate-y-0.5 ${densityClass}`}
                  style={{
                    height: `${CARD_HEIGHT}px`,
                    borderColor: tone.border,
                    backgroundColor: tone.body,
                  }}
                >
                  <header
                    className={`flex items-start justify-between gap-3 border-b border-white/50 ${displaySettings.card_density === 'compact' ? 'px-3 py-2' : displaySettings.card_density === 'spacious' ? 'px-5 py-4' : 'px-4 py-3'}`}
                    style={{ background: tone.header }}
                  >
                    <div>
                      <h3 className={`font-semibold text-text-primary ${fontClass}`}>{group.title}</h3>
                      <p className={`mt-0.5 text-text-secondary ${displaySettings.font_size === 'small' ? 'text-[10px]' : displaySettings.font_size === 'large' ? 'text-xs' : 'text-xs'}`}>{group.source.platform}</p>
                    </div>
                    {updateCount > 0 && (
                      <span className="absolute top-2 right-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {updateCount > 99 ? '99+' : updateCount}
                      </span>
                    )}
                  </header>

                  <div className="flex items-center justify-between px-4 py-2 text-xs text-text-secondary">
                    <span className="flex items-center gap-1">
                      {updateCount > 0 && (
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {updateCount > 99 ? '99+' : updateCount}
                        </span>
                      )}
                      <span>总更新 {updateCount}</span>
                    </span>
                    <span>{group.source.status === 'active' ? '采集正常' : '采集中断'}</span>
                  </div>

                  <div className="h-[calc(100%-100px)] overflow-y-auto px-2 pb-2">
                    <div className={cn('space-y-2', spacingClass)}>
                      {group.items.map((item) => {
                        const isExpanded = expandedItemIds.has(item.id)
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'rounded-lg border border-border-color bg-bg-secondary/85 transition-all',
                              !item.is_read && 'border-accent/30 shadow-sm',
                              item.is_read && 'opacity-70',
                              isExpanded && 'bg-bg-secondary'
                            )}
                            style={isExpanded ? { borderLeft: '3px solid #4CA6E1' } : undefined}
                          >
                            <div
                              className="flex items-start gap-2 p-2 cursor-pointer hover:bg-accent/5"
                              onClick={() => handleToggleExpand(item.id)}
                            >
                              {!item.is_read && <span className="mt-0.5 h-2 w-2 rounded-full bg-unread flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className={cn('font-medium leading-5 text-text-primary hover:text-accent', fontClass)}>
                                  {item.title}
                                </div>
                                {item.summary && !isExpanded && (
                                  <p className={cn('line-clamp-2 text-text-secondary', displaySettings.font_size === 'small' ? 'text-[10px] leading-4' : displaySettings.font_size === 'large' ? 'text-sm leading-6' : 'text-xs leading-5')}>
                                    {item.summary}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* 展开区域 */}
                            {isExpanded && (
                              <div className="px-2 pb-2 border-t border-border-color bg-[#F8FBFF]">
                                <div className="pt-2">
                                  {item.summary ? (
                                    <p className="text-sm leading-5 text-[#555555] mb-2">
                                      {item.summary.length > 400 ? item.summary.slice(0, 400) + '...' : item.summary}
                                    </p>
                                  ) : (
                                    <p className="text-sm text-text-muted mb-2">暂无摘要，请查看原文</p>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-[#AAAAAA]">
                                      {new Date(item.published_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleExpand(item.id); }}
                                        className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary"
                                      >
                                        ∧ 收起
                                      </button>
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => void handleMarkAsRead(item.id)}
                                        className="px-2 py-1 text-xs font-medium text-accent hover:text-accent-hover"
                                      >
                                        ↗ 查看原文
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 未展开时的底部操作栏 */}
                            {!isExpanded && (
                              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                                <span className="text-xs text-text-muted">{formatDate(item.published_at)}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); void handleToggleFavorite(item); }}
                                    className={cn(
                                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors',
                                      item.favorite
                                        ? 'text-red-500 hover:text-red-600'
                                        : 'text-text-muted hover:text-red-500'
                                    )}
                                    title={item.favorite ? item.favorite.name : '添加收藏'}
                                  >
                                    <svg className="h-3.5 w-3.5" fill={item.favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                  </button>
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => void handleMarkAsRead(item.id)}
                                    className="text-xs font-medium text-accent hover:text-accent-hover"
                                  >
                                    查看原文
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
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
              'rounded-lg border border-border-color bg-bg-secondary px-6 py-3 font-medium text-text-secondary shadow-card transition-all hover:border-accent/30 hover:shadow-card-hover',
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
