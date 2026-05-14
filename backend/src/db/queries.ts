import { dbType, sql } from './client.js';
import type {
  CreatePublicSourceInput,
  CreateSourceInput,
  CreateTagInput,
  Item,
  PublicSource,
  PublicSourceCategory,
  Source,
  Tag,
  UnreadBreakdown,
  UpdateSourceInput,
  UpdateTagInput,
} from '../types/index.js';

function sqliteBoolean(value: boolean): number {
  return value ? 1 : 0;
}

function enabledParam(value: boolean): boolean | number {
  return dbType === 'postgresql' ? value : sqliteBoolean(value);
}

function buildInClause(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function appendVisibilityConditions(
  conditions: string[],
  params: Array<string | number>,
  alias = 'i'
): void {
  conditions.push(`NOT (${alias}.platform = ? AND ${alias}.title LIKE ?)`);
  params.push('zhihu', '%赞同了回答%');
}

interface FavoriteTagForAttach {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

async function attachTags(items: Item[]): Promise<Item[]> {
  if (items.length === 0) {
    return items;
  }

  const itemIds = items.map((item) => item.id);

  // 获取收藏标签
  const favoriteRows = await sql.query<{ item_id: number; id: number; name: string; sort_order: number; created_at: string }>(
    `SELECT f.item_id, ft.id, ft.name, ft.sort_order, ft.created_at
     FROM favorites f
     JOIN favorite_tags ft ON ft.id = f.favorite_tag_id
     WHERE f.item_id IN (${buildInClause(itemIds.length)})`,
    itemIds
  );

  const favoriteMap = new Map<number, FavoriteTagForAttach>();
  for (const row of favoriteRows) {
    favoriteMap.set(row.item_id, {
      id: row.id,
      name: row.name,
      sort_order: row.sort_order,
      created_at: row.created_at,
    });
  }

  return items.map((item) => ({
    ...item,
    is_read: Boolean(item.is_read),
    favorite: favoriteMap.get(item.id) ?? null,
  }));
}

export const sourcesQueries = {
  async getAll(): Promise<Source[]> {
    return sql.query<Source>(
      `SELECT s.*, ps.category
       FROM sources s
       LEFT JOIN public_sources ps ON ps.id = s.public_source_id
       ORDER BY s.created_at DESC`
    );
  },

  async getById(id: number): Promise<Source | null> {
    return (await sql.get<Source>(
      `SELECT s.*, ps.category
       FROM sources s
       LEFT JOIN public_sources ps ON ps.id = s.public_source_id
       WHERE s.id = ?`,
      [id]
    )) ?? null;
  },

  async create(input: CreateSourceInput): Promise<Source> {
    if (dbType === 'postgresql') {
      const rows = await sql.query<Source>(
        `
          INSERT INTO sources (
            name,
            platform,
            input_url,
            rss_url,
            platform_id,
            fetch_interval_min,
            enabled
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING *
        `,
        [
          input.name,
          input.platform,
          input.input_url,
          input.rss_url,
          input.platform_id ?? null,
          input.fetch_interval_min ?? 360,
          input.enabled ?? true,
        ]
      );
      return rows[0];
    }

    await sql.execute(
      `
        INSERT INTO sources (
          name,
          platform,
          input_url,
          rss_url,
          platform_id,
          fetch_interval_min,
          enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.name,
        input.platform,
        input.input_url,
        input.rss_url,
        input.platform_id ?? null,
        input.fetch_interval_min ?? 360,
        sqliteBoolean(input.enabled ?? true),
      ]
    );

    const created = await sql.get<Source>('SELECT * FROM sources WHERE id = last_insert_rowid()');
    if (!created) {
      throw new Error('Failed to create source');
    }
    return created;
  },

  async update(id: number, input: UpdateSourceInput): Promise<Source | null> {
    const updates: string[] = [];
    const values: Array<string | number | boolean> = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(enabledParam(input.enabled));
    }
    if (input.fetch_interval_min !== undefined) {
      updates.push('fetch_interval_min = ?');
      values.push(input.fetch_interval_min);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await sql.execute(`UPDATE sources SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  },

  async delete(id: number): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) {
      return false;
    }

    await sql.execute('DELETE FROM sources WHERE id = ?', [id]);
    return true;
  },

  async getDueForFetch(): Promise<Source[]> {
    return sql.query<Source>(
      'SELECT * FROM sources WHERE enabled = ? AND status != ? ORDER BY last_fetched_at ASC NULLS FIRST',
      [enabledParam(true), 'disabled']
    );
  },

  async updateFetchedAt(id: number): Promise<void> {
    await sql.execute(
      'UPDATE sources SET last_fetched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  },

  async updateSuccess(id: number): Promise<void> {
    await sql.execute(
      `
        UPDATE sources
        SET status = ?,
            error_count = 0,
            last_error = NULL,
            last_error_at = NULL,
            last_success_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ['active', id]
    );
  },

  async updateError(id: number, errorMessage: string): Promise<void> {
    await sql.execute(
      `
        UPDATE sources
        SET status = ?,
            error_count = error_count + 1,
            last_error = ?,
            last_error_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ['error', errorMessage, id]
    );
  },
};

export const itemsQueries = {
  async getById(id: number): Promise<Item | null> {
    const item =
      (await sql.get<Item>(
        `
          SELECT i.*, CASE WHEN r.item_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
          FROM items i
          LEFT JOIN read_status r ON r.item_id = i.id
          WHERE i.id = ?
        `,
        [id]
      )) ?? null;

    if (!item) {
      return null;
    }

    const [withTags] = await attachTags([item]);
    return withTags ?? null;
  },

  async getList(options: {
    platform?: string;
    sourceId?: number;
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    search?: string;
    isPublic?: boolean;
    category?: string;
    days?: number;
  }): Promise<Item[]> {
    const params: Array<string | number> = [];
    const conditions = ['1=1'];

    if (options.platform) {
      conditions.push('i.platform = ?');
      params.push(options.platform);
    }

    if (options.sourceId !== undefined) {
      conditions.push('i.source_id = ?');
      params.push(options.sourceId);
    }

    // 时间范围过滤（默认 3 天）
    if (options.days !== undefined && options.days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - options.days);
      conditions.push('i.published_at >= ?');
      params.push(cutoff.toISOString());
    }

    if (options.unreadOnly) {
      conditions.push('r.item_id IS NULL');
    }

    // 公开/定制源过滤
    if (options.isPublic !== undefined) {
      conditions.push('s.is_public = ?');
      params.push(options.isPublic ? 1 : 0);
    }

    // 公开源分类过滤
    if (options.isPublic && options.category) {
      conditions.push('ps.category = ?');
      params.push(options.category);
    }

    appendVisibilityConditions(conditions, params);

    const search = options.search?.trim();
    if (search) {
      conditions.push('(i.title LIKE ? OR COALESCE(i.summary, \'\') LIKE ? OR COALESCE(i.author, \'\') LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    params.push(options.limit ?? 20, options.offset ?? 0);

    const items = await sql.query<Item>(
      `
        SELECT i.*, CASE WHEN r.item_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
        FROM items i
        LEFT JOIN read_status r ON r.item_id = i.id
        LEFT JOIN sources s ON s.id = i.source_id
        LEFT JOIN public_sources ps ON ps.id = s.public_source_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY i.published_at DESC
        LIMIT ? OFFSET ?
      `,
      params
    );

    return attachTags(items);
  },

  async upsert(item: Partial<Item>): Promise<Item | null> {
    const existing = await sql.get<{ id: number }>(
      'SELECT id FROM items WHERE source_id = ? AND guid = ?',
      [item.source_id ?? null, item.guid ?? null]
    );

    if (existing) {
      await sql.execute(
        `
          UPDATE items
          SET title = ?,
              summary = ?,
              url = ?,
              author = ?,
              cover_url = ?,
              platform = ?,
              published_at = ?,
              raw_json = ?
          WHERE id = ?
        `,
        [
          item.title ?? '',
          item.summary ?? null,
          item.url ?? '',
          item.author ?? null,
          item.cover_url ?? null,
          item.platform ?? 'custom',
          item.published_at ?? new Date().toISOString(),
          item.raw_json ? JSON.stringify(item.raw_json) : null,
          existing.id,
        ]
      );
      return this.getById(existing.id);
    }

    if (dbType === 'postgresql') {
      const rows = await sql.query<Item>(
        `
          INSERT INTO items (
            source_id,
            guid,
            title,
            summary,
            url,
            author,
            cover_url,
            platform,
            published_at,
            raw_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *
        `,
        [
          item.source_id ?? null,
          item.guid ?? '',
          item.title ?? '',
          item.summary ?? null,
          item.url ?? '',
          item.author ?? null,
          item.cover_url ?? null,
          item.platform ?? 'custom',
          item.published_at ?? new Date().toISOString(),
          item.raw_json ?? null,
        ]
      );
      const [created] = await attachTags(rows);
      return created ?? null;
    }

    await sql.execute(
      `
        INSERT INTO items (
          source_id,
          guid,
          title,
          summary,
          url,
          author,
          cover_url,
          platform,
          published_at,
          raw_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        item.source_id ?? null,
        item.guid ?? '',
        item.title ?? '',
        item.summary ?? null,
        item.url ?? '',
        item.author ?? null,
        item.cover_url ?? null,
        item.platform ?? 'custom',
        item.published_at ?? new Date().toISOString(),
        item.raw_json ? JSON.stringify(item.raw_json) : null,
      ]
    );

    const created = await sql.get<Item>('SELECT * FROM items WHERE id = last_insert_rowid()');
    if (!created) {
      return null;
    }

    const [withTags] = await attachTags([created]);
    return withTags ?? null;
  },

  async markAsRead(itemId: number): Promise<void> {
    if (dbType === 'postgresql') {
      await sql.execute(
        'INSERT INTO read_status (item_id, read_at) VALUES (?, CURRENT_TIMESTAMP) ON CONFLICT (item_id) DO NOTHING',
        [itemId]
      );
      return;
    }

    await sql.execute(
      'INSERT OR IGNORE INTO read_status (item_id, read_at) VALUES (?, CURRENT_TIMESTAMP)',
      [itemId]
    );
  },

  async markAllAsRead(options: { platform?: string; sourceId?: number }): Promise<number> {
    const params: Array<string | number> = [];
    const conditions = ['NOT EXISTS (SELECT 1 FROM read_status r WHERE r.item_id = i.id)'];

    if (options.platform) {
      conditions.push('i.platform = ?');
      params.push(options.platform);
    }

    if (options.sourceId) {
      conditions.push('i.source_id = ?');
      params.push(options.sourceId);
    }

    const unreadItems = await sql.query<{ id: number }>(
      `SELECT i.id FROM items i WHERE ${conditions.join(' AND ')}`,
      params
    );

    for (const item of unreadItems) {
      await this.markAsRead(item.id);
    }

    return unreadItems.length;
  },

  async getUnreadCount(): Promise<number> {
    const params: Array<string | number> = [];
    const conditions = ['NOT EXISTS (SELECT 1 FROM read_status r WHERE r.item_id = i.id)'];
    appendVisibilityConditions(conditions, params);

    const result = await sql.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM items i
        WHERE ${conditions.join(' AND ')}
      `,
      params
    );

    return Number(result?.count ?? 0);
  },

  async getUnreadBreakdown(): Promise<UnreadBreakdown> {
    const params: Array<string | number> = [];
    const conditions = ['NOT EXISTS (SELECT 1 FROM read_status r WHERE r.item_id = i.id)'];
    appendVisibilityConditions(conditions, params);

    const unreadItems = await sql.query<{ platform: string; source_id: number }>(
      `
        SELECT i.platform, i.source_id
        FROM items i
        WHERE ${conditions.join(' AND ')}
      `,
      params
    );

    const byPlatform: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const item of unreadItems) {
      byPlatform[item.platform] = (byPlatform[item.platform] ?? 0) + 1;
      const sourceKey = String(item.source_id);
      bySource[sourceKey] = (bySource[sourceKey] ?? 0) + 1;
    }

    return {
      total: unreadItems.length,
      byPlatform,
      bySource,
    };
  },
};

export const tagsQueries = {
  async getAll(): Promise<Tag[]> {
    return sql.query<Tag>('SELECT * FROM tags ORDER BY sort_order ASC, name ASC');
  },

  async getById(id: number): Promise<Tag | null> {
    return (await sql.get<Tag>('SELECT * FROM tags WHERE id = ?', [id])) ?? null;
  },

  async create(input: CreateTagInput): Promise<Tag> {
    if (dbType === 'postgresql') {
      const rows = await sql.query<Tag>(
        `
          INSERT INTO tags (name, color, description, sort_order)
          VALUES (?, ?, ?, ?)
          RETURNING *
        `,
        [input.name, input.color ?? '#4CA6E1', input.description ?? null, input.sort_order ?? 0]
      );
      return rows[0];
    }

    await sql.execute(
      'INSERT INTO tags (name, color, description, sort_order) VALUES (?, ?, ?, ?)',
      [input.name, input.color ?? '#4CA6E1', input.description ?? null, input.sort_order ?? 0]
    );

    const created = await sql.get<Tag>('SELECT * FROM tags WHERE id = last_insert_rowid()');
    if (!created) {
      throw new Error('Failed to create tag');
    }
    return created;
  },

  async update(id: number, input: UpdateTagInput): Promise<Tag | null> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.color !== undefined) {
      updates.push('color = ?');
      values.push(input.color);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description);
    }
    if (input.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(input.sort_order);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    await sql.execute(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  },

  async delete(id: number): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) {
      return false;
    }

    await sql.execute('DELETE FROM tags WHERE id = ?', [id]);
    return true;
  },

  async getItemTags(itemId: number): Promise<Tag[]> {
    return sql.query<Tag>(
      `
        SELECT t.*
        FROM tags t
        JOIN item_tags it ON it.tag_id = t.id
        WHERE it.item_id = ?
        ORDER BY t.sort_order ASC, t.name ASC
      `,
      [itemId]
    );
  },

  async addTagToItem(itemId: number, tagId: number): Promise<void> {
    if (dbType === 'postgresql') {
      await sql.execute(
        'INSERT INTO item_tags (item_id, tag_id, tagged_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (item_id, tag_id) DO NOTHING',
        [itemId, tagId]
      );
      return;
    }

    await sql.execute(
      'INSERT OR IGNORE INTO item_tags (item_id, tag_id, tagged_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [itemId, tagId]
    );
  },

  async removeTagFromItem(itemId: number, tagId: number): Promise<void> {
    await sql.execute('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?', [itemId, tagId]);
  },

  async getItemsByTag(tagId: number, options: { limit?: number; offset?: number } = {}): Promise<Item[]> {
    const items = await sql.query<Item>(
      `
        SELECT i.*, CASE WHEN r.item_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
        FROM items i
        JOIN item_tags it ON it.item_id = i.id
        LEFT JOIN read_status r ON r.item_id = i.id
        WHERE it.tag_id = ?
        ORDER BY i.published_at DESC
        LIMIT ? OFFSET ?
      `,
      [tagId, options.limit ?? 20, options.offset ?? 0]
    );

    return attachTags(items);
  },
};

