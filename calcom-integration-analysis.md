# Cal.com 资产集成分析报告

> 分析目标：基于 calcom/cal.com 仓库资产，为 InfoHub 项目提供集成与改进方向
> 分析时间：2026-05-07
> 分析工具：Magpie v0.1
> 仓库地址：https://github.com/calcom/cal.com

---

## 一、项目匹配度总览

### 1.1 Cal.com 项目定位

| 属性 | 值 |
|------|-----|
| 项目类型 | Framework（框架型仓库） |
| 核心定位 | 日程调度与第三方集成的插件化平台 |
| Star 数 | 42,000+ |
| 架构层次 | Surface → Engine → Orchestration → Interface |
| 差异化能力 | 开放平台、OAuth 集成架构、任务队列、Webhook 系统 |

### 1.2 InfoHub 项目定位

| 属性 | 值 |
|------|-----|
| 项目类型 | 工具型 + 平台型混合 |
| 核心定位 | 多平台内容订阅聚合与分发中枢 |
| 核心功能 | Bilibili/X/微博/知乎/微信/小红书/RSS 采集 |
| 当前痛点 | 采集中断无重试、Cookie 过期无感知、无内容分发出口 |

### 1.3 匹配度评估

**两颗星高度匹配**。Cal.com 和 InfoHub 都是「集成平台型产品」：

- Cal.com = 日程调度 + 第三方日历集成
- InfoHub = 内容聚合 + 第三方平台采集

两者在**任务调度、凭证管理、Webhook 分发、接口抽象**四个维度高度对齐。

---

## 二、架构对比分析

### 2.1 Cal.com 四层架构

```
┌─────────────────────────────────────────────────────┐
│ L04 Interface（接口与信任层）                        │
│ OAuth管理器 | App Store集成 | Credential存储 | API Key│
├─────────────────────────────────────────────────────┤
│ L03 Orchestration（组织与编排层）                    │
│ Tasker任务队列 | Webhook投递 | Calendar订阅同步      │
├─────────────────────────────────────────────────────┤
│ L02 Engine（规则与引擎层）                           │
│ tRPC路由 | Prisma Schema | 日志 | 安全加密           │
├─────────────────────────────────────────────────────┤
│ L01 Surface（用户表面层）                            │
│ Next.js前端 | UI组件库 | 设置面板 | 数据表格         │
└─────────────────────────────────────────────────────┘
```

### 2.2 InfoHub 当前架构

```
┌─────────────────────────────────────────────────────┐
│ Router（路由层）                                     │
│ /api/collect | /api/feeds | /api/platforms          │
├─────────────────────────────────────────────────────┤
│ Service（服务层）                                    │
│ Collector（采集分发）| RSSGenerator | CookieManager │
├─────────────────────────────────────────────────────┤
│ Database（数据层）                                   │
│ SQLite（Feed/User/Platform）                        │
├─────────────────────────────────────────────────────┤
│ Scheduler（调度层）                                  │
│ cron.ts 定时触发（无重试、无状态）                   │
└─────────────────────────────────────────────────────┘
```

### 2.3 关键差距

| 维度 | Cal.com | InfoHub 当前 | 差距 |
|------|---------|-------------|------|
| 任务调度 | tasker（DB/Redis双后端，支持重试） | cron.ts（无重试，无状态） | **极大** |
| 凭证管理 | OAuthManager（自动刷新） | CookieManager（无刷新） | **大** |
| 内容分发 | WebhookService（完整投递系统） | 无 | **极大** |
| 安全防护 | SSRF + 加密（AES-256） | 无 | **大** |
| 接口抽象 | Calendar + 适配器模式 | if/else 分发 | **中** |
| 数据模型 | Task/Webhook/Credential 完整 | 基础 CRUD | **大** |

---

## 三、需要改进的内容

### 3.1 优先级 P0（核心缺口，必须改进）

#### 改进点 1：任务调度系统

**现状问题**：
- cron.ts 定时触发，无重试机制
- 采集失败后需要手动重跑
- 无法追踪任务执行状态（成功/失败/重试次数）
- 多平台并发采集无统一管理

**改进目标**：
- 实现事件驱动的任务队列
- 支持失败自动重试（指数退避）
- 支持任务状态追踪
- 支持延迟投递

#### 改进点 2：凭证生命周期管理

**现状问题**：
- Cookie 存储后不检测是否过期
- 微博/知乎 Cookie 过期后静默失败
- 各平台凭证管理分散，无统一抽象

**改进目标**：
- 实现凭证有效性检测
- 实现自动刷新机制
- 统一凭证存储接口

