/**
 * WeRss 数据迁移脚本
 * Phase 1: 将 WeRss 数据库中的公众号和文章迁移到 InfoHub
 *
 * 用法:
 *   npx tsx src/db/migrations/werss_import.ts
 *   npx tsx src/db/migrations/werss_import.ts --dry-run
 *   npx tsx src/db/migrations/werss_import.ts /path/to/werss.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 从 src/db/migrations 到 backend/data 需要 3 层父目录
const INFOHUB_DB_PATH = path.resolve(__dirname, '../../../data/infohub.db');
const WERSS_PATHS_TO_TRY = [
  'C:/Users/DELL/AppData/Local/Temp/werss.db', // Windows bash /tmp 转换
  '/tmp/werss.db',
  path.resolve(__dirname, '../../../data/werss.db'),
];

interface WeRssFeed {
  id: string;
  mp_name: string;
  mp_cover: string | null;
  mp_intro: string | null;
  status: number;
  sync_time: number | null;
  update_time: number | null;
  created_at: string;
  updated_at: string;
  faker_id: string;
}

interface WeRssArticle {
  id: string;
  mp_id: string;
  title: string;
  pic_url: string | null;
  url: string | null;
  description: string | null;
  content: string | null;
  content_html: string | null;
  status: number;
  publish_time: number | null;
  created_at: string;
  updated_at: number | null;
  updated_at_millis: number | null;
  is_export: number;
  is_read: number;
  is_favorite: number;
}

interface MigrationResult {
  feedsImported: number;
  feedsSkipped: number;
  articlesImported: number;
  articlesSkipped: number;
  errors: string[];
}

function log(message: string) {
  console.log(`[Migration] ${message}`);
}

function logError(message: string) {
  console.error(`[Migration ERROR] ${message}`);
}

function warn(message: string) {
  console.warn(`[Migration WARN] ${message}`);
}

/**
 * 解码 base64 faker_id
 */
function decodeFakeId(encoded: string): string {
  try {
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return encoded;
  }
}

/**
 * 转换 Unix 时间戳为 ISO 字符串
 */
function timestampToISO(ts: number | null): string {
  if (!ts) return new Date().toISOString();
  return new Date(ts * 1000).toISOString();
}

/**
 * 迁移主函数
 */
