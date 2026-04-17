'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Frontend] Global error boundary caught an error:', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body className="bg-bg-primary">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-2xl border border-border-color bg-bg-secondary p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-text-primary">InfoHub 暂时不可用</h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              前端捕获到一次全局异常。你可以先尝试恢复当前页面，如果仍然失败，再重启 InfoHub。
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => reset()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                尝试恢复
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg border border-border-color px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
