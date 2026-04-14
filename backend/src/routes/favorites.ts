import { Hono } from 'hono';
import { z } from 'zod';
import { favoriteTagsQueries, favoritesQueries } from '../db/queries.js';
import { BadRequestError, NotFoundError } from '../middleware/error.js';

const favoritesRouter = new Hono();

const createFavoriteTagSchema = z.object({
  name: z.string().min(1).max(50),
  sort_order: z.number().int().min(0).optional(),
});

const setFavoriteSchema = z.object({
  favorite_tag_id: z.number().int().min(1),
});

function parseId(value: string, label: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return id;
}

// GET /api/favorites/tags - 获取所有收藏标签
favoritesRouter.get('/tags', async (c) => {
  const tags = await favoriteTagsQueries.getAll();
  return c.json({ ok: true, tags });
});

// GET /api/favorites/tags/:id - 获取单个收藏标签
favoritesRouter.get('/tags/:id', async (c) => {
  const id = parseId(c.req.param('id'), 'tag id');
  const tag = await favoriteTagsQueries.getById(id);
  if (!tag) {
    throw new NotFoundError('收藏标签不存在');
  }
  return c.json({ ok: true, tag });
});

// POST /api/favorites/tags - 创建收藏标签
favoritesRouter.post('/tags', async (c) => {
  const input = createFavoriteTagSchema.parse(await c.req.json());
  const tag = await favoriteTagsQueries.create(input);
  return c.json({ ok: true, tag, message: '收藏标签已创建' }, 201);
});

// DELETE /api/favorites/tags/:id - 删除收藏标签
favoritesRouter.delete('/tags/:id', async (c) => {
  const id = parseId(c.req.param('id'), 'tag id');
  const success = await favoriteTagsQueries.delete(id);
  if (!success) {
    throw new NotFoundError('收藏标签不存在');
  }
  return c.json({ ok: true, message: '收藏标签已删除' });
});

// GET /api/favorites/tags/:id/items - 获取某个收藏标签下的内容
favoritesRouter.get('/tags/:id/items', async (c) => {
  const id = parseId(c.req.param('id'), 'tag id');
  const limit = Number.parseInt(c.req.query('limit') ?? '20', 10);
  const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);

  const tag = await favoriteTagsQueries.getById(id);
  if (!tag) {
    throw new NotFoundError('收藏标签不存在');
  }

  const items = await favoritesQueries.getItemsByTag(id, { limit, offset });
  return c.json({
    ok: true,
    tag,
    items,
    pagination: {
      limit,
      offset,
      hasMore: items.length === limit,
    },
  });
});

// GET /api/favorites/items/:id - 获取内容的收藏状态
favoritesRouter.get('/items/:id', async (c) => {
  const itemId = parseId(c.req.param('id'), 'item id');
  const favorite = await favoritesQueries.getForItem(itemId);
  return c.json({ ok: true, favorite });
});

// POST /api/favorites/items/:id - 设置/更新内容的收藏标签
favoritesRouter.post('/items/:id', async (c) => {
  const itemId = parseId(c.req.param('id'), 'item id');
  const { favorite_tag_id } = setFavoriteSchema.parse(await c.req.json());

  // 验证标签存在
  const tag = await favoriteTagsQueries.getById(favorite_tag_id);
  if (!tag) {
    throw new NotFoundError('收藏标签不存在');
  }

  await favoritesQueries.set(itemId, favorite_tag_id);
  const favorite = await favoritesQueries.getForItem(itemId);
  return c.json({ ok: true, favorite, message: '已收藏' });
});

// DELETE /api/favorites/items/:id - 取消收藏
favoritesRouter.delete('/items/:id', async (c) => {
  const itemId = parseId(c.req.param('id'), 'item id');
  await favoritesQueries.remove(itemId);
  return c.json({ ok: true, message: '已取消收藏' });
});

export default favoritesRouter;
