import {
  Source,
  Item,
  FeedListResponse,
  Tag,
  RsshubSettingsResponse,
  UnreadBreakdownResponse,
} from '../types'

const API_BASE = '/api'

/**
 * 通用fetch封装
 */
async function fetchApi<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

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
   * 获取Feed列表
   */
  async getFeed(params?: {
    platform?: string
    limit?: number
    offset?: number
    unread_only?: boolean
    search?: string
  }): Promise<FeedListResponse> {
    const query = new URLSearchParams()
    if (params?.platform) query.set('platform', params.platform)
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.unread_only) query.set('unread_only', 'true')
    if (params?.search) query.set('search', params.search)

    return fetchApi<FeedListResponse>(`${API_BASE}/feed?${query}`)
  },

  /**
   * 获取未读数量
   */
  async getUnreadCount(): Promise<UnreadBreakdownResponse> {
    return fetchApi<UnreadBreakdownResponse>(`${API_BASE}/feed/unread-count`)
  },

  /**
   * 标记已读
   */
  async markAsRead(itemId: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/feed/read`, {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId }),
    })
  },

  /**
   * 批量标记已读
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
   * 获取所有订阅源
   */
  async getAll(): Promise<{ ok: boolean; sources: Source[] }> {
    return fetchApi(`${API_BASE}/sources`)
  },

  /**
   * 获取单个订阅源
   */
  async getById(id: number): Promise<{ ok: boolean; source: Source }> {
    return fetchApi(`${API_BASE}/sources/${id}`)
  },

  /**
   * 创建订阅源
   */
  async create(url: string): Promise<{ ok: boolean; source: Source }> {
    return fetchApi(`${API_BASE}/sources`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  },

  /**
   * 更新订阅源
   */
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
   * 删除订阅源
   */
  async delete(id: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/sources/${id}`, {
      method: 'DELETE',
    })
  },

  /**
   * 手动触发采集
   */
  async collect(id: number): Promise<{
    ok: boolean
    result: {
      sourceId: number
      success: boolean
      itemCount: number
      error?: string
    }
  }> {
    return fetchApi(`${API_BASE}/sources/${id}/collect`, {
      method: 'POST',
    })
  },
}

/**
 * Tags API
 */
export const tagsApi = {
  /**
   * 获取所有标签
   */
  async getAll(): Promise<{ ok: boolean; tags: Tag[] }> {
    return fetchApi(`${API_BASE}/tags`)
  },

  /**
   * 获取单个标签
   */
  async getById(id: number): Promise<{ ok: boolean; tag: Tag }> {
    return fetchApi(`${API_BASE}/tags/${id}`)
  },

  /**
   * 创建标签
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
   * 更新标签
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
   * 删除标签
   */
  async delete(id: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/tags/${id}`, {
      method: 'DELETE',
    })
  },

  /**
   * 获取标签下的内容
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
   * 获取内容的标签
   */
  async getTags(itemId: number): Promise<{ ok: boolean; tags: Tag[] }> {
    return fetchApi(`${API_BASE}/tags/items/${itemId}/tags`)
  },

  /**
   * 给内容打标签
   */
  async addTag(itemId: number, tagId: number): Promise<{ ok: boolean; tags: Tag[] }> {
    return fetchApi(`${API_BASE}/tags/items/${itemId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_id: tagId }),
    })
  },

  /**
   * 移除内容的标签
   */
  async removeTag(itemId: number, tagId: number): Promise<{ ok: boolean }> {
    return fetchApi(`${API_BASE}/tags/items/${itemId}/tags/${tagId}`, {
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

export const cookieApi = {
  /**
   * 获取 Cookie 状态
   */
  async getStatus(): Promise<CookieStatusResponse> {
    return fetchApi(`${API_BASE}/cookie/status`)
  },

  /**
   * 从 Chrome 提取 Cookie
   */
  async extract(): Promise<CookieExtractResponse> {
    return fetchApi(`${API_BASE}/cookie/extract`, {
      method: 'POST',
    })
  },

  /**
   * 检查 Chrome 连接状态
   */
  async checkChrome(): Promise<{ ok: boolean; data: { connected: boolean; port: number; error?: string } }> {
    return fetchApi(`${API_BASE}/cookie/chrome`)
  },
}
