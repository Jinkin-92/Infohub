import { Hono } from 'hono';
import { z } from 'zod';
import { itemsQueries, sourcesQueries } from '../db/queries.js';
import { getValidatedQuery, validateQuery } from '../middleware/validation.js';
import { NotFoundError } from '../middleware/error.js';
import { rssGenerator } from '../services/rssGenerator.js';
import { sql } from '../db/client.js';

const feedRouter = new Hono();

const getItemsSchema = z.object({
  platform: z.enum(['zhihu', 'x', 'news', 'custom', 'bilibili', 'youtube', 'wechat', 'weibo']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  unread_only: z.enum(['true', 'false']).optional(),
  search: z.string().max(100).optional(),
});

const markAsReadSchema = z.object({
  item_id: z.number().int().min(1),
});

const markAllAsReadSchema = z.object({
  platform: z.enum(['zhihu', 'x', 'news', 'custom', 'bilibili', 'youtube', 'wechat', 'weibo']).optional(),
});

feedRouter.get('/', validateQuery(getItemsSchema), async (c) => {
  const query = getValidatedQuery<z.infer<typeof getItemsSchema>>(c);
  const items = await itemsQueries.getList({
    platform: query.platform,
    limit: query.limit,
    offset: query.offset,
    unreadOnly: query.unread_only === 'true',
    search: query.search,
  });

  return c.json({
    ok: true,
    items,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      hasMore: items.length === query.limit,
    },
  });
});

feedRouter.get('/unread-count', async (c) => {
  const breakdown = await itemsQueries.getUnreadBreakdown();
  return c.json({
    ok: true,
    count: breakdown.total,
    by_platform: breakdown.byPlatform,
    by_source: breakdown.bySource,
  });
});

feedRouter.post('/read', async (c) => {
  const body = await c.req.json();
  const { item_id } = markAsReadSchema.parse(body);

  const item = await itemsQueries.getById(item_id);
  if (!item) {
    throw new NotFoundError('Item not found');
  }

  await itemsQueries.markAsRead(item_id);
  return c.json({ ok: true, message: 'Marked as read' });
});

feedRouter.post('/read-all', async (c) => {
  const body = await c.req.json();
  const { platform } = markAllAsReadSchema.parse(body);
  const count = await itemsQueries.markAllAsRead({ platform });

  return c.json({
    ok: true,
    message: `Marked ${count} items as read`,
    count,
  });
});

// ============ WeChat RSS 端点 ============

const wechatFeedSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(30),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * 获取指定公众号的 RSS
 * GET /api/feed/wechat/:feedId.rss
 */
feedRouter.get('/wechat/:feedId', validateQuery(wechatFeedSchema), async (c) => {
  const feedId = c.req.param('feedId');
  const query = getValidatedQuery<z.infer<typeof wechatFeedSchema>>(c);

  // 获取公众号信息
  const account = await sql.get<{
    mp_name: string;
    mp_cover: string | null;
    mp_intro: string | null;
  }>('SELECT mp_name, mp_cover, mp_intro FROM wechat_accounts WHERE id = ?', [feedId]);

  if (!account) {
    throw new NotFoundError(`WeChat account not found: ${feedId}`);
  }

  // 获取文章列表
  const items = await itemsQueries.getList({
    platform: 'wechat',
    limit: query.limit,
    offset: query.offset,
  });

  // 过滤出属于该公众号的文章 (通过 author 字段匹配 feedId)
  const rssItems = items
    .filter((item) => item.author != null && item.author === feedId)
    .map((item) => ({
      id: item.guid,
      title: item.title,
      link: item.url,
      description: item.summary || '',
      image: item.cover_url || undefined,
      updated: new Date(item.published_at),
      mp_name: account.mp_name,
    }));

  const rssXml = rssGenerator.generateRSS(rssItems, {
    title: `${account.mp_name} - InfoHub`,
    link: `http://localhost:3000/feed/wechat/${feedId}`,
    description: account.mp_intro || `${account.mp_name} 的文章`,
    imageUrl: account.mp_cover || undefined,
  });

  return c.newResponse(rssXml, 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
  });
});

/**
 * 获取所有微信文章的 RSS
 * GET /api/feed/wechat/all.rss
 */
feedRouter.get('/wechat/all', validateQuery(wechatFeedSchema), async (c) => {
  const query = getValidatedQuery<z.infer<typeof wechatFeedSchema>>(c);

  // 获取所有微信源
  const sources = await sourcesQueries.getAll();
  const wechatSources = sources.filter((s) => s.platform === 'wechat' && s.enabled);

  if (wechatSources.length === 0) {
    const emptyRss = rssGenerator.generateRSS([], {
      title: 'InfoHub - 微信公众号',
      link: 'http://localhost:3000',
      description: '暂无订阅的微信公众号',
    });
    return c.newResponse(emptyRss, 200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    });
  }

  // 获取所有微信文章
  const items = await itemsQueries.getList({
    platform: 'wechat',
    limit: query.limit,
    offset: query.offset,
  });

  // 获取所有公众号信息
  const accounts = await sql.query<{
    id: string;
    mp_name: string;
    mp_cover: string | null;
  }>('SELECT id, mp_name, mp_cover FROM wechat_accounts');

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const rssItems = items.map((item) => {
    const account = item.author ? accountMap.get(item.author) : undefined;
    const mpName = account?.mp_name || 'Unknown';
    return {
      id: item.guid,
      title: item.title,
      link: item.url,
      description: item.summary || '',
      image: item.cover_url || undefined,
      updated: new Date(item.published_at),
      mp_name: mpName,
    };
  });

  const rssXml = rssGenerator.generateRSS(rssItems, {
    title: 'InfoHub - 所有微信公众号',
    link: 'http://localhost:3000',
    description: `共 ${wechatSources.length} 个订阅源`,
  });

  return c.newResponse(rssXml, 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
  });
});

export default feedRouter;
