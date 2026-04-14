# InfoHub + WeRss 单体合并实施计划

> 创建时间: 2026-04-01
> 目标: 将 WeRss 功能完全集成到 InfoHub，创建一个统一的内容聚合系统

---

## 系统分析

### InfoHub 技术栈
- **后端**: TypeScript + Hono (端口 3002)
- **前端**: Next.js (端口 3000)
- **数据库**: SQLite (`backend/data/infohub.db`)
- **采集**: rss-parser + Bilibili/Youtube 专用收集器

### WeRss 技术栈
- **后端**: Python + FastAPI (端口 8001)
- **数据库**: SQLite (`data/werss.db`)
- **认证**: 微信 `cookie` + `token` (mp.weixin.qq.com)
- **采集**: WxGather 类 (微信平台 API)

### WeRss 核心模块

| 模块 | 路径 | 功能 |
|------|------|------|
| 微信采集 | `core/wx/wx.py` | 通过微信平台 API 获取文章列表和内容 |
| RSS 生成 | `core/rss.py` | 生成 RSS/ATOM/JSON 格式 |
| RSS API | `apis/rss.py` | 提供 `/feed/{id}.rss` 端点 |
| 级联同步 | `core/cascade.py` | 父子节点数据同步 |

### 数据库 Schema 对比

**InfoHub `sources` 表**:
```sql
CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  name TEXT,
  platform TEXT,  -- 'zhihu'|'x'|'wechat'|'bilibili'|'youtube'|'custom'
  rss_url TEXT,
  input_url TEXT,
  enabled INTEGER DEFAULT 1,
  last_fetched_at TEXT,
  error_message TEXT
);
```

**InfoHub `items` 表**:
```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  source_id INTEGER,
  guid TEXT UNIQUE,
  title TEXT,
  summary TEXT,
  url TEXT,
  author TEXT,
  cover_url TEXT,
  platform TEXT,
  published_at TEXT,
  is_read INTEGER DEFAULT 0,
  is_favorite INTEGER DEFAULT 0
);
```

**WeRss `feeds` 表** (公众号):
```sql
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,           -- 'MP_WXS_{fakeid}'
  mp_name TEXT,
  mp_cover TEXT,
  mp_intro TEXT,
  status INTEGER,
  sync_time INTEGER,
  update_time INTEGER,
  created_at DATETIME,
  updated_at DATETIME,
  faker_id TEXT
);
```

**WeRss `articles` 表**:
```sql
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  mp_id TEXT,                    -- FK to feeds.id
  title TEXT,
  pic_url TEXT,
  url TEXT,
  description TEXT,
  content TEXT,
  content_html TEXT,
  status INTEGER,
  publish_time INTEGER,
  is_read INTEGER DEFAULT 0,
  is_favorite INTEGER DEFAULT 0,
  is_export INTEGER DEFAULT 0
);
```

---

