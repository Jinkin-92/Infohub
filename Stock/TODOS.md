# TODOS — 策略选股池系统

> 来自 CEO Review 2026-03-25 的延期项目

---

## Phase 2（回测引擎稳定后）

### TODO-001: 策略参数优化器
- **What**: 网格搜索/遗传算法参数调优模块
- **Why**: 策略表现不佳时，区分"逻辑问题"vs"参数问题"
- **Effort**: M → M (CC+gstack)
- **Blocked by**: 回测引擎完成并验证稳定
- **Priority**: P2

### TODO-002: 策略配置化
- **What**: YAML/JSON 驱动策略定义，无需改代码即可新增策略
- **Why**: 降低新增策略成本，业务人员可参与策略定义
- **Effort**: M → M
- **Blocked by**: 2-3 个策略硬编码实现，验证模式通用性
- **Priority**: P2

---

## Future Ideas（有价值但暂不承诺）

### TODO-003: 实时预警系统
- **What**: 盘中监控（每 30 分钟），触发即时飞书告警
- **Why**: 从"事后报告"变为"实时监控"
- **Effort**: M → S
- **Context**: CEO Review 中用户明确 SKIP，后续若需要再评估
- **Priority**: P3

### TODO-004: aktools 备选数据源
- **What**: AKShare HTTP API 封装，作为 InStock 的备选
- **Why**: 若 InStock 不稳定，有 fallback 方案
- **Effort**: S → S
- **Context**: 若 InStock 验证通过则不需要；若失败则升级为 ACCEPTED
- **Priority**: P3

### TODO-005: Tushare/Yahoo Finance 多数据源
- **What**: 付费数据源支持，美股数据覆盖
- **Why**: 全球配置策略需要美股基准数据
- **Effort**: M → M
- **Cost**: Tushare 可能需要付费 token
- **Priority**: P3

### TODO-006: 策略组合优化（马科维茨）
- **What**: 5 个策略间的资产配置优化
- **Why**: 不只是单策略最优，而是组合整体最优
- **Effort**: M → S
- **Blocked by**: 回测数据积累（至少 3 个月实盘或回测）
- **Priority**: P3

### TODO-007: 参数敏感性分析
- **What**: 分析哪些参数对策略结果影响最大
- **Why**: 避免过拟合，理解策略稳健性
- **Effort**: S → S
- **Blocked by**: TODO-001 完成
- **Priority**: P3

### TODO-008: 多用户/多账户支持
- **What**: 支持多个真实账户跟踪，不同资金规模
- **Why**: 不只是虚拟策略，可跟踪实际投资
- **Effort**: L → M
- **Priority**: P3

---

## 技术债务/改进

### TODO-009: 数据归档策略
- **What**: 历史数据自动归档到 parquet，保持主库轻量
- **Why**: 数据量增长后查询性能保障
- **Effort**: S → S
- **Trigger**: 当 daily_nav 表超过 10 万行时执行
- **Priority**: P3

### TODO-010: 容器化部署
- **What**: Docker Compose 一键启动全系统
- **Why**: 简化部署，环境一致性
- **Effort**: M → S
- **Context**: InStock 已用 Docker，可扩展为全系统
- **Priority**: P3

---

*Last updated: 2026-03-25*
