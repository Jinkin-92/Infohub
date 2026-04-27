import {
  Source,
  Item,
  FeedListResponse,
  Tag,
  FavoriteTag,
  RsshubSettingsResponse,
  UnreadBreakdownResponse,
} from '../types'

function resolveApiBase(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_BASE || '/api'
  }

  const explicit = process.env.NEXT_PUBLIC_API_BASE
  if (explicit) {
    return explicit
  }

  const { protocol, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:3002/api`
  }

  return '/api'
}

const API_BASE = resolveApiBase()

/**
 * 閫氱敤fetch灏佽
 */
async function fetchApi<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  let response: Response

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
  } catch {
    throw new Error(
      '无法连接本地服务，请确认 InfoHub 后端已经启动，然后访问 http://127.0.0.1:3002/health 检查是否正常。'
    )
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Feed API
 */
export const feedApi = {
  /**
   * 鑾峰彇Feed鍒楄〃
   */
  async getFeed(params?: {
    platform?: string
    sourceId?: number
    category?: string
    limit?: number
    offset?: number
    days?: number
    unread_only?: boolean
    search?: string
    is_public?: 'true' | 'false'
  }): Promise<FeedListResponse> {
    const query = new URLSearchParams()
    if (params?.platform) query.set('platform', params.platform)
    if (params?.sourceId) query.set('sourceId', params.sourceId.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.is_public) query.set('is_public', params.is_public)
    if (params?.unread_only) query.set('unread_only', 'true')
    if (params?.search) query.set('search', params.search)
    if (params?.days) query.set('days', params.days.toString())

    return fetchApi<FeedListResponse>(`${API_BASE}/feed?${query}`)
  },

  /**
   * 鑾峰彇鏈鏁伴噺
   */
  async getUnreadCount(): Promise<UnreadBreakdownResponse> {
    return fetchApi<UnreadBreakdownResponse>(`${API_BASE}/feed/unread-count`)
  },

  /**
   * 鏍囪宸茶
   */
  async markAsRead(itemId: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/feed/read`, {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId }),
    })
  },

  /**
   * 鎵归噺鏍囪宸茶
   */
  async markAllAsRead(platform?: string): Promise<{ ok: boolean; count: number }> {
    return fetchApi(`${API_BASE}/feed/read-all`, {
      method: 'POST',
      body: JSON.stringify({ platform }),
    })
  },
}

/**
 * Sources API
 */
