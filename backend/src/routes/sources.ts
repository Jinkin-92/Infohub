import { Hono } from 'hono';
import { z } from 'zod';
import { sourcesQueries } from '../db/queries.js';
import { itemsQueries } from '../db/queries.js';
import { sql } from '../db/client.js';
import { collector } from '../services/collector.js';
import { cronManager } from '../services/cron.js';
import { urlDetector } from '../services/urlDetector.js';
import { env } from '../config/env.js';
import { resolveZhihuSourceName } from '../services/zhihuSourceName.js';
import { getValidatedBody, validateBody } from '../middleware/validation.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/error.js';
import type { CreateSourceInput } from '../types/index.js';
import { zhihuBrowserCollector } from '../services/zhihuBrowserCollector.js';

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

function normalizeWeChatFakeId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const prefixedMatch = trimmed.match(/MP_WXS_(\d+)/i);
  if (prefixedMatch) {
    return prefixedMatch[1];
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (/^\d+$/.test(decoded)) {
      return decoded;
    }
  } catch {
    return null;
  }

  return null;
}

sourcesRouter.get('/', async (c) => {
  const sources = await sourcesQueries.getAll();
  return c.json({ ok: true, sources });
});

/**
 * 预览订阅源检测结果
 * POST /api/sources/detect
 * 不创建源，只返回检测信息供前端预览
 */
sourcesRouter.post('/detect', validateBody(createSourceSchema), async (c) => {
  const { url } = getValidatedBody<z.infer<typeof createSourceSchema>>(c);
  const detected = await urlDetector.detect(url);

  return c.json({
    ok: true,
    detected: {
      platform: detected.platform,
      platformId: detected.platformId,
      rssUrl: detected.rssUrl,
      displayName: detected.displayName,
    },
  });
});

sourcesRouter.post('/collect/all', async (c) => {
  const refresh = await cronManager.startManualCollection(false);
  return c.json({
    ok: true,
    refresh,
    scheduler: cronManager.getStatus(),
    message: refresh.alreadyRunning
      ? 'A refresh is already running'
      : 'Manual refresh started in the background',
  }, refresh.alreadyRunning ? 200 : 202);
});

// Get error diagnosis for a source
sourcesRouter.get('/:id/diagnose', async (c) => {
  const id = parseId(c.req.param('id'));
  const source = await sourcesQueries.getById(id);
  if (!source) {
    throw new NotFoundError('Source not found');
  }

  if (!source.last_error) {
    return c.json({
      ok: true,
      diagnosis: {
        hasError: false,
        category: null,
        action: null,
        label: null,
        fixLabel: null,
        errorMessage: null,
      },
    });
  }

  const diagnosis = collector.classifyError(source, source.last_error);
  return c.json({
    ok: true,
    diagnosis: {
      hasError: true,
      ...diagnosis,
      errorMessage: source.last_error,
    },
  });
});