#### 改进点 3：内容分发管道

**现状问题**：
- 采集完成后无推送机制
- 用户需要手动导入 Notion/Readwise
- 无法成为内容分发 Hub

**改进目标**：
- 支持 Webhook 投递
- 支持 HMAC 安全签名
- 支持模板化内容格式

### 3.2 优先级 P1（重要缺口，应该改进）

#### 改进点 4：安全防护

**现状问题**：
- 用户输入的 URL 无校验
- Cookie 明文存储在本地
- 存在 SSRF 风险

**改进目标**：
- URL 安全校验（防止内网攻击）
- 凭证加密存储

#### 改进点 5：平台采集接口抽象

**现状问题**：
- 新增平台需要修改多处代码
- if/else 分发到采集器，耦合严重
- 无法支持热插拔平台

**改进目标**：
- 定义 ContentSource 接口
- 实现服务注册表模式
- 添加新平台只需配置

### 3.3 优先级 P2（体验优化，可以改进）

#### 改进点 6：数据表格筛选器

**现状问题**：
- Feed 列表无高级筛选
- 无法保存筛选条件
- 长列表加载性能差

#### 改进点 7：日期时间工具

**现状问题**：
- 时间显示格式不统一
- 无时区处理
- 无相对时间缓存

---

## 四、如何改进

### 4.1 Phase 1：数据层重构（第 1-2 周）

#### 步骤 1.1：扩展 SQLite Schema

在 `backend/src/db/` 下新建或修改 schema：

```sql
-- Task 表：替代 cron.ts 的任务追踪
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL,              -- 'collection' | 'webhook'
  payload TEXT NOT NULL,            -- JSON: { platform, url, options }
  scheduled_at DATETIME,
  succeeded_at DATETIME,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Webhook 表：内容推送订阅
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  subscriber_url TEXT NOT NULL,
  event_triggers TEXT NOT NULL,     -- JSON: ["new_item", "feed_update"]
  active INTEGER DEFAULT 1,
  secret TEXT,                       -- HMAC 签名密钥
  payload_template TEXT,             -- Handlebars 模板
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Credential 表：统一凭证存储
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  platform TEXT NOT NULL,           -- 'weibo' | 'zhihu' | 'bilibili'
  key TEXT NOT NULL,                -- 加密后的凭证
  expiry_date INTEGER,               -- 过期时间戳
  refresh_token TEXT,                -- 刷新令牌
  metadata TEXT,                     -- 平台特有字段
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 步骤 1.2：实现 Tasker 接口

新建 `backend/src/services/tasker.ts`：

```typescript
// packages/features/tasker/tasker.ts 的 InfoHub 版本
export type TaskTypes = 'collection' | 'webhook' | 'cleanup'

export interface TaskHandler<T = unknown> {
  run: (payload: T) => Promise<void>
  onError?: (error: Error, task: TaskPayload<T>) => Promise<void>
}

export interface Tasker {
  createAndEnqueue: <T>(task: CreateTaskInput<T>) => Promise<Task>
  cancel: (taskId: string) => Promise<void>
}

export interface CreateTaskInput<T> {
  type: TaskTypes
  payload: T
  scheduledAt?: Date
  maxAttempts?: number
}
```

#### 步骤 1.3：实现 InternalTasker

新建 `backend/src/services/internal-tasker.ts`：

```typescript
import { Database } from 'better-sqlite3'
import { Tasker, CreateTaskInput, Task } from './tasker'

export class InternalTasker implements Tasker {
  constructor(private db: Database) {}

