-- platform_credentials 表
CREATE TABLE IF NOT EXISTS platform_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT UNIQUE NOT NULL,
  credential_type TEXT NOT NULL,
  credential_value TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- platform_login_sessions 表
CREATE TABLE IF NOT EXISTS platform_login_sessions (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  state TEXT DEFAULT 'launching',
  target_url TEXT,
  cookie_configured INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- source_columns 表
CREATE TABLE IF NOT EXISTS source_columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- source_categories 表
CREATE TABLE IF NOT EXISTS source_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 扩展 sources 表
ALTER TABLE sources ADD COLUMN column_id INTEGER;
ALTER TABLE sources ADD COLUMN category_id INTEGER;
ALTER TABLE sources ADD COLUMN pinned INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN card_title TEXT;
ALTER TABLE sources ADD COLUMN card_subtitle TEXT;
ALTER TABLE sources ADD COLUMN description TEXT;

-- 预设栏目（忽略已存在错误）
INSERT OR IGNORE INTO source_columns (name, sort_order) VALUES ('核心关注', 1);
INSERT OR IGNORE INTO source_columns (name, sort_order) VALUES ('高频更新', 2);
INSERT OR IGNORE INTO source_columns (name, sort_order) VALUES ('深度阅读', 3);
INSERT OR IGNORE INTO source_columns (name, sort_order) VALUES ('观察中', 4);

-- 预设类别
INSERT OR IGNORE INTO source_categories (name) VALUES ('AI');
INSERT OR IGNORE INTO source_categories (name) VALUES ('科技');
INSERT OR IGNORE INTO source_categories (name) VALUES ('财经');
INSERT OR IGNORE INTO source_categories (name) VALUES ('商业');
INSERT OR IGNORE INTO source_categories (name) VALUES ('宏观');
INSERT OR IGNORE INTO source_categories (name) VALUES ('其他');
