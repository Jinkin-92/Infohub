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
import { useTranslation } from './components/TranslationContext'
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
  const [repairReport, setRepairReport] = useState<{
    sources: {
      totalFailed: number
      byAction: Record<string, Array<{
        sourceId: number
        sourceName: string
        platform: string
        category: string
        action: string
        label: string
        fixLabel: string
        errorMessage: string | null
      }>>
    }
    logins: Array<{ platform: string; valid: boolean; sourceCount: number }>
  } | null>(null)
  const lastCompletedRefreshRef = useRef<string | null>(null)
  const { translateAll, isTranslatingAll } = useTranslation()
  const [selectedSourceId, setSelectedSourceId] = useState<number | undefined>(undefined)

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

  const { data: sourcesData } = useSWR(
    ['sources-status', refreshTrigger],
    () => sourcesApi.getAll(),
    { revalidateOnFocus: false }
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
    let timeoutId: ReturnType<typeof setTimeout>

    const refreshOnPageLoad = async () => {
      setLoadingFreshContent(true)
      timeoutId = setTimeout(() => {
        if (active) {
          setLoadingFreshContent(false)
        }
      }, 30000)

      try {
        const response = await sourcesApi.collectAll()
        if (!active) return
        setRefreshMessage(
          response.refresh.alreadyRunning
            ? '订阅源正在后台刷新，内容会在完成后自动更新。'
            : '已开始后台刷新订阅源，最新内容会在完成后自动显示。'
        )
      } catch (error) {
        if (!active) return
        setRefreshMessage(error instanceof Error ? error.message : '启动刷新失败，请稍后重试。')
      } finally {
        if (!active) return
        setLoadingFreshContent(false)
        void mutateIntegrations()
      }
    }

    refreshOnPageLoad()

    return () => {
      active = false
      clearTimeout(timeoutId)
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

  const getFeedParams = useCallback(() => {
    if (activeTab.sourceType === 'public') {
      return { platform: undefined, isPublic: true as const, category: activeTab.category }
    }
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
      const result = await settingsApi.repair()
      await mutateIntegrations()
      setRefreshTrigger((prev) => prev + 1)
      void mutateUnread()

      const { report } = result

      if (report.sources.totalFailed > 0) {
        setRepairReport({
          sources: {
            totalFailed: report.sources.totalFailed,
            byAction: report.sources.byAction,
          },
          logins: report.logins,
        })
        setRefreshMessage(null)
      } else {
        setRepairReport(null)
        const rsshubMsg = report.rsshub.restarted
          ? '已重启 RSSHub 服务'
          : report.rsshub.wasRunning
            ? 'RSSHub 运行正常'
            : 'RSSHub 重启失败'
        const loginIssues = report.logins.filter((l) => !l.valid && l.sourceCount > 0)
        const loginMsg =
          loginIssues.length > 0
            ? `检测到 ${loginIssues.length} 个平台登录异常（${loginIssues.map((l) => l.platform).join('、')}）`
            : '所有平台登录状态正常'
        setRefreshMessage(`修复完成：${rsshubMsg}；所有订阅源状态正常；${loginMsg}。`)
      }
    } catch (err) {
      setRepairReport(null)
      setRefreshMessage(err instanceof Error ? err.message : '一键修复执行失败')
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

  const actionLabels: Record<string, string> = {
    relogin: '需重新登录',
    restart_rsshub: 'RSSHub 服务异常',
    retry: '网络超时',
    retry_later: '平台反爬/稍后重试',
    disable_temporarily: 'RSSHub 路由问题',
    configure_proxy: '需要配置代理',
  }

  function formatDiagnosisDescription(report: NonNullable<typeof repairReport>): string {
    const parts = Object.entries(report.sources.byAction).map(([action, items]) => {
      const label = actionLabels[action] || '采集失败'
      return `${label}（${items.length} 个）`
    })

    const loginIssues = report.logins.filter((l) => !l.valid && l.sourceCount > 0)
    if (loginIssues.length > 0) {
      parts.push(`登录异常：${loginIssues.map((l) => l.platform).join('、')}`)
    }

    return parts.join('；') + '。建议进入设置查看详情并处理。'
  }

  // 获取当前栏目下的所有订阅源
  const allSourcesForTab = (sourcesData?.sources || []).filter(
    (source) => source.enabled &&
      (!activeTab.platform || activeTab.platform === 'all' || source.platform === activeTab.platform || source.category === activeTab.platform) &&
      (activeTab.sourceType === 'public' ? source.is_public && (!activeTab.category || source.category === activeTab.category) : !source.is_public)
  )

  // 按平台分组订阅源
  const sourcesByPlatform = allSourcesForTab.reduce((acc, source) => {
    const key = source.platform
    if (!acc[key]) acc[key] = []
    acc[key].push(source)
    return acc
  }, {} as Record<string, typeof allSourcesForTab>)

  // 获取可用的日期分组
  const getDateGroups = () => {
    return [
      { key: 'all', label: '全部' },
      { key: 'today', label: '今天' },
      { key: 'yesterday', label: '昨天' },
      { key: 'week', label: '本周' },
      { key: 'older', label: '更早' },
    ]
  }

  return (
    <div className="flex min-h-screen">
      {/* 左侧边栏 - 固定定位 */}
      <aside className="fixed left-0 top-0 h-screen w-56 flex-shrink-0 overflow-y-scroll border-r border-border-color bg-bg-primary scrollbar-hide">
        {/* Logo区域 */}
        <div className="flex items-center gap-2 border-b border-border-color px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <span className="font-semibold text-text-primary">信息中枢</span>
        </div>

        <div className="p-3">
          {/* 日期筛选 */}
          <div className="mb-6">
            <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-secondary">日期</h3>
            <div className="space-y-0.5">
              {getDateGroups().map((date) => (
                <button
                  key={date.key}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-all hover:bg-bg-tertiary hover:text-text-primary active:bg-accent/10"
                >
                  {date.label}
                </button>
              ))}
            </div>
          </div>

          {/* 二级栏目 - 平台筛选 */}
          <div className="mb-6">
            <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-secondary">平台</h3>
            <div className="space-y-0.5">
              {activeTab.sourceType === 'custom' ? (
                <>
                  <button
                    onClick={() => {
                      setActiveTab({ sourceType: 'custom', platform: 'all' })
                      setTabVersion((v) => v + 1)
                    }}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all',
                      activeTab.platform === 'all'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-accent/10'
                    )}
                  >
                    全部
                  </button>
                  {['zhihu', 'x', 'wechat', 'weibo', 'bilibili', 'youtube'].map((platform) => {
                    const platformLabels: Record<string, string> = {
                      zhihu: '知乎',
                      x: 'X',
                      wechat: '微信',
                      weibo: '微博',
                      bilibili: 'B站',
                      youtube: 'YouTube',
                    }
                    return (
                      <button
                        key={platform}
                        onClick={() => {
                          setActiveTab({ sourceType: 'custom', platform: platform as any })
                          setTabVersion((v) => v + 1)
                          setSelectedSourceId(undefined)
                        }}
                        className={cn(
                          'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all',
                          activeTab.platform === platform
                            ? 'bg-accent text-white shadow-sm'
                            : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-accent/10'
                        )}
                      >
                        {platformLabels[platform]}
                      </button>
                    )
                  })}
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setActiveTab({ sourceType: 'public', category: 'all' })
                      setTabVersion((v) => v + 1)
                    }}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all',
                      activeTab.category === 'all'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-accent/10'
                    )}
                  >
                    全部
                  </button>
                  {['tech', 'news', 'finance', 'life', 'design', 'video', 'aggregator'].map((cat) => {
                    const catLabels: Record<string, string> = {
                      tech: '科技',
                      news: '新闻',
                      finance: '财经',
                      life: '生活',
                      design: '设计',
                      video: '视频',
                      aggregator: '聚合',
                    }
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setActiveTab({ sourceType: 'public', category: cat as any })
                          setTabVersion((v) => v + 1)
                          setSelectedSourceId(undefined)
                        }}
                        className={cn(
                          'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all',
                          activeTab.category === cat
                            ? 'bg-accent text-white shadow-sm'
                            : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-accent/10'
                        )}
                      >
                        {catLabels[cat]}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* 订阅源选择 */}
          <div className="mb-6">
            <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-text-secondary">订阅源</h3>
            <div className="space-y-0.5">
              <button
                onClick={() => setSelectedSourceId(undefined)}
                className={cn(
                  'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all',
                  selectedSourceId === undefined
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-accent/10'
                )}
              >
                全部订阅源
              </button>
              {Object.entries(sourcesByPlatform).map(([platform, sources]) => (
                <div key={platform} className="mt-2">
                  <div className="px-3 py-1.5 text-xs font-bold text-text-tertiary uppercase tracking-wider">
                    {platform}
                  </div>
                  {sources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => setSelectedSourceId(source.id)}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all truncate',
                        selectedSourceId === source.id
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-accent/10'
                      )}
                    >
                      {source.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="ml-56 flex-1 min-w-0">
        {/* 顶部栏 - 固定定位，整合所有元素 */}
        <div className="fixed right-0 top-0 z-40 ml-56 w-[calc(100%-14rem)] border-b border-border-color bg-bg-secondary shadow-sm">
          {/* 第一行：核心操作 */}
          <div className="flex h-14 items-center gap-3 px-4">
            {/* 订阅源类型切换 */}
            <button
              onClick={() => setActiveTab({ sourceType: 'custom', platform: 'all' })}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                activeTab.sourceType === 'custom'
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 hover:text-text-primary'
              )}
            >
              定制订阅源
            </button>
            <button
              onClick={() => setActiveTab({ sourceType: 'public', category: 'all' })}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                activeTab.sourceType === 'public'
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 hover:text-text-primary'
              )}
            >
              公开订阅源
            </button>

            {/* 搜索框 */}
            <div className="flex-1 max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索标题、摘要..."
                className="w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </div>

            {/* 标签筛选 */}
            <select
              value={selectedTagId ?? ''}
              onChange={(e) => setSelectedTagId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-border-color bg-bg-primary px-2 py-2 text-sm text-text-secondary"
            >
              <option value="">全部收藏</option>
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>

            {/* 翻译按钮 */}
            <button
              onClick={() => translateAll()}
              disabled={isTranslatingAll}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {isTranslatingAll ? '翻译中' : '翻译'}
            </button>

            {/* 添加按钮 */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加
            </button>

            {/* 设置按钮 */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-lg p-2 text-text-secondary transition-all hover:bg-bg-tertiary hover:text-text-primary"
              aria-label="设置"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* 第二行：状态和统计 */}
          <div className="flex h-9 items-center gap-3 border-t border-border-color px-4 text-sm text-text-secondary">
            {/* 状态消息 */}
            {refreshMessage && (
              <span className="truncate">{refreshMessage}</span>
            )}
            {loadingFreshContent && (
              <span>刷新中...</span>
            )}
            {collectorIssue && (
              <span className="text-amber-600">{collectorIssue.title}</span>
            )}
            {repairReport && repairReport.sources.totalFailed > 0 && (
              <span className="text-amber-600">检测到 {repairReport.sources.totalFailed} 个订阅源需要处理</span>
            )}

            {/* 分隔 */}
            {(refreshMessage || loadingFreshContent || collectorIssue || (repairReport && repairReport.sources.totalFailed > 0)) && (
              <span className="text-text-muted">|</span>
            )}

            {/* 内容统计 */}
            <span>内容统计区域</span>

            {/* 分隔 */}
            <span className="text-text-muted">|</span>

            {/* 标记已读按钮 */}
            <button
              onClick={() => {/* 标记已读逻辑 */}}
              className="text-accent hover:text-accent-hover"
            >
              全部标记已读
            </button>
          </div>
        </div>

        {/* 占位，避免内容被顶部栏遮挡 */}
        <div className="h-20"></div>

        {/* 内容区域 */}
        <div className="px-4">

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
            selectedSourceId={selectedSourceId}
          />
        </div>
      </main>

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
    </div>
  )
}
