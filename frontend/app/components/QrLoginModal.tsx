'use client'

import { type LoginSession } from '../lib/api'
import { ActionButton } from './ActionButton'

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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative mx-4 w-full max-w-sm overflow-hidden rounded-2xl bg-bg-secondary shadow-2xl">
        <div className="border-b border-border-color px-6 py-4">
          <h3 className="text-lg font-semibold text-text-primary">连接{platformName}</h3>
        </div>

        <div className="flex min-h-[160px] flex-col items-center justify-center px-6 py-6">
          {session.state === 'cookie_saved' || session.state === 'confirmed' ? (
            <div className="text-center">
              <div className="text-4xl mb-2">✅</div>
              <p className="font-medium text-success">{message}</p>
            </div>
          ) : session.state === 'failed' || session.state === 'expired' ? (
            <div className="text-center">
              <div className="text-4xl mb-2">❌</div>
              <p className="text-error">{session.error || message}</p>
            </div>
          ) : session.state === 'cancelled' ? (
            <div className="text-center">
              <div className="text-4xl mb-2">ℹ️</div>
              <p className="text-text-secondary">{message}</p>
            </div>
          ) : showQrImage ? (
            <div className="text-center">
              <p className="mb-3 text-text-secondary">{message}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.qrcodeUrl}
                alt="微信登录二维码"
                className="mx-auto h-48 w-48 rounded-lg border border-border-color"
              />
              <p className="mt-2 text-xs text-text-muted">请用微信扫描二维码</p>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl mb-2 animate-pulse">🔔</div>
              <p className="text-text-secondary">{message}</p>
              {isWaitingOrScanning && platform !== 'wechat' && (
                <p className="mt-1 text-xs text-text-muted">请在浏览器窗口中完成登录</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-color bg-bg-primary px-6 py-4">
          <ActionButton
            onClick={onCancel}
            variant="secondary"
          >
            取消
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
