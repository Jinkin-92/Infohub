export interface Source {
  id: number
  name: string
  platform: 'zhihu' | 'x' | 'news' | 'custom' | 'bilibili' | 'youtube' | 'wechat' | 'weibo'
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
  is_public?: boolean
  public_source_id?: number | null
  category?: string
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
  favorite?: FavoriteTag | null
}

export interface FavoriteTag {
  id: number
  name: string
  sort_order: number
  created_at: string
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

// Feed API 请求参数
export interface FeedParams {
  platform?: string
  limit?: number
  offset?: number
  unread_only?: boolean
  search?: string
  is_public?: 'true' | 'false'
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
  scheduler: {
    enabled: boolean
    isCollecting: boolean
    lastRunAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
  }
  message?: string
}

export const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  zhihu: { id: 'zhihu', name: '知乎', color: '#0084FF', icon: 'zhihu' },
  x: { id: 'x', name: 'X', color: '#000000', icon: 'x' },
  bilibili: { id: 'bilibili', name: 'B站', color: '#FB7299', icon: 'bilibili' },
  youtube: { id: 'youtube', name: 'YouTube', color: '#FF0000', icon: 'youtube' },
  wechat: { id: 'wechat', name: '微信公众号', color: '#07C160', icon: 'wechat' },
  weibo: { id: 'weibo', name: '微博', color: '#E6162D', icon: 'weibo' },
  news: { id: 'news', name: '新闻', color: '#FF6B6B', icon: 'news' },
  custom: { id: 'custom', name: 'RSS', color: '#6B7280', icon: 'rss' },
}

export interface PublicSource {
  id: number
  name: string
  url: string
  rss_url: string
  platform: string
  category: string
  description: string | null
  enabled: boolean
  subscribed_count: number
  created_at: string
}

export interface PublicSourceCategory {
  id: number
  slug: string
  name: string
  sort_order: number
  created_at: string
}

export const PUBLIC_CATEGORY_CONFIG: Record<string, PlatformConfig> = {
  tech: { id: 'tech', name: '科技', color: '#6366F1', icon: 'tech' },
  news: { id: 'news', name: '新闻', color: '#EF4444', icon: 'news' },
  finance: { id: 'finance', name: '财经', color: '#F59E0B', icon: 'finance' },
  life: { id: 'life', name: '生活', color: '#10B981', icon: 'life' },
  design: { id: 'design', name: '设计', color: '#8B5CF6', icon: 'design' },
  video: { id: 'video', name: '视频', color: '#EC4899', icon: 'video' },
  aggregator: { id: 'aggregator', name: '聚合', color: '#6B7280', icon: 'aggregator' },
}
