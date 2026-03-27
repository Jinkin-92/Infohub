import { dbType, sql } from './client.js';
import type {
  CreateSourceInput,
  CreateTagInput,
  Item,
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

type TaggedRow = {
  item_id: number;
  id: number;
  name: string;
  color: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

async function attachTags(items: Item[]): Promise<Item[]> {
  if (items.length === 0) {
    return items;
  }

  const itemIds = items.map((item) => item.id);
  const taggedRows = await sql.query<TaggedRow>(
    `
      SELECT
        it.item_id,
        t.id,
        t.name,
        t.color,
        t.description,
        t.sort_order,
        t.created_at
      FROM item_tags it
      JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id IN (${buildInClause(itemIds.length)})
      ORDER BY t.sort_order ASC, t.name ASC
    `,
    itemIds
  );

  const tagMap = new Map<number, Tag[]>();
  for (const row of taggedRows) {
    const tags = tagMap.get(row.item_id) ?? [];
    tags.push({
      id: row.id,
      name: row.name,
      color: row.color,
      description: row.description,
      sort_order: row.sort_order,
      created_at: row.created_at,
    });
    tagMap.set(row.item_id, tags);
  }

  return items.map((item) => ({
    ...item,
    is_read: Boolean(item.is_read),
    tags: tagMap.get(item.id) ?? [],
  }));
}

export const sourcesQueries = {
  async getAll(): Promise<Source[]> {
    return sql.query<Source>('SELECT * FROM sources ORDER BY created_at DESC');
  },

  async getById(id: number): Promise<Source | null> {
    return (await sql.get<Source>('SELECT * FROM sources WHERE id = ?', [id])) ?? null;
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
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    search?: string;
  }): Promise<Item[]> {
    const params: Array<string | number> = [];
    const conditions = ['1=1'];

    if (options.platform) {
      conditions.push('i.platform = ?');
      params.push(options.platform);
    }

    if (options.unreadOnly) {
      conditions.push('r.item_id IS NULL');
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
