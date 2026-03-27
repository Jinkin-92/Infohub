'use client'

import { useState, useCallback } from 'react'
import { cn } from '../lib/utils'
import { sourcesApi } from '../lib/api'
import { PLATFORM_CONFIG } from '../types'

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
  const [error, setError] = useState<string | null>(null)
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null)

  // 重置状态
  const resetState = useCallback(() => {
    setUrl('')
    setError(null)
    setDetectedPlatform(null)
    setIsLoading(false)
  }, [])

  // 关闭弹窗
  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  // 检测平台类型
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

  // 处理输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUrl(value)
    setError(null)
    detectPlatform(value)
  }, [detectPlatform])

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
      <div className="relative bg-bg-secondary rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
                支持知乎、X(Twitter)、RSS 订阅
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

          {/* 示例链接 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">
              快速示例
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fillExample('https://www.zhihu.com/people/example')}
                className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-primary text-text-secondary hover:text-text-primary rounded-lg transition-colors"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{ backgroundColor: PLATFORM_CONFIG.zhihu.color }}
                />
                知乎用户
              </button>
              <button
                type="button"
                onClick={() => fillExample('https://x.com/example')}
                className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-primary text-text-secondary hover:text-text-primary rounded-lg transition-colors"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{ backgroundColor: PLATFORM_CONFIG.x.color }}
                />
                X 用户
              </button>
              <button
                type="button"
                onClick={() => fillExample('https://space.bilibili.com/435931665/upload/video')}
                className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-primary text-text-secondary hover:text-text-primary rounded-lg transition-colors"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{ backgroundColor: PLATFORM_CONFIG.bilibili.color }}
                />
                B站 UP主
              </button>
              <button
                type="button"
                onClick={() => fillExample('https://youtube.com/@example')}
                className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-primary text-text-secondary hover:text-text-primary rounded-lg transition-colors"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{ backgroundColor: PLATFORM_CONFIG.youtube.color }}
                />
                YouTube 频道
              </button>
              <button
                type="button"
                onClick={() => fillExample('https://example.com/feed.xml')}
                className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-primary text-text-secondary hover:text-text-primary rounded-lg transition-colors"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{ backgroundColor: PLATFORM_CONFIG.custom.color }}
                />
                RSS 订阅
              </button>
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
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className={cn(
                'px-5 py-2.5 text-sm font-medium text-white rounded-xl',
                'bg-accent hover:bg-accent-hover',
                'transition-all duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
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
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
