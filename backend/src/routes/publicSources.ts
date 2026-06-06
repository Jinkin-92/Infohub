import { Hono } from 'hono';
import { z } from 'zod';
import { publicSourcesQueries } from '../db/queries.js';
import { getValidatedBody, validateBody } from '../middleware/validation.js';
import { BadRequestError } from '../middleware/error.js';

const publicSourcesRouter = new Hono();

const subscribeSchema = z.object({
  source_ids: z.array(z.number().int().positive()),
});

const unsubscribeSchema = z.object({
  source_ids: z.array(z.number().int().positive()),
});

const createPublicSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().min(1),
  rss_url: z.string().url().min(1),
  platform: z.string().default('news'),
  category: z.string().min(1),
  description: z.string().optional(),
});

// GET /api/public-sources - 获取所有公开源
publicSourcesRouter.get('/', async (c) => {
  const category = c.req.query('category');
  const sources = await publicSourcesQueries.getAll(category || undefined);
  const categories = await publicSourcesQueries.getCategories();
  return c.json({ ok: true, sources, categories });
});

// GET /api/public-sources/categories - 获取分类
publicSourcesRouter.get('/categories', async (c) => {
  const categories = await publicSourcesQueries.getCategories();
  return c.json({ ok: true, categories });
});

// GET /api/public-sources/subscribed - 获取已订阅的ID列表
publicSourcesRouter.get('/subscribed', async (c) => {
  const subscribedIds = await publicSourcesQueries.getSubscribedIds(1);
  return c.json({ ok: true, subscribed_ids: subscribedIds });
});

// POST /api/public-sources/subscribe - 批量订阅
publicSourcesRouter.post('/subscribe', validateBody(subscribeSchema), async (c) => {
  const { source_ids } = getValidatedBody<z.infer<typeof subscribeSchema>>(c);

  if (source_ids.length === 0) {
    throw new BadRequestError('source_ids cannot be empty');
  }

  // 订阅并创建 sources 记录
  const { subscribed, failed, sourceIds } = await publicSourcesQueries.subscribe(1, source_ids);

  // 触发采集（异步，不阻塞响应）
  for (const sourceId of sourceIds) {
    // fire and forget
    fetch(`http://localhost:3002/api/sources/${sourceId}/collect`, { method: 'POST' }).catch(() => {});
  }

  return c.json({ ok: true, subscribed, failed, sourceIds });
});

// DELETE /api/public-sources/unsubscribe - 取消订阅
publicSourcesRouter.delete('/unsubscribe', validateBody(unsubscribeSchema), async (c) => {
  const { source_ids } = getValidatedBody<z.infer<typeof unsubscribeSchema>>(c);

  const { unsubscribed } = await publicSourcesQueries.unsubscribe(1, source_ids);

  // 从用户的 sources 表中删除对应的源
  // 这里需要通过 public_source_id 查找并删除

  return c.json({ ok: true, unsubscribed });
});

// POST /api/public-sources - 添加新的公开源
publicSourcesRouter.post('/', validateBody(createPublicSourceSchema), async (c) => {
  const input = getValidatedBody<z.infer<typeof createPublicSourceSchema>>(c);
  const source = await publicSourcesQueries.create(input);
  return c.json({ ok: true, source });
});

export default publicSourcesRouter;
