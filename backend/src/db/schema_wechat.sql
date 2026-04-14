-- WeChat 扩展 Schema
-- Phase 1: 数据库合并

-- ============================================
-- 微信公众号账号表 (存储公众号元数据)
-- ============================================
CREATE TABLE IF NOT EXISTS wechat_accounts (
  id                    TEXT PRIMARY KEY,              -- 'MP_WXS_{fakeid}'
  mp_name               TEXT NOT NULL,                -- 公众号名称
  mp_cover              TEXT,                          -- 公众号封面图
  mp_intro              TEXT,                          -- 公众号简介
  faker_id              TEXT NOT NULL,                 -- 微信 fakeid (base64 解码后的数字)
  status                INTEGER DEFAULT 1,              -- 状态: 0=禁用, 1=启用
  sync_time             INTEGER,                       -- 最后同步时间 (Unix timestamp)
  update_time           INTEGER,                       -- 最后更新时间
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wechat_accounts_faker ON wechat_accounts(faker_id);
CREATE INDEX IF NOT EXISTS idx_wechat_accounts_status ON wechat_accounts(status);

-- ============================================
-- 扩展 sources 表 - 添加 WeChat 特有字段
-- ============================================
-- 注意: SQLite 不支持 DROP COLUMN，我们使用 ALTER TABLE 替代方案
-- 如果字段已存在则跳过

-- 添加微信 fakeid (通过 ALTER TABLE)
-- SQLite 3.35.0+ 支持 DROP COLUMN，但为了兼容性我们使用备用方案

-- 方案: 创建扩展表存储微信特有信息
CREATE TABLE IF NOT EXISTS sources_wechat_ext (
  source_id             INTEGER PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  faker_id              TEXT NOT NULL,                 -- 微信 fakeid
  mp_cover              TEXT,                          -- 公众号封面
  sync_time             INTEGER,                       -- 最后同步时间
  update_time           INTEGER,                       -- 最后更新时间
  cookie_configured     INTEGER DEFAULT 0,             -- 是否已配置 cookie
  token_configured      INTEGER DEFAULT 0,             -- 是否已配置 token
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 扩展 items 表 - 添加微信文章内容
-- ============================================
-- 注意: 为了避免 ALTER TABLE 兼容性问题，使用独立表

CREATE TABLE IF NOT EXISTS items_wechat_ext (
  item_id               INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  content               TEXT,                          -- 文章完整 HTML 内容
  digest                TEXT,                          -- 文章摘要
  content_hash          TEXT,                          -- 内容哈希 (用于去重)
  is_full_text          INTEGER DEFAULT 0,             -- 是否获取了全文
  created_at            TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- 微信设置表 (存储认证信息)
-- ============================================
CREATE TABLE IF NOT EXISTS wechat_settings (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),  -- 单行配置
  cookie                TEXT,                          -- 微信 cookie
  token                 TEXT,                          -- 微信 token
  user_agent            TEXT,                          -- User-Agent
  proxy_enabled         INTEGER DEFAULT 0,             -- 是否启用代理
  proxy_url             TEXT,                          -- 代理 URL
  deno_proxy_url        TEXT,                          -- Deno 代理 URL
  gather_content        INTEGER DEFAULT 0,             -- 是否采集全文
  gather_model          TEXT DEFAULT 'web',            -- 采集模式: web/app/api
  updated_at            TEXT DEFAULT (datetime('now'))
);

-- 插入默认配置
INSERT OR IGNORE INTO wechat_settings (id) VALUES (1);

-- ============================================
-- 迁移: 将已存在的 wechat 源转换为新结构
-- ============================================
-- 查找已存在的 wechat 源
-- SELECT id, name, input_url, rss_url FROM sources WHERE platform = 'wechat';