  async createAndEnqueue<T>(input: CreateTaskInput<T>): Promise<Task> {
    const id = crypto.randomUUID()
    this.db.prepare(`
      INSERT INTO tasks (id, type, payload, scheduled_at, max_attempts)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      input.type,
      JSON.stringify(input.payload),
      input.scheduledAt || new Date(),
      input.maxAttempts || 3
    )
    return { id, type: input.type, payload: input.payload, attempts: 0 }
  }

  async cancel(taskId: string): Promise<void> {
    this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(taskId)
  }
}
```

#### 步骤 1.4：实现 TaskProcessor

新建 `backend/src/services/task-processor.ts`：

```typescript
export class TaskProcessor {
  constructor(
    private db: Database,
    private handlers: Map<string, TaskHandler>
  ) {}

  async processQueue(batchSize = 10): Promise<{ succeeded: number; failed: number }> {
    const tasks = this.db.prepare(`
      SELECT * FROM tasks
      WHERE scheduled_at <= datetime('now')
        AND succeeded_at IS NULL
        AND attempts < max_attempts
      ORDER BY scheduled_at ASC
      LIMIT ?
    `).all() as Task[]

    let succeeded = 0, failed = 0

    for (const task of tasks) {
      const handler = this.handlers.get(task.type)
      if (!handler) continue

      try {
        await handler.run(JSON.parse(task.payload))
        this.db.prepare(`
          UPDATE tasks SET succeeded_at = datetime('now') WHERE id = ?
        `).run(task.id)
        succeeded++
      } catch (error) {
        // 指数退避重试
        const delay = Math.min(60000 * Math.pow(2, task.attempts), 3600000)
        this.db.prepare(`
          UPDATE tasks SET
            attempts = attempts + 1,
            last_error = ?,
            scheduled_at = datetime('now', ?)
          WHERE id = ?
        `).run(String(error), `+${delay} milliseconds`, task.id)

        if (task.attempts + 1 >= task.maxAttempts) {
          await handler.onError?.(error as Error, task)
        }
        failed++
      }
    }

    return { succeeded, failed }
  }
}
```

### 4.2 Phase 2：安全层实现（第 2 周）

#### 步骤 2.1：实现 SSRF 防护

新建 `backend/src/lib/ssrf-protection.ts`：

参考 `packages/lib/ssrfProtection.ts`：

```typescript
// 核心逻辑
export async function validateHostOrUrl(urlStr: string): Promise<string> {
  const parsed = new URL(urlStr)

  // HTTPS only
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS allowed')
  }

  // DNS 重解验证
  const dnsResult = await dns.resolve4(parsed.hostname)
  const primaryIp = dnsResult[0]

  // 私有 IP 检查
  if (isPrivateIp(primaryIp)) {
    throw new Error('Private IP not allowed')
  }

  // DNS rebinding 检查
  const allIps = await dns.resolve4(parsed.hostname, { all: true })
  for (const ip of allIps) {
    if (isPrivateIp(ip)) {
      throw new Error('DNS rebinding detected')
    }
  }

  return urlStr
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  // 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 127)
  )
}
```

#### 步骤 2.2：实现凭证加密

新建 `backend/src/lib/crypto.ts`：

参考 `packages/lib/crypto.ts`：

```typescript
const ALGORITHM = 'aes-256-gcm'

export function encrypt(key: string, data: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv)
  return (
    iv.toString('hex') + ':' +
    cipher.update(data, 'utf8', 'hex') + ':' +
    cipher.final('hex') + ':' +
    cipher.getAuthTag().toString('hex')
  )
}

export function decrypt(key: string, encrypted: string): string {
  const [ivHex, data, authTagHex] = encrypted.split(':')
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(key, 'hex'),
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8')
}
```

**注意**：密钥需要通过环境变量或配置文件管理，不要硬编码。

### 4.3 Phase 3：凭证管理（第 2-3 周）

#### 步骤 3.1：实现 CredentialManager

新建 `backend/src/services/credential-manager.ts`：

参考 `packages/app-store/_utils/oauth/OAuthManager.ts`：

```typescript
export interface Credential {
  id: string
  platform: string
  key: string  // 加密后的凭证
  expiryDate?: number
  refreshToken?: string
  metadata?: Record<string, unknown>
}

export class CredentialManager {
  constructor(
    private db: Database,
    private encryptKey: string,
    private decryptKey: string
  ) {}

  async saveCredential(platform: string, rawCredential: Record<string, unknown>): Promise<Credential> {
    const encrypted = encrypt(this.encryptKey, JSON.stringify(rawCredential))
    const id = crypto.randomUUID()

    this.db.prepare(`
      INSERT INTO credentials (id, platform, key, expiry_date, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      platform,
      encrypted,
      rawCredential.expiry_date || null,
      JSON.stringify(rawCredential.metadata || {})
    )

    return { id, platform, key: encrypted, expiryDate: rawCredential.expiry_date }
  }

  async getValidCredential(platform: string): Promise<Credential | null> {
    const row = this.db.prepare(`
      SELECT * FROM credentials WHERE platform = ? ORDER BY created_at DESC LIMIT 1
    `).get(platform) as any

    if (!row) return null

    const decrypted = JSON.parse(decrypt(this.decryptKey, row.key))

    // 检测是否即将过期（5秒阈值）
    if (row.expiry_date && row.expiry_date - Date.now() < 5000) {
      // 需要刷新
      const refreshed = await this.refreshCredential(row.platform, decrypted)
      if (refreshed) {
        return this.saveCredential(platform, refreshed)
      }
    }

    return {
      id: row.id,
      platform: row.platform,
      key: row.key,
      expiryDate: row.expiry_date,
      metadata: JSON.parse(row.metadata || '{}')
    }
  }

  private async refreshCredential(platform: string, credential: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    // 各平台的刷新逻辑
    switch (platform) {
      case 'weibo':
        return this.refreshWeiboCredential(credential)
      case 'zhihu':
        return this.refreshZhihuCredential(credential)
      default:
        return null
    }
  }

  private async refreshWeiboCredential(credential: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    // 参考 refreshOAuthTokens.ts 的实现
    const response = await fetch('https://api.weibo.com/oauth2/access_token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credential.refresh_token as string,
        client_id: process.env.WEIBO_CLIENT_ID!,
        client_secret: process.env.WEIBO_CLIENT_SECRET!,
      }),
    })
    return response.json()
  }
}
```

### 4.4 Phase 4：Webhook 分发层（第 3 周）

#### 步骤 4.1：实现 WebhookService

新建 `backend/src/services/webhook-service.ts`：

参考 `packages/features/webhooks/lib/WebhookService.ts` 和 `sendPayload.ts`：

```typescript
export interface WebhookSubscriber {
  id: string
  subscriberUrl: string
  secret?: string
  payloadTemplate?: string
}

