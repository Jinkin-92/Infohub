'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { TabBar } from './components/TabBar'
import { FeedList } from './components/FeedList'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PublicSourcesPanel } from './components/PublicSourcesPanel'
import { SearchBar } from './components/SearchBar'
import { AddSourceModal } from './components/AddSourceModal'
import { SettingsModal } from './components/SettingsModal'
import { FavoriteFilter } from './components/FavoriteFilter'
import { StatusBanner } from './components/StatusBanner'
import { ActionButton } from './components/ActionButton'
import { SourceChip } from './components/SourceChip'
import { feedApi, favoritesApi, settingsApi, sourcesApi } from './lib/api'
import { FavoriteTag } from './types'
import { cn } from './lib/utils'

export type SourceType = 'custom' | 'public'
export type CustomPlatform = 'all' | 'zhihu' | 'x' | 'wechat' | 'weibo' | 'bilibili' | 'youtube'
export type PublicCategory = 'all' | 'tech' | 'news' | 'finance' | 'life' | 'design' | 'video' | 'aggregator'

export interface TabState {
  sourceType: SourceType
  platform?: CustomPlatform
  category?: PublicCategory
}

const PUBLIC_CATEGORIES: PublicCategory[] = ['all', 'tech', 'news', 'finance', 'life', 'design', 'video', 'aggregator']

const PUBLIC_CATEGORY_LABELS: Record<PublicCategory, string> = {
  all: '全部',
  tech: '科技',
  news: '新闻',
  finance: '财经',
  life: '生活',
  design: '设计',
  video: '视频',
  aggregator: '聚合',
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
        if (!active) {
          return
        }

        setRefreshMessage(
          response.refresh.alreadyRunning
            ? '后台刷新已经在进行中，页面先显示上次同步内容，完成后会自动更新。'
            : '已开始后台刷新，页面先显示上次同步内容，完成后会自动更新。'
        )
      } catch (error) {
        if (!active) {
          return
        }

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
  }, [mutateIntegrations])

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

      <div className="mx-auto max-w-content px-4 pb-2 pt-4 sm:px-6 lg:px-8">
        {collectorIssue && (
          <StatusBanner
            variant="warning"
            title={collectorIssue.title}
            description={collectorIssue.description}
            actionLabel={repairingCollector ? '修复中...' : '一键修复'}
            actionDisabled={repairingCollector}
            onAction={() => void handleRepairCollector()}
            className="mb-4"
          />
        )}

        {loadingFreshContent && !collectorIssue && (
          <StatusBanner
            variant="info"
            title="正在后台刷新订阅源"
            description="当前先显示上次同步内容，刷新完成后会自动更新到最新内容。"
            className="mb-4"
          />
        )}

        {refreshMessage && !loadingFreshContent && !collectorIssue && (
          <StatusBanner
            variant="success"
            title="刷新状态"
            description={refreshMessage}
            className="mb-4"
          />
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

      <div className="mx-auto max-w-content px-4 py-4 sm:px-6 lg:px-8">
        {activeTab.sourceType === 'custom' && (
          <div className="mb-4 flex items-center justify-end">
            <ActionButton
              onClick={() => setIsAddModalOpen(true)}
              data-testid="open-add-source-modal"
              variant="primary"
              size="md"
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              添加定制订阅源
            </ActionButton>
          </div>
        )}

        {activeTab.sourceType === 'public' && (
          <div className="mb-4 flex items-center justify-between">
            <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-2">
              {PUBLIC_CATEGORIES.map((category) => (
                <SourceChip
                  key={category}
                  onClick={() => {
                    setActiveTab({ sourceType: 'public', category })
                    setTabVersion((v) => v + 1)
                  }}
                  selected={activeTab.category === category}
                  accentColor={category === 'all' ? undefined : '#0EA5E9'}
                  className="px-4 py-2 text-sm"
                >
                  {PUBLIC_CATEGORY_LABELS[category]}
                </SourceChip>
              ))}
            </div>
            <ActionButton
              onClick={() => setIsPublicSourcesOpen(true)}
              data-testid="open-public-sources-panel"
              variant="primary"
              size="sm"
              className="flex-shrink-0"
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              添加公开 RSS
            </ActionButton>
          </div>
        )}

        <ErrorBoundary>
          <FeedList
            key={`${activeTab.sourceType}-${activeTab.sourceType === 'public' ? activeTab.category : activeTab.platform}-${tabVersion}`}
            platform={activeTab.sourceType === 'public' ? undefined : activeTab.platform === 'all' ? undefined : activeTab.platform}
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
        </ErrorBoundary>
      </div>

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