export const sourcesApi = {
  /**
   * 鑾峰彇鎵€鏈夎闃呮簮
   */
  async getAll(): Promise<{ ok: boolean; sources: Source[] }> {
    return fetchApi(`${API_BASE}/sources`)
  },

  /**
   * 鑾峰彇鍗曚釜璁㈤槄婧?   */
  async getById(id: number): Promise<{ ok: boolean; source: Source }> {
    return fetchApi(`${API_BASE}/sources/${id}`)
  },

  /**
   * 鍒涘缓璁㈤槄婧?   */
  async create(url: string): Promise<{ ok: boolean; source: Source }> {
    return fetchApi(`${API_BASE}/sources`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  },

  /**
   * 棰勮璁㈤槄婧愭娴嬬粨鏋?   */
  async detect(url: string): Promise<{
    ok: boolean
    detected: {
      platform: string
      platformId: string
      rssUrl: string
      displayName: string
    }
  }> {
    return fetchApi(`${API_BASE}/sources/detect`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  },

  /**
   * 鏇存柊璁㈤槄婧?   */
  async update(
    id: number,
    data: { name?: string; enabled?: boolean }
  ): Promise<{ ok: boolean; source: Source }> {
    return fetchApi(`${API_BASE}/sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  /**
   * 鍒犻櫎璁㈤槄婧?   */
  async delete(id: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/sources/${id}`, {
      method: 'DELETE',
    })
  },

  /**
   * 鎵嬪姩瑙﹀彂閲囬泦
   */
  async collect(id: number): Promise<{
    ok: boolean
    result: {
      sourceId: number
      success: boolean
      itemCount: number
      skipped?: boolean
      error?: string
    }
  }> {
    return fetchApi(`${API_BASE}/sources/${id}/collect`, {
      method: 'POST',
    })
  },

  async collectAll(): Promise<{
    ok: boolean
    refresh: {
      started: boolean
      alreadyRunning: boolean
    }
    scheduler: {
      enabled: boolean
      isCollecting: boolean
      lastRunAt: string | null
      lastSuccessAt: string | null
      lastError: string | null
    }
    message?: string
  }> {
    return fetchApi(`${API_BASE}/sources/collect/all`, {
      method: 'POST',
    })
  },
}

/**
 * Tags API
 */
export const tagsApi = {
  /**
   * 鑾峰彇鎵€鏈夋爣绛?   */
  async getAll(): Promise<{ ok: boolean; tags: Tag[] }> {
    return fetchApi(`${API_BASE}/tags`)
  },

  /**
   * 鑾峰彇鍗曚釜鏍囩
   */
  async getById(id: number): Promise<{ ok: boolean; tag: Tag }> {
    return fetchApi(`${API_BASE}/tags/${id}`)
  },

  /**
   * 鍒涘缓鏍囩
   */
  async create(data: {
    name: string
    color?: string
    description?: string
    sort_order?: number
  }): Promise<{ ok: boolean; tag: Tag }> {
    return fetchApi(`${API_BASE}/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 鏇存柊鏍囩
   */
  async update(
    id: number,
    data: { name?: string; color?: string; description?: string; sort_order?: number }
  ): Promise<{ ok: boolean; tag: Tag }> {
    return fetchApi(`${API_BASE}/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  /**
   * 鍒犻櫎鏍囩
   */
  async delete(id: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/tags/${id}`, {
      method: 'DELETE',
    })
  },

  /**
   * 鑾峰彇鏍囩涓嬬殑鍐呭
   */
  async getItems(id: number, params?: { limit?: number; offset?: number }): Promise<{
    ok: boolean
    tag: Tag
    items: Item[]
    pagination: { limit: number; offset: number; hasMore: boolean }
  }> {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    return fetchApi(`${API_BASE}/tags/${id}/items?${query}`)
  },
}

/**
 * Item Tags API
 */
export const itemTagsApi = {
  /**
   * 鑾峰彇鍐呭鐨勬爣绛?   */
  async getTags(itemId: number): Promise<{ ok: boolean; tags: Tag[] }> {
    return fetchApi(`${API_BASE}/tags/items/${itemId}/tags`)
  },

  /**
   * 缁欏唴瀹规墦鏍囩
   */
  async addTag(itemId: number, tagId: number): Promise<{ ok: boolean; tags: Tag[] }> {
    return fetchApi(`${API_BASE}/tags/items/${itemId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_id: tagId }),
    })
  },

  /**
   * 绉婚櫎鍐呭鐨勬爣绛?   */
  async removeTag(itemId: number, tagId: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/tags/items/${itemId}/tags/${tagId}`, {
      method: 'DELETE',
    })
  },
}

// ============================================
// 收藏 API
// ============================================
export const favoritesApi = {
  async getTags(): Promise<{ ok: boolean; tags: FavoriteTag[] }> {
    return fetchApi(`${API_BASE}/favorites/tags`)
  },

  async createTag(data: { name: string; sort_order?: number }): Promise<{ ok: boolean; tag: FavoriteTag }> {
    return fetchApi(`${API_BASE}/favorites/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async deleteTag(id: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/favorites/tags/${id}`, {
      method: 'DELETE',
    })
  },

  async getFavorite(itemId: number): Promise<{ ok: boolean; favorite: FavoriteTag | null }> {
    return fetchApi(`${API_BASE}/favorites/items/${itemId}`)
  },

  async getItemsByTag(
    tagId: number,
    params?: { limit?: number; offset?: number }
  ): Promise<{
    ok: boolean
    tag: FavoriteTag
    items: Item[]
    pagination: { limit: number; offset: number; hasMore: boolean }
  }> {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    return fetchApi(`${API_BASE}/favorites/tags/${tagId}/items?${query}`)
  },

  async setFavorite(itemId: number, favoriteTagId: number): Promise<{ ok: boolean; favorite: FavoriteTag }> {
    return fetchApi(`${API_BASE}/favorites/items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify({ favorite_tag_id: favoriteTagId }),
    })
  },

  async removeFavorite(itemId: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/favorites/items/${itemId}`, {
      method: 'DELETE',
    })
  },
}

export const settingsApi = {
  async getIntegrations(): Promise<RsshubSettingsResponse> {
    return fetchApi(`${API_BASE}/settings/integrations`)
  },

  async saveIntegrations(values: Record<string, string>): Promise<RsshubSettingsResponse> {
    return fetchApi(`${API_BASE}/settings/integrations`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    })
  },

  async restartIntegrations(): Promise<RsshubSettingsResponse> {
    return fetchApi(`${API_BASE}/settings/integrations/restart`, {
      method: 'POST',
    })
  },
}

/**
 * Cookie API
 */
export interface CookieStatusResponse {
  ok: boolean
  data: {
    chromeConnected: boolean
    chromePort: number
    chromeError?: string
    platforms: Array<{
      platform: string
      key: string
      url: string
      configured: boolean
      loggedIn: boolean
    }>
  }
}

export interface CookieExtractResponse {
  ok: boolean
  data?: {
    total: number
    success: number
    failed: number
    results: Array<{
      platform: string
      success: boolean
      cookies: Record<string, string>
      error?: string
    }>
    settings: Array<{
      key: string
      label: string
      configured: boolean
    }>
  }
  error?: string
  code?: string
}

export interface WeiboLoginSession {
  sessionId: string
  state: 'launching' | 'awaiting_login' | 'login_detected' | 'cookie_saved' | 'failed' | 'cancelled'
  message: string
  startedAt: string
  updatedAt: string
  targetUrl: string
  currentUrl?: string
  cookieConfigured: boolean
  cookiePreview?: string
  error?: string
}

export const cookieApi = {
  /**
   * 鑾峰彇 Cookie 鐘舵€?   */
  async getStatus(): Promise<CookieStatusResponse> {
    return fetchApi(`${API_BASE}/cookie/status`)
  },

  /**
   * 浠?Chrome 鎻愬彇 Cookie
   */
  async extract(): Promise<CookieExtractResponse> {
    return fetchApi(`${API_BASE}/cookie/extract`, {
      method: 'POST',
    })
  },

  /**
   * 妫€鏌?Chrome 杩炴帴鐘舵€?   */
  async checkChrome(): Promise<{ ok: boolean; data: { connected: boolean; port: number; error?: string } }> {
    return fetchApi(`${API_BASE}/cookie/chrome`)
  },

  async startWeiboLogin(targetUrl?: string): Promise<{ ok: boolean; data?: WeiboLoginSession; error?: string }> {
    return fetchApi(`${API_BASE}/cookie/weibo/start`, {
      method: 'POST',
      body: JSON.stringify({ targetUrl }),
    })
  },

  async getWeiboLoginStatus(sessionId: string): Promise<{ ok: boolean; data: WeiboLoginSession; error?: string }> {
    return fetchApi(`${API_BASE}/cookie/weibo/${sessionId}/status`)
  },

  async cancelWeiboLogin(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    return fetchApi(`${API_BASE}/cookie/weibo/${sessionId}/cancel`, {
      method: 'POST',
    })
  },
}

/**
 * WeChat API
 */
export interface WeChatAuthStatus {
  ok: boolean
  data: {
    configured: boolean
    cookieValid: boolean
    tokenValid: boolean
    cookieConfigured: boolean
    tokenConfigured: boolean
  }
}

export interface WeChatSearchResult {
  ok: boolean
  data: {
    total: number
    accounts: Array<{
      fakeid: string
      name: string
      alias: string
      avatar: string
    }>
  }
  error?: string
}

export interface WeChatCollectResult {
  ok: boolean
  data?: {
    collected: Record<string, number>
    totalSources: number
  }
  error?: string
}

export interface WeChatSettings {
  ok: boolean
  data: {
    gatherContent: boolean
    gatherModel: 'web' | 'app' | 'api'
    proxyEnabled: boolean
    proxyUrl: string
    denoProxyUrl: string
  }
}

export const wechatApi = {
  /**
   * 鑾峰彇寰俊璁よ瘉鐘舵€?   */
  async getAuthStatus(): Promise<WeChatAuthStatus> {
    return fetchApi(`${API_BASE}/wechat/auth/status`)
  },

  /**
   * 璁剧疆寰俊璁よ瘉淇℃伅
   */
  async setCredentials(credentials: { cookie: string; token: string; userAgent?: string }): Promise<{ ok: boolean; error?: string }> {
    return fetchApi(`${API_BASE}/wechat/auth/credentials`, {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  },

  /**
   * 楠岃瘉璁よ瘉淇℃伅
   */
  async verifyCredentials(): Promise<{ ok: boolean; data: { valid: boolean } }> {
    return fetchApi(`${API_BASE}/wechat/auth/verify`, {
      method: 'POST',
    })
  },

  /**
   * 鎼滅储鍏紬鍙?   */
  async search(query: string, limit?: number): Promise<WeChatSearchResult> {
    const params = new URLSearchParams({ query })
    if (limit) params.set('limit', String(limit))
    return fetchApi(`${API_BASE}/wechat/search?${params}`)
  },

  /**
   * 瑙﹀彂鎵€鏈夊叕浼楀彿閲囬泦
   */
  async collect(): Promise<WeChatCollectResult> {
    return fetchApi(`${API_BASE}/wechat/collect`, {
      method: 'POST',
    })
  },

  /**
   * 瑙﹀彂鍗曚釜鍏紬鍙烽噰闆?   */
  async collectSource(sourceId: number): Promise<{
    ok: boolean
    data?: {
      articlesCollected: number
      sourceId: number
      latestItem?: {
        id: number
        title: string
        published_at: string
        url: string
      } | null
    }
    error?: string
  }> {
    return fetchApi(`${API_BASE}/wechat/collect/${sourceId}`, {
      method: 'POST',
    })
  },

  /**
   * 鑾峰彇寰俊璁剧疆
   */
  async getSettings(): Promise<WeChatSettings> {
    return fetchApi(`${API_BASE}/wechat/settings`)
  },

  /**
   * 鏇存柊寰俊璁剧疆
   */
  async updateSettings(settings: {
    gatherContent?: boolean
    gatherModel?: 'web' | 'app' | 'api'
    proxyEnabled?: boolean
    proxyUrl?: string
    denoProxyUrl?: string
  }): Promise<{ ok: boolean; error?: string }> {
    return fetchApi(`${API_BASE}/wechat/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    })
  },
}

