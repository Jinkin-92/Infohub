'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { TabBar } from './components/TabBar'
import { FeedList } from './components/FeedList'
import { PublicSourcesPanel } from './components/PublicSourcesPanel'
import { SearchBar } from './components/SearchBar'
import { AddSourceModal } from './components/AddSourceModal'
import { SettingsModal } from './components/SettingsModal'
import { FavoriteFilter } from './components/FavoriteFilter'
import { feedApi, favoritesApi, settingsApi, sourcesApi } from './lib/api'
import { FavoriteTag } from './types'
import { cn } from './lib/utils'

// 两层 Tab 结构：
// - sourceType: 'custom' | 'public' (顶级：定制订阅源 / 公开订阅源)
// - 对于 'custom': platform ('all' | 'zhihu' | 'x' | 'wechat' | 'weibo' | 'bilibili' | 'youtube')
// - 对于 'public': category ('all' | 'tech' | 'news' | 'finance' | 'life' | 'design' | 'video' | 'aggregator')
export type SourceType = 'custom' | 'public'
export type CustomPlatform = 'all' | 'zhihu' | 'x' | 'wechat' | 'weibo' | 'bilibili' | 'youtube'
export type PublicCategory = 'all' | 'tech' | 'news' | 'finance' | 'life' | 'design' | 'video' | 'aggregator'