// Get diagnoses for all failed sources
sourcesRouter.get('/diagnose/all', async (c) => {
  const sources = await sourcesQueries.getAll();
  const failedSources = sources.filter(s => s.status === 'error' && s.last_error);

  const diagnoses = failedSources.map(source => {
    const diagnosis = collector.classifyError(source, source.last_error!);
    return {
      sourceId: source.id,
      sourceName: source.name,
      platform: source.platform,
      ...diagnosis,
      errorMessage: source.last_error,
    };
  });

  // Group by action type for batch operations
  const byAction = diagnoses.reduce((acc, d) => {
    if (!acc[d.action]) acc[d.action] = [];
    acc[d.action].push(d);
    return acc;
  }, {} as Record<string, typeof diagnoses>);

  return c.json({
    ok: true,
    totalFailed: failedSources.length,
    diagnoses,
    byAction,
  });
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
  const duplicate = detected.platform === 'wechat' && detected.platformId
    ? existing.find((source) =>
        source.platform === 'wechat' &&
        normalizeWeChatFakeId(source.platform_id) === normalizeWeChatFakeId(detected.platformId)
      )
    : existing.find((source) => source.rss_url === detected.rssUrl);
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
  let finalSource = source;

  // 知乎源：从 RSSHub feed 标题提取真实用户名
  if (detected.platform === 'zhihu') {
    try {
      const displayName = await resolveZhihuSourceName(detected.rssUrl, detected.platformId);
      if (displayName) {
        await sourcesQueries.update(source.id, { name: displayName });
      }
    } catch (err) {
      console.error('[Sources] Failed to fetch Zhihu username:', err);
    }
  }

  // 为微信源创建 faker_id 条目
  // platformId 此时已经是解码后的纯数字 fakeid（urlDetector 处理过）
  if (detected.platform === 'wechat' && detected.platformId) {
    try {
      const localFeedUrl = `http://localhost:${env.PORT}/api/feed/wechat/${source.id}`;

      await sql.execute(
        `UPDATE sources
         SET rss_url = ?, platform_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [localFeedUrl, detected.platformId, source.id]
      );

      await sql.execute(
        'INSERT INTO sources_wechat_ext (source_id, faker_id) VALUES (?, ?)',
        [source.id, detected.platformId]
      );

      await sql.execute(
        `INSERT OR IGNORE INTO wechat_accounts (id, mp_name, faker_id, status)
         VALUES (?, ?, ?, 1)`,
        [`MP_WXS_${detected.platformId}`, detected.displayName, detected.platformId]
      );

      await sql.execute(
        `UPDATE wechat_accounts
         SET mp_name = ?, faker_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [detected.displayName, detected.platformId, `MP_WXS_${detected.platformId}`]
      );

      finalSource = (await sourcesQueries.getById(source.id)) ?? source;
    } catch (err) {
      console.error('[Sources] Failed to create wechat ext:', err);
    }
  }

  void collector.collectSource(source.id).catch((error) => {
    console.error('[Sources] Initial collection failed:', error);
  });

  return c.json({ ok: true, source: finalSource, detected }, 201);
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

  const result = await collector.collectSource(id, { force: true });
  return c.json({ ok: result.success, result });
});

// 知乎采集专用端点 - 带重试机制
sourcesRouter.post('/zhihu/collect', async (c) => {
  const { sourceId } = await c.req.json<{ sourceId: number }>();

  if (!sourceId) {
    return c.json({ ok: false, error: 'sourceId is required' }, 400);
  }

  const source = await sourcesQueries.getById(sourceId);
  if (!source) {
    return c.json({ ok: false, error: 'Source not found' }, 404);
  }

  if (source.platform !== 'zhihu') {
    return c.json({ ok: false, error: 'Not a zhihu source' }, 400);
  }

  try {
    // 知乎采集器内部已经有重试机制
    const rssItems = await zhihuBrowserCollector.collectItems(source);

    // 处理 items (存储到数据库等) - 使用与 collector.processItem 一致的逻辑
    let successCount = 0;
    for (const item of rssItems) {
      try {
        // 使用 collector 的 processItem 方法处理数据
        const processedItem = {
          source_id: sourceId,
          guid: item.guid || item.link || item.title || '',
          title: item.title || 'Untitled',
          summary: item.description?.slice(0, 500) || null,
          url: item.link || '',
          author: item.author || null,
          cover_url: null,
          platform: 'zhihu',
          published_at: item.isoDate || item.pubDate || new Date().toISOString(),
          raw_json: null,
        };
        await itemsQueries.upsert(processedItem);
        successCount += 1;
      } catch (err) {
        console.error('[Zhihu Collect] Failed to store item:', err);
      }
    }

    await sourcesQueries.updateSuccess(sourceId);
    return c.json({ ok: true, itemCount: successCount });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Zhihu collection failed';
    await sourcesQueries.updateError(sourceId, errorMessage);
    return c.json({ ok: false, error: errorMessage });
  }
});

export default sourcesRouter;