export interface WebhookPayload {
  event: string
  platform: string
  items: Array<{
    id: string
    title: string
    url: string
    publishedAt: string
    content?: string
  }>
}

export class WebhookService {
  private subscribers: WebhookSubscriber[] = []

  async init(subscribers: WebhookSubscriber[]): Promise<void> {
    this.subscribers = subscribers.filter(s => s.active)
  }

  async sendPayload(event: string, payload: WebhookPayload): Promise<{ sent: number; failed: number }> {
    const results = await Promise.allSettled(
      this.subscribers
        .filter(s => s.eventTriggers.includes(event))
        .map(sub => this.sendToSubscriber(sub, event, payload))
    )

    return {
      sent: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    }
  }

  private async sendToSubscriber(
    subscriber: WebhookSubscriber,
    event: string,
    payload: WebhookPayload
  ): Promise<void> {
    const body = subscriber.payloadTemplate
      ? handlebars.compile(subscriber.payloadTemplate)(payload)
      : JSON.stringify(payload)

    const signature = subscriber.secret
      ? crypto.createHmac('sha256', subscriber.secret)
          .update(JSON.stringify(payload))
          .digest('hex')
      : ''

    const response = await fetch(subscriber.subscriberUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-InfoHub-Signature': `sha256=${signature}`,
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`Webhook delivery failed: ${response.status}`)
    }
  }
}
```

#### 步骤 4.2：集成到采集流程

修改采集完成后的逻辑：

```typescript
// backend/src/services/collector.ts
async collectPlatform(platform: string, url: string) {
  const items = await this.collect(platform, url)

  // 原有逻辑：存储到数据库

  // 新增：触发 Webhook
  const webhookService = new WebhookService()
  await webhookService.init(await this.getWebhooks(platform))
  await webhookService.sendPayload('new_item', {
    event: 'new_item',
    platform,
    items,
  })

  return items
}
```

### 4.5 Phase 5：架构抽象（第 3-4 周）

#### 步骤 5.1：定义 ContentSource 接口

新建 `backend/src/interfaces/content-source.ts`：

参考 `packages/types/Calendar.d.ts`：

```typescript
export interface ContentItem {
  id: string
  title: string
  url: string
  publishedAt: Date
  author?: string
  content?: string
  thumbnail?: string
  platform: string
}

export interface ContentSourceOptions {
  credential?: Credential
  limit?: number
  since?: Date
}

export interface ContentSource {
  platform: string

  listItems(options?: ContentSourceOptions): Promise<ContentItem[]>

  search?(query: string, options?: ContentSourceOptions): Promise<ContentItem[]>

  validateCredential?(credential: Credential): Promise<boolean>
}
```

#### 步骤 5.2：实现服务注册表

新建 `backend/src/services/content-source-registry.ts`：

参考 `packages/app-store/calendar.services.generated.ts`：

```typescript
import type { ContentSource } from '../interfaces/content-source'
import { BilibiliSource } from './platforms/bilibili'
import { WeiboSource } from './platforms/weibo'
import { ZhihuSource } from './platforms/zhihu'
import { RSSTSource } from './platforms/rss'

