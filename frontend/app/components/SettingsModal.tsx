'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { cn, getSourceColor } from '../lib/utils'
import { settingsApi, sourcesApi, favoritesApi, wechatApi } from '../lib/api'
import { PlatformConnectionsPanel } from './PlatformConnectionsPanel'
import { IntegrationSetting, PLATFORM_CONFIG, PUBLIC_CATEGORY_CONFIG, Source, FavoriteTag } from '../types'
import { useTheme, type DisplaySettings } from './ThemeProvider'
import { EmptyState } from './EmptyState'
import { SourceHealthBadge } from './SourceHealthBadge'
import { StatusBanner } from './StatusBanner'
import { ActionButton } from './ActionButton'
import { TextAreaField } from './FormField'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onDataChange?: () => void
}

type TabType = 'sources' | 'favorites' | 'general' | 'connections' | 'about'

export function SettingsModal({ isOpen, onClose, onDataChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('sources')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [collectingSource, setCollectingSource] = useState<number | null>(null)
  const [sourceNotice, setSourceNotice] = useState<string | null>(null)

  const { data: sourcesData, mutate: mutateSources, isLoading } = useSWR(
    isOpen ? 'sources' : null,
    () => sourcesApi.getAll(),
    { revalidateOnFocus: false }
  )
  const { data: tagsData, mutate: mutateTags } = useSWR(
    isOpen ? 'favorites' : null,
    () => favoritesApi.getTags(),
    { revalidateOnFocus: false }
  )

  const sources = sourcesData?.sources || []
  const tags = tagsData?.tags || []

  const handleClose = useCallback(() => {
    setConfirmDelete(null)
    setCollectingSource(null)
    setSourceNotice(null)
    setActiveTab('sources')
    onClose()
  }, [onClose])

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await sourcesApi.delete(id)
        setConfirmDelete(null)
        setSourceNotice('订阅源已删除。')
        await mutateSources()
        onDataChange?.()
      } catch (error) {
        setSourceNotice(error instanceof Error ? error.message : '删除订阅源失败。')
      }
    },
    [mutateSources, onDataChange]
  )

  const handleCollect = useCallback(
    async (source: Source) => {
      setCollectingSource(source.id)
      try {
        if (source.platform === 'wechat') {
          const response = await wechatApi.collectSource(source.id)
          const count = response.data?.articlesCollected ?? 0
          const latestItem = response.data?.latestItem
          const latestPublished = latestItem?.published_at
            ? new Date(latestItem.published_at).toLocaleString('zh-CN', { hour12: false })
            : null
          {
            const message = !response.ok
              ? response.error || '微信采集失败，请稍后重试。'
              : count > 0
                ? latestItem
                  ? `微信采集完成，新增 ${count} 条内容。最近一条：${latestItem.title}（${latestPublished}）`
                  : `微信采集完成，新增 ${count} 条内容。`
                : latestItem
                  ? `微信已是最新，最近一条：${latestItem.title}（${latestPublished}）`
                  : '微信采集完成，本次没有新增内容。'
            setSourceNotice(message)
            await mutateSources()
            onDataChange?.()
            return
          }
          setSourceNotice(
            response.ok
              ? count > 0
                ? `微信采集完成，新增 ${count} 条内容。`
                : '微信采集完成，本次没有新增内容。'
              : response.error || '微信采集失败，请稍后重试。'
          )
          await mutateSources()
          onDataChange?.()
          return
        }

        const response = await sourcesApi.collect(source.id)
        setSourceNotice(
          response.ok
            ? `采集完成，新增 ${response.result.itemCount} 条内容。`
            : response.result.error || '采集失败，请稍后重试。'
        )
        await mutateSources()
        onDataChange?.()
      } catch (error) {
        setSourceNotice(error instanceof Error ? error.message : '采集失败，请稍后重试。')
      } finally {
        setCollectingSource(null)
      }
    },
    [mutateSources, onDataChange]
  )

  const handleToggleEnabled = useCallback(
    async (source: Source) => {
      try {
        await sourcesApi.update(source.id, { enabled: !source.enabled })
        setSourceNotice(source.enabled ? '订阅源已停用。' : '订阅源已启用。')
        await mutateSources()
        onDataChange?.()
      } catch (error) {
        setSourceNotice(error instanceof Error ? error.message : '更新订阅源失败。')
      }
    },
    [mutateSources, onDataChange]
  )

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-bg-secondary shadow-2xl"
        style={{ maxHeight: '85vh' }}
        data-testid="settings-modal"
      >
        <div className="flex h-[75vh]">
          <div className="flex w-56 flex-col border-r border-border-color bg-bg-primary">
            <div className="border-b border-border-color p-5">
              <h2 className="text-lg font-semibold text-text-primary">设置</h2>
            </div>

            <nav className="flex-1 space-y-1 p-3">
              <SidebarButton
                active={activeTab === 'sources'}
                onClick={() => setActiveTab('sources')}
                testId="settings-tab-sources"
                icon={<PanelIcon path="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />}
                label="订阅源"
                badge={sources.length}
              />
              <SidebarButton
                active={activeTab === 'favorites'}
                onClick={() => setActiveTab('favorites')}
                testId="settings-tab-favorites"
                icon={<PanelIcon path="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />}
                label="收藏"
                badge={tags.length}
              />
              <SidebarButton
                active={activeTab === 'general'}
                onClick={() => setActiveTab('general')}
                testId="settings-tab-general"
                icon={<PanelIcon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />}
                label="通用"
              />
              <SidebarButton
                active={activeTab === 'about'}
                onClick={() => setActiveTab('about')}
                testId="settings-tab-about"
                icon={<PanelIcon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                label="关于"
              />
              <SidebarButton
                active={activeTab === 'connections'}
                onClick={() => setActiveTab('connections')}
                testId="settings-tab-connections"
                icon={<PanelIcon path="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />}
                label="平台连接"
              />
            </nav>

            <div className="border-t border-border-color p-3">
              <button
                onClick={handleClose}
                data-testid="close-settings-modal"
                className="w-full rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                关闭
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'sources' && (
              <SourcesTab
                sources={sources}
                isLoading={isLoading}
                notice={sourceNotice}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
                collectingSource={collectingSource}
                onToggleEnabled={handleToggleEnabled}
                onCollect={handleCollect}
                onDelete={handleDelete}
              />
            )}
            {activeTab === 'favorites' && <TagsTab tags={tags} onMutate={mutateTags} />}
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'about' && <AboutTab />}
            {activeTab === 'connections' && (
              <PlatformConnectionsPanel
                onMessage={(msg) => setSourceNotice(msg)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PanelIcon({ path }: { path: string }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  )
}

interface SidebarButtonProps {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  badge?: number
  testId?: string
}

function SidebarButton({ active, onClick, icon, label, badge, testId }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        active
          ? 'border border-border-color bg-bg-secondary text-text-primary shadow-sm'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      )}
    >
      <span className={cn(active ? 'text-accent' : 'text-text-muted')}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
          {badge}
        </span>
      )}
    </button>
  )
}

