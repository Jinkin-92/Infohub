'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '../lib/utils'
import { sourcesApi } from '../lib/api'
import { PLATFORM_CONFIG } from '../types'
import { ActionButton } from './ActionButton'
import { SourceChip } from './SourceChip'

interface DetectionResult {
  platform: string
  platformId: string
  rssUrl: string
  displayName: string
}

interface AddSourceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

/**
 * 添加订阅源弹窗
 */
export function AddSourceModal({ isOpen, onClose, onSuccess }: AddSourceModalProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null)
  const [detectedSource, setDetectedSource] = useState<DetectionResult | null>(null)
  const detectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 重置状态
  const resetState = useCallback(() => {
    setUrl('')
    setError(null)
    setDetectedPlatform(null)
    setDetectedSource(null)
    setIsLoading(false)
    setIsDetecting(false)
  }, [])

  // 关闭弹窗
  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  // 检测平台类型 (快速本地检测)
  const detectPlatform = useCallback((input: string) => {
    if (!input) {
      setDetectedPlatform(null)
      return
    }

    // 知乎
    if (input.includes('zhihu.com') || input.includes('zhuanlan.zhihu.com')) {
      setDetectedPlatform('zhihu')
      return
    }

    // X/Twitter
    if (input.includes('x.com') || input.includes('twitter.com')) {
      setDetectedPlatform('x')
      return
    }

    // 微信公众号文章
    if (input.includes('mp.weixin.qq.com')) {
      setDetectedPlatform('wechat')
      return
    }

    // 传送门公众号
    if (input.includes('chuansongme.com')) {
      setDetectedPlatform('wechat')
      return
    }

    // 微博
    if (input.includes('weibo.com') || input.includes('weibo.cn')) {
      setDetectedPlatform('weibo')
      return
    }

    // B站
    if (input.includes('bilibili.com') || input.includes('space.bilibili.com')) {
      setDetectedPlatform('bilibili')
      return
    }

    // YouTube
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
      setDetectedPlatform('youtube')
      return
    }

    // 通用 RSS
    if (input.endsWith('.xml') || input.includes('rss') || input.includes('feed')) {
      setDetectedPlatform('custom')
      return
    }

    setDetectedPlatform(null)
  }, [])

  // 远程检测订阅源 (获取真实名称)
  const detectSource = useCallback(async (inputUrl: string) => {
    if (!inputUrl || !inputUrl.startsWith('http')) {
      setDetectedSource(null)
      return
    }

    setIsDetecting(true)
    try {
      const response = await sourcesApi.detect(inputUrl)
      if (response.ok && response.detected) {
        setDetectedSource(response.detected)
        // 同时更新 platform 显示
        setDetectedPlatform(response.detected.platform)
      } else {
        setDetectedSource(null)
      }
    } catch {
      setDetectedSource(null)
    } finally {
      setIsDetecting(false)
    }
  }, [])

  // 处理输入变化 - 防抖检测
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUrl(value)
    setError(null)
    detectPlatform(value)

    // 清除之前的定时器
    if (detectTimeoutRef.current) {
      clearTimeout(detectTimeoutRef.current)
    }

    // 防抖延迟检测
    detectTimeoutRef.current = setTimeout(() => {
      detectSource(value)
    }, 800)
  }, [detectPlatform, detectSource])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (detectTimeoutRef.current) {
        clearTimeout(detectTimeoutRef.current)
      }
    }
  }, [])

  // 提交表单
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) {
      setError('请输入订阅源地址')
      return
    }

    // 基本URL验证
    try {
      new URL(url)
    } catch {
      setError('请输入有效的URL地址')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await sourcesApi.create(url.trim())
      resetState()
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }, [url, resetState, onSuccess, onClose])

  // 使用示例
  const fillExample = useCallback((exampleUrl: string) => {
    setUrl(exampleUrl)
    detectPlatform(exampleUrl)
  }, [detectPlatform])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* 弹窗内容 */}
      <div
        className="relative bg-bg-secondary rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        data-testid="add-source-modal"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                添加订阅源
              </h2>
              <p className="text-sm text-text-secondary">
                支持知乎、X、微信、微博、B站、YouTube、RSS
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* URL 输入 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              订阅源地址
            </label>
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={handleInputChange}
                data-testid="add-source-url-input"
                placeholder="https://..."
                disabled={isLoading}
                className={cn(
                  'w-full px-4 py-3 rounded-xl border bg-bg-secondary',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                  'transition-all duration-150',
                  error && 'border-error focus:border-error focus:ring-error/20',
                  isLoading && 'opacity-60 cursor-not-allowed'
                )}
              />
              {/* 平台检测指示器 */}
              {detectedPlatform && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 bg-bg-tertiary rounded-full">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: PLATFORM_CONFIG[detectedPlatform]?.color }}
                  />
                  <span className="text-xs font-medium text-text-secondary">
                    {PLATFORM_CONFIG[detectedPlatform]?.name}
                  </span>
                </div>
              )}
            </div>
            {error && (
              <p className="text-sm text-error flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            )}
          </div>

          {/* 检测结果预览 */}
          {(detectedSource || isDetecting) && url.trim() && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-secondary">
                识别结果
              </label>
              <div className="p-4 bg-bg-tertiary rounded-xl border border-border-color">
                {isDetecting ? (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm text-text-secondary">正在识别...</span>
                  </div>
                ) : detectedSource ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: PLATFORM_CONFIG[detectedSource.platform]?.color + '20' }}
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PLATFORM_CONFIG[detectedSource.platform]?.color }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {detectedSource.displayName}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {PLATFORM_CONFIG[detectedSource.platform]?.name} · {detectedSource.rssUrl.length > 40 ? detectedSource.rssUrl.slice(0, 40) + '...' : detectedSource.rssUrl}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* 示例链接 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">
              快速示例
            </label>
            <div className="flex flex-wrap gap-2">
              <SourceChip
                type="button"
                onClick={() => fillExample('https://www.zhihu.com/people/example')}
                accentColor={PLATFORM_CONFIG.zhihu.color}
                className="px-3 py-1.5 text-sm"
              >
                知乎用户
              </SourceChip>
              <SourceChip
                type="button"
                onClick={() => fillExample('https://x.com/example')}
                accentColor={PLATFORM_CONFIG.x.color}
                className="px-3 py-1.5 text-sm"
              >
                X 用户
              </SourceChip>
              <SourceChip
                type="button"
                onClick={() => fillExample('https://space.bilibili.com/435931665/upload/video')}
                accentColor={PLATFORM_CONFIG.bilibili.color}
                className="px-3 py-1.5 text-sm"
              >
                B站 UP主
              </SourceChip>
              <SourceChip
                type="button"
                onClick={() => fillExample('https://youtube.com/@example')}
                accentColor={PLATFORM_CONFIG.youtube.color}
                className="px-3 py-1.5 text-sm"
              >
                YouTube 频道
              </SourceChip>
              <SourceChip
                type="button"
                onClick={() => fillExample('https://mp.weixin.qq.com/s/rkU039BJIpkGe0ntrOG76g')}
                accentColor={PLATFORM_CONFIG.wechat.color}
                className="px-3 py-1.5 text-sm"
              >
                微信公众号
              </SourceChip>
              <SourceChip
                type="button"
                onClick={() => fillExample('https://weibo.com/u/1234567890')}
                accentColor={PLATFORM_CONFIG.weibo.color}
                className="px-3 py-1.5 text-sm"
              >
                微博用户
              </SourceChip>
              <SourceChip
                type="button"
                onClick={() => fillExample('https://example.com/feed.xml')}
                accentColor={PLATFORM_CONFIG.custom.color}
                className="px-3 py-1.5 text-sm"
              >
                RSS 订阅
              </SourceChip>
            </div>
          </div>

          {/* 说明文字 */}
          <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-text-secondary space-y-1">
                <p className="font-medium text-text-primary">提示</p>
                <p>系统会自动识别平台类型并转换为 RSS 订阅。采集可能需要几分钟时间。</p>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <ActionButton
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              variant="subtle"
              size="md"
            >
              取消
            </ActionButton>
            <ActionButton
              type="submit"
              disabled={isLoading || !url.trim()}
              data-testid="submit-add-source"
              variant="primary"
              size="md"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  添加中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  添加订阅
                </>
              )}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  )
}