export const ContentSourceMap = {
  bilibili: () => new BilibiliSource(),
  weibo: () => new WeiboSource(),
  zhihu: () => new ZhihuSource(),
  rss: () => new RSSTSource(),
} as const

export type PlatformType = keyof typeof ContentSourceMap

export function createContentSource(platform: PlatformType): ContentSource {
  const factory = ContentSourceMap[platform]
  if (!factory) {
    throw new Error(`Unknown platform: ${platform}`)
  }
  return factory()
}
```

#### 步骤 5.3：重构 Collector

```typescript
// 旧代码
async collect(platform: string, url: string) {
  if (platform === 'bilibili') {
    return this.collectBilibili(url)
  } else if (platform === 'weibo') {
    return this.collectWeibo(url)
  } else if (platform === 'zhihu') {
    return this.collectZhihu(url)
  }
  // ... 更多 if/else
}

// 新代码
async collect(platform: string, url: string, options?: ContentSourceOptions) {
  const source = createContentSource(platform as PlatformType)
  return source.listItems({ ...options, url })
}
```

---

## 五、Cal.com 可复用的代码清单

### 5.1 按资产簇分类

#### AC-001：任务队列与异步处理（Critical）

| 资产 ID | 文件 | 复用方式 | 置信度 |
|---------|------|----------|--------|
| C-001 | packages/features/tasker/tasker.ts | **直接复用接口定义** | 95% |
| C-002 | packages/features/tasker/internal-tasker.ts | **模式复用**（改用 SQLite） | 90% |
| C-004 | packages/features/tasker/task-processor.ts | **模式复用**（重试逻辑） | 92% |
| C-005 | packages/features/tasker/repository.ts | **模式复用**（指数退避） | 88% |

#### AC-002：Webhook 投递与订阅系统（Critical）

| 资产 ID | 文件 | 复用方式 | 置信度 |
|---------|------|----------|--------|
| C-006 | packages/features/webhooks/lib/WebhookService.ts | **直接复用** | 94% |
| C-007 | packages/features/webhooks/lib/sendPayload.ts | **直接复用**（HMAC+模板） | 95% |
| C-008 | packages/features/webhooks/lib/schedulePayload.ts | **模式复用** | 90% |

#### AC-003：OAuth 与凭证生命周期管理（Critical）

| 资产 ID | 文件 | 复用方式 | 置信度 |
|---------|------|----------|--------|
| C-010 | packages/app-store/_utils/oauth/OAuthManager.ts | **模式复用**（改适配微博/知乎） | 98% |
| C-012 | packages/app-store/_utils/oauth/universalSchema.ts | **直接复用** | 97% |
| C-013 | packages/app-store/_utils/oauth/refreshOAuthTokens.ts | **模式复用** | 92% |

#### AC-005：速率限制与安全防护（High）

| 资产 ID | 文件 | 复用方式 | 置信度 |
|---------|------|----------|--------|
| C-018 | packages/lib/ssrfProtection.ts | **直接复用** | 97% |
| C-019 | packages/lib/crypto.ts | **直接复用** | 95% |

#### AC-004：日历集成接口抽象（High）

| 资产 ID | 文件 | 复用方式 | 置信度 |
|---------|------|----------|--------|
| C-014 | packages/types/Calendar.d.ts | **直接复用接口设计** | 96% |
| C-015 | packages/app-store/calendar.services.generated.ts | **直接复用注册表模式** | 90% |
| C-016 | packages/app-store/ics-feedcalendar/lib/CalendarService.ts | **模式复用**（Promise.allSettled） | 88% |

#### AC-010：数据库 Schema 通用模型（Critical）

| 资产 ID | 文件 | 复用方式 | 置信度 |
|---------|------|----------|--------|
| F-003 | packages/prisma/schema.prisma | **直接复用 Task/Webhook 模型** | 92% |

### 5.2 可直接复制代码的列表

以下代码**零 cal.com 业务依赖**，可直接复制到 InfoHub：

1. **tasker.ts 接口定义**（packages/features/tasker/tasker.ts:1-50）
2. **sendPayload HMAC+模板逻辑**（packages/features/webhooks/lib/sendPayload.ts:1-50）
3. **ssrfProtection URL 校验**（packages/lib/ssrfProtection.ts:1-80）
4. **crypto.ts AES-256 加密**（packages/lib/crypto.ts:1-40）
5. **OAuth2UniversalSchema**（packages/app-store/_utils/oauth/universalSchema.ts:1-30）

### 5.3 需要适配的代码

以下代码需要**根据 InfoHub 场景适配**：

| 原始代码 | 适配内容 |
|---------|---------|
| internal-tasker.ts | Prisma → SQLite |
| task-processor.ts | 重试逻辑保留，批处理大小调整 |
| OAuthManager.ts | Google/Outlook OAuth → 微博/知乎 Cookie |
| Calendar 接口 | 日历操作 → 内容采集操作 |
| CalendarServiceMap | 日历服务注册 → 平台采集器注册 |

---

## 六、注意点

### 6.1 安全注意点

#### 加密密钥管理
- **禁止**将 AES 加密密钥硬编码在代码中
- 使用环境变量 `ENCRYPTION_KEY` 或专门的密钥管理服务
- 定期轮换密钥（建议每 90 天）

#### SSRF 防护边界
- 所有用户输入的 URL 必须经过 `validateHostOrUrl` 校验
- 特别关注内网地址：`127.0.0.1`、`192.168.x.x`、`10.x.x.x`
- DNS rebinding 攻击需要 DNS 重解验证

#### Webhook 安全
- 生成 Webhook 时生成随机 secret
- 使用 HMAC-SHA256 签名，接收方验证签名
- Secret 不在 URL 中传递，使用 Header

### 6.2 性能注意点

#### 任务队列批处理
- 默认批处理大小 10，避免一次性加载过多任务
- 任务处理超时设置建议 30 秒
- 重试间隔指数增长，上限 1 小时

#### 凭证缓存
- 不每次采集都刷新凭证
- 凭证过期前 5 秒才触发刷新
- 刷新失败记录错误，不阻塞采集

#### Webhook 并发
- `Promise.allSettled` 处理多订阅者
- 单个 Webhook 超时设置 10 秒
- 失败不阻塞其他 Webhook

### 6.3 兼容性注意点

#### SQLite 限制
- SQLite 不支持 `FOR UPDATE` 等行锁
- 并发写入需要使用 `IMMEDIATE` 事务
- JSON 存储使用 `TEXT` 类型

#### 平台 API 变更
- 微博/知乎 API 可能频繁变更
- 凭证刷新逻辑需要版本控制
- 预留降级方案（Cookie 失效后提示用户重新登录）

### 6.4 迁移注意点

#### 数据库迁移
- 新增表需要向后兼容
- 使用 `CREATE TABLE IF NOT EXISTS`
- 迁移前备份现有数据

#### 向后兼容
- cron.ts 的定时触发逻辑需要保留一段时间
- 新任务队列与旧 cron 双运行，验证稳定后切换
- 提供回滚机制

---

## 七、部署测试计划

### 7.1 测试环境准备

```bash
# 1. 克隆 InfoHub（如果还没有）
cd D:/code
git clone https://github.com/Jinkin-92/infohub.git
cd infohub

