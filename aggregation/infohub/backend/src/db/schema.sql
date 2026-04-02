-- 个人信息中枢数据库Schema
-- 版本：v1.0
-- 创建日期：2026-03-24

-- 订阅源表
CREATE TABLE IF NOT EXISTS sources (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  platform              VARCHAR(30)  NOT NULL,
  -- 平台类型：'zhihu' | 'x' | 'news' | 'custom' | 'bilibili' | 'youtube' | 'wechat'

  input_url             TEXT NOT NULL,              -- 用户原始输入的URL
  rss_url               TEXT NOT NULL,              -- 解析后实际拉取的RSS URL
  platform_id           VARCHAR(100),               -- 提取出的平台用户ID

  fetch_interval_min    INT DEFAULT 360,            -- 采集间隔（分钟）
  enabled               BOOLEAN DEFAULT TRUE,       -- 是否启用

  -- 状态跟踪字段（工程审查要求）
  status                VARCHAR(20) DEFAULT 'active', -- 状态：active/error/disabled
  error_count           INT DEFAULT 0,              -- 连续错误次数
  last_error            TEXT,                       -- 最后一次错误信息
  last_error_at         TIMESTAMPTZ,                -- 最后一次错误时间

  last_fetched_at       TIMESTAMPTZ,                -- 最后采集时间
  last_success_at       TIMESTAMPTZ,                -- 最后成功时间
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 内容条目表
CREATE TABLE IF NOT EXISTS items (
  id                    BIGSERIAL PRIMARY KEY,
  source_id             INT REFERENCES sources(id) ON DELETE CASCADE,

  guid                  TEXT NOT NULL,              -- RSS item的guid，用于去重
  title                 TEXT NOT NULL,
  summary               TEXT,
  url                   TEXT NOT NULL,
  author                VARCHAR(100),
  cover_url             TEXT,

  platform              VARCHAR(30) NOT NULL,       -- 内容所属平台
  published_at          TIMESTAMPTZ NOT NULL,       -- 原始发布时间
  fetched_at            TIMESTAMPTZ DEFAULT NOW(),  -- 采集时间

  raw_json              JSONB,                      -- 原始数据，供Agent使用

  UNIQUE(source_id, guid)
);

-- 已读状态表（服务端同步）
CREATE TABLE IF NOT EXISTS read_status (
  item_id               BIGINT REFERENCES items(id) ON DELETE CASCADE,
  read_at               TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (item_id)
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_items_published_at ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_platform ON items(platform);
CREATE INDEX IF NOT EXISTS idx_items_source_id ON items(source_id);

-- 复合索引（性能优化）
CREATE INDEX IF NOT EXISTS idx_items_source_published ON items(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_platform_published ON items(platform, published_at DESC);

-- 触发器：自动更新updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sources_updated_at ON sources;
CREATE TRIGGER update_sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 预设内置新闻源（初始数据）
INSERT INTO sources (name, platform, input_url, rss_url, fetch_interval_min) VALUES
  ('36氪 · AI', 'news', 'https://36kr.com/information/AI', 'https://36kr.com/feed', 60),
  ('Hacker News', 'news', 'https://news.ycombinator.com', 'https://hnrss.org/frontpage', 60),
  ('The Verge · AI', 'news', 'https://www.theverge.com/ai', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 60)
ON CONFLICT DO NOTHING;

-- 注释说明
COMMENT ON TABLE sources IS '订阅源配置表';
COMMENT ON TABLE items IS '内容条目表';
COMMENT ON TABLE read_status IS '已读状态表';
COMMENT ON COLUMN sources.status IS '源状态：active(正常)/error(错误)/disabled(禁用)';
COMMENT ON COLUMN sources.error_count IS '连续采集失败次数';

-- ============================================
-- 标签系统（v1.1 新增）
-- ============================================

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(50) NOT NULL UNIQUE,  -- 标签名
  color                 VARCHAR(7) DEFAULT '#4CA6E1', -- 标签颜色（Hex）
  description           VARCHAR(200),                 -- 标签描述
  sort_order            INT DEFAULT 0,                -- 排序权重
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 内容标签关联表
CREATE TABLE IF NOT EXISTS item_tags (
  item_id               BIGINT REFERENCES items(id) ON DELETE CASCADE,
  tag_id                INT REFERENCES tags(id) ON DELETE CASCADE,
  tagged_at             TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (item_id, tag_id)
);

-- 标签索引
CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);

-- 注释
COMMENT ON TABLE tags IS '标签表';
COMMENT ON TABLE item_tags IS '内容标签关联表';

-- 预设默认标签
INSERT INTO tags (name, color, description, sort_order) VALUES
  ('重要', '#FF4D4F', '重要内容标记', 1),
  ('稍后阅读', '#FAAD14', '稍后阅读', 2),
  ('技术', '#4CA6E1', '技术相关', 3),
  ('产品', '#52C41A', '产品相关', 4),
  ('设计', '#722ED1', '设计相关', 5)
ON CONFLICT DO NOTHING;

-- ============================================
-- 微信公众号扩展表 (Phase 4)
-- ============================================

-- 微信公众号账号表
CREATE TABLE IF NOT EXISTS wechat_accounts (
  id                    VARCHAR(50) PRIMARY KEY,       -- 公众号ID，如 MP_WXS_xxx
  mp_name               VARCHAR(200) NOT NULL,         -- 公众号名称
  mp_cover              TEXT,                          -- 头像URL
  mp_intro             TEXT,                          -- 公众号简介
  fakeid                VARCHAR(100),                  -- 微信内部 fakeid
  alias                 VARCHAR(100),                  -- 公众号别名
  status                VARCHAR(20) DEFAULT 'active',  -- 状态：active/disabled
  sync_time            TIMESTAMPTZ,                  -- 上次同步时间
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 订阅源微信扩展表 (关联 sources 表)
CREATE TABLE IF NOT EXISTS sources_wechat_ext (
  source_id             INT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  faker_id              VARCHAR(100) NOT NULL,         -- 微信 fakeid
  mp_name               VARCHAR(200),                  -- 公众号名称（冗余存储）
  last_article_time     TIMESTAMPTZ,                  -- 最新文章时间
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 微信文章扩展表 (关联 items 表)
CREATE TABLE IF NOT EXISTS items_wechat_ext (
  item_id               BIGINT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  content               TEXT,                          -- 完整文章内容 (HTML)
  digest                TEXT,                          -- 文章摘要
  content_hash          VARCHAR(64),                   -- 内容哈希 (去重)
  is_full_text          BOOLEAN DEFAULT FALSE,         -- 是否抓取了全文
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 微信设置表
CREATE TABLE IF NOT EXISTS wechat_settings (
  id                    INT PRIMARY KEY DEFAULT 1,
  cookie                TEXT,                          -- 微信 cookie
  token                 VARCHAR(50),                   -- 微信 token
  user_agent            TEXT,                          -- User-Agent
  gather_content        INT DEFAULT 0,                 -- 是否采集全文 (0/1)
  gather_model          VARCHAR(20) DEFAULT 'web',    -- 采集模式：web/app/api
  proxy_enabled         INT DEFAULT 0,                -- 是否启用代理
  proxy_url             TEXT,                          -- 代理地址
  deno_proxy_url        TEXT,                          -- Deno 代理地址
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 初始化微信设置
INSERT INTO wechat_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 微信表索引
CREATE INDEX IF NOT EXISTS idx_wechat_accounts_name ON wechat_accounts(mp_name);
CREATE INDEX IF NOT EXISTS idx_sources_wechat_ext_faker ON sources_wechat_ext(faker_id);
CREATE INDEX IF NOT EXISTS idx_items_wechat_ext_hash ON items_wechat_ext(content_hash);

COMMENT ON TABLE wechat_accounts IS '微信公众号账号表';
COMMENT ON TABLE sources_wechat_ext IS '订阅源微信扩展表';
COMMENT ON TABLE items_wechat_ext IS '微信文章扩展表';
COMMENT ON TABLE wechat_settings IS '微信设置表';
