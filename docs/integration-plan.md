# InfoHub + WeRss 整合方案

> 创建时间: 2026-04-01
> 状态: 草稿

## 背景

InfoHub (端口 3002) 和 WeRss (端口 8001) 是两个独立运行的内容聚合系统。本方案描述如何将两者整合为统一的阅读体验。

### 当前架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (localhost:3000)                     │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  InfoHub Backend (localhost:3002)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Sources  │  │   Feed   │  │  Tags    │  │ Settings │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Collector Service                      │  │
│  │  - RSS parsing (rss-parser)                               │  │
│  │  - Platform-specific collectors                           │  │
│  │  - Cron scheduler                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  RSSHub (:1200) │  │  WeRss (:8001)  │  │    SQLite DB    │
│  - zhihu        │  │  - WeChat RSS   │  │  (sources,      │
│  - twitter/x    │  │    公众号       │  │   items, tags)  │
│  - bilibili     │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│   源站          │  │  rsshub-docker  │
│   (需要cookie)  │  │  (WeChat采集)   │
└─────────────────┘  └─────────────────┘
```

### 数据流现状

```
WeChat 公众号
    │
    ▼
rsshub-docker (we-mp-rss 容器)
    │
    ▼
WeRss (:8001) ──── RSS feed URL ────► InfoHub Collector
    │                                        │
    │                                        ▼
    │                                 SQLite DB
    │                                        │
    ▼                                        ▼
用户直接访问                              前端展示
```

## 整合目标

1. **统一入口**: 用户只需访问 InfoHub，所有内容一站式阅读
2. **统一管理**: 订阅源在 InfoHub 统一管理，无需在两个系统配置
3. **统一架构**: 长远目标是单一代码库，短期内保持双服务运行

## 整合方案

### 方案 A: API 代理网关 (短期, 低复杂度)

InfoHub 作为唯一的用户入口，WeRss 作为专门的 WeChat RSS 服务被 InfoHub 调用。

```
┌─────────────────────────────────────────────────────────────────┐
│                     最终用户 (仅看到 InfoHub)                     │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  InfoHub (localhost:3002)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  源管理 API (Sources API)                                   │ │
│  │  - 添加/删除/编辑订阅源                                       │ │
│  │  - 触发采集                                                  │ │
│  │  - 微信源特殊处理: 检测到 mp.weixin.qq.com → 自动路由到 WeRss │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  采集调度 (Collector)                                       │ │
│  │  - 常规 RSS (知乎, B站, YouTube, 自定义) → 直接抓取          │ │
│  │  - 微信 RSS → 转发到 WeRss 代理抓取                          │ │
│  └────────────────────────────────────────────────────────┐   │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│  RSSHub (:1200) │  │  WeRss (:8001)  │
│  其他平台       │  │  微信专用       │
└─────────────────┘  └─────────────────┘
```

**实现步骤:**

1. **修改 urlDetector.ts**: 当检测到微信 URL 时，自动生成 WeRss 的 RSS URL
   - 输入: `https://mp.weixin.qq.com/s/xxx`
   - 输出: `http://localhost:8001/feed/{account_id}.rss`

2. **修改 collector.ts**: 添加 WeChat 特殊路由逻辑
   - 微信源: 直接返回 WeRss URL 而不是本地采集

3. **修改 sources API**: 支持从 WeRss 自动同步源列表

**优点:**
- 实现简单，改动最少
- 保持系统解耦
- WeRss 可以独立升级

**缺点:**
- 仍需运行 WeRss 服务
- 额外网络跳转 (InfoHub → WeRss → 源站)

---

### 方案 B: 数据同步 (中期, 中复杂度)

InfoHub 直接从 WeRss 的 SQLite 数据库读取源列表，实现统一管理。

```
┌─────────────────────────────────────────────────────────────────┐
│                  InfoHub (localhost:3002)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  统一源管理                                                  │ │
│  │  - InfoHub DB: 用户配置, 标签, 阅读状态                     │ │
│  │  - WeRss DB: 微信源元数据 (只读)                             │ │
│  │  - 虚拟视图: 将 WeRss 源合并到 InfoHub 源列表                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼ (只读访问)
┌─────────────────┐
│  WeRss DB      │
│  /tmp/werss.db │
│  (feeds 表)    │
└─────────────────┘
```

**实现步骤:**

1. **创建 WeRss 数据适配器** `infohub/backend/src/services/werssAdapter.ts`
   - 读取 `/tmp/werss.db` (或通过 Docker 卷映射)
   - 映射 feeds 表到 InfoHub Source 类型

2. **修改 sources API**:
   - `GET /api/sources` 合并 InfoHub 源和 WeRss 源
   - `POST /api/sources` 微信源写入 WeRss DB

3. **Docker 集成**:
   - 将 WeRss 的 `werss.db` 映射到主机路径
   - InfoHub 直接读取

**优点:**
- 源管理统一
- 无额外网络延迟
- 可以完全停用 WeRss 前端

