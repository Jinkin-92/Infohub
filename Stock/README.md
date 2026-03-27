# Stock Strategy Pool

这是一个面向 A 股策略实验的 Python 项目，当前已经拆成两条独立异步链路：

- 市场数据链路：抓取 `local / akshare / instock` 数据源，写入 [`data/market_data.json`](/d:/code/Stock/data/market_data.json)
- Agent 决策链路：读取市场快照，运行策略，生成操作指示，写入 [`data/agent_decisions.json`](/d:/code/Stock/data/agent_decisions.json) 和 [`data/portfolio.json`](/d:/code/Stock/data/portfolio.json)

当前运行态默认使用 JSON 持久化。原因是这个环境里 SQLite 文件写入会触发 `disk I/O error`，所以数据库模型保留了，但实际主流程先走 JSON，优先保证可运行。

## 主要入口

- `python main.py init-db`
- `python main.py check-data --provider akshare`
- `python main.py update-market-data --provider akshare`
- `python main.py run-agent --provider akshare`
- `python main.py run-agent --provider akshare --notify`
- `python main.py run-once --provider akshare`
- `python scripts/market_data_worker.py`
- `python scripts/strategy_agent_worker.py`
- `python scripts/async_stack.py`

## 异步拆分

### 1. 市场数据更新任务

职责：

- 检查数据源健康状态
- 拉取候选股票快照
- 写入市场数据库快照

实现文件：

- [`engine/market_updater.py`](/d:/code/Stock/engine/market_updater.py)
- [`database/market_store.py`](/d:/code/Stock/database/market_store.py)
- [`scripts/market_data_worker.py`](/d:/code/Stock/scripts/market_data_worker.py)

关键环境变量：

- `MARKET_WORKER_PROVIDER`
- `MARKET_UPDATE_TIME`
- `MARKET_RUN_IMMEDIATELY`

### 2. Agent 策略任务

职责：

- 监听最新市场快照
- 根据指定策略读取股票池
- 生成买卖信号
- 视配置发送飞书通知

实现文件：

- [`engine/strategy_agent.py`](/d:/code/Stock/engine/strategy_agent.py)
- [`database/decision_store.py`](/d:/code/Stock/database/decision_store.py)
- [`report/daily_report.py`](/d:/code/Stock/report/daily_report.py)
- [`report/feishu.py`](/d:/code/Stock/report/feishu.py)
- [`scripts/strategy_agent_worker.py`](/d:/code/Stock/scripts/strategy_agent_worker.py)

关键环境变量：

- `AGENT_PROVIDER`
- `AGENT_STRATEGY`
- `AGENT_POLL_SECONDS`
- `AGENT_NOTIFY`
- `FEISHU_WEBHOOK_URL`

## 推荐运行方式

### 开发期

先准备环境：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.runtime.example .env
```

本地烟测：

```powershell
python main.py init-db
python main.py update-market-data --provider local
python main.py run-agent --provider local
python main.py run-once --provider local
python -m pytest -q tests --basetemp=tests/.pytest_tmp
```

### 生产/常驻运行

方案 A，直接跑两个常驻 worker：

```powershell
python scripts/market_data_worker.py
python scripts/strategy_agent_worker.py
```

方案 B，用 Windows 计划任务：

- 每天 15:35 跑一次市场更新
- Agent 每 5 分钟轮询一次市场快照

我已经补好了脚本：

- [`scripts/run_market_update.ps1`](/d:/code/Stock/scripts/run_market_update.ps1)
- [`scripts/run_strategy_agent.ps1`](/d:/code/Stock/scripts/run_strategy_agent.ps1)
- [`scripts/register_scheduled_tasks.ps1`](/d:/code/Stock/scripts/register_scheduled_tasks.ps1)

注册示例：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register_scheduled_tasks.ps1
```

## 当前完整闭环

现在已经能跑通这条链：

1. `update-market-data` 从数据源拉市场快照
2. `run-agent` 从市场快照读数据并运行 `momentum`
3. 决策结果写入本地 JSON
4. 可选发送飞书通知

## 已验证命令

- `python -m pytest -q tests --basetemp=tests/.pytest_tmp`
- `python main.py update-market-data --provider local`
- `python main.py run-agent --provider local`
- `python main.py run-once --provider local`

`akshare` 也已经实际验证通过；`instock` 也可用，但因为东方财富分页和历史数据抓取较慢，完整链路耗时会明显更长。