# 2. 创建测试分支
git checkout -b feature/calcom-integration

# 3. 启动现有服务
./start.bat
```

### 7.2 分阶段测试

#### Phase 1 测试：数据层

**测试用例 1.1：Task 表创建**

```sql
-- 在 SQLite 中手动创建 Task 表
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  scheduled_at TEXT,
  succeeded_at TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT
);
```

**验证方法**：
```bash
# 检查表是否存在
sqlite3 infohub.db ".schema tasks"
```

**测试用例 1.2：InternalTasker 创建任务**

```typescript
// 在 backend/src/services/ 下新建 test-tasker.ts
import { InternalTasker } from './internal-tasker'
import { Database } from 'better-sqlite3'

const db = new Database('infohub.db')
const tasker = new InternalTasker(db)

async function test() {
  const task = await tasker.createAndEnqueue({
    type: 'collection',
    payload: { platform: 'weibo', url: 'https://weibo.com/u/123' },
    scheduledAt: new Date()
  })
  console.log('Created task:', task.id)

  // 验证 Task 表中有记录
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)
  console.log('Task in DB:', row)
}

test()
```

**预期结果**：任务创建成功，DB 中有记录

**测试用例 1.3：TaskProcessor 重试逻辑**

```typescript
import { TaskProcessor } from './task-processor'

const processor = new TaskProcessor(db, new Map([
  ['collection', {
    run: async (payload) => {
      console.log('Processing:', payload)
      throw new Error('Simulated failure')
    },
    onError: async (err, task) => {
      console.log('Task failed permanently:', task.id, err.message)
    }
  }]
]))

async function test() {
  // 创建失败任务
  await tasker.createAndEnqueue({
    type: 'collection',
    payload: { test: true },
    maxAttempts: 3
  })

  // 处理第一批（会失败，attempts = 1）
  await processor.processQueue()
  const task = db.prepare('SELECT * FROM tasks WHERE attempts = 1').get()
  console.log('After first attempt, scheduled_at should be in future:', task)
}

