'use client'

import { useState } from 'react'

const PLATFORM_CONFIG: Record<string, { name: string; label: string; placeholder: string }> = {
  weibo: { name: '微博', label: 'Cookie', placeholder: 'SUB=xxx; SUBP=xxx' },
  x: { name: 'X/Twitter', label: 'Cookie', placeholder: 'auth_token=xxx; ct0=xxx' },
  xiaohongshu: { name: '小红书', label: 'Cookie', placeholder: 'a1=xxx; webId=xxx' },
  zhihu: { name: '知乎', label: 'Cookie', placeholder: 'z_c0=xxx' },
  wechat: { name: '微信公众号', label: 'Cookie 和 Token', placeholder: '填入 Cookie\n第二行填入 Token' },
}

interface Props {
  platform: string
  onSave: (value: string) => void
  onClose: () => void
}

export function ManualCredentialModal({ platform, onSave, onClose }: Props) {
  const config = PLATFORM_CONFIG[platform] || { name: platform, label: '凭证', placeholder: '' }
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await onSave(value.trim())
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
            disabled={!value.trim() || saving}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
