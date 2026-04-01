import { Hono } from 'hono';
import { z } from 'zod';
import { itemsQueries } from '../db/queries.js';
import { getValidatedQuery, validateQuery } from '../middleware/validation.js';
import { NotFoundError } from '../middleware/error.js';

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

export default feedRouter;
