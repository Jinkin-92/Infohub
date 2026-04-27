# 个人信息中枢 - TODO清单

> 由 CEO Plan Review (2026-03-24) 生成
> 模式：HOLD SCOPE

---

## P0 - 阻塞性（MVP前必须完成）

### 安全
- [ ] **S3-1: 添加SSRF防护**
  - 在urlDetector中禁止内网IP、私有地址、非HTTP(S)协议
  - 参考：[私有地址列表](https://en.wikipedia.org/wiki/Private_network)

- [ ] **S3-2: 添加Schema验证**
  - 使用Zod为所有API端点添加输入验证
  - 优先端点：/api/sources POST, /api/feed/*

### 错误处理
- [ ] **S2-1: 添加源状态跟踪**
  - 修改schema：sources表添加error_count, last_error, status字段
  - 采集失败时更新状态，前端可查看源健康状况

- [ ] **S2-3: 完整URL验证**
  - 检测空值、无效格式、错误协议
  - 返回友好错误信息

- [ ] **S5-1: 统一错误处理**
  - 创建AppError类和全局错误处理中间件
  - 统一响应格式：{ ok: false, error: string, code?: string }

### 架构
- [ ] **S1-1: 限制Agent API为本地访问**
  - docker-compose.yml中移除backend端口3001的对外暴露
  - 或添加网络隔离配置

- [ ] **S1-3: 添加连接池配置**
  - postgres.js配置max: 10, idle_timeout: 20

---

## P1 - 高优先级（MVP中完成）

### 架构
- [ ] **S1-2: 添加RSSHub适配器层**
  - 封装RSSHub URL格式，隔离直接依赖
  - 文件：backend/src/services/rsshubAdapter.ts

### 错误处理
- [ ] **S2-2: 添加指数退避重试**
  - 采集失败时重试3次，间隔1s -> 2s -> 4s
  - 仅对RSSHub网络错误生效

### 数据流
- [ ] **S4-1: 时间窗口去重**
  - 采集前检查last_fetched_at，5分钟内不重复采集

- [ ] **S4-2: 分页批量处理**
  - markAllAsRead改为每批1000条处理
  - 返回处理进度（如需要）

- [ ] **S4-3: 虚拟滚动**
  - 前端使用react-window实现瀑布流虚拟滚动
  - 支持10万+条内容流畅滚动

### 代码质量
- [ ] **S5-2: 添加路径验证**
  - urlDetector各平台分支验证path格式
  - 不匹配时抛出具体错误

- [ ] **S5-3: 提取魔法数字为常量**
  - DEFAULT_FETCH_INTERVAL = 360
  - NEWS_FETCH_INTERVAL = 60
  - DUPLICATE_FETCH_WINDOW_MS = 5 * 60 * 1000

### 测试
- [ ] **S6-1: 配置测试栈**
  - 后端：Vitest + @testcontainers/postgresql
  - 前端：Vitest + React Testing Library
  - E2E：Playwright

- [ ] **S6-2: 设定覆盖率目标**
  - 单元测试：70%
  - 集成测试：60%
  - E2E：覆盖关键路径（添加源、采集、阅读）

---

## P2 - 中优先级（MVP后优化）

### 架构
- [ ] **添加数据库迁移工具（node-pg-migrate）**
  - 替代一次性init脚本
  - 支持schema版本管理和回滚
  - 文件：migrations/ 目录

### 性能
- [ ] **流式RSS处理**
  - collector使用流式解析器
  - 数据库分批插入（每批100条）
  - 防止大RSS源导致内存溢出

- [ ] **添加数据库复合索引**
  - `(source_id, published_at DESC)`
  - `(platform, published_at DESC)`

- [ ] **YouTube解析结果缓存**
  - channel_id解析结果永久缓存到数据库或Redis

- [ ] **RSS响应缓存**
  - 5分钟内重复请求返回缓存结果

### 可观察性
- [ ] 添加结构化日志（pino）
- [ ] 添加/metrics端点（Prometheus格式）
- [ ] 添加/health端点（健康检查）

### 部署
- [ ] 创建部署验证脚本
- [ ] 添加备份/恢复流程文档

---

## P3 - 低优先级（后续版本）

### 安全
- [ ] **S3-3: RSSHub镜像更新检查**
  - 每月检查RSSHub changelog
  - 测试兼容性后更新

### 功能扩展（Phase 4）
- [ ] YouTube接入（含handle解析）
- [ ] B站接入
- [ ] 财经数据面板
- [ ] werss微信公众号
- [ ] Agent简报生成（Claude API）
- [ ] waytoagi爬虫（或评估是否必要）

### 架构升级
- [ ] 多用户支持（用户系统、数据隔离）
- [ ] 分布式定时任务（替代node-cron）
- [ ] PostgreSQL只读副本

---

## 审查决策记录

### 工程审查决策记录（2026-03-24）
1. ✅ 分阶段实施策略（先后端，后前端）
2. ✅ 数据库迁移工具（node-pg-migrate）
3. ✅ 流式RSS处理（分批插入）
4. ✅ 完整测试栈（Vitest + testcontainers + Playwright）
5. ✅ 统一错误处理（AppError类）

### 已接受的架构决策
1. ✅ 限制Agent API为本地访问
2. ✅ 添加RSSHub适配器层
3. ✅ 添加连接池配置
4. ✅ 添加源状态跟踪（error_count, last_error, status）
5. ✅ 添加指数退避重试（3次）
6. ✅ 完整URL验证
7. ✅ 统一错误处理（AppError类）
8. ✅ 添加SSRF防护
9. ✅ 添加Schema验证（Zod）
10. ✅ RSSHub更新检查流程
11. ✅ 时间窗口去重（5分钟）
12. ✅ 分页批量处理（每批1000条）
13. ✅ 虚拟滚动（react-window）
14. ✅ 添加路径验证
15. ✅ 提取魔法数字为常量
16. ✅ 测试栈（Vitest + Playwright）
17. ✅ 覆盖率目标（70%/60%）
18. ✅ 真实容器（testcontainers）

### 已知风险
- **5个CRITICAL GAPS**：错误处理、竞态条件、输入验证等未完全覆盖
- **SSRF漏洞**：用户输入URL可直接访问内网
- **Agent API未授权**：当前完全开放（已决策限制为本地）

### 建议的MVP范围调整
- **推迟到Phase 4**：YouTube、B站、财经、公众号、Agent简报
- **评估是否必要**：waytoagi爬虫（需要维护成本）
- **MVP阶段使用**：公用RSSHub替代自建（降低维护成本）

---

*最后更新：2026-03-24 | 审查模式：HOLD SCOPE*

---

## 当前实际状态（2026-03-26）

### 已完成
- [x] 后端 TypeScript 构建通过，`/api/feed`、`/api/sources`、`/api/tags` 主链路可用
- [x] 前端 Next.js 构建通过，首页 `http://localhost:3000` 可正常返回
- [x] 前端 `/api` 代理改为可配置，容器内已通过 `API_PROXY_TARGET` 指向后端
- [x] SQLite 初始化已补齐默认标签自愈与空库默认源初始化
- [x] 本地 `sqlite` 模式下已兼容 `Node 25+` 环境，后端会自动回退到 `Node 24` 启动
- [x] 已完成一轮非提交式 QA，验证首页、标签、源列表、Feed 列表、创建源接口

### 当前遗留风险
- [ ] 外部 RSS 源仍可能触发 `429` 限流，采集器缺少更明确的重试/退避策略
- [ ] `better-sqlite3` 对本机默认 `Node 25.8.1` 仍非原生直跑兼容，当前是兼容包装方案，不是根治
- [ ] Docker 路径尚未在本机完成验证，当前运行验证主要基于本地 Node 进程
- [ ] 标签、采集、Feed 主链路仍缺少自动化测试兜底

### 下一阶段优先级
- [ ] **P0: 采集器限流恢复**
  - 为 `429`、超时、临时网络异常增加指数退避与更清晰的错误分类
- [ ] **P0: 补最小回归测试**
  - 至少覆盖 `sources -> collect -> feed` 主路径
- [ ] **P1: 文档继续收口**
  - 统一 README、实施方案、运行说明中的本地端口 `3002` / 容器端口 `3001`
- [ ] **P1: 评估 SQLite 依赖策略**
  - 判断继续保留 `better-sqlite3` 包装兼容，还是切换到对 `Node 25+` 更友好的方案
