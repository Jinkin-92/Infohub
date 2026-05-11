# Manifest: Jinkin-92/infohub

Generated: 2026-05-09T10:24:55+08:00
Project thesis: InfoHub - 本地订阅聚合中枢，支持多平台集中追踪，极简高效信息流
Core object: 可复用代码资产
Total assets: 15

## Primary Workflow

1. 识别目标项目的主价值与核心对象
2. 对资产簇给出 clone / service / skill / reference 建议
3. 基于代码审查填充结构化 manifest（JSON + Markdown）
4. 建立本地 manifest 更新工作流

## Architecture Layers

| Layer | Description | Key Files |
|-------|-------------|-----------|
| **surface** | 用户界面、API 路由、入口点 | `frontend/app/*`, `backend/src/routes/*`, `backend/src/index.ts` |
| **engine** | 核心规则、处理逻辑、领域引擎 | `backend/src/services/collector.ts`, `urlDetector.ts`, `rssGenerator.ts`, `middleware/error.ts` |
| **orchestration** | 工作流、触发器、队列、进程管理 | `backend/src/services/cron.ts`, `localIntegrations.ts`, `auth/*`, `wechat/*` |
| **interface** | 外部 API、数据库抽象、类型定义 | `backend/src/db/*`, `frontend/app/lib/api.ts`, `frontend/app/types/index.ts` |

## Asset Clusters

### CL-001: 内容采集引擎 (Content Collection Engine)
**Confidence: 0.92** | **Layer: engine** | **Assets: 4**

多平台统一内容采集、URL 解析、RSS 生成的核心引擎。覆盖微信/微博/X/B站/知乎/YouTube 等 8+ 平台。

| Asset | File | Mode | Action | Reason |
|-------|------|------|--------|--------|
| Collector | `backend/src/services/collector.ts` | service | 抽取为采集服务 | 多平台统一采集抽象，含错误分类/自动修复/源修复逻辑 |
| URLDetector | `backend/src/services/urlDetector.ts` | skill | 封装为可调用的 URL 解析工具 | 智能 URL 解析器，支持 6+ 平台自动识别和 RSS 链接生成 |
| RSSGenerator | `backend/src/services/rssGenerator.ts` | clone | 直接复制使用 | 零依赖多格式 RSS 生成器(RSS2.0/Atom/JSON)，RFC 822 日期处理 |
| RSSHubAdapter | `backend/src/services/rsshubAdapter.ts` | clone | 直接复制使用 | RSSHub URL 格式封装，隔离直接依赖 |

**Opportunities:**
- Collector 的错误分类体系 (`errorCategories` + `classifyError`) 可提取为独立 npm 包
- URLDetector 的平台适配器模式可扩展至更多内容平台
- RSSGenerator 可作为轻量级 RSS 工具库发布
- RSSHubAdapter 的适配器模式是降低外部服务耦合的标准做法

**Integration Effort:** low ~ high（RSSGenerator 最低，Collector 最高）

---

### CL-002: 数据库基础设施 (Database Infrastructure)
**Confidence: 0.88** | **Layer: interface** | **Assets: 2**

SQLite/PostgreSQL 双兼容抽象层与完整查询模式。含自动建表、增量迁移、统一查询接口。

| Asset | File | Mode | Action | Reason |
|-------|------|------|--------|--------|
| DBClient | `backend/src/db/client.ts` | clone | 按需提取数据库抽象层 | SQLite/PostgreSQL 双兼容抽象层，含自动建表、增量迁移 |
| QueryLayer | `backend/src/db/queries.ts` | clone | 参考查询模式 | 完整的 CRUD 查询模式：源管理、内容管理、标签、收藏、公开源订阅 |

**Opportunities:**
- DBClient 的 `?` → `$n` 自动转换可作为 SQL 参数适配器复用
- 查询层的 `attachTags` 模式（批量关联查询）是通用数据加载模式
- ensureColumn 增量迁移是小型项目的实用 schema 演进方案

**Anti-pattern Warning:** 不要将自动建表逻辑直接用于生产环境，应使用专业迁移工具(Prisma/Knex)管理 schema 变更

**Integration Effort:** medium

---

### CL-003: 错误处理框架 (Error Handling Framework)
**Confidence: 0.95** | **Layer: engine** | **Assets: 1**

结构化应用错误类体系与统一响应格式化。零外部依赖，框架无关。

| Asset | File | Mode | Action | Reason |
|-------|------|------|--------|--------|
| AppError | `backend/src/middleware/error.ts` | clone | 直接复制到目标项目 | 完整的结构化错误类体系：AppError + 6 个子类 + formatError + getStatusCode |

**Opportunities:**
- 可直接复制到 Hono/Express/Fastify/Nest.js 任何项目
- `isOperational` 标记支持区分业务错误和系统错误
- `Error.captureStackTrace` 的使用是 Node.js 错误类的最佳实践

**Anti-pattern Warning:** `ValidationError` 的 `errors` 字段类型 (`Record<string, string[]>`) 可能需要根据前端需求调整

**Integration Effort:** low

---

### CL-004: 平台认证系统 (Platform Auth System)
**Confidence: 0.78** | **Layer: orchestration** | **Assets: 3**

多平台统一凭证存储与认证流程管理。覆盖微信/微博/X/小红书/知乎。

