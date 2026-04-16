'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { authApi, type LoginSession, type PlatformStatus } from '../lib/api'
import { ManualCredentialModal } from './ManualCredentialModal'
import { QrLoginModal } from './QrLoginModal'

interface Props {
  onMessage?: (msg: string) => void
}

const DEFAULT_TEST_URLS: Record<string, string> = {
  wechat: 'https://mp.weixin.qq.com/s/r6rCmay_PJxc9I-huNmjcA',
  zhihu: 'https://www.zhihu.com/people/fu-lan-ke-yang',
  xiaohongshu:
    'https://www.xiaohongshu.com/user/profile/669f985a000000000d027d9f?xsec_token=ABcbHMoapyi56-qoJsruhheNUeFUVCBOlGY_Wdi72z4tU=&xsec_source=pc_search',
  weibo: 'https://weibo.com/1788911247?refer_flag=1001030103_',
  x: 'https://x.com/oooodjdjd',
}

export function PlatformConnectionsPanel({ onMessage }: Props) {
  const { data, mutate, isLoading } = useSWR('auth-platforms', () => authApi.platforms(), {
    revalidateOnFocus: false,
  })

  const platforms: PlatformStatus[] = data?.platforms || []

  const [qrLoginPlatform, setQrLoginPlatform] = useState<string | null>(null)
  const [qrSession, setQrSession] = useState<LoginSession | null>(null)
  const [manualPlatform, setManualPlatform] = useState<string | null>(null)
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null)

  const testStatusText = useMemo(() => {
    if (!testingPlatform) {
      return null
    }
    const current = platforms.find((p) => p.platform === testingPlatform)
    return current ? `正在测试 ${current.displayName} 连接...` : '正在测试平台连接...'
  }, [platforms, testingPlatform])

  const handleQrLogin = useCallback(
    async (platform: string) => {
      try {
        const result = await authApi.startSession(platform)
        if (result.ok) {
          setQrLoginPlatform(platform)
          setQrSession(result.session)
        }
      } catch (err) {
        onMessage?.(err instanceof Error ? err.message : '启动登录失败')
      }
    },
    [onMessage]
  )

  useEffect(() => {
    if (!qrLoginPlatform || !qrSession) return
    if (
      qrSession.state === 'cookie_saved' ||
      qrSession.state === 'confirmed' ||
      qrSession.state === 'failed' ||
      qrSession.state === 'cancelled'
    ) {
      return
    }

    const interval = setInterval(async () => {
      try {
        const result = await authApi.sessionStatus(qrLoginPlatform, qrSession.sessionId)
        if (!result.ok) return

        setQrSession(result.session)
        if (result.session.state === 'cookie_saved' || result.session.state === 'confirmed') {
          clearInterval(interval)
          onMessage?.('登录成功，凭证已保存并生效')
          setTimeout(() => {
            setQrLoginPlatform(null)
            setQrSession(null)
            mutate()
          }, 1200)
        } else if (result.session.state === 'failed' || result.session.state === 'cancelled') {
          clearInterval(interval)
          setQrLoginPlatform(null)
          setQrSession(null)
        }
      } catch {
        // ignore polling errors
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [qrLoginPlatform, qrSession, mutate, onMessage])

  const handleCancelQr = useCallback(async () => {
    if (qrLoginPlatform && qrSession) {
      await authApi.cancelSession(qrLoginPlatform, qrSession.sessionId)
    }
    setQrLoginPlatform(null)
    setQrSession(null)
  }, [qrLoginPlatform, qrSession])

  const handleSaveCredential = useCallback(
    async (platform: string, value: string) => {
      try {
        await authApi.saveCredential(platform, value)
        onMessage?.('凭证已保存')
        setManualPlatform(null)
        mutate()
      } catch (err) {
        onMessage?.(err instanceof Error ? err.message : '保存凭证失败')
      }
    },
    [mutate, onMessage]
  )

  const handleDeleteCredential = useCallback(
    async (platform: string) => {
      try {
        await authApi.deleteCredential(platform)
        onMessage?.('连接已断开')
        mutate()
      } catch (err) {
        onMessage?.(err instanceof Error ? err.message : '断开连接失败')
      }
    },
    [mutate, onMessage]
  )

  const handleTestConnection = useCallback(
    async (platform: string) => {
      setTestingPlatform(platform)
      try {
        const url = DEFAULT_TEST_URLS[platform]
        const result = await authApi.test(platform, url)
        const summary = result.result.success
          ? `[${platform}] 测试成功 (${result.result.statusCode ?? 'n/a'})`
          : `[${platform}] 测试失败: ${result.result.message}`
        onMessage?.(summary)
      } catch (err) {
        onMessage?.(err instanceof Error ? err.message : '平台测试失败')
      } finally {
        setTestingPlatform(null)
      }
    },
    [onMessage]
  )

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">加载中...</div>
  }

  return (
    <>
      <div className="space-y-3" data-testid="platform-connections-panel">
        <p className="mb-4 text-sm text-gray-500">连接需要登录的平台后，相关订阅源才可稳定采集。</p>
        {testStatusText && <p className="text-xs text-blue-600">{testStatusText}</p>}

        {platforms.map((platform) => (
          <PlatformCard
            key={platform.platform}
            platform={platform}
            isTesting={testingPlatform === platform.platform}
            onQrLogin={() => handleQrLogin(platform.platform)}
            onManualLogin={() => setManualPlatform(platform.platform)}
            onDelete={() => handleDeleteCredential(platform.platform)}
            onTest={() => handleTestConnection(platform.platform)}
          />
        ))}

        <div className="mt-6 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
          <p className="text-sm text-gray-500">
            公开信源无需登录：YouTube、B站、新闻 RSS、自定义 RSS。
          </p>
        </div>
      </div>

      {qrLoginPlatform && qrSession && (
        <QrLoginModal platform={qrLoginPlatform} session={qrSession} onCancel={handleCancelQr} />
      )}

      {manualPlatform && (
        <ManualCredentialModal
          platform={manualPlatform}
          onSave={(value) => handleSaveCredential(manualPlatform, value)}
          onClose={() => setManualPlatform(null)}
        />
      )}
    </>
  )
}

interface PlatformCardProps {
  platform: PlatformStatus
  isTesting: boolean
  onQrLogin: () => void
  onManualLogin: () => void
  onDelete: () => void
  onTest: () => void
}

function PlatformCard({ platform, isTesting, onQrLogin, onManualLogin, onDelete, onTest }: PlatformCardProps) {
  const isConnected = platform.status === 'connected'
  const isStale = platform.status === 'expired' || platform.status === 'invalid'

  const statusLabel = isConnected ? '已连接' : isStale ? (platform.status === 'expired' ? '已过期' : '已失效') : '未连接'
  const statusColor = isConnected ? 'text-green-600' : isStale ? 'text-amber-600' : 'text-red-500'
  const statusBg = isConnected ? 'bg-green-50 dark:bg-green-900/20' : isStale ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-red-50 dark:bg-red-900/20'
  const healthTone =
    platform.healthState === 'expired'
      ? 'text-amber-700'
      : platform.healthState === 'warning'
        ? 'text-amber-600'
        : 'text-gray-500'

  return (
    <div
      className={`rounded-lg border border-gray-200 p-4 dark:border-gray-700 ${statusBg}`}
      data-testid={`platform-card-${platform.platform}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{platform.icon}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{platform.displayName}</span>
        </div>
        <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
      </div>

      {(isConnected || isStale) && (platform.cookiePreview || platform.tokenPreview) && (
        <div className="mb-3 flex gap-4 text-xs text-gray-500">
          {platform.cookiePreview && <span>Cookie: {platform.cookiePreview}</span>}
          {platform.tokenPreview && <span>Token: {platform.tokenPreview}</span>}
        </div>
      )}

      {(isConnected || isStale) && (platform.warningMessage || platform.lastSuccessfulUseAt) && (
        <div className={`mb-3 space-y-1 text-xs ${healthTone}`}>
          {platform.warningMessage && <p>{platform.warningMessage}</p>}
          {platform.lastSuccessfulUseAt && <p>最近一次成功使用: {platform.lastSuccessfulUseAt}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {platform.capability.qrLogin && (
          <button
            onClick={onQrLogin}
            data-testid={`connect-platform-${platform.platform}`}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-600"
          >
            连接{platform.displayName}
          </button>
        )}
        {platform.capability.manualCredential && (
          <button
            onClick={onManualLogin}
            data-testid={`manual-platform-${platform.platform}`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            手动填写{platform.capability.qrLogin ? '凭证' : 'Cookie'}
          </button>
        )}
        <button
          onClick={onTest}
          disabled={isTesting}
          data-testid={`test-platform-${platform.platform}`}
          className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          {isTesting ? '测试中...' : '测试连接'}
        </button>
        {(isConnected || isStale) && (
          <button
            onClick={onDelete}
            data-testid={`disconnect-platform-${platform.platform}`}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 transition-colors hover:text-red-600 dark:border-red-800"
          >
            断开
          </button>
        )}
      </div>
    </div>
  )
}