// ============================================
// 收藏标签查询（替代标签系统）
// ============================================
export interface FavoriteTag {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface CreateFavoriteTagInput {
  name: string;
  sort_order?: number;
}

export interface Favorite {
  item_id: number;
  favorite_tag_id: number;
  favorite_tag_name?: string;
  created_at: string;
}

export const favoriteTagsQueries = {
  async getAll(): Promise<FavoriteTag[]> {
    return sql.query<FavoriteTag>('SELECT * FROM favorite_tags ORDER BY sort_order ASC, name ASC');
  },

  async getById(id: number): Promise<FavoriteTag | null> {
    return (await sql.get<FavoriteTag>('SELECT * FROM favorite_tags WHERE id = ?', [id])) ?? null;
  },

  async create(input: CreateFavoriteTagInput): Promise<FavoriteTag> {
    if (dbType === 'postgresql') {
      const rows = await sql.query<FavoriteTag>(
        'INSERT INTO favorite_tags (name, sort_order) VALUES (?, ?) RETURNING *',
        [input.name, input.sort_order ?? 0]
      );
      return rows[0];
    }

    await sql.execute(
      'INSERT INTO favorite_tags (name, sort_order) VALUES (?, ?)',
      [input.name, input.sort_order ?? 0]
    );

    const created = await sql.get<FavoriteTag>('SELECT * FROM favorite_tags WHERE id = last_insert_rowid()');
    if (!created) {
      throw new Error('Failed to create favorite tag');
    }
    return created;
  },

  async delete(id: number): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) {
      return false;
    }
    await sql.execute('DELETE FROM favorite_tags WHERE id = ?', [id]);
    return true;
  },
};

