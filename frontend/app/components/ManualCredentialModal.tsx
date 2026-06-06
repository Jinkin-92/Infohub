'use client'

import { useState } from 'react'

const PLATFORM_CONFIG: Record<string, { name: string; label: string; placeholder: string }> = {
  weibo: { name: '微博', label: 'Cookie', placeholder: 'SUB=xxx; SUBP=xxx' },
  x: { name: 'X/Twitter', label: 'auth_token 和 ct0', placeholder: '' },
  xiaohongshu: { name: '小红书', label: 'Cookie', placeholder: 'a1=xxx; webId=xxx' },
  zhihu: { name: '知乎', label: 'Cookie', placeholder: 'z_c0=xxx' },
  wechat: { name: '微信公众号', label: 'Cookie 和 Token', placeholder: '填入 Cookie\n第二行填入 Token' },
}

const X_FIELD_LABELS = ['auth_token', 'ct0']

interface Props {
  platform: string
  onSave: (value: string) => void
  onClose: () => void
}

export function ManualCredentialModal({ platform, onSave, onClose }: Props) {
  const config = PLATFORM_CONFIG[platform] || { name: platform, label: '凭证', placeholder: '' }
  const [value, setValue] = useState('')
  const [xFields, setXFields] = useState({ auth_token: '', ct0: '' })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      if (platform === 'x') {
        const combined = `auth_token=${xFields.auth_token.trim()}; ct0=${xFields.ct0.trim()}`
        await onSave(combined)
      } else {
        await onSave(value.trim())
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          手动填写{config.name}凭证
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {platform === 'wechat'
            ? '请填写 Cookie 和 Token，每个占一行'
            : `请填写 ${config.label}（从浏览器开发者工具 Cookie 中复制）`}
        </p>

        {platform === 'wechat' ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={"Cookie\nToken"}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : platform === 'x' ? (
          <div className="space-y-3">
            {X_FIELD_LABELS.map((field) => (
              <div key={field}>
                <label className="mb-1.5 block text-sm font-medium text-gray-600 dark:text-gray-400">
                  {field}
                </label>
                <input
                  type="text"
                  value={xFields[field as keyof typeof xFields]}
                  onChange={(e) => setXFields((prev) => ({ ...prev, [field]: e.target.value }))}
                  placeholder={`只填入 ${field} 的值，示例：abc123xyz`}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-1">
              打开 x.com → 登录 → 按 F12 打开开发者工具 → Application → Cookies → x.com → 找到 auth_token 和 ct0，复制对应的值分别粘贴到上方输入框。
            </p>
          </div>
        ) : (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={config.placeholder}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (platform === 'x' ? (!xFields.auth_token.trim() || !xFields.ct0.trim()) : !value.trim())}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
