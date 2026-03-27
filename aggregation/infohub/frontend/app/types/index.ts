export interface Source {
  id: number
  name: string
  platform: 'zhihu' | 'x' | 'news' | 'custom' | 'bilibili' | 'youtube' | 'wechat'
  input_url: string
  rss_url: string
  platform_id: string | null
  fetch_interval_min: number
  enabled: boolean
  status: 'active' | 'error' | 'disabled'
  error_count: number
  last_error: string | null
  last_error_at?: string | null
  last_fetched_at: string | null
  last_success_at?: string | null
  created_at: string
  updated_at?: string
}

export interface Item {
  id: number
  source_id: number
  title: string
  summary: string | null
  url: string
  author: string | null
  cover_url: string | null
  platform: string
  published_at: string
  is_read?: boolean
  tags?: Tag[]
}

export interface Tag {
  id: number
  name: string
  color: string
  description: string | null
  sort_order: number
  created_at: string
}

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

export interface FeedListResponse {
  ok: boolean
  items: Item[]
  pagination: {
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface UnreadBreakdownResponse {
  ok: boolean
  count: number
  by_platform: Record<string, number>
  by_source: Record<string, number>
}

export interface PlatformConfig {
  id: string
  name: string
  color: string
  icon: string
}

export interface IntegrationSetting {
  key: string
  label: string
  description: string
  placeholder: string
  value: string
  configured: boolean
}

export interface RsshubSettingsResponse {
  ok: boolean
  rsshub: {
    running: boolean
    port: number
    envPath: string
    settings: IntegrationSetting[]
  }
  message?: string
}

export const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  zhihu: { id: 'zhihu', name: '知乎', color: '#0084FF', icon: 'zhihu' },
  x: { id: 'x', name: 'X', color: '#000000', icon: 'x' },
  bilibili: { id: 'bilibili', name: 'B站', color: '#FB7299', icon: 'bilibili' },
  youtube: { id: 'youtube', name: 'YouTube', color: '#FF0000', icon: 'youtube' },
  wechat: { id: 'wechat', name: '微信公众号', color: '#07C160', icon: 'wechat' },
  news: { id: 'news', name: '新闻', color: '#FF6B6B', icon: 'news' },
  custom: { id: 'custom', name: 'RSS', color: '#6B7280', icon: 'rss' },
}