// ============================================
// 缁熶竴骞冲彴璁よ瘉 API
// ============================================

export interface PlatformStatus {
  platform: string
  displayName: string
  icon: string
  color: string
  capability: {
    qrLogin: boolean
    manualCredential: boolean
    needsVerification: boolean
  }
  status: 'connected' | 'disconnected' | 'expired' | 'invalid'
  cookiePreview?: string
  tokenPreview?: string
  verifiedAt?: string
  lastCheckedAt?: string
  lastSuccessfulUseAt?: string
  healthState?: 'healthy' | 'warning' | 'expired'
  warningMessage?: string
  reconnectRecommended?: boolean
  error?: string
  dependentSources: number
}

export interface LoginSession {
  sessionId: string
  state: string
  message: string
  startedAt: string
  updatedAt: string
  targetUrl?: string
  qrcodeUrl?: string
  cookieConfigured: boolean
  cookiePreview?: string
  error?: string
}

export interface PlatformTestResult {
  platform: string
  testUrl: string
  resolvedRssUrl?: string
  resolvedPlatformId?: string
  success: boolean
  statusCode?: number
  message: string
}

export const authApi = {
  /** 鍒楀嚭鎵€鏈夊钩鍙扮姸鎬?*/
  async platforms(): Promise<{ ok: boolean; platforms: PlatformStatus[] }> {
    return fetchApi(`${API_BASE}/auth/platforms`)
  },

  /** 鍗曞钩鍙扮姸鎬?*/
  async status(platform: string): Promise<{ ok: boolean; status: PlatformStatus }> {
    return fetchApi(`${API_BASE}/auth/${platform}/status`)
  },

  /** 鍚姩鎵爜鐧诲綍浼氳瘽 */
  async startSession(platform: string, targetUrl?: string): Promise<{ ok: boolean; session: LoginSession }> {
    return fetchApi(`${API_BASE}/auth/${platform}/session`, {
      method: 'POST',
      body: JSON.stringify({ targetUrl }),
    })
  },

  /** 鑾峰彇浼氳瘽鐘舵€?*/
  async sessionStatus(platform: string, sessionId: string): Promise<{ ok: boolean; session: LoginSession }> {
    return fetchApi(`${API_BASE}/auth/${platform}/session/${sessionId}`)
  },

  /** 鍙栨秷浼氳瘽 */
  async cancelSession(platform: string, sessionId: string): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/auth/${platform}/session/${sessionId}/cancel`, {
      method: 'POST',
    })
  },

  /** 淇濆瓨鎵嬪姩鍑瘉 */
  async saveCredential(platform: string, value: string): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/auth/${platform}/credentials`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    })
  },

  /** 楠岃瘉鍑瘉 */
  async verify(platform: string): Promise<{ ok: boolean; valid: boolean; message?: string }> {
    return fetchApi(`${API_BASE}/auth/${platform}/verify`, {
      method: 'POST',
    })
  },

  async test(platform: string, url?: string): Promise<{ ok: boolean; result: PlatformTestResult }> {
    return fetchApi(`${API_BASE}/auth/${platform}/test`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  },

  /** 鍒犻櫎鍑瘉 */
  async deleteCredential(platform: string): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/auth/${platform}/credentials`, {
      method: 'DELETE',
    })
  },
}

// ============================================
// 鍏变负璁〥R鏉垮簱 API
// ============================================

export const publicSourcesApi = {
  /** 鑾峰彇鎵€鏈夊叕寮忎俊婧?*/
  async getAll(category?: string): Promise<{
    ok: boolean
    sources: Array<{
      id: number
      name: string
      url: string
      rss_url: string
      platform: string
      category: string
      description: string | null
      enabled: boolean
      subscribed_count: number
    }>
    categories: Array<{ id: number; slug: string; name: string; sort_order: number }>
  }> {
    const query = category ? `?category=${category}` : ''
    return fetchApi(`${API_BASE}/public-sources${query}`)
  },

  /** 鑾峰彇鍒嗙被 */
  async getCategories(): Promise<{
    ok: boolean
    categories: Array<{ id: number; slug: string; name: string; sort_order: number }>
  }> {
    return fetchApi(`${API_BASE}/public-sources/categories`)
  },

  /** 鑾峰彇宸叉湁璁剧疆淇″睘ID */
  async getSubscribedIds(): Promise<{ ok: boolean; subscribed_ids: number[] }> {
    return fetchApi(`${API_BASE}/public-sources/subscribed`)
  },

  /** 鎵归噺璁剧疆 */
  async subscribe(sourceIds: number[]): Promise<{ ok: boolean; subscribed: number; failed: number }> {
    return fetchApi(`${API_BASE}/public-sources/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ source_ids: sourceIds }),
    })
  },

  /** 鍙栨淳璁剧疆 */
  async unsubscribe(sourceIds: number[]): Promise<{ ok: boolean; unsubscribed: number }> {
    return fetchApi(`${API_BASE}/public-sources/unsubscribe`, {
      method: 'DELETE',
      body: JSON.stringify({ source_ids: sourceIds }),
    })
  },

  /** 娣诲姞鏂扮殑鍏变负RSS婧?*/
  async create(data: {
    name: string
    url: string
    rss_url: string
    category: string
    platform?: string
    description?: string
  }): Promise<{ ok: boolean; source: { id: number } }> {
    return fetchApi(`${API_BASE}/public-sources`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// ============================================
// 翻译 API
// ============================================

export const translateApi = {
  async translate(text: string, from = 'zh-CN', to = 'en'): Promise<{
    ok: boolean
    translatedText?: string
    error?: string
  }> {
    return fetchApi(`${API_BASE}/translate`, {
      method: 'POST',
      body: JSON.stringify({ text, from, to }),
    })
  },
}
