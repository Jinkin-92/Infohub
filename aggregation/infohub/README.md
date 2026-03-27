# 个人信息中枢 (InfoHub)

> 多平台内容聚合系统

## 项目结构

```
infohub/
├── docker-compose.yml          # Docker Compose编排
├── .env.example                # 环境变量示例
├── backend/                    # Hono后端服务 (Phase 0 ✅)
│   ├── src/
│   │   ├── index.ts            # 入口文件
│   │   ├── config/
│   │   │   └── env.ts          # 环境变量配置
│   │   ├── db/
│   │   │   ├── client.ts       # 数据库连接
│   │   │   ├── queries.ts      # 数据库查询
│   │   │   └── schema.sql      # 数据库Schema
│   │   ├── middleware/
│   │   │   ├── error.ts        # 统一错误处理
│   │   │   ├── logger.ts       # 请求日志
│   │   │   └── validation.ts   # 请求验证
│   │   ├── routes/
│   │   │   ├── feed.ts         # Feed API
│   │   │   └── sources.ts      # Sources API
│   │   ├── services/
│   │   │   ├── collector.ts    # RSS采集器
│   │   │   ├── cron.ts         # 定时任务
│   │   │   ├── rsshubAdapter.ts # RSSHub适配器
│   │   │   └── urlDetector.ts  # URL平台识别
│   │   └── types/
│   │       └── index.ts        # 类型定义
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
└── frontend/                   # Next.js前端 (Phase 1 ✅)
    ├── app/
    │   ├── components/
    │   │   ├── TabBar.tsx      # 平台Tab导航
    │   │   ├── FeedList.tsx    # 瀑布流列表
    │   │   └── FeedItem.tsx    # 内容卡片
    │   ├── lib/
    │   │   ├── api.ts          # API客户端
       │   └── utils.ts          # 工具函数
    │   ├── types/
    │   │   └── index.ts        # 类型定义
    │   ├── globals.css         # 全局样式
    │   ├── layout.tsx          # 根布局
    │   └── page.tsx            # 主页面
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.js
    └── Dockerfile

## 快速启动

### 环境要求

- Docker & Docker Compose
- Node.js 20+ (本地开发)

本地运行说明:
- 如果使用 `DB_TYPE=sqlite`，后端现在会在检测到 `Node 25+` 时自动使用 `Node 24` 兼容启动。
- 如果使用 `DB_TYPE=postgresql`，则继续直接使用当前 Node 版本。

### 1. 启动服务

```bash
# 进入项目目录
cd infohub

# 复制环境变量
cp .env.example .env

# 安装依赖
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 启动所有服务
docker compose up -d

# 等待服务启动（约30秒）
docker compose logs -f backend
```

### 2. 验证服务

```bash
# 健康检查
curl http://localhost:3002/health

# 获取订阅源列表
curl http://localhost:3002/api/sources

# 获取Feed列表
curl http://localhost:3002/api/feed
```

### 3. 添加订阅源

```bash
# 添加知乎订阅源
curl -X POST http://localhost:3002/api/sources \
  -H "Content-Type: application/json" \
  -d '{"url": "https://zhihu.com/people/example"}'

# 添加RSS订阅源
curl -X POST http://localhost:3002/api/sources \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/feed.xml"}'
```

### 4. 手动触发采集

```bash
# 替换{source_id}为实际的订阅源ID
curl -X POST http://localhost:3002/api/sources/{source_id}/collect
```

## API文档

### Feed API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/feed | 获取条目列表 |
| GET | /api/feed/unread-count | 获取未读数量 |
| POST | /api/feed/read | 标记已读 |
| POST | /api/feed/read-all | 批量标记已读 |

**GET /api/feed 参数：**
- `platform`: 平台筛选 (zhihu, x, news, custom)
- `limit`: 每页数量 (1-100, 默认20)
- `offset`: 偏移量 (默认0)
- `unread_only`: 仅未读 (true/false)

### Sources API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/sources | 获取所有订阅源 |
| GET | /api/sources/:id | 获取单个订阅源 |
| POST | /api/sources | 创建订阅源 |
| PATCH | /api/sources/:id | 更新订阅源 |
| DELETE | /api/sources/:id | 删除订阅源 |
| POST | /api/sources/:id/collect | 手动触发采集 |

## 开发模式

### 后端本地开发

```bash
cd backend

# 安装依赖
npm install

# 复制环境变量
cp .env.example .env

# 开发模式（热重载）
npm run dev
```

### 数据库连接

```bash
# 进入数据库容器
docker compose exec postgres psql -U infohub -d infohub

# 查看表结构
\dt

# 查看订阅源
SELECT * FROM sources;

# 查看内容条目
SELECT * FROM items ORDER BY published_at DESC LIMIT 10;
```

## 定时任务

- 每30分钟自动检查并采集需要更新的订阅源
- 采集间隔可配置（默认新闻60分钟，其他360分钟）
- 5分钟内不重复采集同一源

## 技术栈

### 后端
- **框架**: Hono (Node.js)
- **数据库**: PostgreSQL 16
- **RSS适配**: RSSHub
- **定时任务**: node-cron
- **验证**: Zod
- **部署**: Docker Compose

### 前端
- **框架**: Next.js 14 (App Router)
- **样式**: Tailwind CSS
- **状态管理**: SWR
- **图标**: Lucide React
- **日期**: date-fns

## 开发阶段

### Phase 0 - 后端核心 ✅
- ✅ PostgreSQL Schema（含状态跟踪字段）
- ✅ Hono后端框架
- ✅ 统一错误处理（AppError）
- ✅ Zod请求验证
- ✅ RSSHub适配器层
- ✅ URL平台识别器
- ✅ RSS采集器（含时间窗口去重）
- ✅ 数据库查询模块
- ✅ Feed API路由
- ✅ Sources API路由
- ✅ 定时任务管理器
- ✅ Docker Compose编排

### Phase 1 - 前端基础 ✅
- ✅ Next.js 14 + Tailwind CSS
- ✅ 平台Tab导航（颜色圆点区分）
- ✅ 瀑布流布局（响应式三列）
- ✅ 内容卡片（标题+摘要+展开）
- ✅ 已读状态显示
- ✅ API客户端封装

### Phase 2 - 交互完善 ✅
- ✅ 添加订阅源弹窗
- ✅ 设置页面（订阅源管理、通用设置、关于）
- ✅ 已读状态同步优化（乐观更新 + 批量标记）
- ✅ 性能优化（CSS Containment）
- ✅ 暗黑模式（亮色/暗色/跟随系统）

### Phase 3 - 功能扩展 ✅
- ✅ YouTube/B站平台支持（Tab导航、URL检测、示例）
- ✅ 内容搜索（标题、摘要、作者全文搜索，支持快捷键 Ctrl+K）
- [ ] 标签管理（需要数据库 schema 变更）
- [ ] 微信公众号集成

## 许可证

MIT
