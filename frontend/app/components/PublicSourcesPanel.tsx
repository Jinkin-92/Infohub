'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { cn } from '../lib/utils'
import { publicSourcesApi } from '../lib/api'
import { PUBLIC_CATEGORY_CONFIG } from '../types'

interface PublicSourcesPanelProps {
  isOpen: boolean
  onClose: () => void
  onRefresh?: () => void
}

type CategorySlug = 'all' | 'tech' | 'news' | 'finance' | 'life' | 'design' | 'video' | 'aggregator'

const categories: { id: CategorySlug; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'tech', name: '科技' },
  { id: 'news', name: '新闻' },
  { id: 'finance', name: '财经' },
  { id: 'life', name: '生活' },
  { id: 'design', name: '设计' },
  { id: 'video', name: '视频' },
  { id: 'aggregator', name: '聚合' },
]

export function PublicSourcesPanel({ isOpen, onClose, onRefresh }: PublicSourcesPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategorySlug>('all')
  const [subscribedIds, setSubscribedIds] = useState<Set<number>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // 获取所有公开源
  const { data: sourcesData, mutate: mutateSources } = useSWR(
    'public-sources',
    () => publicSourcesApi.getAll(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )

  // 获取已订阅的 ID
  const { data: subscribedData, mutate: mutateSubscribed } = useSWR(
    'public-sources-subscribed',
    () => publicSourcesApi.getSubscribedIds(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )

  useEffect(() => {
    if (sourcesData?.sources && subscribedData?.subscribed_ids) {
      setIsLoading(false)
      setSubscribedIds(new Set(subscribedData.subscribed_ids))
    }
  }, [sourcesData, subscribedData])

  // 按分类过滤源
  const filteredSources = sourcesData?.sources?.filter(
    (source) => selectedCategory === 'all' || source.category === selectedCategory
  ) ?? []

  // 切换选择
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev))
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // 全选当前分类
  const selectAllCurrentCategory = () => {
    const ids = filteredSources.map((s) => s.id)
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev))
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  // 取消全选当前分类
  const deselectAllCurrentCategory = () => {
    const ids = new Set(filteredSources.map((s) => s.id))
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev))
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  // 订阅选中源
  const handleSubscribe = async () => {
    if (selectedIds.size === 0) return

    setIsSubscribing(true)
    try {
      await publicSourcesApi.subscribe(Array.from(selectedIds))
      setSubscribedIds((prev) => {
        const merged = new Set<number>()
        Array.from(prev).forEach((id) => merged.add(id))
        Array.from(selectedIds).forEach((id) => merged.add(id))
        return merged
      })
      setSelectedIds(new Set())
      void mutateSubscribed()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to subscribe:', error)
    } finally {
      setIsSubscribing(false)
    }
  }

  // 取消订阅
  const handleUnsubscribe = async (sourceId: number) => {
    try {
      await publicSourcesApi.unsubscribe([sourceId])
      setSubscribedIds((prev) => {
        const next = new Set(Array.from(prev))
        next.delete(sourceId)
        return next
      })
      setSelectedIds((prev) => {
        const next = new Set(Array.from(prev))
        next.delete(sourceId)
        return next
      })
      void mutateSubscribed()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 面板 */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-bg-secondary shadow-2xl animate-in slide-in-from-right duration-200"
        data-testid="public-sources-panel"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">添加公开订阅源</h2>
            <p className="text-sm text-text-secondary mt-0.5">勾选订阅源后点击确认</p>
          </div>
          <button
            onClick={onClose}
            data-testid="close-public-sources-panel"
            className="p-2 rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 分类标签栏 */}
        <div className="px-6 py-3 border-b border-border-color">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all',
                  selectedCategory === cat.id
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-primary hover:text-text-primary'
                )}
                style={
                  selectedCategory !== cat.id && cat.id !== 'all'
                    ? { backgroundColor: PUBLIC_CATEGORY_CONFIG[cat.id]?.color + '15', color: PUBLIC_CATEGORY_CONFIG[cat.id]?.color }
                    : undefined
                }
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3" style={{ height: 'calc(100vh - 200px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <svg className="h-8 w-8 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted">
              <svg className="h-12 w-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-lg font-medium">暂无{categories.find(c => c.id === selectedCategory)?.name}类订阅源</p>
            </div>
          ) : (
            filteredSources.map((source) => {
              const isSubscribed = subscribedIds.has(source.id)
              const isSelected = selectedIds.has(source.id)
              const config = PUBLIC_CATEGORY_CONFIG[source.category as CategorySlug]

              return (
                <div
                  key={source.id}
                  className={cn(
                    'flex items-center gap-4 rounded-xl border p-4 transition-all',
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-sm'
                      : 'border-border-color bg-bg-primary hover:border-accent/30'
                  )}
                >
                  {/* 选择框 */}
                  <button
                    onClick={() => {
                      if (isSubscribed) {
                        void handleUnsubscribe(source.id)
                      } else {
                        toggleSelect(source.id)
                      }
                    }}
                    className={cn(
                      'flex-shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all',
                      isSubscribed
                        ? 'bg-accent border-accent text-white'
                        : isSelected
                          ? 'border-accent bg-accent/10'
                          : 'border-border-color hover:border-accent/50'
                    )}
                  >
                    {isSubscribed || isSelected ? (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-text-primary truncate">{source.name}</h3>
                    {source.description && (
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{source.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-text-muted">{source.platform}</span>
                    </div>
                  </div>

                  {/* 订阅状态 */}
                  {isSubscribed ? (
                    <span className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-success border border-success/30 bg-success/5">
                      已订阅
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleSelect(source.id)}
                      className={cn(
                        'flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        isSelected
                          ? 'bg-accent text-white'
                          : 'bg-bg-tertiary text-text-secondary hover:bg-accent/10 hover:text-accent border border-transparent hover:border-accent/30'
                      )}
                    >
                      {isSelected ? '已选择' : '添加'}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* 底部操作栏 */}
        {selectedIds.size > 0 && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-4 border-t border-border-color bg-bg-secondary">
            <span className="text-sm font-medium text-text-primary">
              已选择 <span className="text-accent">{selectedIds.size}</span> 个
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-tertiary transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void handleSubscribe()}
                disabled={isSubscribing}
                className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isSubscribing ? '订阅中...' : '确认订阅'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
