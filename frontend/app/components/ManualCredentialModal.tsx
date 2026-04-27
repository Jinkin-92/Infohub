'use client'

import { useState } from 'react'
import { ActionButton } from './ActionButton'
import { TextAreaField } from './FormField'

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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-bg-secondary shadow-2xl">
        <div className="border-b border-border-color px-6 py-4">
          <h3 className="text-lg font-semibold text-text-primary">手动填写{config.name}凭证</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {platform === 'wechat'
              ? '请填写 Cookie 和 Token，每个占一行。'
              : `请填写 ${config.label}，通常从浏览器开发者工具 Cookie 中复制。`}
          </p>
        </div>

        <div className="p-6">
          <TextAreaField
            label={config.label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={platform === 'wechat' ? 'Cookie\nToken' : config.placeholder}
            rows={4}
            disabled={saving}
            className="font-mono"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border-color bg-bg-primary px-6 py-4">
          <ActionButton
            onClick={onClose}
            variant="subtle"
            disabled={saving}
          >
            取消
          </ActionButton>
          <ActionButton
            onClick={handleSave}
            disabled={!value.trim() || saving}
            variant="primary"
          >
            {saving ? '保存中…' : '保存'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