export interface TabState {
  sourceType: SourceType
  // 平台过滤（定制订阅源）
  platform?: CustomPlatform
  // 分类过滤（公开订阅源）
  category?: PublicCategory
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabState>({ sourceType: 'custom', platform: 'all' })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isPublicSourcesOpen, setIsPublicSourcesOpen] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [availableTags, setAvailableTags] = useState<FavoriteTag[]>([])
  const [tabVersion, setTabVersion] = useState(0)
  const [repairingCollector, setRepairingCollector] = useState(false)
  const [loadingFreshContent, setLoadingFreshContent] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const lastCompletedRefreshRef = useRef<string | null>(null)

  const { data: unreadData, mutate: mutateUnread } = useSWR(
    ['unread-breakdown', refreshTrigger],
    () => feedApi.getUnreadCount(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  )

  const { data: integrationsData, mutate: mutateIntegrations } = useSWR(
    'integrations-status',
    () => settingsApi.getIntegrations(),
    {
      refreshInterval: (data) => (data?.scheduler?.isCollecting ? 5000 : 30000),
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )

  useEffect(() => {
    favoritesApi.getTags().then((response) => {
      if (response.ok) {
        setAvailableTags(response.tags)
      }
    })
  }, [])

  useEffect(() => {
    let active = true

    const refreshOnPageLoad = async () => {
      setLoadingFreshContent(true)
      try {
        const response = await sourcesApi.collectAll()
        setRefreshMessage(
          response.refresh.alreadyRunning
            ? '订阅源正在后台刷新，内容会在完成后自动更新。'
            : '已开始后台刷新订阅源，最新内容会在完成后自动显示。'
        )
      } catch (error) {
        setRefreshMessage(error instanceof Error ? error.message : '启动刷新失败，请稍后重试。')
      } finally {
        if (!active) {
          return
        }
        void mutateIntegrations()
      }
    }

    void refreshOnPageLoad()

    return () => {
      active = false
    }
  }, [mutateIntegrations, mutateUnread])

  useEffect(() => {
    if (!integrationsData) {
      return
    }

    setLoadingFreshContent(integrationsData.scheduler.isCollecting)

    const completedAt = integrationsData.scheduler.lastSuccessAt
    if (
      !integrationsData.scheduler.isCollecting &&
      completedAt &&
      completedAt !== lastCompletedRefreshRef.current
    ) {
      lastCompletedRefreshRef.current = completedAt
      setRefreshTrigger((prev) => prev + 1)
      void mutateUnread()
      setRefreshMessage('订阅源刷新完成，内容已更新。')
    }
  }, [integrationsData, mutateUnread])

  // 根据当前 Tab 状态计算 API 参数
  const getFeedParams = useCallback(() => {
    if (activeTab.sourceType === 'public') {
      // 公开订阅源：不过滤 platform，只过滤 is_public
      return { platform: undefined, isPublic: true as const, category: activeTab.category }
    }
    // 定制订阅源
    return { platform: activeTab.platform === 'all' ? undefined : activeTab.platform, isPublic: false as const }
  }, [activeTab])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setSelectedTagId(null)
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const handleTagSelect = useCallback((tagId: number | null) => {
    setSelectedTagId(tagId)
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
    void mutateUnread()
    void mutateIntegrations()
  }, [mutateIntegrations, mutateUnread])

  const handleRepairCollector = useCallback(async () => {
    setRepairingCollector(true)
    try {
      await settingsApi.restartIntegrations()
      await mutateIntegrations()
      setRefreshTrigger((prev) => prev + 1)
      void mutateUnread()
    } finally {
      setRepairingCollector(false)
    }
  }, [mutateIntegrations, mutateUnread])

  const collectorIssue = !integrationsData?.rsshub.running
    ? {
        title: '采集服务已断开',
        description: '知乎等依赖本地 RSSHub 的订阅源目前不会自动更新，系统正在尝试恢复。',
      }
    : integrationsData?.scheduler.lastError
      ? {
          title: '最近一次刷新未完成',
          description: integrationsData.scheduler.lastError,
        }
      : null

  return (
    <main className="min-h-screen bg-bg-primary" data-testid="home-root">
      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab)
          setSelectedTagId(null)
          setTabVersion((v) => v + 1)
        }}
        onSettingsClick={() => setIsSettingsOpen(true)}
        unreadCounts={unreadData?.by_platform ?? {}}
      />

      <div className="w-full px-4 pb-2 pt-4 sm:px-6 lg:px-8">
        {collectorIssue && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{collectorIssue.title}</p>
                <p className="mt-1 text-sm text-amber-800">{collectorIssue.description}</p>
              </div>
              <button
                onClick={() => void handleRepairCollector()}
                disabled={repairingCollector}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {repairingCollector ? '修复中...' : '一键修复'}
              </button>
            </div>
          </div>
        )}

        {loadingFreshContent && !collectorIssue && (
          <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 shadow-sm">
            正在刷新订阅源并检查最新内容...
          </div>
        )}

        {refreshMessage && !loadingFreshContent && !collectorIssue && (
          <div className="mb-4 rounded-2xl border border-border-color bg-bg-secondary px-4 py-3 text-sm text-text-secondary shadow-sm">
            {refreshMessage}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchBar
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="搜索标题、摘要、作者..."
            className="flex-1"
          />
          <FavoriteFilter
            tags={availableTags}
            selectedTagId={selectedTagId}
            onSelectTag={handleTagSelect}
          />
        </div>
      </div>

      <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
        {/* 定制订阅源：显示添加按钮 */}
        {activeTab.sourceType === 'custom' && (
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setIsAddModalOpen(true)}
              data-testid="open-add-source-modal"
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加定制订阅源
            </button>
          </div>
        )}

        {/* 公开订阅源时显示分类标签栏 */}
        {activeTab.sourceType === 'public' && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {['all', 'tech', 'news', 'finance', 'life', 'design', 'video', 'aggregator'].map((cat) => {
                const label = cat === 'all' ? '全部' : cat === 'tech' ? '科技' : cat === 'news' ? '新闻' : cat === 'finance' ? '财经' : cat === 'life' ? '生活' : cat === 'design' ? '设计' : cat === 'video' ? '视频' : '聚合'
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveTab({ sourceType: 'public', category: cat as any })
                      setTabVersion((v) => v + 1)
                    }}
                    className={cn(
                      'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all',
                      activeTab.category === cat
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setIsPublicSourcesOpen(true)}
              data-testid="open-public-sources-panel"
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加公开RSS
            </button>
          </div>
        )}

        <FeedList
          key={`${activeTab.sourceType}-${activeTab.sourceType === 'public' ? activeTab.category : activeTab.platform}-${tabVersion}`}
          platform={activeTab.sourceType === 'public' ? undefined : (activeTab.platform === 'all' ? undefined : activeTab.platform)}
          isPublic={activeTab.sourceType === 'public'}
          category={activeTab.sourceType === 'public' ? (activeTab.category === 'all' ? undefined : activeTab.category) : undefined}
          searchQuery={searchQuery}
          tagId={selectedTagId}
          refreshTrigger={refreshTrigger}
          tabVersion={tabVersion}
          sourceUnreadCounts={unreadData?.by_source}
          onCountsChange={() => {
            void mutateUnread()
          }}
        />
      </div>

      {/* 公开订阅源添加面板 */}
      <PublicSourcesPanel
        isOpen={isPublicSourcesOpen}
        onClose={() => setIsPublicSourcesOpen(false)}
        onRefresh={handleRefresh}
      />

      <AddSourceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDataChange={handleRefresh}
      />
    </main>
  )
}
