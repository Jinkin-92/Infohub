import { Hono } from 'hono';
import { z } from 'zod';
import { sourcesQueries } from '../db/queries.js';
import { collector } from '../services/collector.js';
import { urlDetector } from '../services/urlDetector.js';
import { getValidatedBody, validateBody } from '../middleware/validation.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/error.js';
import type { CreateSourceInput } from '../types/index.js';

const sourcesRouter = new Hono();

const createSourceSchema = z.object({
  url: z.string().url().min(1),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  fetch_interval_min: z.number().min(5).max(1440).optional(),
});

function parseId(value: string | undefined): number {
  if (!value) {
    throw new BadRequestError('Invalid id');
  }
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new BadRequestError('Invalid id');
  }
  return id;
}

sourcesRouter.get('/', async (c) => {
  const sources = await sourcesQueries.getAll();
  return c.json({ ok: true, sources });
});

sourcesRouter.get('/:id', async (c) => {
  const source = await sourcesQueries.getById(parseId(c.req.param('id')));
  if (!source) {
    throw new NotFoundError('Source not found');
  }
  return c.json({ ok: true, source });
});

sourcesRouter.post('/', validateBody(createSourceSchema), async (c) => {
  const { url } = getValidatedBody<z.infer<typeof createSourceSchema>>(c);
  const detected = await urlDetector.detect(url);

  const existing = await sourcesQueries.getAll();
  const duplicate = existing.find((source) => source.rss_url === detected.rssUrl);
  if (duplicate) {
    throw new ConflictError('Source already exists');
  }

  const input: CreateSourceInput = {
    name: detected.displayName,
    platform: detected.platform,
    input_url: url,
    rss_url: detected.rssUrl,
    platform_id: detected.platformId || null,
    fetch_interval_min: detected.platform === 'news' ? 60 : 360,
    enabled: true,
  };

  const source = await sourcesQueries.create(input);
  void collector.collectSource(source.id).catch((error) => {
    console.error('[Sources] Initial collection failed:', error);
  });

  return c.json({ ok: true, source, detected }, 201);
});

sourcesRouter.patch('/:id', validateBody(updateSourceSchema), async (c) => {
  const source = await sourcesQueries.update(
    parseId(c.req.param('id')),
    getValidatedBody<z.infer<typeof updateSourceSchema>>(c)
  );

  if (!source) {
    throw new NotFoundError('Source not found');
  }

  return c.json({ ok: true, source });
});

sourcesRouter.delete('/:id', async (c) => {
  const deleted = await sourcesQueries.delete(parseId(c.req.param('id')));
  if (!deleted) {
    throw new NotFoundError('Source not found');
  }

  return c.json({ ok: true, message: 'Source deleted' });
});

sourcesRouter.post('/:id/collect', async (c) => {
  const id = parseId(c.req.param('id'));
  const source = await sourcesQueries.getById(id);
  if (!source) {
    throw new NotFoundError('Source not found');
  }

  const result = await collector.collectSource(id);
  return c.json({ ok: result.success, result });
});

export default sourcesRouter;
