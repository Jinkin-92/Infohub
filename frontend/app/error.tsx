'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Frontend] Route error boundary caught an error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-lg rounded-2xl border border-border-color bg-bg-secondary p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-text-primary">页面暂时加载失败</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          我们已经拦截到这次页面异常。你可以先重试一次；如果问题持续，重新启动 InfoHub 一般可以恢复。
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            重新加载页面
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-border-color px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            刷新应用
          </button>
        </div>
      </div>
    </div>
  )
}