| Asset | File | Mode | Action | Reason |
|-------|------|------|--------|--------|
| CredentialStore | `backend/src/services/auth/credentialStore.ts` | clone | 直接复制并替换加密方式 | 统一凭证存储，含简单加密、状态管理、多平台支持 |
| WeChatArticleCollector | `backend/src/services/wechat/articleCollector.ts` | reference | 参考页面抓取模式 | 微信公众号文章采集与存储，含内容抓取 |
| WeChatAuth | `backend/src/services/wechat/auth.ts` | reference | 参考微信认证流程 | 微信公众号平台认证与账号搜索 |

**Opportunities:**
- CredentialStore 可作为任何需要多平台 OAuth 管理的项目起点
- 扫码登录会话状态机（weiboAuth/xiaohongshuAuth）可复用于其他平台
- 认证状态机 (`active/expired/invalid`) 是通用设计模式

**Anti-pattern Warning:** `simpleEncrypt` 仅使用 base64 混淆，生产环境必须替换为 AES-256-GCM 或类似真正加密

**Integration Effort:** low ~ high

---

### CL-005: 本地服务编排 (Local Service Orchestration)
**Confidence: 0.82** | **Layer: orchestration** | **Assets: 2**

RSSHub 进程生命周期管理与采集任务调度。支持 Windows/Linux 双平台。

| Asset | File | Mode | Action | Reason |
|-------|------|------|--------|--------|
| LocalIntegrations | `backend/src/services/localIntegrations.ts` | service | 参考进程管理模式 | RSSHub 本地进程全生命周期管理：启动/停止/看门狗/端口冲突检测 |
| CronManager | `backend/src/services/cron.ts` | reference | 参考 worker pool 模式 | 并发控制的采集调度器(worker pool 模式)，支持手动/自动触发 |

**Opportunities:**
- LocalIntegrations 的 Windows 进程管理逻辑（netstat + taskkill + PowerShell）是 Node.js 子进程管理的最佳实践
- CronManager 的 worker pool 模式可复用于任何批量任务调度场景
- `waitForPortState` 轮询检测是服务健康检查的简单可靠方案

**Anti-pattern Warning:** `runNext` 递归模式在极大任务量时可能导致调用栈问题，应考虑迭代实现

**Integration Effort:** medium

---

### CL-006: 前端基础设施 (Frontend Infrastructure)
**Confidence: 0.75** | **Layer: surface** | **Assets: 2**

类型化 API 客户端与共享类型系统。Next.js + TypeScript 技术栈。

| Asset | File | Mode | Action | Reason |
|-------|------|------|--------|--------|
| APIClient | `frontend/app/lib/api.ts` | reference | 参考 API 组织模式 | 完整的类型化 API 客户端，按领域分组 |
| TypeSystem | `frontend/app/types/index.ts` | reference | 参考类型与配置模式 | 前后端共享类型定义 + 平台配置常量 |

**Opportunities:**
- APIClient 的分组模式（feedApi/sourcesApi/tagsApi...）是大型前端项目的 API 组织参考
- `PLATFORM_CONFIG` 的平台元数据模式可用于任何多平台聚合应用
- `resolveApiBase` 的开发/生产环境自动切换是本地开发友好的配置模式

**Integration Effort:** high（高度项目耦合）

---

### CL-007: 测试与运维工具 (Testing & Operations)
**Confidence: 0.70** | **Layer: surface** | **Assets: 1**

冒烟测试与全链路自测脚本。规模较小但模式清晰。

| Asset | File | Mode | Action | Reason |
|-------|------|------|--------|--------|
| SmokeTestLib | `scripts/local-smoke-lib.mjs` | reference | 参考 CLI 参数解析模式 | 参数解析 + 目标选择的小型 CLI 工具模式 |

**Opportunities:**
- `selectTargetSource` 的显式→启用→回退选择逻辑是 CLI 工具的目标解析参考
- `parseArgs` 的防御性编程是小型 CLI 的健壮模式

**Integration Effort:** low

---

## Unified Decision Table

| Cluster | Layer | Clone | Service | Skill | Reference | Top Opportunity |
|---------|-------|-------|---------|-------|-----------|-----------------|
| 内容采集引擎 | engine | RSSGenerator, RSSHubAdapter | Collector | URLDetector | — | 错误分类体系提取为 npm 包 |
| 数据库基础设施 | interface | DBClient, QueryLayer | — | — | — | SQL 参数适配器提取 |
| 错误处理框架 | engine | AppError | — | — | — | 直接复制到任何后端框架 |
| 平台认证系统 | orchestration | CredentialStore | — | — | WeChat* | 替换加密后作为通用凭证库 |
| 本地服务编排 | orchestration | — | LocalIntegrations | — | CronManager | Worker pool 模式复用 |
| 前端基础设施 | surface | — | — | — | APIClient, TypeSystem | PLATFORM_CONFIG 模式复用 |
| 测试与运维 | surface | — | — | — | SmokeTestLib | CLI 参数解析模式参考 |

## Summary

- **Total Assets:** 15
- **High Confidence (≥0.8):** 11
- **Medium Confidence (0.7~0.8):** 4
- **By Reuse Mode:** clone × 5, service × 2, skill × 1, reference × 7
- **By Type:** Framework × 6, Tooling × 5, CodeSnippet × 3, Knowledge × 1

## Files

| File | Description |
|------|-------------|
| `magpie-manifest.json` | Full structured asset data with evidence + generated layers |
| `magpie-manifest.md` | This file — human-readable summary of findings |
| `scripts/update-manifest.mjs` | Local manifest maintenance script (see Step 3) |