export const favoritesQueries = {
  // 获取内容对应的收藏标签
  async getForItem(itemId: number): Promise<FavoriteTag | null> {
    const row = await sql.get<Favorite & FavoriteTag>(
      `SELECT f.*, ft.name as favorite_tag_name, ft.sort_order
       FROM favorites f
       JOIN favorite_tags ft ON ft.id = f.favorite_tag_id
       WHERE f.item_id = ?`,
      [itemId]
    );
    if (!row) return null;
    return { id: row.favorite_tag_id, name: row.favorite_tag_name!, sort_order: row.sort_order, created_at: row.created_at };
  },

  // 获取多个内容的收藏状态
  async getForItems(itemIds: number[]): Promise<Map<number, FavoriteTag>> {
    if (itemIds.length === 0) return new Map();
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = await sql.query<Favorite & FavoriteTag>(
      `SELECT f.item_id, ft.id, ft.name, ft.sort_order, f.created_at
       FROM favorites f
       JOIN favorite_tags ft ON ft.id = f.favorite_tag_id
       WHERE f.item_id IN (${placeholders})`,
      itemIds
    );
    const map = new Map<number, FavoriteTag>();
    for (const row of rows) {
      map.set(row.item_id, { id: row.favorite_tag_id, name: row.favorite_tag_name!, sort_order: row.sort_order, created_at: row.created_at });
    }
    return map;
  },

  // 添加/更新收藏（如果已收藏则更新标签）
  async set(itemId: number, favoriteTagId: number): Promise<void> {
    await sql.execute(
      'INSERT OR REPLACE INTO favorites (item_id, favorite_tag_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [itemId, favoriteTagId]
    );
  },

  // 取消收藏
  async remove(itemId: number): Promise<void> {
    await sql.execute('DELETE FROM favorites WHERE item_id = ?', [itemId]);
  },

  // 获取某个收藏标签下的所有内容
  async getItemsByTag(favoriteTagId: number, options: { limit?: number; offset?: number } = {}): Promise<Item[]> {
    const items = await sql.query<Item>(
      `SELECT i.*, CASE WHEN r.item_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
       FROM items i
       JOIN favorites f ON f.item_id = i.id
       LEFT JOIN read_status r ON r.item_id = i.id
       WHERE f.favorite_tag_id = ?
       ORDER BY i.published_at DESC
       LIMIT ? OFFSET ?`,
      [favoriteTagId, options.limit ?? 20, options.offset ?? 0]
    );
    return items;
  },
};

