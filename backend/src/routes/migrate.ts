/**
 * 数据库迁移 API 路由
 */

import { Hono } from 'hono';
import { sql } from '../db/client.js';

const migrateRouter = new Hono();

/**
 * 填充 sources_wechat_ext 表的 faker_id
 * 从现有 sources 的 RSS URL 中提取 fakeid
 */
migrateRouter.post('/fill-wechat-faker-id', async (c) => {
  try {
    // 获取所有微信源
    const sources = await sql.query<{
      id: number;
      name: string;
      rss_url: string;
      platform_id: string | null;
    }>(`SELECT id, name, rss_url, platform_id FROM sources WHERE platform = 'wechat'`);

    let updated = 0;
    let skipped = 0;
    const results: Array<{ id: number; name: string; fakeid: string | null; status: string }> = [];

    for (const source of sources) {
      let fakeid: string | null = null;

      // 从 platform_id 提取
      if (source.platform_id) {
        const match = source.platform_id.match(/MP_WXS_(\d+)/);
        if (match) {
          fakeid = match[1];
        }
      }

      // 从 RSS URL 提取
      if (!fakeid && source.rss_url) {
        const feedMatch = source.rss_url.match(/\/feed\/MP_WXS_(\d+)/);
        if (feedMatch) {
          fakeid = feedMatch[1];
        } else {
          const csmMatch = source.rss_url.match(/\/wechat\/csm\/([^/]+)/);
          if (csmMatch) {
            fakeid = csmMatch[1];
          }
        }
      }

      if (!fakeid) {
        results.push({ id: source.id, name: source.name, fakeid: null, status: 'skipped' });
        skipped++;
        continue;
      }

      // 检查是否已有记录
      const existing = await sql.get<{ source_id: number }>(
        'SELECT source_id FROM sources_wechat_ext WHERE source_id = ?',
        [source.id]
      );

      if (existing) {
        await sql.execute(
          'UPDATE sources_wechat_ext SET faker_id = ?, mp_name = ? WHERE source_id = ?',
          [fakeid, source.name, source.id]
        );
      } else {
        await sql.execute(
          'INSERT INTO sources_wechat_ext (source_id, faker_id, mp_name) VALUES (?, ?, ?)',
          [source.id, fakeid, source.name]
        );
      }

      results.push({ id: source.id, name: source.name, fakeid, status: 'updated' });
      updated++;
    }

    return c.json({
      ok: true,
      data: {
        total: sources.length,
        updated,
        skipped,
        results,
      },
    });
  } catch (error) {
    console.error('[Migrate] fill-wechat-faker-id error:', error);
    const message = error instanceof Error ? error.message : 'Migration failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

export default migrateRouter;