export async function migrateFromWeRss(
  werssDbPath: string,
  dryRun: boolean = false
): Promise<MigrationResult> {
  const result: MigrationResult = {
    feedsImported: 0,
    feedsSkipped: 0,
    articlesImported: 0,
    articlesSkipped: 0,
    errors: [],
  };

  // 连接 WeRss 数据库 (只读)
  let werssDb: Database.Database;
  try {
    werssDb = new Database(werssDbPath, { readonly: true });
    log(`Connected to WeRss DB: ${werssDbPath}`);
  } catch (error) {
    throw new Error(`Failed to open WeRss database: ${error}`);
  }

  // 连接 InfoHub 数据库
  const infoHubDbPath = INFOHUB_DB_PATH;
  let infoHubDb: Database.Database;
  try {
    infoHubDb = new Database(infoHubDbPath);
    infoHubDb.pragma('journal_mode = WAL');
    log(`Connected to InfoHub DB: ${infoHubDbPath}`);
  } catch (error) {
    werssDb.close();
    throw new Error(`Failed to open InfoHub database: ${error}`);
  }

  try {
    // ============================================
    // 步骤 1: 确保 WeChat 扩展表存在
    // ============================================
    log('Creating WeChat extension tables...');

    infoHubDb.exec(`
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
    `);

    log('WeChat extension tables ready.');

    // ============================================
    // 步骤 2: 迁移 feeds (公众号)
    // ============================================
    log('Migrating feeds (WeChat accounts)...');

    const feeds = werssDb
      .prepare('SELECT * FROM feeds ORDER BY created_at DESC')
      .all() as WeRssFeed[];

    log(`Found ${feeds.length} feeds in WeRss database.`);

    const insertWechatAccount = infoHubDb.prepare(`
      INSERT OR IGNORE INTO wechat_accounts
        (id, mp_name, mp_cover, mp_intro, faker_id, status, sync_time, update_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSource = infoHubDb.prepare(`
      INSERT INTO sources
        (name, platform, input_url, url, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertWechatExt = infoHubDb.prepare(`
      INSERT INTO sources_wechat_ext
        (source_id, faker_id, mp_cover, sync_time, update_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    // 检查是否已存在 (通过 name 和 platform)
    const checkSourceExists = infoHubDb.prepare(`
      SELECT id FROM sources WHERE name = ? AND platform = 'wechat'
    `);

    for (const feed of feeds) {
      try {
        // 检查是否已存在
        const existing = checkSourceExists.get(feed.id) as { id: number } | undefined;
        if (existing) {
          log(`  Skipping existing feed: ${feed.mp_name} (${feed.id})`);
          result.feedsSkipped++;
          continue;
        }

        if (dryRun) {
          log(`  [DRY RUN] Would import: ${feed.mp_name} (${feed.id})`);
          result.feedsImported++;
          continue;
        }

        // 插入 wechat_accounts
        insertWechatAccount.run(
          feed.id,
          feed.mp_name,
          feed.mp_cover,
          feed.mp_intro,
          feed.faker_id,
          feed.status,
          feed.sync_time,
          feed.update_time,
          feed.created_at,
          feed.updated_at
        );

        // 构建 RSS URL (WeRss 格式)
        const rssUrl = `http://localhost:8001/feed/${feed.id}.rss`;

        // 插入 sources 表
        const insertResult = insertSource.run(
          feed.mp_name,
          'wechat',
          `https://mp.weixin.qq.com`, // input_url 保留微信域名作为标识
          rssUrl,
          feed.status === 1 ? 1 : 0,
          feed.created_at,
          feed.updated_at
        );

        const sourceId = insertResult.lastInsertRowid as number;

        // 插入 wechat 扩展表
        insertWechatExt.run(
          sourceId,
          feed.faker_id,
          feed.mp_cover,
          feed.sync_time,
          feed.update_time
        );

        log(`  Imported: ${feed.mp_name} (source_id=${sourceId})`);
        result.feedsImported++;
      } catch (error) {
        const msg = `Failed to import feed ${feed.mp_name}: ${error}`;
        logError(msg);
        result.errors.push(msg);
      }
    }

    // ============================================
    // 步骤 3: 迁移 articles (文章)
    // ============================================
    log('Migrating articles...');

    const articles = werssDb
      .prepare('SELECT * FROM articles ORDER BY publish_time DESC')
      .all() as WeRssArticle[];

    log(`Found ${articles.length} articles in WeRss database.`);

    const insertItem = infoHubDb.prepare(`
      INSERT OR IGNORE INTO items
        (source_id, guid, title, summary, url, author, cover_url, platform, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'wechat', ?)
    `);

    const insertItemExt = infoHubDb.prepare(`
      INSERT INTO items_wechat_ext
        (item_id, content, digest)
      VALUES (?, ?, ?)
    `);

    const getSourceByFeedId = infoHubDb.prepare(`
      SELECT sources.id as id FROM sources
      JOIN wechat_accounts ON sources.name = wechat_accounts.mp_name
      WHERE wechat_accounts.id = ? AND sources.platform = 'wechat'
    `);

    // 用于去重
    const processedGuids = new Set<string>();

    for (const article of articles) {
      try {
        // 查找对应的 source (通过 wechat_accounts 的 id = mp_id)
        const source = getSourceByFeedId.get(article.mp_id) as
          | { id: number }
          | undefined;
        if (!source) {
          log(`  Skipping article (unknown source): ${article.title}`);
          result.articlesSkipped++;
          continue;
        }

        // 检查去重
        if (processedGuids.has(article.id)) {
          result.articlesSkipped++;
          continue;
        }
        processedGuids.add(article.id);

        if (dryRun) {
          log(
            `  [DRY RUN] Would import: ${article.title} (source_id=${source.id})`
          );
          result.articlesImported++;
          continue;
        }

        // 转换时间
        const publishedAt = timestampToISO(article.publish_time);

        // 插入 items 表
        const insertResult = insertItem.run(
          source.id,
          article.id,
          article.title,
          article.description || '',
          article.url || '',
          article.mp_id, // author 暂时用 mp_id
          article.pic_url,
          publishedAt
        );

        const itemId = insertResult.lastInsertRowid as number;

        // 插入 items_wechat_ext
        if (article.content || article.content_html) {
          insertItemExt.run(
            itemId,
            article.content || article.content_html,
            article.description || ''
          );
        }

        result.articlesImported++;
      } catch (error) {
        const msg = `Failed to import article ${article.title}: ${error}`;
        logError(msg);
        result.errors.push(msg);
      }
    }

    // ============================================
    // 完成
    // ============================================
    log('Migration completed!');
    log(`  Feeds imported: ${result.feedsImported}`);
    log(`  Feeds skipped: ${result.feedsSkipped}`);
    log(`  Articles imported: ${result.articlesImported}`);
    log(`  Articles skipped: ${result.articlesSkipped}`);
    if (result.errors.length > 0) {
      log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((e) => logError(e));
    }
  } finally {
    werssDb.close();
    infoHubDb.close();
  }

  return result;
}

// 主入口
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');

  // 支持命令行参数指定路径
  let werssPath = args.find((a) => !a.startsWith('-'));
  if (!werssPath) {
    // 尝试多个可能的路径
    for (const p of WERSS_PATHS_TO_TRY) {
      if (existsSync(p)) {
        log(`Found WeRss DB at: ${p}`);
        werssPath = p;
        break;
      }
    }
    // 也尝试 /tmp/werss.db (Windows bash 转换后)
    const windowsTmpPath = 'C:/Users/DELL/AppData/Local/Temp/werss.db';
    if (!werssPath && existsSync(windowsTmpPath)) {
      werssPath = windowsTmpPath;
    }
  }

  if (!werssPath) {
    logError('Could not find WeRss database. Please specify the path.');
    logError('Usage: npx tsx src/db/migrations/werss_import.ts [/path/to/werss.db]');
    logError('Or copy the database first: npm run db:copy-werss');
    process.exit(1);
  }

  log(`Starting migration from: ${werssPath}`);
  log(`InfoHub DB path: ${INFOHUB_DB_PATH}`);
  if (dryRun) {
    log('DRY RUN MODE - No changes will be written');
  }

  try {
    const result = await migrateFromWeRss(werssPath, dryRun);
    if (result.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    logError(`Migration failed: ${error}`);
    process.exit(1);
  }
}

// 仅在直接运行时执行
main();
