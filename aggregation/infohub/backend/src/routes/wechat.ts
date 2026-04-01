/**
 * 微信相关 API 路由
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { wechatAuth, weChatArticleCollector } from '../services/wechat/index.js';
import { sql } from '../db/client.js';

const wechatRouter = new Hono();

// Schema 验证
const setCredentialsSchema = z.object({
  cookie: z.string().min(1),
  token: z.string().min(1).regex(/^\d+$/, 'Token must be numeric'),
  userAgent: z.string().optional(),
});

const searchBizSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.coerce.number().min(1).max(20).default(5),
});

// ============ 认证相关 ============

/**
 * 获取微信认证状态
 */
wechatRouter.get('/auth/status', async (c) => {
  try {
    const status = await wechatAuth.getStatus();
    const settings = await sql.get<{
      cookie_configured: number;
      token_configured: number;
    }>(
      `SELECT
        CASE WHEN cookie IS NOT NULL AND cookie != '' THEN 1 ELSE 0 END as cookie_configured,
        CASE WHEN token IS NOT NULL AND token != '' THEN 1 ELSE 0 END as token_configured
       FROM wechat_settings WHERE id = 1`
    );

    return c.json({
      ok: true,
      data: {
        ...status,
        cookieConfigured: Boolean(settings?.cookie_configured),
        tokenConfigured: Boolean(settings?.token_configured),
      },
    });
  } catch (error) {
    console.error('[WeChat API] auth/status error:', error);
    return c.json({ ok: false, error: 'Failed to get auth status' }, 500);
  }
});

/**
 * 设置微信认证信息
 */
wechatRouter.post('/auth/credentials', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = setCredentialsSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid credentials format' }, 400);
    }

    await wechatAuth.saveToSettings({
      cookie: parsed.data.cookie,
      token: parsed.data.token,
      userAgent: parsed.data.userAgent,
    });

    return c.json({ ok: true, message: 'Credentials saved' });
  } catch (error) {
    console.error('[WeChat API] auth/credentials error:', error);
    return c.json({ ok: false, error: 'Failed to save credentials' }, 500);
  }
});

/**
 * 验证认证信息是否有效
 */
wechatRouter.post('/auth/verify', async (c) => {
  try {
    const valid = await wechatAuth.verifyCredentials();
    return c.json({ ok: true, data: { valid } });
  } catch (error) {
    console.error('[WeChat API] auth/verify error:', error);
    return c.json({ ok: false, error: 'Verification failed' }, 500);
  }
});

// ============ 公众号搜索 ============

/**
 * 搜索公众号
 */
wechatRouter.get('/search', async (c) => {
  try {
    const query = c.req.query('query');
    const limit = c.req.query('limit');

    if (!query) {
      return c.json({ ok: false, error: 'query parameter is required' }, 400);
    }

    const parsed = searchBizSchema.safeParse({ query, limit });
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid parameters' }, 400);
    }

    const result = await wechatAuth.searchBiz(parsed.data.query, parsed.data.limit);

    return c.json({
      ok: true,
      data: {
        total: result.total,
        accounts: result.accounts.map((acc) => ({
          fakeid: acc.fakeid,
          name: acc.nickname,
          alias: acc.alias,
          avatar: acc.round_head_img,
        })),
      },
    });
  } catch (error) {
    console.error('[WeChat API] search error:', error);
    const message = error instanceof Error ? error.message : 'Search failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

// ============ 采集相关 ============

/**
 * 手动触发所有公众号采集
 */
wechatRouter.post('/collect', async (c) => {
  try {
    if (!wechatAuth.isConfigured()) {
      return c.json({ ok: false, error: 'WeChat credentials not configured' }, 400);
    }

    const results = await weChatArticleCollector.collectAll();

    return c.json({
      ok: true,
      data: {
        collected: results,
        totalSources: Object.keys(results).length,
      },
    });
  } catch (error) {
    console.error('[WeChat API] collect error:', error);
    const message = error instanceof Error ? error.message : 'Collection failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * 触发单个公众号采集
 */
wechatRouter.post('/collect/:sourceId', async (c) => {
  try {
    const sourceId = c.req.param('sourceId');

    if (!wechatAuth.isConfigured()) {
      return c.json({ ok: false, error: 'WeChat credentials not configured' }, 400);
    }

    // 获取 faker_id
    const wechatExt = await sql.get<{ faker_id: string }>(
      'SELECT faker_id FROM sources_wechat_ext WHERE source_id = ?',
      [Number(sourceId)]
    );

    if (!wechatExt) {
      return c.json({ ok: false, error: 'Source not found or not a WeChat source' }, 404);
    }

    const count = await weChatArticleCollector.collectAndStore(wechatExt.faker_id, Number(sourceId));

    return c.json({
      ok: true,
      data: { sourceId: Number(sourceId), articlesCollected: count },
    });
  } catch (error) {
    console.error('[WeChat API] collect/:sourceId error:', error);
    const message = error instanceof Error ? error.message : 'Collection failed';
    return c.json({ ok: false, error: message }, 500);
  }
});

// ============ 设置相关 ============

/**
 * 获取微信采集设置
 */
wechatRouter.get('/settings', async (c) => {
  try {
    const settings = await sql.get<{
      gather_content: number;
      gather_model: string;
      proxy_enabled: number;
      proxy_url: string | null;
      deno_proxy_url: string | null;
    }>('SELECT * FROM wechat_settings WHERE id = 1');

    return c.json({
      ok: true,
      data: {
        gatherContent: Boolean(settings?.gather_content),
        gatherModel: settings?.gather_model || 'web',
        proxyEnabled: Boolean(settings?.proxy_enabled),
        proxyUrl: settings?.proxy_url || '',
        denoProxyUrl: settings?.deno_proxy_url || '',
      },
    });
  } catch (error) {
    console.error('[WeChat API] settings error:', error);
    return c.json({ ok: false, error: 'Failed to get settings' }, 500);
  }
});

/**
 * 更新微信采集设置
 */
const updateSettingsSchema = z.object({
  gatherContent: z.boolean().optional(),
  gatherModel: z.enum(['web', 'app', 'api']).optional(),
  proxyEnabled: z.boolean().optional(),
  proxyUrl: z.string().optional(),
  denoProxyUrl: z.string().optional(),
});

wechatRouter.patch('/settings', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid settings' }, 400);
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (parsed.data.gatherContent !== undefined) {
      updates.push('gather_content = ?');
      values.push(parsed.data.gatherContent ? 1 : 0);
    }
    if (parsed.data.gatherModel !== undefined) {
      updates.push('gather_model = ?');
      values.push(parsed.data.gatherModel);
    }
    if (parsed.data.proxyEnabled !== undefined) {
      updates.push('proxy_enabled = ?');
      values.push(parsed.data.proxyEnabled ? 1 : 0);
    }
    if (parsed.data.proxyUrl !== undefined) {
      updates.push('proxy_url = ?');
      values.push(parsed.data.proxyUrl);
    }
    if (parsed.data.denoProxyUrl !== undefined) {
      updates.push('deno_proxy_url = ?');
      values.push(parsed.data.denoProxyUrl);
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');
      await sql.execute(
        `UPDATE wechat_settings SET ${updates.join(', ')} WHERE id = 1`,
        values
      );
    }

    return c.json({ ok: true, message: 'Settings updated' });
  } catch (error) {
    console.error('[WeChat API] settings patch error:', error);
    return c.json({ ok: false, error: 'Failed to update settings' }, 500);
  }
});

export default wechatRouter;