## 合并架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    统一前端 (localhost:3000)                      │
│         知乎 / X / 微信 / 微博 / B站 / YouTube / RSS             │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              InfoHub Backend (localhost:3002)                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    统一采集层 (Collector)                     ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        ││
│  │  │  Zhihu   │ │    X     │ │  WeChat  │ │  Weibo   │        ││
│  │  │ Collector│ │ Collector│ │ Collector│ │ Collector│        ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                     ││
│  │  │ Bilibili│ │ YouTube  │ │   RSS    │                     ││
│  │  │ Collector│ │ Collector│ │ Collector│                     ││
│  │  └──────────┘ └──────────┘ └──────────┘                     ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          ││
│  │ Sources  │ │  Items   │ │  Tags    │ │ Settings │          ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          ││
│  ┌──────────────────────────────────────────────────────────┐  ││
│  │            统一数据库 (SQLite)                               │  ││
│  │  sources | items | tags | settings | wechat_*              │  ││
│  └──────────────────────────────────────────────────────────┘  ││
└─────────────────────────────────────────────────────────────────┘
```

---

## 实施阶段

### Phase 1: 数据库合并 (Day 1)

#### 1.1 扩展 InfoHub Schema

**新增微信相关表**:

```sql
-- 微信公众号配置表
CREATE TABLE wechat_accounts (
  id TEXT PRIMARY KEY,           -- 'MP_WXS_{fakeid}'
  mp_name TEXT NOT NULL,
  mp_cover TEXT,
  mp_intro TEXT,
  faker_id TEXT NOT NULL,
  status INTEGER DEFAULT 1,
  sync_time INTEGER,
  update_time INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 微信公众号文章表 (扩展 items)
-- 新增字段到 items 表:
ALTER TABLE items ADD COLUMN content TEXT;
ALTER TABLE items ADD COLUMN source_type TEXT DEFAULT 'rss'; -- 'rss' | 'wechat'
```

**修改 sources 表**:
```sql
ALTER TABLE sources ADD COLUMN faker_id TEXT;  -- 微信 fakeid
ALTER TABLE sources ADD COLUMN mp_cover TEXT;   -- 公众号封面
```

#### 1.2 创建数据迁移脚本

文件: `infohub/backend/src/db/migrations/werss_import.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';

export async function migrateFromWeRss(werssDbPath: string, infoHubDbPath: string) {
  const werssDb = new Database(werssDbPath, { readonly: true });
  const infoHubDb = new Database(infoHubDbPath);

  // 迁移 feeds
  const feeds = werssDb.prepare('SELECT * FROM feeds').all();
  const insertFeed = infoHubDb.prepare(`
    INSERT OR IGNORE INTO wechat_accounts
    (id, mp_name, mp_cover, mp_intro, faker_id, status, sync_time, update_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const feed of feeds) {
    insertFeed.run(
      feed.id,
      feed.mp_name,
      feed.mp_cover,
      feed.mp_intro,
      feed.faker_id,
      feed.status,
      feed.sync_time,
      feed.update_time
    );
  }

  // 迁移 articles → items
  const articles = werssDb.prepare('SELECT * FROM articles').all();
  const insertItem = infoHubDb.prepare(`
    INSERT OR IGNORE INTO items
    (source_id, guid, title, summary, url, author, cover_url, platform,
     published_at, content, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'wechat', ?, ?, 'wechat')
  `);

  for (const article of articles) {
    // 查找对应的 source_id
    const source = infoHubDb.prepare(
      "SELECT id FROM sources WHERE platform='wechat' AND faker_id=?"
    ).get(article.mp_id.replace('MP_WXS_', ''));

    insertItem.run(
      source?.id || null,
      article.id,
      article.title,
      article.description,
      article.url,
      article.mp_id,
      article.pic_url,
      new Date(article.publish_time * 1000).toISOString(),
      article.content
    );
  }

  werssDb.close();
  infoHubDb.close();
}
```

---

### Phase 2: 微信采集器 (Day 2-3)

#### 2.1 微信 API 认证模块

文件: `infohub/backend/src/services/wechat/auth.ts`

```typescript
/**
 * 微信认证管理
 * 对应 WeRss 的 core/wx/wx.py 认证部分
 */

interface WeChatCredentials {
  cookie: string;
  token: string;
  userAgent: string;
}

export class WeChatAuth {
  private cookie: string = '';
  private token: string = '';
  private userAgent: string = '';

  constructor() {
    this.loadFromSettings();
  }

  private loadFromSettings(): void {
    // 从 settings 表加载微信认证信息
    // 对应 WeRss 的 driver/token.py
  }

  /**
   * 验证 cookie 是否有效
   * 调用 mp.weixin.qq.com/cgi-bin/user_manager?type=4 检查
   */
  async verifyCredentials(): Promise<boolean> {
    // 对应 WeRss 的 check_cookie_validity()
  }

  /**
   * 获取新的 token
   */
  async refreshToken(): Promise<string | null> {
    // 对应 WeRss 的 get_token()
  }

  /**
   * 搜索公众号 (通过名称查找 fakeid)
   */
  async searchBiz(query: string): Promise<Array<{
    fakeid: string;
    nickname: string;
    alias: string;
    round_head_img: string;
  }>> {
    // 对应 WeRss 的 search_Biz()
  }
}
```

#### 2.2 微信公众号文章采集

文件: `infohub/backend/src/services/wechat/articleCollector.ts`

```typescript
/**
 * 微信公众号文章采集器
 * 移植自 WeRss core/wx/wx.py
 */

interface Article {
  id: string;
  mp_id: string;
  title: string;
  cover: string;
  link: string;
  digest: string;
  update_time: number;
  create_time: number;
}

interface ArticleContent {
  id: string;
  content: string;  // HTML 内容
}

export class WeChatArticleCollector {
  /**
   * 获取公众号文章列表
   * 对应 WeRss get_Articles(faker_id)
   */
  async getArticles(fakerId: string, limit: number = 20): Promise<Article[]> {
    // 1. 调用 mp.weixin.qq.com/cgi-bin/appmsgpublish
    // 2. 解析返回的 JSON
    // 3. 返回文章列表
  }

  /**
   * 提取文章内容
   * 对应 WeRss content_extract(url)
   */
  async extractContent(url: string): Promise<string> {
    // 1. 请求文章 URL
    // 2. 解析 HTML，提取 js_content div
    // 3. 处理图片 src
  }

  /**
   * 采集并存储文章
   */
  async collectAndStore(feedId: string): Promise<number> {
    // 1. 获取 faker_id
    // 2. 调用 getArticles 获取文章列表
    // 3. 对每篇文章调用 extractContent
    // 4. 存储到数据库
  }
}
```

#### 2.3 集成到 Collector 主类

修改 `infohub/backend/src/services/collector.ts`:

```typescript
// 在 collectItems 方法中添加:
if (source.platform === 'wechat') {
  return weChatCollector.collectAndStore(source.id);
}
```

---

### Phase 3: RSS 生成迁移 (Day 3-4)

#### 3.1 统一 RSS 生成服务

文件: `infohub/backend/src/services/rssGenerator.ts`

```typescript
/**
 * 统一 RSS 生成器
 * 移植自 WeRss core/rss.py
 */

interface RSSItem {
  id: string;
  title: string;
  link: string;
  description: string;
  content?: string;
  image?: string;
  updated: Date | string;
  mp_name?: string;
}

export class RSSGenerator {
  /**
   * 生成 RSS 2.0 XML
   */
  generateRSS(items: RSSItem[], options: {
    title: string;
    link: string;
    description: string;
    language?: string;
    imageUrl?: string;
  }): string {
    // 对应 WeRss RSS.generate_rss()
  }

  /**
   * 生成 Atom 格式
   */
  generateAtom(items: RSSItem[], options: SameOptions): string {
    // 对应 WeRss RSS.generate_atom()
  }

  /**
   * 生成 JSON Feed
   */
  generateJSON(items: RSSItem[], options: SameOptions): string {
    // 对应 WeRss RSS.generate_json()
  }

  /**
   * 根据扩展名自动选择格式
   */
  generate(items: RSSItem[], options: SameOptions & { ext: string }): string {
    // 对应 WeRss RSS.generate()
  }
}
```

#### 3.2 创建 RSS 端点

修改 `infohub/backend/src/routes/feed.ts`:

```typescript
feedRouter.get('/wechat/:feedId.xml', async (c) => {
  // 获取指定公众号的 RSS
});

feedRouter.get('/wechat/all.xml', async (c) => {
  // 获取所有公众号的 RSS
});
```

---

### Phase 4: 前端集成 (Day 4-5)

#### 4.1 统一平台支持

修改 `infohub/frontend/app/types/index.ts`:

```typescript
type Platform = 'zhihu' | 'x' | 'wechat' | 'weibo' | 'bilibili' | 'youtube' | 'news' | 'custom';
```

#### 4.2 微信订阅源管理

修改 `infohub/frontend/app/components/AddSourceModal.tsx`:
- 添加公众号搜索功能 (调用微信 API)
- 支持通过 fakeid 或公众号名称添加

#### 4.3 公众号详情页

新增 `infohub/frontend/app/components/WeChatSourceDetail.tsx`:
- 显示公众号信息 (名称、封面、简介)
- 文章列表和内容预览

---

### Phase 5: 配置与部署 (Day 5-6)

#### 5.1 微信认证配置 UI

修改 `infohub/frontend/app/components/SettingsModal.tsx`:
- 添加微信 cookie/token 配置
- 添加认证状态检测和刷新

#### 5.2 Docker 整合

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  infohub:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "3002:3002"
    volumes:
      - ./data:/app/data
      - ./config:/app/config
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/infohub.db
      - WECHAT_COOKIE=${WECHAT_COOKIE}
      - WECHAT_TOKEN=${WECHAT_TOKEN}
    depends_on:
      - rsshub

  rsshub:
    image: diygod/rsshub:latest
    ports:
      - "1200:1200"
    volumes:
      - ./rsshub_cache:/app/.rsshub_cache

volumes:
  data:
```

#### 5.2 一键部署脚本

文件: `deploy.sh`

```bash
#!/bin/bash
set -e

echo "🚀 开始部署 InfoHub..."

# 1. 拉取最新代码
git pull

# 2. 安装依赖
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. 配置环境变量
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  请编辑 .env 文件配置微信认证信息"
fi

# 4. 启动服务
docker-compose up -d

# 5. 运行数据库迁移
npm run migrate

echo "✅ 部署完成!"
echo "前端: http://localhost:3000"
echo "后端: http://localhost:3002"
```

---

## 文件变更清单

### 新增文件

| 文件路径 | 功能 | 来源 |
|---------|------|------|
| `backend/src/db/migrations/werss_import.ts` | WeRss 数据迁移 | 新建 |
| `backend/src/services/wechat/auth.ts` | 微信认证管理 | WeRss auth.py |
| `backend/src/services/wechat/articleCollector.ts` | 微信文章采集 | WeRss wx.py |
| `backend/src/services/wechat/rssGenerator.ts` | RSS 生成 | WeRss rss.py |
| `backend/src/db/schema_wechat.sql` | 微信表结构 | 新建 |
| `backend/src/routes/wechat.ts` | 微信 API 路由 | 新建 |
| `frontend/app/components/WeChatSourceDetail.tsx` | 公众号详情组件 | 新建 |
| `docker-compose.yml` | Docker 编排 | 新建 |
| `deploy.sh` | 部署脚本 | 新建 |

### 修改文件

| 文件路径 | 变更 |
|---------|------|
| `backend/src/db/schema.sql` | 添加微信表和字段 |
| `backend/src/services/collector.ts` | 集成 WeChatCollector |
| `backend/src/services/urlDetector.ts` | 微信 URL 检测 |
| `backend/src/routes/feed.ts` | 添加微信 RSS 端点 |
| `backend/src/routes/sources.ts` | 微信源管理 |
| `backend/src/types/index.ts` | 添加 WeChat 类型 |
| `frontend/app/components/AddSourceModal.tsx` | 公众号搜索/添加 |
| `frontend/app/components/TabBar.tsx` | 微信 Tab 支持 |
| `frontend/app/types/index.ts` | 扩展 Platform 类型 |

---

## 验证清单

- [ ] 数据库迁移成功，所有公众号和文章正确导入
- [ ] 微信 cookie/token 配置后能成功认证
- [ ] 可以通过名称搜索公众号
- [ ] 可以添加新的公众号订阅
- [ ] 手动触发采集能获取最新文章
- [ ] RSS 端点返回正确的 RSS XML
- [ ] 前端显示所有平台 (包括微信) 的内容
- [ ] Docker 部署成功
- [ ] 一键部署脚本正常工作
- [ ] 没有 "暂无内容" 问题 (tab 切换正常)

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 微信 API 变更 | 高 - 可能导致采集失败 | 预留接口，WeRss 作为备用 |
| Cookie 过期 | 中 - 需要定期更新 | 添加过期检测和提醒 |
| 大量公众号迁移 | 中 - 数据一致性 | 使用事务，保证原子性 |
| 部署复杂度 | 低 - 用户上手困难 | 提供 Docker 一键部署 |

---

## 时间估算

| Phase | 任务 | 工作量 |
|-------|------|--------|
| Phase 1 | 数据库合并 | 2-3 小时 |
| Phase 2 | 微信采集器 | 4-6 小时 |
| Phase 3 | RSS 生成迁移 | 2-3 小时 |
| Phase 4 | 前端集成 | 3-4 小时 |
| Phase 5 | 配置与部署 | 2-3 小时 |
| **总计** | | **13-19 小时** |

---

## 下一步行动

1. **立即**: 创建 `monolithic-integration` 分支
2. **Phase 1**: 执行数据库 schema 扩展和数据迁移
3. **Phase 2**: 移植微信认证和采集模块
4. **Phase 3-5**: 按顺序完成剩余阶段
5. **测试**: 完整功能验证
6. **发布**: 合并到 main，准备 v1.0

---

## 附录: WeRss 关键代码参考

### 微信 API 端点 (mp.weixin.qq.com)

```python
# 搜索公众号
GET /cgi-bin/searchbiz?action=search_biz&query={name}&token={token}&lang=zh_CN

# 获取文章列表
GET /cgi-bin/appmsgpublish?sub=list&sub_action=list_ex&begin=0&count=20&fakeid={fakeid}&token={token}

# 检查 cookie 有效性
GET /cgi-bin/user_manager?type=4&token={token}
```

### WeRss 数据库路径
- 容器内: `/app/data/werss.db`
- Docker 卷映射到: `/tmp/werss.db` (主机)
