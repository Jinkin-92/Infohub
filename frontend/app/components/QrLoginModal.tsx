'use client'

import { type LoginSession } from '../lib/api'

const PLATFORM_NAMES: Record<string, string> = {
  wechat: '微信公众号',
  weibo: '微博',
  x: 'X/Twitter',
  xiaohongshu: '小红书',
}

const STATE_MESSAGES: Record<string, string> = {
  launching: '正在获取二维码…',
  awaiting_user_action: '等待扫码…',
  awaiting_login: '请在打开的浏览器窗口中扫码或登录',
  confirmed: '登录成功',
  login_detected: '检测到登录成功，正在保存…',
  cookie_saved: '登录成功，Cookie 已保存',
  expired: '二维码已过期，请重新获取',
  failed: '登录失败',
  cancelled: '已取消',
}

interface Props {
  platform: string
  session: LoginSession
  onCancel: () => void
}

export function QrLoginModal({ platform, session, onCancel }: Props) {
  const platformName = PLATFORM_NAMES[platform] || platform
  const message = STATE_MESSAGES[session.state] || session.message || ''

  // 微信有二维码图片，其他平台是独立浏览器窗口
  const showQrImage = platform === 'wechat' && session.qrcodeUrl
  const isWaitingOrScanning = ['launching', 'awaiting_user_action', 'awaiting_login', 'login_detected'].includes(session.state)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          连接{platformName}
        </h3>

        <div className="min-h-[80px] flex flex-col items-center justify-center">
          {session.state === 'cookie_saved' || session.state === 'confirmed' ? (
            <div className="text-center">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-green-600 font-medium">{message}</p>
            </div>
          ) : session.state === 'failed' || session.state === 'expired' ? (
            <div className="text-center">
              <div className="text-4xl mb-2">❌</div>
              <p className="text-red-500">{session.error || message}</p>
            </div>
          ) : session.state === 'cancelled' ? (
            <div className="text-center">
              <div className="text-4xl mb-2">ℹ️</div>
              <p className="text-gray-500">{message}</p>
            </div>
          ) : showQrImage ? (
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-300 mb-3">{message}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.qrcodeUrl}
                alt="微信登录二维码"
                className="w-48 h-48 mx-auto rounded-lg border border-gray-200 dark:border-gray-700"
              />
              <p className="text-xs text-gray-400 mt-2">请用微信扫描二维码</p>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl mb-2 animate-pulse">🔔</div>
              <p className="text-gray-600 dark:text-gray-300">{message}</p>
              {isWaitingOrScanning && platform !== 'wechat' && (
                <p className="text-xs text-gray-400 mt-1">请在浏览器窗口中完成登录</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
