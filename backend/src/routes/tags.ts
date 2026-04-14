import { Hono } from 'hono';
import { z } from 'zod';
import { tagsQueries } from '../db/queries.js';
import { BadRequestError, NotFoundError } from '../middleware/error.js';

const tagsRouter = new Hono();

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(200).optional(),
  sort_order: z.number().int().min(0).optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(200).optional(),
  sort_order: z.number().int().min(0).optional(),
});

const tagItemSchema = z.object({
  tag_id: z.number().int().min(1),
});

function parseId(value: string, label: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return id;
}

tagsRouter.get('/', async (c) => {
  const tags = await tagsQueries.getAll();
  return c.json({ ok: true, tags });
});

tagsRouter.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'), 'tag id');
  const tag = await tagsQueries.getById(id);
  if (!tag) {
    throw new NotFoundError('Tag not found');
  }

  return c.json({ ok: true, tag });
});

tagsRouter.post('/', async (c) => {
  const input = createTagSchema.parse(await c.req.json());
  const tag = await tagsQueries.create(input);
  return c.json({ ok: true, tag, message: 'Tag created' }, 201);
});

tagsRouter.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'), 'tag id');
  const input = updateTagSchema.parse(await c.req.json());
  const tag = await tagsQueries.update(id, input);
  if (!tag) {
    throw new NotFoundError('Tag not found');
  }

  return c.json({ ok: true, tag, message: 'Tag updated' });
});

tagsRouter.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'), 'tag id');
  const success = await tagsQueries.delete(id);
  if (!success) {
    throw new NotFoundError('Tag not found');
  }

  return c.json({ ok: true, message: 'Tag deleted' });
});

tagsRouter.get('/:id/items', async (c) => {
  const id = parseId(c.req.param('id'), 'tag id');
  const limit = Number.parseInt(c.req.query('limit') ?? '20', 10);
  const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);

  const tag = await tagsQueries.getById(id);
  if (!tag) {
    throw new NotFoundError('Tag not found');
  }

  const items = await tagsQueries.getItemsByTag(id, { limit, offset });
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

tagsRouter.post('/items/:id/tags', async (c) => {
  const itemId = parseId(c.req.param('id'), 'item id');
  const { tag_id } = tagItemSchema.parse(await c.req.json());

  await tagsQueries.addTagToItem(itemId, tag_id);
  const tags = await tagsQueries.getItemTags(itemId);

  return c.json({ ok: true, tags, message: 'Tag added' });
});

tagsRouter.delete('/items/:id/tags/:tagId', async (c) => {
  const itemId = parseId(c.req.param('id'), 'item id');
  const tagId = parseId(c.req.param('tagId'), 'tag id');

  await tagsQueries.removeTagFromItem(itemId, tagId);
  return c.json({ ok: true, message: 'Tag removed' });
});

tagsRouter.get('/items/:id/tags', async (c) => {
  const itemId = parseId(c.req.param('id'), 'item id');
  const tags = await tagsQueries.getItemTags(itemId);
  return c.json({ ok: true, tags });
});

export default tagsRouter;
