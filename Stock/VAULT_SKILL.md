# Skill: 策略选股池日常运维

**适用 Agent**：Vault
**触发方式**：Cron 定时触发（15:35 工作日）+ 错误处理触发

---

## Skill 描述

你负责定时驱动一个多策略虚拟持仓选股系统的每日运转，并在运行完成后发送飞书日报。日报的"策略自评"部分由你通过 Claude API 生成。

---

## 一、每日 15:35 执行流程

### Step 1：运行主系统

```bash
cd ~/stock-strategy-pool && python main.py --run daily
```

等待脚本完成。

- 若退出码为 `0`：继续 Step 2
- 若退出码非 `0`：跳转到【错误处理流程】

### Step 2：读取日报数据

读取系统生成的日报 JSON 文件：
```bash
cat ~/stock-strategy-pool/data/daily_report_latest.json
```

该 JSON 包含以下字段：
```json
{
  "date": "2025-01-15",
  "is_trading_day": true,
  "market": {
    "sh_index": {"close": 3250.5, "change_pct": 0.85},
    "sz_index": {"close": 10850.2, "change_pct": 1.12}
  },
  "strategies": [
    {
      "name": "momentum",
      "display_name": "量化动量",
      "nav": 215680.0,
      "daily_return_pct": 1.23,
      "cumulative_return_pct": 7.84,
      "benchmark_return_pct": 5.20,
      "alpha": 2.64,
      "cash": 12500.0,
      "positions": [
        {"symbol": "600036", "name": "招商银行", "shares": 200, "avg_cost": 35.2, "current_price": 37.5, "pnl_pct": 6.53}
      ],
      "transactions_today": [
        {"action": "BUY", "symbol": "601318", "name": "中国平安", "shares": 100, "price": 48.5, "reason": "momentum_signal"}
      ],
      "alerts": ["601988 今日停牌，无法操作"]
    }
  ],
  "pending_signals": [],
  "dividends_received": []
}
```

### Step 3：生成策略自评（调用 Claude API）

构造以下 prompt，调用 Claude API：

```
你是一位量化投资分析师，正在对以下虚拟持仓策略进行每日复盘。

【今日市场】
上证指数：{sh_close}，涨跌：{sh_change}%
深证成指：{sz_close}，涨跌：{sz_change}%

【各策略表现】
{将 strategies 数组格式化为文字，包含净值、收益率、持仓概况}

【今日交易】
{今日所有策略的交易记录}

请完成以下分析（总字数 300-500 字）：
1. 今日各策略表现简评（强调跑赢/跑输基准的原因）
2. 持仓中是否存在需要关注的风险点（止盈/止损临近、集中度过高等）
3. 针对表现最差策略，给出 1-2 条具体改进建议
4. 明日市场关注点提示（基于当前持仓和市场状态）

输出格式：纯文本，分段落，不使用 Markdown 标题符号。
```

提取 Claude 返回的文字内容作为 `ai_commentary`。

### Step 4：发送飞书消息

构造飞书富文本消息，格式如下：

**消息结构**（使用飞书 `post` 类型消息）：

```
📊 策略日报 · {date}

━━━━ 市场概况 ━━━━
上证 {sh_close} ({sh_change}%)  深证 {sz_close} ({sz_change}%)

━━━━ 策略净值 ━━━━
策略         净值          今日     累计    vs基准
量化动量   ¥215,680   +1.23%  +7.84%  +2.64%
红利低波   ¥198,320   -0.45%  -0.84%  -1.20%
全球配置   ¥209,150   +0.88%  +4.58%  +0.33%
高成长     ¥223,400   +1.95% +11.70%  +5.90%
个人组合   ¥205,880   +0.32%  +2.94%  +2.10%

━━━━ 今日交易 ━━━━
{列出所有买卖记录，无则显示"今日无交易"}

━━━━ 异常提示 ━━━━
{列出停牌/临近阈值等异常，无则显示"✅ 无异常"}

━━━━ AI 策略自评 ━━━━
{ai_commentary}

━━━━ 明日信号预告 ━━━━
{列出 pending_signals，无则显示"无预定信号"}
```

发送到飞书 Webhook（从 `.env` 文件读取 `FEISHU_WEBHOOK_URL`）：
```bash
WEBHOOK=$(grep FEISHU_WEBHOOK_URL ~/stock-strategy-pool/.env | cut -d= -f2)
```

使用 HTTP POST 发送。

---

## 二、错误处理流程

当主系统脚本退出码非 0 时：

1. 读取日志最后 20 行：
   ```bash
   tail -20 ~/stock-strategy-pool/logs/run.log
   ```

2. 提取错误摘要（最后一个 ERROR 行）

3. 发送飞书告警：
   ```
   ⚠️ 策略系统运行异常 · {date}
   
   错误摘要：{error_summary}
   
   请检查日志：~/stock-strategy-pool/logs/run.log
   常见处理：重新运行 python main.py --run daily
   ```

4. 尝试重新运行一次（延迟 60 秒后）：
   ```bash
   sleep 60 && cd ~/stock-strategy-pool && python main.py --run daily
   ```

5. 若二次运行仍失败：仅发送告警，不再重试，等待人工处理

---

## 三、非交易日处理

系统在非交易日运行时会：
- 输出日志：`[INFO] Today is not a trading day, skipping.`
- 退出码：`0`（正常退出）
- **不生成日报，不发送飞书消息**

你无需做额外处理。

---

## 四、周末策略健康检查（可选，每周六 10:00）

```bash
cd ~/stock-strategy-pool && python main.py --run weekly_check
```

生成周报并发送飞书，内容包括：
- 本周各策略净值变化
- 本周完成的交易列表
- 持仓分散度评估
- 下周预定调仓提醒（若有）

---

## 五、工具调用参考

| 需要做的事 | 使用工具 |
|---------|---------|
| 运行 Python 脚本 | bash / terminal |
| 读取 JSON 文件 | bash `cat` 或文件读取工具 |
| 调用 Claude API 生成分析 | anthropic API call |
| 发送飞书消息 | HTTP POST 到 Webhook URL |
| 查看系统日志 | bash `tail` |

---

## 六、Cron 配置参考

在 OpenClaw 中配置以下定时任务：

```
名称：策略选股池-每日运行
表达式：35 15 * * 1-5
时区：Asia/Shanghai
执行：运行本 Skill 的【每日 15:35 执行流程】

名称：策略选股池-周末检查（可选）
表达式：0 10 * * 6
时区：Asia/Shanghai
执行：运行本 Skill 的【周末健康检查】
```
