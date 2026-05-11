/**
 * 平台适配器
 * 将现有收集器包装为 ContentSource 接口，实现注册表模式
 *
 * 注意：适配器只负责收集 items，不写入数据库。
 * 数据库写入由 Collector.processBatch 统一处理。
 */

import type { ContentSource, CollectionResult, ContentSourceOptions } from '../interfaces/contentSource.js';
import type { Source, RSSItem } from '../types/index.js';
import { bilibiliPublicCollector } from './bilibiliPublicCollector.js';
import { weiboHttpCollector } from './weiboHttpCollector.js';
import { weiboBrowserCollector } from './weiboBrowserCollector.js';
import { weiboProfileStore } from './weiboProfileStore.js';
import { xBrowserCollector } from './xBrowserCollector.js';
import { xCancelCollector } from './xCancelCollector.js';
import { zhihuBrowserCollector } from './zhihuBrowserCollector.js';
import { youtubePublicCollector } from './youtubePublicCollector.js';
import { env } from '../config/env.js';

/**
 * Bilibili 平台适配器
 */
export const bilibiliAdapter: ContentSource = {
  platform: 'bilibili',

  async collect(
    source: Pick<Source, 'id' | 'name' | 'input_url' | 'rss_url' | 'platform_id'>,
    _options?: ContentSourceOptions
  ): Promise<CollectionResult> {
    try {
      const { items } = await bilibiliPublicCollector.collectItems(source as Source);
      return { sourceId: source.id, success: true, itemCount: items.length, items };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { sourceId: source.id, success: false, itemCount: 0, error: msg };
    }
  },
};

/**
 * Weibo 平台适配器
 * 根据配置自动选择 HTTP 或 Browser 收集器
 */
export const weiboAdapter: ContentSource = {
  platform: 'weibo',

  async collect(
    source: Pick<Source, 'id' | 'name' | 'input_url' | 'rss_url' | 'platform_id'>,
    _options?: ContentSourceOptions
  ): Promise<CollectionResult> {
    try {
      const useBrowser = env.WEIBO_COLLECTOR_MODE === 'browser' || weiboProfileStore.hasActiveProfile();
      const collector = useBrowser ? weiboBrowserCollector : weiboHttpCollector;
      const items = await collector.collectItems(source as Source);
      return { sourceId: source.id, success: true, itemCount: items.length, items };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { sourceId: source.id, success: false, itemCount: 0, error: msg };
    }
  },
};

/**
 * X (Twitter) 平台适配器
 * 优先尝试 XCancel，失败时回退到 Browser
 */
export const xAdapter: ContentSource = {
  platform: 'x',

  async collect(
    source: Pick<Source, 'id' | 'name' | 'input_url' | 'rss_url' | 'platform_id'>,
    _options?: ContentSourceOptions
  ): Promise<CollectionResult> {
    try {
      let items: RSSItem[];
      try {
        items = await xCancelCollector.collectItems(source as Source);
      } catch (error) {
        console.warn(
          `[XAdapter] XCancel failed for source ${source.id}, falling back to browser:`,
          error instanceof Error ? error.message : error
        );
        items = await xBrowserCollector.collectItems(source as Source);
      }
      return { sourceId: source.id, success: true, itemCount: items.length, items };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { sourceId: source.id, success: false, itemCount: 0, error: msg };
    }
  },
};

/**
 * Zhihu 平台适配器
 */
export const zhihuAdapter: ContentSource = {
  platform: 'zhihu',

  async collect(
    source: Pick<Source, 'id' | 'name' | 'input_url' | 'rss_url' | 'platform_id'>,
    _options?: ContentSourceOptions
  ): Promise<CollectionResult> {
    try {
      const items = await zhihuBrowserCollector.collectItems(source as Source);
      return { sourceId: source.id, success: true, itemCount: items.length, items };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { sourceId: source.id, success: false, itemCount: 0, error: msg };
    }
  },
};

/**
 * YouTube 平台适配器
 */
export const youtubeAdapter: ContentSource = {
  platform: 'youtube',

  async collect(
    source: Pick<Source, 'id' | 'name' | 'input_url' | 'rss_url' | 'platform_id'>,
    _options?: ContentSourceOptions
  ): Promise<CollectionResult> {
    try {
      const items = await youtubePublicCollector.collectItems(source as Source);
      return { sourceId: source.id, success: true, itemCount: items.length, items };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { sourceId: source.id, success: false, itemCount: 0, error: msg };
    }
  },
};