interface SourcesTabProps {
  sources: Source[]
  isLoading: boolean
  notice: string | null
  confirmDelete: number | null
  setConfirmDelete: (id: number | null) => void
  collectingSource: number | null
  onToggleEnabled: (source: Source) => void
  onCollect: (source: Source) => void
  onDelete: (id: number) => void
}

function SourcesTab({
  sources,
  isLoading,
  notice,
  confirmDelete,
  setConfirmDelete,
  collectingSource,
  onToggleEnabled,
  onCollect,
  onDelete,
}: SourcesTabProps) {
  const [sourceType, setSourceType] = useState<'custom' | 'public'>('custom')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [diagnosing, setDiagnosing] = useState<number | null>(null)
  const [diagnoses, setDiagnoses] = useState<Record<number, {
    category: string
    action: string
    label: string
    fixLabel: string
    errorMessage: string
  }>>({})

  const handleDiagnose = async (source: Source) => {
    if (!source.last_error) return
    setDiagnosing(source.id)
    try {
      const response = await sourcesApi.diagnose(source.id)
      if (response.ok && response.diagnosis.hasError) {
        setDiagnoses(prev => ({ ...prev, [source.id]: response.diagnosis as any }))
      }
    } finally {
      setDiagnosing(null)
    }
  }

  const handleFixAction = async (source: Source, action: string) => {
    switch (action) {
      case 'retry':
        await onCollect(source)
        // Refresh diagnosis after retry
        setDiagnoses(prev => {
          const next = { ...prev }
          delete next[source.id]
          return next
        })
        break
      case 'disable_temporarily':
        onToggleEnabled(source)
        // Clear diagnosis after disable (error will be cleared by backend)
        setDiagnoses(prev => {
          const next = { ...prev }
          delete next[source.id]
          return next
        })
        break
      case 'configure_proxy':
      case 'relogin':
      case 'retry_later':
        // Open settings or platform connections
        break
      case 'restart_rsshub':
        // Trigger restart will be handled by parent
        break
      default:
        await onCollect(source)
    }
  }

  const customSources = sources.filter(s => !s.is_public)
  const publicSources = sources.filter(s => s.is_public)

  const filteredSources = sourceType === 'custom'
    ? customSources.filter(s => platformFilter === 'all' || s.platform === platformFilter)
    : publicSources.filter(s => !s.category || platformFilter === 'all' || s.category === platformFilter)

  const platforms = sourceType === 'custom'
    ? ['all', 'zhihu', 'x', 'wechat', 'weibo', 'bilibili', 'youtube', 'news', 'custom']
    : ['all', 'tech', 'news', 'finance', 'life', 'design', 'video', 'aggregator']

  const platformName = (p: string) => {
    if (p === 'all') return '全部'
    if (sourceType === 'custom') {
      return PLATFORM_CONFIG[p]?.name || p
    }
    const names: Record<string, string> = { tech: '科技', news: '新闻', finance: '财经', life: '生活', design: '设计', video: '视频', aggregator: '聚合' }
    return names[p] || p
  }

  return (
    <div className="p-6" data-testid="settings-sources-tab">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">订阅源管理</h3>
          <p className="text-sm text-text-secondary">共 {sourceType === 'custom' ? customSources.length : publicSources.length} 个订阅源</p>
        </div>
      </div>

      {notice && (
        <StatusBanner
          variant={notice.includes('失败') || notice.includes('错误') ? 'error' : 'info'}
          title="订阅源状态"
          description={notice}
          className="mb-4"
        />
      )}

      {/* 两级目录切换 */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => { setSourceType('custom'); setPlatformFilter('all') }}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              sourceType === 'custom' ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
            )}
          >
            定制订阅源
          </button>
          <button
            onClick={() => { setSourceType('public'); setPlatformFilter('all') }}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              sourceType === 'public' ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
            )}
          >
            公开订阅源
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {platforms.map(p => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                platformFilter === p
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
              )}
            >
              {platformName(p)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-bg-tertiary" />
          ))}
        </div>
      ) : filteredSources.length === 0 ? (
        <EmptyState title="暂无订阅源" description="先添加订阅源，再回到这里做管理。" />
      ) : (
        <div className="space-y-3">
          {filteredSources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              isConfirmingDelete={confirmDelete === source.id}
              isCollecting={collectingSource === source.id}
              onToggleEnabled={() => onToggleEnabled(source)}
              onCollect={() => onCollect(source)}
              onDelete={() => setConfirmDelete(source.id)}
              onCancelDelete={() => setConfirmDelete(null)}
              onConfirmDelete={() => onDelete(source.id)}
              diagnosis={diagnoses[source.id]}
              onDiagnose={() => handleDiagnose(source)}
              onFixAction={(action) => handleFixAction(source, action)}
              isDiagnosing={diagnosing === source.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SourceItemProps {
  source: Source
  isConfirmingDelete: boolean
  isCollecting: boolean
  onToggleEnabled: () => void
  onCollect: () => void
  onDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  diagnosis?: {
    category: string
    action: string
    label: string
    fixLabel: string
    errorMessage: string
  }
  onDiagnose?: () => void
  onFixAction?: (action: string) => void
  isDiagnosing?: boolean
}

function SourceItem({
  source,
  isConfirmingDelete,
  isCollecting,
  onToggleEnabled,
  onCollect,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
  diagnosis,
  onDiagnose,
  onFixAction,
  isDiagnosing,
}: SourceItemProps) {
  const color = getSourceColor(source)
  const displayName = source.is_public && source.category
    ? PUBLIC_CATEGORY_CONFIG[source.category]?.name || source.category
    : (PLATFORM_CONFIG[source.platform]?.name || source.platform)

  return (
    <div
      data-testid={`source-item-${source.id}`}
      className={cn(
        'rounded-xl border p-4 transition-all duration-150',
        source.enabled ? 'border-border-color bg-bg-secondary' : 'border-transparent bg-bg-tertiary opacity-70'
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}15` }}
        >
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h4 className="truncate font-medium text-text-primary">{source.name}</h4>
            <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs text-text-secondary">
              {displayName}
            </span>
            <SourceHealthBadge
              tone={
                !source.enabled
                  ? 'disabled'
                  : source.status === 'active'
                    ? 'active'
                    : source.error_count > 0
                      ? 'error'
                      : 'interrupted'
              }
            />
            {source.error_count > 0 && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                错误 {source.error_count}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-text-secondary">{source.input_url}</p>
          <p className="mt-1 text-xs text-text-muted">
            上次采集：{source.last_fetched_at ? new Date(source.last_fetched_at).toLocaleString('zh-CN') : '从未'}
          </p>
          {source.last_error && (
            <p className="mt-2 line-clamp-2 text-xs text-red-500">{source.last_error}</p>
          )}
          {source.last_error && source.status === 'error' && (
            <div className="mt-2 flex items-center gap-2">
              {!diagnosis ? (
                <button
                  onClick={onDiagnose}
                  disabled={isDiagnosing}
                  className="rounded px-2 py-1 text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                >
                  {isDiagnosing ? '诊断中...' : '诊断问题'}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="rounded px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700">
                    {diagnosis.label}
                  </span>
                  <button
                    onClick={() => onFixAction?.(diagnosis.action)}
                    className="rounded px-2 py-1 text-xs font-medium bg-accent text-white hover:bg-accent-hover"
                  >
                    {diagnosis.fixLabel}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isConfirmingDelete ? (
            <>
              <button
                onClick={onToggleEnabled}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors duration-200',
                  source.enabled ? 'bg-accent' : 'bg-text-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-bg-secondary shadow-sm transition-transform duration-200',
                    source.enabled ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>

              <IconButton
                title="手动采集"
                disabled={isCollecting || !source.enabled}
                onClick={onCollect}
                testId={`collect-source-${source.id}`}
              >
                {isCollecting ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </IconButton>

              <IconButton title="删除" onClick={onDelete} danger>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </IconButton>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-500">确认删除？</span>
              <button
                onClick={onConfirmDelete}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                删除
              </button>
              <button
                onClick={onCancelDelete}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function IconButton({
  children,
  title,
  disabled,
  onClick,
  danger = false,
  testId,
}: {
  children: ReactNode
  title: string
  disabled?: boolean
  onClick: () => void
  danger?: boolean
  testId?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={cn(
        'rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        danger
          ? 'text-text-secondary hover:bg-red-50 hover:text-red-500'
          : 'text-text-secondary hover:bg-accent/10 hover:text-accent'
      )}
    >
      {children}
    </button>
  )
}

function GeneralTab() {
  const { theme, setTheme, resolvedTheme, displaySettings, setDisplaySettings } = useTheme()
  const { data, mutate, isLoading } = useSWR('settings-integrations', () => settingsApi.getIntegrations(), {
    revalidateOnFocus: false,
  })
  const [values, setValues] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!data?.rsshub.settings) {
      return
    }

    const nextValues = Object.fromEntries(
      data.rsshub.settings.map((setting) => [setting.key, setting.value])
    )
    setValues(nextValues)
  }, [data])

  const configuredCount = useMemo(
    () => data?.rsshub.settings.filter((setting) => setting.configured).length ?? 0,
    [data]
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setNotice(null)

    try {
      const response = await settingsApi.saveIntegrations(values)
      await mutate(response, { revalidate: false })
      setNotice(
        response.rsshub.running
          ? '本地 RSSHub 配置已保存并重启。'
          : '配置已保存，但本地 RSSHub 尚未成功启动。'
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败，请稍后重试。')
    } finally {
      setIsSaving(false)
    }
  }, [mutate, values])

  return (
    <div className="p-6" data-testid="settings-general-tab">
      <h3 className="mb-6 text-lg font-semibold text-text-primary">通用设置</h3>

      <div className="space-y-6">
        <div className="rounded-xl border border-border-color bg-bg-primary p-4">
          <h4 className="mb-4 font-medium text-text-primary">主题</h4>
          <div className="grid grid-cols-3 gap-3">
            <ThemeOption label="亮色" selected={theme === 'light'} onClick={() => setTheme('light')} />
            <ThemeOption label="暗色" selected={theme === 'dark'} onClick={() => setTheme('dark')} />
            <ThemeOption label="跟随系统" selected={theme === 'system'} onClick={() => setTheme('system')} />
          </div>
          <p className="mt-3 text-sm text-text-muted">当前生效：{resolvedTheme === 'dark' ? '暗色' : '亮色'}</p>
        </div>

        <div className="rounded-xl border border-border-color bg-bg-primary p-4">
          <h4 className="mb-4 font-medium text-text-primary">显示</h4>

          <div className="mb-4">
            <label className="mb-2 block text-sm text-text-secondary">字号</label>
            <div className="grid grid-cols-3 gap-3">
              <DisplayOption label="小" selected={displaySettings.fontSize === 'sm'} onClick={() => setDisplaySettings({ ...displaySettings, fontSize: 'sm' })} />
              <DisplayOption label="中" selected={displaySettings.fontSize === 'md'} onClick={() => setDisplaySettings({ ...displaySettings, fontSize: 'md' })} />
              <DisplayOption label="大" selected={displaySettings.fontSize === 'lg'} onClick={() => setDisplaySettings({ ...displaySettings, fontSize: 'lg' })} />
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm text-text-secondary">卡片密度</label>
            <div className="grid grid-cols-3 gap-3">
              <DisplayOption label="紧凑" selected={displaySettings.cardDensity === 'compact'} onClick={() => setDisplaySettings({ ...displaySettings, cardDensity: 'compact' })} />
              <DisplayOption label="标准" selected={displaySettings.cardDensity === 'normal'} onClick={() => setDisplaySettings({ ...displaySettings, cardDensity: 'normal' })} />
              <DisplayOption label="宽松" selected={displaySettings.cardDensity === 'relaxed'} onClick={() => setDisplaySettings({ ...displaySettings, cardDensity: 'relaxed' })} />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-text-secondary">行间距</label>
            <div className="grid grid-cols-3 gap-3">
              <DisplayOption label="紧凑" selected={displaySettings.lineHeight === 'compact'} onClick={() => setDisplaySettings({ ...displaySettings, lineHeight: 'compact' })} />
              <DisplayOption label="标准" selected={displaySettings.lineHeight === 'normal'} onClick={() => setDisplaySettings({ ...displaySettings, lineHeight: 'normal' })} />
              <DisplayOption label="宽松" selected={displaySettings.lineHeight === 'relaxed'} onClick={() => setDisplaySettings({ ...displaySettings, lineHeight: 'relaxed' })} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border-color bg-bg-primary p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-medium text-text-primary">本地 RSSHub</h4>
              <p className="text-sm text-text-secondary">
                直接把登录态写入本地 RSSHub 配置文件，保存后会自动重启服务。
              </p>
            </div>
            <div className="text-right text-sm">
              <p className={cn('font-medium', data?.rsshub.running ? 'text-green-600' : 'text-red-500')}>
                {data?.rsshub.running ? 'RSSHub 运行中' : 'RSSHub 未运行'}
              </p>
              <p className="text-text-muted">已配置 {configuredCount} 项</p>
            </div>
          </div>

          {notice && (
            <div className="mb-4 rounded-lg border border-border-color bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
              {notice}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-lg bg-bg-secondary" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border-color bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
                <p>配置文件：{data?.rsshub.envPath}</p>
                <p>服务地址：http://localhost:{data?.rsshub.port ?? 1200}</p>
              </div>

              {data?.rsshub.settings.map((setting) => (
                <IntegrationFieldEditor
                  key={setting.key}
                  setting={setting}
                  value={values[setting.key] ?? ''}
                  onChange={(nextValue) => setValues((prev) => ({ ...prev, [setting.key]: nextValue }))}
                />
              ))}

              <div className="flex justify-end">
                <ActionButton
                  onClick={handleSave}
                  disabled={isSaving}
                  data-testid="save-rsshub-settings"
                  variant="primary"
                  size="md"
                >
                  {isSaving ? '保存中...' : '保存并重启 RSSHub'}
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ThemeOption({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 text-sm font-medium transition-all duration-150',
        selected
          ? 'border-accent bg-accent/5 text-accent'
          : 'border-border-color text-text-secondary hover:border-text-tertiary hover:text-text-primary'
      )}
    >
      {label}
    </button>
  )
}

function DisplayOption({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150',
        selected
          ? 'border-accent bg-accent/5 text-accent'
          : 'border-border-color text-text-secondary hover:border-text-tertiary hover:text-text-primary'
      )}
    >
      {label}
    </button>
  )
}

function IntegrationFieldEditor({
  setting,
  value,
  onChange,
}: {
  setting: IntegrationSetting
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-xl border border-border-color bg-bg-secondary p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h5 className="font-medium text-text-primary">{setting.label}</h5>
        {setting.configured && (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">已配置</span>
        )}
      </div>
      <p className="mb-3 text-sm text-text-secondary">{setting.description}</p>
      <TextAreaField
        label="配置值"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={setting.placeholder}
        rows={4}
        className="bg-bg-primary"
      />
      <p className="mt-2 text-xs text-text-muted">环境变量名：{setting.key}</p>
    </div>
  )
}

function AboutTab() {
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'available' | 'error'>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  const checkForUpdate = useCallback(async () => {
    setUpdateStatus('checking')
    setLatestVersion(null)
    try {
      const response = await fetch('https://api.github.com/repos/Jinkin-92/infohub/releases/latest', {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      })

      // 检查是否被限速
      if (response.status === 403) {
        const data = await response.json().catch(() => ({}))
        if (data.message?.includes('rate limit')) {
          setUpdateStatus('error')
          return
        }
      }

      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      const tag = data.tag_name?.replace(/^v/, '') || '0.0.0'
      setLatestVersion(tag)

      const currentVersion = '1.0.0'
      const isLatest = compareVersions(tag, currentVersion) <= 0
      setUpdateStatus(isLatest ? 'latest' : 'available')
    } catch {
      setUpdateStatus('error')
    }
  }, [])

  return (
    <div className="p-6">
      <h3 className="mb-6 text-lg font-semibold text-text-primary">关于</h3>

      <div className="space-y-4 rounded-xl border border-border-color bg-bg-primary p-5">
        <div>
          <h4 className="text-lg font-semibold text-text-primary">信息中枢</h4>
          <p className="text-sm text-text-secondary">InfoHub v1.0.0</p>
        </div>
        <p className="text-sm text-text-secondary">
          一个面向个人内容聚合与筛选的本地优先信息中枢。
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={checkForUpdate}
            disabled={updateStatus === 'checking'}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {updateStatus === 'checking' ? '检查中...' : '检查更新'}
          </button>
          {updateStatus === 'latest' && (
            <span className="text-sm text-green-600">已是最新版本</span>
          )}
          {updateStatus === 'available' && (
            <span className="text-sm text-accent">
              发现新版本 v{latestVersion}！请前往 GitHub 下载。
            </span>
          )}
          {updateStatus === 'error' && (
            <span className="text-sm text-red-500">
              检查更新失败（API 限速）
              <a
                href="https://github.com/Jinkin-92/infohub/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 underline hover:text-accent"
              >
                前往 GitHub 查看
              </a>
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {['Next.js 14', 'Hono', 'SQLite', 'RSSHub', 'Tailwind CSS'].map((label) => (
            <span
              key={label}
              className="rounded-full border border-border-color bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

function TagsTab({ tags, onMutate }: { tags: FavoriteTag[]; onMutate: () => void }) {
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({ name: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const resetForm = () => {
    setFormData({ name: '' })
    setIsCreating(false)
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) return
    setIsSubmitting(true)
    try {
      await favoritesApi.createTag(formData)
      onMutate()
      resetForm()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    await favoritesApi.deleteTag(id)
    setConfirmDelete(null)
    onMutate()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">收藏管理</h3>
          <p className="text-sm text-text-secondary">共 {tags.length} 个收藏标签</p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            新建收藏标签
          </button>
        )}
      </div>

      {isCreating && (
        <div className="mb-6 rounded-xl border border-border-color bg-bg-primary p-4">
          <h4 className="mb-4 font-medium text-text-primary">新建收藏标签</h4>
          <div className="space-y-4">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ name: e.target.value })}
              placeholder="标签名称，如：重要、稍后阅读"
              className="w-full rounded-lg border border-border-color bg-bg-secondary px-3 py-2 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex justify-end gap-2">
              <ActionButton
                onClick={resetForm}
                variant="subtle"
              >
                取消
              </ActionButton>
              <ActionButton
                onClick={handleCreate}
                disabled={isSubmitting || !formData.name.trim()}
                variant="primary"
              >
                {isSubmitting ? '保存中...' : '保存'}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {tags.length === 0 ? (
        <EmptyState title="暂无收藏标签" description="创建收藏标签后，可以给内容打上红心标记。" />
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-xl border border-border-color bg-bg-secondary p-3"
            >
              <div className="flex items-center gap-3">
                <svg className="h-4 w-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span className="font-medium text-text-primary">{tag.name}</span>
              </div>

              {confirmDelete === tag.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-500">确认删除？</span>
                  <button
                    onClick={() => handleDelete(tag.id)}
                    className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
                  >
                    删除
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <IconButton title="删除" danger onClick={() => setConfirmDelete(tag.id)}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
