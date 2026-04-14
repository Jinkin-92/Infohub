export interface Source {
  id: number;
  name: string;
  platform: 'zhihu' | 'x' | 'news' | 'custom' | 'bilibili' | 'youtube' | 'wechat' | 'weibo';
  input_url: string;
  rss_url: string;
  platform_id: string | null;
  fetch_interval_min: number;
  enabled: boolean;
  status: 'active' | 'error' | 'disabled';
  error_count: number;
  last_error: string | null;
  last_error_at: string | null;
  last_fetched_at: string | null;
  last_success_at: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  public_source_id: number | null;
  category?: string;
}

export interface CreateSourceInput {
  name: string;
  platform: string;
  input_url: string;
  rss_url: string;
  platform_id?: string | null;
  fetch_interval_min?: number;
  enabled?: boolean;
}

export interface UpdateSourceInput {
  name?: string;
  enabled?: boolean;
  fetch_interval_min?: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface Item {
  id: number;
  source_id: number;
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  author: string | null;
  cover_url: string | null;
  platform: string;
  published_at: string;
  fetched_at: string;
  raw_json: unknown;
  is_read?: boolean;
  favorite?: FavoriteTag | null;
}

export interface FavoriteTag {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface ReadStatus {
  item_id: number;
  read_at: string;
}

export interface DetectionResult {
  platform: string;
  platformId: string;
  rssUrl: string;
  displayName: string;
}

export interface RSSItem {
  title?: string;
  description?: string;
  contentSnippet?: string;
  link?: string;
  guid?: string;
  creator?: string;
  author?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  'content:encoded'?: string;
  enclosure?: {
    url: string;
    type: string;
    length: string;
  };
  'media:thumbnail'?: {
    $: {
      url: string;
    };
  };
}

export interface CollectionResult {
  sourceId: number;
  success: boolean;
  itemCount: number;
  skipped?: boolean;
  error?: string;
}

export interface UnreadBreakdown {
  total: number;
  byPlatform: Record<string, number>;
  bySource: Record<string, number>;
}

export interface ItemTag {
  item_id: number;
  tag_id: number;
  tagged_at: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
  description?: string;
  sort_order?: number;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
  description?: string;
  sort_order?: number;
}

// 公开订阅源
export interface PublicSource {
  id: number;
  name: string;
  url: string;
  rss_url: string;
  platform: string;
  category: string;
  description: string | null;
  enabled: boolean;
  subscribed_count: number;
  created_at: string;
}

export interface PublicSourceCategory {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface CreatePublicSourceInput {
  name: string;
  url: string;
  rss_url: string;
  platform?: string;
  category: string;
  description?: string;
}
