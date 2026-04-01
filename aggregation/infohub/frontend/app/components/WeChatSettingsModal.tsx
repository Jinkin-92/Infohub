'use client'

import { useState, useEffect } from 'react'
import { wechatApi } from '../lib/api'

interface WeChatSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function WeChatSettingsModal({ isOpen, onClose }: WeChatSettingsModalProps) {
  const [cookie, setCookie] = useState('')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<{
    configured: boolean
    cookieConfigured: boolean
    tokenConfigured: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [collecting, setCollecting] = useState(false)
  const [collectResult, setCollectResult] = useState<string | null>(null)

  // 加载状态
  useEffect(() => {
    if (isOpen) {
      loadStatus()
    }
  }, [isOpen])

  async function loadStatus() {
    try {
      const res = await wechatApi.getAuthStatus()
      if (res.ok && res.data) {
        setStatus(res.data)
        // 如果已配置，不显示明文
        setCookie(res.data.cookieConfigured ? '********' : '')
        setToken(res.data.tokenConfigured ? '********' : '')
      }
    } catch {
      setError('Failed to load status')
    }
  }

  async function handleSave() {
    if (!cookie || !token) {
      setError('Cookie and Token are required')
      return
    }

    if (cookie === '********' && token === '********') {
      // 没有实际修改
      setSuccess('Settings unchanged')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await wechatApi.setCredentials({ cookie, token })
      if (res.ok) {
        setSuccess('Credentials saved successfully')
        await loadStatus()
      } else {
        setError(res.error || 'Failed to save')
      }
    } catch {
      setError('Failed to save credentials')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await wechatApi.verifyCredentials()
      if (res.ok && res.data?.valid) {
        setSuccess('Credentials are valid!')
      } else {
        setError('Credentials are invalid')
      }
    } catch {
      setError('Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleCollect() {
    setCollecting(true)
    setCollectResult(null)
    setError(null)

    try {
      const res = await wechatApi.collect()
      if (res.ok && res.data) {
        const total = Object.values(res.data.collected).reduce((sum, n) => sum + n, 0)
        setCollectResult(`Collected ${total} articles from ${res.data.totalSources} sources`)
        await loadStatus()
      } else {
        setError(res.error || 'Collection failed')
      }
    } catch {
      setError('Collection failed')
    } finally {
      setCollecting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-bg-primary p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">微信公众号设置</h2>
            <p className="mt-1 text-sm text-text-secondary">
              配置微信 cookie 和 token 来采集公众号文章
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status */}
        {status && (
          <div className="mb-6 rounded-lg bg-bg-tertiary p-4">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${status.configured ? 'bg-green-500' : 'bg-yellow-500'}`}
              />
              <span className="text-text-secondary">
                {status.configured ? '已配置认证信息' : '未配置认证信息'}
              </span>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-text-secondary">
              <span>Cookie: {status.cookieConfigured ? '✓' : '✗'}</span>
              <span>Token: {status.tokenConfigured ? '✓' : '✗'}</span>
            </div>
          </div>
        )}

        {/* Error/Success */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-green-500/10 p-3 text-sm text-green-500">{success}</div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Cookie
            </label>
            <input
              type="password"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="wxuin..."
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              从微信公众平台获取，建议使用专门的账号
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="1234567890"
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              微信公众平台的 token 值（纯数字）
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存设置'}
            </button>
            <button
              onClick={handleVerify}
              disabled={loading || !status?.configured}
              className="flex-1 rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
            >
              验证
            </button>
          </div>
        </div>

        {/* Collection */}
        {status?.configured && (
          <div className="mt-6 border-t border-border pt-6">
            <h3 className="mb-3 text-sm font-medium text-text-primary">采集文章</h3>
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {collecting ? '采集中...' : '立即采集所有公众号'}
            </button>
            {collectResult && (
              <p className="mt-2 text-sm text-green-500">{collectResult}</p>
            )}
            <p className="mt-2 text-xs text-text-tertiary">
              采集可能需要几分钟，取决于公众号数量和网络状况
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
