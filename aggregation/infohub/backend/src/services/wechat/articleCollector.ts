/**
 * 微信公众号文章采集器
 * 对应 WeRss core/wx/wx.py 的 WxGather 类
 *
 * 功能:
 * - 通过微信平台 API 获取公众号文章列表
 * - 提取文章完整内容
 * - 存储到数据库
 */

import { wechatAuth } from './auth.js';
import { sql } from '../../db/client.js';

interface ArticleListItem {
  id: string;
  mp_id: string;
  title: string;
  cover: string;
  link: string;
  digest: string;
  update_time: number;
  create_time: number;
}

/**
 * 从 URL 中提取文章 ID
 */
function extractArticleId(url: string): string {
  const match = url.match(/\/([^/]+)$/);
  return match ? match[1] : '';
}

/**
 * 转换 Unix 时间戳为 ISO 字符串
 */
function timestampToISO(ts: number | null): string {
  if (!ts) return new Date().toISOString();
  return new Date(ts * 1000).toISOString();
}

/**
 * 计算内容哈希 (用于去重)
 */
async function contentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class WeChatArticleCollector {
  private gatherContent: boolean = false;
  private batchSize: number = 20;

  constructor() {
    this.loadSettings();
  }

  /**
   * 加载采集设置
   */
  private async loadSettings(): Promise<void> {
    try {
      const settings = await sql.get<{
        gather_content: number | null;
      }>('SELECT gather_content FROM wechat_settings WHERE id = 1');

      if (settings) {
        this.gatherContent = Boolean(settings.gather_content);
      }
    } catch (error) {
      console.error('[WeChatCollector] Failed to load settings:', error);
    }
  }

  /**
   * 获取公众号文章列表
   * 对应 WeRss get_Articles(faker_id)
   */
  async getArticles(fakerId: string, limit: number = 20): Promise<ArticleListItem[]> {
    if (!wechatAuth.isConfigured()) {
      throw new Error('WeChat credentials not configured');
    }

    const url = new URL('https://mp.weixin.qq.com/cgi-bin/appmsgpublish');
    url.searchParams.set('sub', 'list');
    url.searchParams.set('sub_action', 'list_ex');
    url.searchParams.set('begin', '0');
    url.searchParams.set('count', String(limit));
    url.searchParams.set('fakeid', fakerId);
    url.searchParams.set('token', wechatAuth.getToken());
    url.searchParams.set('lang', 'zh_CN');
    url.searchParams.set('f', 'json');
    url.searchParams.set('ajax', '1');

    try {
      const response = await fetch(url.toString(), {
        headers: wechatAuth.getHeaders(),
      });

      const data = await response.json() as {
        publish_page?: { publish_list?: string[] };
        publish_info?: string;
      };

      if (!data.publish_page?.publish_list) {
        return [];
      }

      const articles: ArticleListItem[] = [];

      for (const item of data.publish_page.publish_list) {
        try {
          const parsed = JSON.parse(item);
          const appmsgex = parsed.appmsgex?.[0] || parsed.appmsgex?.[0] || parsed;

          if (!appmsgex.title) continue;

          articles.push({
            id: extractArticleId(appmsgex.link || ''),
            mp_id: `MP_WXS_${Buffer.from(fakerId).toString('base64')}`,
            title: appmsgex.title || '',
            cover: appmsgex.cover || appmsgex.cdn_url || '',
            link: appmsgex.link || '',
            digest: appmsgex.digest || '',
            update_time: appmsgex.update_time || 0,
            create_time: appmsgex.create_time || 0,
          });
        } catch {
          // 跳过解析失败的项
          continue;
        }
      }

      return articles;
    } catch (error) {
      console.error('[WeChatCollector] getArticles failed:', error);
      throw error;
    }
  }

  /**
   * 提取文章内容
   * 对应 WeRss content_extract(url)
   */
  async extractContent(url: string): Promise<string> {
    if (!wechatAuth.isConfigured()) {
      throw new Error('WeChat credentials not configured');
    }

    try {
      const response = await fetch(url, {
        headers: {
          ...wechatAuth.getHeaders(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          Referer: 'https://mp.weixin.qq.com/',
        },
      });

      const html = await response.text();

      // 简单的 HTML 解析 - 提取 js_content div
      const contentMatch = html.match(/<div[^>]*id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i);

      if (contentMatch) {
        let content = contentMatch[1];

        // 处理图片 - 将 data-src 转换为 src
        content = content.replace(/data-src=/gi, 'src=');

        return content;
      }

      return '';
    } catch (error) {
      console.error('[WeChatCollector] extractContent failed:', error);
      return '';
    }
  }

  /**
   * 采集并存储单个公众号的文章
   */
  async collectAndStore(fakerId: string, sourceId: number): Promise<number> {
    const articles = await this.getArticles(fakerId, this.batchSize);
    let storedCount = 0;

    for (const article of articles) {
      try {
        // 检查是否已存在
        const existing = await sql.get<{ id: number }>(
          'SELECT id FROM items WHERE guid = ? AND source_id = ?',
          [article.id, sourceId]
        );

        if (existing) {
          continue; // 已存在，跳过
        }

        // 提取文章内容 (如果启用)
        let content = '';
        if (this.gatherContent && article.link) {
          content = await this.extractContent(article.link);
        }

        // 计算内容哈希
        const hash = content ? await contentHash(content) : '';

        // 插入 items 表
        await sql.execute(
          `INSERT INTO items (source_id, guid, title, summary, url, author, cover_url, platform, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'wechat', ?)`,
          [
            sourceId,
            article.id,
            article.title,
            article.digest || '',
            article.link,
            article.mp_id,
            article.cover,
            timestampToISO(article.update_time),
          ]
        );

        // 获取刚插入的 item id
        const item = await sql.get<{ id: number }>(
          'SELECT id FROM items WHERE guid = ? AND source_id = ?',
          [article.id, sourceId]
        );

        if (item && content) {
          // 插入 items_wechat_ext
          await sql.execute(
            `INSERT INTO items_wechat_ext (item_id, content, digest, content_hash, is_full_text)
             VALUES (?, ?, ?, ?, ?)`,
            [item.id, content, article.digest || '', hash, this.gatherContent ? 1 : 0]
          );
        }

        storedCount++;
      } catch (error) {
        console.error(`[WeChatCollector] Failed to store article ${article.title}:`, error);
      }
    }

    // 更新 sources 的 last_fetched_at
    await sql.execute(
      'UPDATE sources SET last_fetched_at = datetime(\'now\') WHERE id = ?',
      [sourceId]
    );

    return storedCount;
  }

  /**
   * 采集所有已配置的微信公众号
   */
  async collectAll(): Promise<Record<string, number>> {
    const results: Record<string, number> = {};

    if (!wechatAuth.isConfigured()) {
      throw new Error('WeChat credentials not configured');
    }

    // 获取所有启用的微信源
    const sources = await sql.query<{
      id: number;
      name: string;
    }>(
      `SELECT s.id, s.name FROM sources s
       JOIN sources_wechat_ext we ON s.id = we.source_id
       WHERE s.platform = 'wechat' AND s.enabled = 1`
    );

    for (const source of sources) {
      // 获取 faker_id
      const wechatExt = await sql.get<{ faker_id: string }>(
        'SELECT faker_id FROM sources_wechat_ext WHERE source_id = ?',
        [source.id]
      );

      if (!wechatExt) {
        continue;
      }

      try {
        const count = await this.collectAndStore(wechatExt.faker_id, source.id);
        results[source.name] = count;
        console.log(`[WeChatCollector] ${source.name}: collected ${count} articles`);
      } catch (error) {
        console.error(`[WeChatCollector] ${source.name}: collection failed`, error);
        results[source.name] = -1;
      }
    }

    return results;
  }
}

// 单例导出
export const weChatArticleCollector = new WeChatArticleCollector();
