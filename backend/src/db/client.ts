import Database from 'better-sqlite3';
import postgres from 'postgres';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { env } from '../config/env.js';

export type DbType = 'postgresql' | 'sqlite';
export const dbType: DbType = env.DB_TYPE;

type PgClient = ReturnType<typeof postgres>;
type SqliteClient = Database.Database;

let pgClient: PgClient | null = null;
let sqliteClient: SqliteClient | null = null;

function normalizeQuery(query: string): string {
  if (dbType !== 'postgresql') {
    return query;
  }

  let index = 0;
  return query.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function initDb() {
  if (dbType === 'postgresql') {
    if (!env.DATABASE_URL) {
      throw new Error('PostgreSQL mode requires DATABASE_URL');
    }

    pgClient = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      debug:
        env.NODE_ENV === 'development'
          ? (_connection, query) => {
              console.log(`[PG] ${query}`);
            }
          : undefined,
    });
    return;
  }

  mkdirSync(dirname(env.SQLITE_PATH), { recursive: true });

  sqliteClient = new Database(env.SQLITE_PATH);
  sqliteClient.pragma('journal_mode = WAL');
  sqliteClient.pragma('foreign_keys = ON');
  console.log(`[SQLite] Connected to ${env.SQLITE_PATH}`);

  initSQLiteTables();
}