**缺点:**
- 需要处理数据库 schema 差异
- Docker 卷路径可能变化

---

### 方案 C: 单体合并 (长期, 高复杂度)

将 WeRss 的核心功能合并到 InfoHub，创建一个单一的统一系统。

**合并内容:**
- WeRss 的微信 Feed 抓取逻辑 → InfoHub collector
- WeRss 的 Cookie 管理 → InfoHub cookieExtractor
- WeRss 的 SQLite Schema → InfoHub schema 扩展

**保留内容:**
- InfoHub 的前端 UI
- InfoHub 的标签和阅读状态系统
- InfoHub 的 cron 调度器

**实现步骤:**
1. 分析 WeRss 的 feed 抓取逻辑
2. 创建 `WechatCollector` 替代 WeRss
3. 迁移微信源数据到 InfoHub
4. 停用 WeRss 服务

**优点:**
- 单一系统，易于维护
- 无外部依赖
- 完全可控

**缺点:**
- 工作量大
- 风险高
- 需要重写微信采集逻辑

---

## 推荐路径

```
短期 (立即): 方案 A - API 代理
    │
    ▼
中期 (1-2周): 方案 B - 数据同步
    │
    ▼
长期 (未来): 方案 C - 单体合并 (可选)
```

## 实施计划

### Phase 1: API 代理 (方案 A)

**任务 1.1**: 修改 urlDetector 识别微信 URL 并生成 WeRss 路径

文件: `infohub/backend/src/services/urlDetector.ts`

```typescript
// 伪代码
if (url.includes('mp.weixin.qq.com')) {
  // 从 URL 提取账号或使用 chuansongme
  return { platform: 'wechat', wechatAccount: extractAccount(url) }
}
```

**任务 1.2**: 添加 WeRss 代理模式到 collector

文件: `infohub/backend/src/services/collector.ts`

```typescript
// 伪代码
if (platform === 'wechat') {
  const wechatUrl = weRssAdapter.buildWechatFeedUrl(source)
  return this.collectRsshubItems(wechatUrl)
}
```

**任务 1.3**: 前端添加 "从 WeRss 导入" 按钮

文件: `infohub/frontend/app/components/SettingsModal.tsx`

### Phase 2: 数据同步 (方案 B)

**任务 2.1**: 创建 WeRss 数据库适配器

文件: `infohub/backend/src/services/werssAdapter.ts`

```typescript
interface WeRssSource {
  id: number
  mp_name: string
  mp_cover?: string
  status: string
  faker_id: string  // 用于构建 RSS URL
}

export async function getWeRssSources(): Promise<WeRssSource[]>
export function toInfoHubSource(werss: WeRssSource): Source
```

**任务 2.2**: 合并源列表 API

文件: `infohub/backend/src/routes/sources.ts`

```typescript
// GET /api/sources
// 返回: { ownSources: Source[], wechatSources: Source[] }
```

**任务 2.3**: Docker 卷映射

更新 `docker-compose.yml` 或容器配置，将 WeRss 数据库路径映射到主机。

### Phase 3: 单体合并 (方案 C) - 可选

**任务 3.1**: 分析 WeRss 抓取逻辑

检查 WeRss 如何:
- 获取微信公众号文章列表
- 处理微信文章的特殊格式
- 管理 cookie/session

**任务 3.2**: 实现 WechatCollector

文件: `infohub/backend/src/services/wechatCollector.ts`

## 关键文件参考

| 功能 | InfoHub 文件 | WeRss 参考 |
|------|-------------|-----------|
| URL 检测 | `urlDetector.ts` | WeRss URL 路由规则 |
| 采集器 | `collector.ts` | WeRss feed 抓取 |
| RSS 解析 | `rsshubAdapter.ts` | WeRss 自定义解析 |
| Cookie 管理 | `cookieExtractor.ts` | WeRss cookie 存储 |
| 数据库 | `db/queries.ts` | WeRss `feeds` 表 |

## 验证清单

- [ ] 所有微信源在 InfoHub 前端显示
- [ ] 点击采集能获取最新内容
- [ ] 切换栏目不出现 "暂无内容"
- [ ] WeRss 可以独立运行 (不依赖 InfoHub)
- [ ] 可以通过 InfoHub 管理微信源 (添加/删除)

## 风险和注意事项

1. **微信反爬**: 微信对爬虫有严格限制，依赖 WeRss/rsshub-docker 的稳定采集
2. **Cookie 过期**: Weibo 等平台需要定期更新 cookie
3. **Docker 依赖**: 方案 B 依赖 Docker 卷路径，可能因更新而失效
4. **数据一致性**: 多源同步时注意去重

## 下一步行动

1. **立即**: 实现方案 A - 修改 urlDetector 和 collector 支持微信特殊路由
2. **本周**: 实现方案 B - 添加 WeRss 数据库适配器，合并源列表
3. **评估**: 方案 C 的工作量和风险，决定是否继续
