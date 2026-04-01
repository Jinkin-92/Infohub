'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { cn } from '../lib/utils'
import { settingsApi, sourcesApi, tagsApi, cookieApi } from '../lib/api'
import { IntegrationSetting, PLATFORM_CONFIG, Source, Tag } from '../types'
import { useTheme } from './ThemeProvider'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'sources' | 'tags' | 'general' | 'about'

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
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
    isOpen ? 'tags' : null,
    () => tagsApi.getAll(),
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
      } catch (error) {
        setSourceNotice(error instanceof Error ? error.message : '删除订阅源失败。')
      }
    },
    [mutateSources]
  )

  const handleCollect = useCallback(
    async (id: number) => {
      setCollectingSource(id)
      try {
        const response = await sourcesApi.collect(id)
        setSourceNotice(
          response.ok
            ? `采集完成，新增 ${response.result.itemCount} 条内容。`
            : response.result.error || '采集失败，请稍后重试。'
        )
        await mutateSources()
      } catch (error) {
        setSourceNotice(error instanceof Error ? error.message : '采集失败，请稍后重试。')
      } finally {
        setCollectingSource(null)
      }
    },
    [mutateSources]
  )

  const handleToggleEnabled = useCallback(
    async (source: Source) => {
      try {
        await sourcesApi.update(source.id, { enabled: !source.enabled })
        setSourceNotice(source.enabled ? '订阅源已停用。' : '订阅源已启用。')
        await mutateSources()
      } catch (error) {
        setSourceNotice(error instanceof Error ? error.message : '更新订阅源失败。')
      }
    },
    [mutateSources]
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
                icon={<PanelIcon path="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />}
                label="订阅源"
                badge={sources.length}
              />
              <SidebarButton
                active={activeTab === 'tags'}
                onClick={() => setActiveTab('tags')}
                icon={<PanelIcon path="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />}
                label="标签"
                badge={tags.length}
              />
              <SidebarButton
                active={activeTab === 'general'}
                onClick={() => setActiveTab('general')}
                icon={<PanelIcon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />}
                label="通用"
              />
              <SidebarButton
                active={activeTab === 'about'}
                onClick={() => setActiveTab('about')}
                icon={<PanelIcon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                label="关于"
              />
            </nav>

            <div className="border-t border-border-color p-3">
              <button
                onClick={handleClose}
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
            {activeTab === 'tags' && <TagsTab tags={tags} onMutate={mutateTags} />}
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'about' && <AboutTab />}
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
}

function SidebarButton({ active, onClick, icon, label, badge }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
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
  onCollect: (id: number) => void
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
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">订阅源管理</h3>
          <p className="text-sm text-text-secondary">共 {sources.length} 个订阅源</p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-border-color bg-bg-primary px-4 py-3 text-sm text-text-secondary">
          {notice}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-bg-tertiary" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          title="暂无订阅源"
          description="先从顶部加号添加一个订阅源，系统就会开始采集内容。"
        />
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              isConfirmingDelete={confirmDelete === source.id}
              isCollecting={collectingSource === source.id}
              onToggleEnabled={() => onToggleEnabled(source)}
              onCollect={() => onCollect(source.id)}
              onDelete={() => setConfirmDelete(source.id)}
              onCancelDelete={() => setConfirmDelete(null)}
              onConfirmDelete={() => onDelete(source.id)}
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
}: SourceItemProps) {
  const platform = PLATFORM_CONFIG[source.platform] || PLATFORM_CONFIG.custom

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all duration-150',
        source.enabled ? 'border-border-color bg-bg-secondary' : 'border-transparent bg-bg-tertiary opacity-70'
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${platform.color}15` }}
        >
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: platform.color }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h4 className="truncate font-medium text-text-primary">{source.name}</h4>
            <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs text-text-secondary">
              {platform.name}
            </span>
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
}: {
  children: ReactNode
  title: string
  disabled?: boolean
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
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
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { data, mutate, isLoading } = useSWR('settings-integrations', () => settingsApi.getIntegrations(), {
    revalidateOnFocus: false,
  })
  const { data: cookieStatus } = useSWR('cookie-status', () => cookieApi.getStatus(), {
    revalidateOnFocus: false,
  })
  const [values, setValues] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractNotice, setExtractNotice] = useState<string | null>(null)

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

  const handleExtractCookies = useCallback(async () => {
    setIsExtracting(true)
    setExtractNotice(null)

    try {
      const response = await cookieApi.extract()
      if (response.ok && response.data) {
        const { success, failed, results } = response.data
        const successPlatforms = results.filter((r) => r.success).map((r) => r.platform)
        if (successPlatforms.length > 0) {
          setExtractNotice(`成功从 ${successPlatforms.join('、')} 获取 Cookie`)
        } else {
          setExtractNotice('未能获取任何平台的 Cookie，请确保已在 Chrome 中登录相关网站')
        }
        if (failed > 0) {
          const failedPlatforms = results.filter((r) => !r.success).map((r) => r.platform)
          setExtractNotice((prev) => `${prev || ''}（${failedPlatforms.join('、')} 失败）`)
        }
        // Refresh settings
        await mutate()
      } else if (response.code === 'CHROME_NOT_CONNECTED') {
        setExtractNotice('Chrome 远程调试未连接。请在 chrome://inspect/#remote-debugging 中开启调试选项')
      } else {
        setExtractNotice(response.error || '获取 Cookie 失败')
      }
    } catch (error) {
      setExtractNotice(error instanceof Error ? error.message : '获取 Cookie 失败')
    } finally {
      setIsExtracting(false)
    }
  }, [mutate])

  return (
    <div className="p-6">
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-medium text-text-primary">本地集成</h4>
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

              {/* Chrome Cookie 提取区域 */}
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h5 className="font-medium text-text-primary">从 Chrome 获取 Cookie</h5>
                    <p className="text-xs text-text-secondary mt-1">
                      自动从已登录的 Chrome 中提取 Cookie（需要开启远程调试）
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        cookieStatus?.data?.chromeConnected ? 'bg-green-500' : 'bg-red-500'
                      )}
                    />
                    <span className="text-xs text-text-secondary">
                      Chrome {cookieStatus?.data?.chromeConnected ? '已连接' : '未连接'}
                      {cookieStatus?.data?.chromePort ? ` (端口 ${cookieStatus.data.chromePort})` : ''}
                    </span>
                  </div>
                </div>

                {extractNotice && (
                  <div className="mb-3 rounded-lg border border-border-color bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
                    {extractNotice}
                  </div>
                )}

                <button
                  onClick={handleExtractCookies}
                  disabled={isExtracting || !cookieStatus?.data?.chromeConnected}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isExtracting ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      提取中...
                    </span>
                  ) : (
                    '一键获取全部 Cookie'
                  )}
                </button>

                {!cookieStatus?.data?.chromeConnected && (
                  <p className="mt-2 text-xs text-text-muted">
                    如需启用，请前往 chrome://inspect/#remote-debugging 勾选 "Allow remote debugging"
                  </p>
                )}
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
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存并重启 RSSHub'}
                </button>
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={setting.placeholder}
        rows={4}
        className="w-full rounded-xl border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <p className="mt-2 text-xs text-text-muted">环境变量名：{setting.key}</p>
    </div>
  )
}

function AboutTab() {
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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-4 h-16 w-16 text-text-muted">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h4 className="mb-1 font-medium text-text-primary">{title}</h4>
      <p className="text-sm text-text-secondary">{description}</p>
    </div>
  )
}

function TagsTab({ tags, onMutate }: { tags: Tag[]; onMutate: () => void }) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [formData, setFormData] = useState({ name: '', color: '#4CA6E1', description: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const presetColors = ['#4CA6E1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6B7280', '#14B8A6']

  const resetForm = () => {
    setFormData({ name: '', color: '#4CA6E1', description: '' })
    setIsCreating(false)
    setEditingTag(null)
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      return
    }

    setIsSubmitting(true)
    try {
      await tagsApi.create(formData)
      onMutate()
      resetForm()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingTag || !formData.name.trim()) {
      return
    }

    setIsSubmitting(true)
    try {
      await tagsApi.update(editingTag.id, formData)
      onMutate()
      resetForm()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    await tagsApi.delete(id)
    setConfirmDelete(null)
    onMutate()
  }

  const startEdit = (tag: Tag) => {
    setEditingTag(tag)
    setFormData({
      name: tag.name,
      color: tag.color,
      description: tag.description || '',
    })
    setIsCreating(false)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">标签管理</h3>
          <p className="text-sm text-text-secondary">共 {tags.length} 个标签</p>
        </div>
        {!isCreating && !editingTag && (
          <button
            onClick={() => setIsCreating(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            新建标签
          </button>
        )}
      </div>

      {(isCreating || editingTag) && (
        <div className="mb-6 rounded-xl border border-border-color bg-bg-primary p-4">
          <h4 className="mb-4 font-medium text-text-primary">{editingTag ? '编辑标签' : '新建标签'}</h4>
          <div className="space-y-4">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="标签名称"
              className="w-full rounded-lg border border-border-color bg-bg-secondary px-3 py-2 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex flex-wrap gap-2">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setFormData({ ...formData, color })}
                  className={cn(
                    'h-8 w-8 rounded-lg transition-all',
                    formData.color === color ? 'scale-110 ring-2 ring-accent ring-offset-2' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="描述（可选）"
              className="w-full rounded-lg border border-border-color bg-bg-secondary px-3 py-2 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                取消
              </button>
              <button
                onClick={editingTag ? handleUpdate : handleCreate}
                disabled={isSubmitting || !formData.name.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tags.length === 0 ? (
        <EmptyState title="暂无标签" description="创建标签后，可以给内容打标和筛选。" />
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-xl border border-border-color bg-bg-secondary p-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: tag.color }} />
                <div>
                  <span className="font-medium text-text-primary">{tag.name}</span>
                  {tag.description && <p className="text-xs text-text-muted">{tag.description}</p>}
                </div>
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
                <div className="flex items-center gap-1">
                  <IconButton title="编辑" onClick={() => startEdit(tag)}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </IconButton>
                  <IconButton title="删除" danger onClick={() => setConfirmDelete(tag.id)}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </IconButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