test()
```

**预期结果**：
- 第一次失败，attempts = 1，scheduled_at 推后 1 分钟
- 第二次失败，attempts = 2，scheduled_at 推后 2 分钟
- 第三次失败，attempts = 3，触发 onError

#### Phase 2 测试：安全层

**测试用例 2.1：SSRF 防护**

```typescript
import { validateHostOrUrl } from './ssrf-protection'

async function test() {
  // 应该通过的 URL
  console.log('Validating https://weibo.com/u/123...')
  const result = await validateHostOrUrl('https://weibo.com/u/123')
  console.log('Valid URL passed:', result)

  // 应该被拒绝的 URL（模拟）
  try {
    await validateHostOrUrl('https://192.168.1.1/internal/api')
    console.log('ERROR: Should have blocked private IP')
  } catch (e) {
    console.log('Correctly blocked private IP:', e.message)
  }

  try {
    await validateHostOrUrl('http://localhost:8080/admin')
    console.log('ERROR: Should have blocked localhost')
  } catch (e) {
    console.log('Correctly blocked localhost:', e.message)
  }
}

test()
```

**预期结果**：
- 公开 URL 通过验证
- 内网 IP 和 localhost 被拒绝

**测试用例 2.2：AES 加密**

```typescript
import { encrypt, decrypt } from './crypto'

async function test() {
  const key = process.env.ENCRYPTION_KEY || 'a'.repeat(64) // 32 bytes hex
  const original = JSON.stringify({ cookie: 'weibo_session=xxx', uid: '123' })

  const encrypted = encrypt(key, original)
  console.log('Encrypted:', encrypted.slice(0, 50) + '...')

  const decrypted = decrypt(key, encrypted)
  console.log('Decrypted:', decrypted)

  if (decrypted === original) {
    console.log('✓ Encryption/decryption working')
  } else {
    console.log('ERROR: Decryption mismatch')
  }
}

test()
```

**预期结果**：加密后的内容可以正确解密

#### Phase 3 测试：凭证管理

**测试用例 3.1：凭证存储与读取**

```typescript
import { CredentialManager } from './credential-manager'

async function test() {
  const manager = new CredentialManager(db, ENCRYPTION_KEY, ENCRYPTION_KEY)

  // 保存凭证
  const credential = await manager.saveCredential('weibo', {
    cookie: 'SUB=xxx; SSOLoginState=yyy',
    expiry_date: Date.now() + 3600 * 1000,
    uid: '123456'
  })
  console.log('Saved credential:', credential.id)

  // 读取凭证
  const retrieved = await manager.getValidCredential('weibo')
  console.log('Retrieved credential:', retrieved?.id)
}

test()
```

**预期结果**：凭证可以保存和读取，解密后内容正确

#### Phase 4 测试：Webhook

**测试用例 4.1：Webhook 投递**

```typescript
import { WebhookService, WebhookSubscriber } from './webhook-service'

async function test() {
  const webhookService = new WebhookService()

  // 模拟订阅者（可以使用 httpbin.org 测试）
  const subscribers: WebhookSubscriber[] = [
    {
      id: 'test-1',
      subscriberUrl: 'https://httpbin.org/post',
      secret: 'test-secret',
      active: true
    }
  ]

  await webhookService.init(subscribers)

  const result = await webhookService.sendPayload('new_item', {
    event: 'new_item',
    platform: 'weibo',
    items: [
      { id: '1', title: 'Test Post', url: 'https://weibo.com/123', publishedAt: new Date().toISOString() }
    ]
  })

  console.log('Webhook result:', result)
  // 验证 httpbin.org 返回 200
}

test()
```

**预期结果**：
- sent = 1, failed = 0
- httpbin.org 能收到 POST 请求

#### Phase 5 测试：集成测试

**测试用例 5.1：完整采集流程**

```bash
# 1. 启动服务
./start.bat

# 2. 手动触发一次采集
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{"platform": "weibo", "url": "https://weibo.com/u/123456"}'

# 3. 检查 Task 表
sqlite3 infohub.db "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 5"

# 4. 检查 Webhook 是否触发（如果有配置）
```

**测试用例 5.2：失败重试流程**

```bash
# 1. 配置一个会失败的采集目标
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{"platform": "invalid", "url": "https://invalid-domain.com"}'