export const publicSourcesQueries = {
  async getAll(category?: string): Promise<PublicSource[]> {
    if (category) {
      return sql.query<PublicSource>(
        'SELECT * FROM public_sources WHERE enabled = 1 AND category = ? ORDER BY subscribed_count DESC, name ASC',
        [category]
      );
    }
    return sql.query<PublicSource>(
      'SELECT * FROM public_sources WHERE enabled = 1 ORDER BY subscribed_count DESC, name ASC'
    );
  },

  async getById(id: number): Promise<PublicSource | null> {
    return (await sql.get<PublicSource>('SELECT * FROM public_sources WHERE id = ?', [id])) ?? null;
  },

  async getCategories(): Promise<PublicSourceCategory[]> {
    return sql.query<PublicSourceCategory>(
      'SELECT * FROM public_source_categories ORDER BY sort_order ASC, name ASC'
    );
  },

  async getSubscribedIds(userId: number = 1): Promise<number[]> {
    const rows = await sql.query<{ source_id: number }>(
      'SELECT source_id FROM public_source_subscriptions WHERE user_id = ?',
      [userId]
    );
    return rows.map((r) => r.source_id);
  },

  async subscribe(userId: number, sourceIds: number[]): Promise<{ subscribed: number; failed: number; sourceIds: number[] }> {
    let subscribed = 0;
    let failed = 0;
    const createdSourceIds: number[] = [];

    for (const sourceId of sourceIds) {
      try {
        // 获取公开源详情
        const publicSource = await this.getById(sourceId);
        if (!publicSource) {
          failed++;
          continue;
        }

        // 检查是否已订阅
        const existing = await sql.get<{ user_id: number }>(
          'SELECT user_id FROM public_source_subscriptions WHERE user_id = ? AND source_id = ?',
          [userId, sourceId]
        );

        if (!existing) {
          // 记录订阅关系
          if (dbType === 'postgresql') {
            await sql.execute(
              'INSERT INTO public_source_subscriptions (user_id, source_id) VALUES (?, ?)',
              [userId, sourceId]
            );
          } else {
            await sql.execute(
              'INSERT OR IGNORE INTO public_source_subscriptions (user_id, source_id) VALUES (?, ?)',
              [userId, sourceId]
            );
          }

          // 在 sources 表中创建或更新对应的订阅记录
          // 如果同 rss_url 的源已存在（用户手动添加的），则标记为公开源
          const existingSource = await sql.get<{ id: number }>(
            'SELECT id FROM sources WHERE rss_url = ?',
            [publicSource.rss_url]
          );

          if (existingSource) {
            await sql.execute(
              'UPDATE sources SET is_public = 1, public_source_id = ?, enabled = 1, status = ? WHERE id = ?',
              [sourceId, 'active', existingSource.id]
            );
            createdSourceIds.push(existingSource.id);
          } else {
            await sql.execute(
              `INSERT INTO sources (name, platform, input_url, rss_url, is_public, public_source_id, enabled, status)
               VALUES (?, ?, ?, ?, 1, ?, 1, 'active')`,
              [publicSource.name, publicSource.platform, publicSource.url, publicSource.rss_url, sourceId]
            );
            // SQLite: last_insert_rowid(), PostgreSQL: use RETURNING
            const inserted = await sql.get<{ id: number }>('SELECT last_insert_rowid() as id');
            if (inserted) createdSourceIds.push(inserted.id);
          }

          // 更新订阅计数
          await sql.execute(
            'UPDATE public_sources SET subscribed_count = subscribed_count + 1 WHERE id = ?',
            [sourceId]
          );

          subscribed++;
        }
      } catch (err) {
        console.error('Subscribe error:', err);
        failed++;
      }
    }

    return { subscribed, failed, sourceIds: createdSourceIds };
  },

  async unsubscribe(userId: number, sourceIds: number[]): Promise<{ unsubscribed: number }> {
    for (const sourceId of sourceIds) {
      await sql.execute(
        'DELETE FROM public_source_subscriptions WHERE user_id = ? AND source_id = ?',
        [userId, sourceId]
      );
      // 删除 sources 表中的对应记录
      await sql.execute(
        'DELETE FROM sources WHERE public_source_id = ? AND is_public = 1',
        [sourceId]
      );
      await sql.execute(
        'UPDATE public_sources SET subscribed_count = MAX(0, subscribed_count - 1) WHERE id = ?',
        [sourceId]
      );
    }
    return { unsubscribed: sourceIds.length };
  },

  async create(input: CreatePublicSourceInput): Promise<PublicSource> {
    if (dbType === 'postgresql') {
      const rows = await sql.query<PublicSource>(
        `
          INSERT INTO public_sources (name, url, rss_url, platform, category, description)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *
        `,
        [
          input.name,
          input.url,
          input.rss_url,
          input.platform ?? 'news',
          input.category,
          input.description ?? null,
        ]
      );
      return rows[0];
    }

    await sql.execute(
      `INSERT INTO public_sources (name, url, rss_url, platform, category, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.url,
        input.rss_url,
        input.platform ?? 'news',
        input.category,
        input.description ?? null,
      ]
    );

    const created = await sql.get<PublicSource>('SELECT * FROM public_sources WHERE id = last_insert_rowid()');
    if (!created) {
      throw new Error('Failed to create public source');
    }
    return created;
  },
};

// ============================================
// 用户显示设置查询
// ============================================
export interface UserSettings {
  id: number;
  font_size: string;
  card_density: string;
  line_spacing: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserSettingsInput {
  font_size?: string;
  card_density?: string;
  line_spacing?: string;
}

export const userSettingsQueries = {
  async get(): Promise<UserSettings | null> {
    return (await sql.get<UserSettings>('SELECT * FROM user_settings WHERE id = 1')) ?? null;
  },

  async update(input: UpdateUserSettingsInput): Promise<UserSettings | null> {
    const updates: string[] = [];
    const values: Array<string | number> = [];

    if (input.font_size !== undefined) {
      updates.push('font_size = ?');
      values.push(input.font_size);
    }
    if (input.card_density !== undefined) {
      updates.push('card_density = ?');
      values.push(input.card_density);
    }
    if (input.line_spacing !== undefined) {
      updates.push('line_spacing = ?');
      values.push(input.line_spacing);
    }

    if (updates.length === 0) {
      return this.get();
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(1);

    await sql.execute(`UPDATE user_settings SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.get();
  },
};