function initSQLiteTables() {
  if (!sqliteClient) {
    return;
  }

  sqliteClient.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'custom',
      input_url TEXT NOT NULL,
      rss_url TEXT NOT NULL,
      platform_id TEXT,
      fetch_interval_min INTEGER DEFAULT 360,
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT DEFAULT 'active',
      error_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_error_at TEXT,
      last_success_at TEXT,
      last_fetched_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(rss_url)
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      url TEXT NOT NULL,
      author TEXT,
      cover_url TEXT,
      platform TEXT NOT NULL DEFAULT 'custom',
      published_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      raw_json TEXT,
      UNIQUE(source_id, guid)
    );

    CREATE TABLE IF NOT EXISTS read_status (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#4CA6E1',
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS item_tags (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      tagged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_items_source ON items(source_id);
    CREATE INDEX IF NOT EXISTS idx_items_published ON items(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_items_platform ON items(platform);
    CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);

    -- WeChat 扩展表 (Phase 1: WeRss 集成)
    CREATE TABLE IF NOT EXISTS wechat_accounts (
      id                    TEXT PRIMARY KEY,
      mp_name               TEXT NOT NULL,
      mp_cover              TEXT,
      mp_intro              TEXT,
      faker_id              TEXT NOT NULL,
      status                INTEGER DEFAULT 1,
      sync_time             INTEGER,
      update_time           INTEGER,
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_wechat_accounts_faker ON wechat_accounts(faker_id);
    CREATE INDEX IF NOT EXISTS idx_wechat_accounts_status ON wechat_accounts(status);

    CREATE TABLE IF NOT EXISTS sources_wechat_ext (
      source_id             INTEGER PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
      faker_id              TEXT NOT NULL,
      mp_cover              TEXT,
      sync_time             INTEGER,
      update_time           INTEGER,
      cookie_configured     INTEGER DEFAULT 0,
      token_configured      INTEGER DEFAULT 0,
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items_wechat_ext (
      item_id               INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      content               TEXT,
      digest                TEXT,
      content_hash          TEXT,
      is_full_text          INTEGER DEFAULT 0,
      created_at            TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wechat_settings (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      cookie                TEXT,
      token                 TEXT,
      user_agent            TEXT,
      proxy_enabled         INTEGER DEFAULT 0,
      proxy_url             TEXT,
      deno_proxy_url        TEXT,
      gather_content        INTEGER DEFAULT 0,
      gather_model          TEXT DEFAULT 'web',
      updated_at            TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO wechat_settings (id) VALUES (1);

    -- 收藏标签表（替代标签系统）
    CREATE TABLE IF NOT EXISTS favorite_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      favorite_tag_id INTEGER NOT NULL REFERENCES favorite_tags(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_favorites_item ON favorites(item_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_tag ON favorites(favorite_tag_id);

    -- 平台统一凭证表
    CREATE TABLE IF NOT EXISTS platform_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform VARCHAR(30) UNIQUE NOT NULL,
      credential_type VARCHAR(20) NOT NULL,
      credential_value TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 平台登录会话表
    CREATE TABLE IF NOT EXISTS platform_login_sessions (
      id VARCHAR(50) PRIMARY KEY,
      platform VARCHAR(30) NOT NULL,
      state VARCHAR(30) DEFAULT 'launching',
      target_url TEXT,
      cookie_configured BOOLEAN DEFAULT FALSE,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default favorite tags
  const defaultFavoriteTags = [
    { name: '稍后阅读', sort_order: 1 },
    { name: '重要', sort_order: 2 },
  ];
  for (const tag of defaultFavoriteTags) {
    sqliteClient.exec(`INSERT OR IGNORE INTO favorite_tags (name, sort_order) VALUES ('${tag.name}', ${tag.sort_order})`);
  }

  const defaultTags = [
    { name: '重要', color: '#EF4444' },
    { name: '稍后阅读', color: '#F59E0B' },
    { name: '技术', color: '#4CA6E1' },
    { name: '产品', color: '#10B981' },
    { name: '设计', color: '#8B5CF6' },
  ];
  const defaultSources = [
    {
      name: 'Hacker News',
      platform: 'news',
      input_url: 'https://news.ycombinator.com',
      rss_url: 'https://hnrss.org/frontpage',
      fetch_interval_min: 60,
    },
    {
      name: 'The Verge AI',
      platform: 'news',
      input_url: 'https://www.theverge.com/ai-artificial-intelligence',
      rss_url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
      fetch_interval_min: 60,
    },
    {
      name: '36Kr AI',
      platform: 'news',
      input_url: 'https://36kr.com/information/AI',
      rss_url: 'https://36kr.com/feed',
      fetch_interval_min: 60,
    },
  ];

  const insertTag = sqliteClient.prepare(
    'INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)'
  );

  for (const tag of defaultTags) {
    insertTag.run(tag.name, tag.color);
  }

  const currentTags = sqliteClient
    .prepare('SELECT id, name, color FROM tags ORDER BY id ASC')
    .all() as Array<{ id: number; name: string; color: string }>;

  if (
    currentTags.length === defaultTags.length &&
    currentTags.some((tag, index) => tag.name !== defaultTags[index]?.name)
  ) {
    const updateTag = sqliteClient.prepare(
      'UPDATE tags SET name = ?, color = ? WHERE id = ?'
    );

    defaultTags.forEach((tag, index) => {
      updateTag.run(tag.name, tag.color, index + 1);
    });
  }

  const sourceCount = sqliteClient
    .prepare('SELECT COUNT(*) as count FROM sources')
    .get() as { count: number };

  if (sourceCount.count === 0) {
    const insertSource = sqliteClient.prepare(`
      INSERT INTO sources (
        name,
        platform,
        input_url,
        rss_url,
        fetch_interval_min,
        enabled,
        status
      ) VALUES (?, ?, ?, ?, ?, 1, 'active')
    `);

    for (const source of defaultSources) {
      insertSource.run(
        source.name,
        source.platform,
        source.input_url,
        source.rss_url,
        source.fetch_interval_min
      );
    }
  }

  console.log('[SQLite] Tables initialized');
}

initDb();

export const sql = {
  async query<T = unknown>(queryString: string, params: unknown[] = []): Promise<T[]> {
    if (dbType === 'postgresql') {
      if (!pgClient) {
        throw new Error('PostgreSQL not initialized');
      }

      const result = await pgClient.unsafe(
        normalizeQuery(queryString),
        params as Array<string | number | boolean | null>
      );
      return result as unknown as T[];
    }

    if (!sqliteClient) {
      throw new Error('SQLite not initialized');
    }

    return sqliteClient.prepare(queryString).all(...params) as T[];
  },

  async execute(queryString: string, params: unknown[] = []): Promise<void> {
    if (dbType === 'postgresql') {
      if (!pgClient) {
        throw new Error('PostgreSQL not initialized');
      }

      await pgClient.unsafe(
        normalizeQuery(queryString),
        params as Array<string | number | boolean | null>
      );
      return;
    }

    if (!sqliteClient) {
      throw new Error('SQLite not initialized');
    }

    sqliteClient.prepare(queryString).run(...params);
  },

  async get<T = unknown>(queryString: string, params: unknown[] = []): Promise<T | undefined> {
    if (dbType === 'postgresql') {
      if (!pgClient) {
        throw new Error('PostgreSQL not initialized');
      }

      const result = await pgClient.unsafe(
        normalizeQuery(queryString),
        params as Array<string | number | boolean | null>
      );
      return (result as unknown as T[])[0];
    }

    if (!sqliteClient) {
      throw new Error('SQLite not initialized');
    }

    return sqliteClient.prepare(queryString).get(...params) as T | undefined;
  },
};

export async function checkConnection(): Promise<boolean> {
  try {
    if (dbType === 'postgresql') {
      const result = await sql.get<{ connected: number }>('SELECT 1 as connected');
      return result?.connected === 1;
    }

    return sqliteClient !== null;
  } catch (error) {
    console.error('[DB] Connection check failed:', error);
    return false;
  }
}

export async function closeConnection(): Promise<void> {
  if (dbType === 'postgresql' && pgClient) {
    await pgClient.end();
    pgClient = null;
  }

  if (dbType === 'sqlite' && sqliteClient) {
    sqliteClient.close();
    sqliteClient = null;
  }
}

export function getRawClient(): PgClient | SqliteClient | null {
  return dbType === 'postgresql' ? pgClient : sqliteClient;
}
