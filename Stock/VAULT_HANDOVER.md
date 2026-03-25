# Vault 移交文档 — 策略选股池系统运维

> **接收方**：OpenClaw Agent — Vault
> **文档用途**：告知 Vault 需要接管的系统、定时任务配置、日常操作规程

---

## 一、系统概述

你需要接管一个基于虚拟持仓的 A 股多策略选股系统，已由 Claude Code 完成代码搭建。

**系统路径**（以实际部署路径为准）：
```
~/stock-strategy-pool/
```

**系统功能**：
- 5 个独立选股策略，各持有 20 万虚拟资金
- 每个工作日运行一次，使用当日收盘价更新持仓
- 生成每日策略绩效报告，通过飞书发送

**5 个策略简介**：
| 策略 | 核心逻辑 | 调仓频率 |
|-----|---------|---------|
| 量化动量 | 60日+20日价格动量因子，选Top10 | 每月 |
| 红利低波 | 高股息率 + 低波动率，选Top15 | 每季度 |
| 全球资产配置 | 5类ETF固定比例，偏离>8%再平衡 | 月末或触发 |
| 高成长 | 高营收/利润增速+高ROE，选Top10 | 每季度 |
| 个人组合 | 银行50%+黄金25%+铜25%，指数联动仓控 | 动态触发 |

---

## 二、Cron 任务配置

你需要设置 **2 个定时任务**：

### 任务 A：每日主运行（工作日）
```
时间：15:35（北京时间，周一至周五）
命令：cd ~/stock-strategy-pool && python main.py --run daily
```

任务 A 完成以下动作（按顺序）：
1. 检测当日是否为交易日（非交易日自动退出）
2. 获取当日所有相关股票/ETF 收盘价
3. 检查分红到账情况，更新现金池
4. 对各策略：执行当日信号 → 更新持仓 → 记录净值
5. 生成日报 Markdown 内容
6. 调用 Claude API 生成策略自评建议（见 Skill 第四节）
7. 通过飞书 Webhook 发送完整日报

### 任务 B：周末策略健康检查（可选）
```
时间：每周六 10:00
命令：cd ~/stock-strategy-pool && python main.py --run weekly_check
```

---

## 三、飞书发送配置

**Webhook URL** 存储在 `~/stock-strategy-pool/.env` 文件的 `FEISHU_WEBHOOK_URL` 变量中。

Python 系统已内置飞书发送模块（`report/feishu.py`）。
任务 A 运行结束时，系统会自动调用它发送日报。

**你不需要手动发送飞书消息**，但如果系统报错导致 Python 脚本崩溃，你需要：
1. 捕获脚本的非零退出码
2. 用飞书发送一条错误告警：`⚠️ 策略系统今日运行失败：{错误摘要}，请检查日志`

---

## 四、日常运维检查清单

每次任务 A 执行后，确认以下内容：

- [ ] 脚本退出码为 0（成功）
- [ ] 飞书收到日报消息
- [ ] 日报中"异常提示"板块无未处理项

**若脚本失败**：
1. 查看日志：`tail -100 ~/stock-strategy-pool/logs/run.log`
2. 常见原因：AKShare 接口超时（重新运行通常可解决）、网络问题
3. 非交易日系统会正常退出（exit code 0），日报显示"今日非交易日"

---

## 五、系统初始化（仅首次）

首次启动前，依次运行：
```bash
cd ~/stock-strategy-pool
pip install -r requirements.txt
python scripts/init_db.py       # 初始化数据库
python scripts/init_positions.py  # 以当日收盘价建立初始仓位
```

初始化完成后再配置 Cron 任务。

---

## 六、数据库位置与备份

- 数据库文件：`~/stock-strategy-pool/data/portfolio.db`
- 建议每周自动备份一次：
  ```bash
  cp ~/stock-strategy-pool/data/portfolio.db ~/backups/portfolio_$(date +%Y%m%d).db
  ```

---

## 七、关键文件索引

| 文件/目录 | 用途 |
|---------|-----|
| `main.py` | 主入口，接受 `--run daily` 参数 |
| `data/portfolio.db` | SQLite 数据库（持仓、净值、交易记录） |
| `.env` | 飞书 Webhook URL、数据库路径等配置 |
| `logs/run.log` | 运行日志 |
| `strategies/personal.py` | 个人策略逻辑（如需手动调整标的） |
| `config/strategy_params.yaml` | 各策略可调参数（止损线、持股数等） |