# 2. 等待一分钟，检查 attempts 是否增加
sleep 60
sqlite3 infohub.db "SELECT id, attempts, last_error FROM tasks ORDER BY created_at DESC LIMIT 1"

# 3. 预期：attempts = 1, last_error 有值
```

### 7.3 性能测试

**测试用例：并发采集性能**

```typescript
import { createContentSource } from './content-source-registry'

async function test() {
  const platforms = ['weibo', 'bilibili', 'zhihu', 'rss']
  const start = Date.now()

  const results = await Promise.allSettled(
    platforms.map(p => createContentSource(p).listItems({ limit: 10 }))
  )

  const duration = Date.now() - start
  console.log(`Collected from ${platforms.length} platforms in ${duration}ms`)

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  console.log(`Succeeded: ${succeeded}, Failed: ${failed}`)
}

test()
```

### 7.4 回归测试清单

| 测试项 | 验证方法 | 预期结果 |
|--------|---------|---------|
| 现有 RSS 采集 | `curl http://localhost:3000/api/feeds` | 返回 RSS |
| 现有用户登录 | 浏览器登录流程 | Cookie 正常工作 |
| 现有数据库 | 启动后检查 `sqlite3 infohub.db ".tables"` | 所有表存在 |
| 新增 Task 表 | `sqlite3 infohub.db "SELECT COUNT(*) FROM tasks"` | 返回数字 |
| 新增 Webhook 表 | `sqlite3 infohub.db "SELECT COUNT(*) FROM webhooks"` | 返回数字 |
| 新增 Credential 表 | `sqlite3 infohub.db "SELECT COUNT(*) FROM credentials"` | 返回数字 |

### 7.5 部署检查清单

```
部署前检查：
□ 所有 Phase 1-5 测试通过
□ SQLite schema 迁移脚本已准备
□ 加密密钥已配置到环境变量
□ Webhook secret 已生成并存储
□ SSRF 防护已在所有 URL 输入处启用

部署后检查：
□ 服务启动成功（./start.bat）
□ RSS 采集正常
□ 新任务进入 Task 表
□ 旧 cron 触发仍然工作
□ Webhook 能正常投递（如果有配置）

回滚方案：
□ 保留旧的 cron.ts 实现
□ 数据库 migration 支持回滚
□ 配置开关切换新旧实现
```

---

## 八、附录

### 8.1 Cal.com 关键文件路径

```
packages/features/tasker/
├── tasker.ts              # 任务队列接口
├── internal-tasker.ts     # DB 后端实现
├── redis-tasker.ts        # Redis 后端实现
├── task-processor.ts      # 处理器循环
└── repository.ts          # Task 表操作

packages/features/webhooks/
├── lib/
│   ├── WebhookService.ts  # Webhook Facade
│   ├── sendPayload.ts     # HTTP 投递
│   └── schedulePayload.ts # 延迟投递

packages/app-store/_utils/oauth/
├── OAuthManager.ts        # Token 生命周期
├── encodeOAuthState.ts    # CSRF 保护
├── universalSchema.ts     # Zod Schema
└── refreshOAuthTokens.ts  # Token 刷新

packages/lib/
├── ssrfProtection.ts      # URL 安全校验
├── crypto.ts              # AES 加密
├── rateLimit.ts           # 限流
└── http-error.ts          # 错误类型

packages/types/
└── Calendar.d.ts         # 日历接口定义

packages/prisma/
└── schema.prisma          # 数据库模型
```

### 8.2 InfoHub 目标文件结构

```
backend/src/
├── db/
│   ├── index.ts           # 数据库初始化
│   └── migrations/        # 迁移脚本
├── interfaces/
│   └── content-source.ts  # ContentSource 接口
├── lib/
│   ├── crypto.ts          # 加密工具（新增）
│   ├── ssrf-protection.ts # SSRF 防护（新增）
│   └── http-error.ts      # 错误类型（新增）
├── services/
│   ├── tasker.ts          # 任务队列接口（新增）
│   ├── internal-tasker.ts # DB 后端（新增）
│   ├── task-processor.ts # 处理器（新增）
│   ├── webhook-service.ts # Webhook 服务（新增）
│   ├── credential-manager.ts # 凭证管理（新增）
│   ├── content-source-registry.ts # 注册表（新增）
│   └── platforms/         # 平台适配器
│       ├── bilibili.ts
│       ├── weibo.ts
│       ├── zhihu.ts
│       └── rss.ts
└── routes/
    └── collect.ts         # 采集路由（修改）
```

---

*报告生成：Magpie v0.1*
*分析资产：calcom/cal.com manifest（28 个资产，10 个资产簇）*
