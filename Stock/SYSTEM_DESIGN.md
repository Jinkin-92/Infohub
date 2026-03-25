# 策略选股池系统 — Claude Code 实现规格

> **给 Claude Code 的指令**：请严格按照本文档搭建整个项目。不要跳过任何模块。每完成一个模块请运行测试确认可用。

---

## 一、项目概述

构建一个基于虚拟持仓的多策略选股系统，包含 5 个独立策略，每策略初始资金 20 万元人民币，采用 A 股前收盘价模拟执行，每日 15:35 运行一次，完成持仓更新 + 信号生成 + 日报发送全流程。

**技术栈**
- 语言：Python 3.10+
- 数据：akshare（直接 pip 安装）
- 数据库：SQLite（文件 `data/portfolio.db`）
- ORM：SQLAlchemy 2.x
- 调度：由外部（OpenClaw/Vault）负责，系统只提供 CLI 入口
- 通知：飞书 Webhook（配置在 .env）

---

## 二、项目目录结构

```
stock-strategy-pool/
├── .env                        # 环境变量（飞书 Webhook、路径等）
├── .env.example                # 示例配置
├── requirements.txt
├── README.md
├── main.py                     # CLI 主入口
│
├── config/
│   ├── __init__.py
│   ├── settings.py             # 读取 .env，全局常量
│   └── strategy_params.yaml   # 各策略可调参数
│
├── data/
│   ├── __init__.py
│   ├── fetcher.py              # AKShare 封装，带本地缓存
│   ├── universe.py             # 股票池管理（过滤 ST/停牌/退市/低价）
│   └── dividend.py            # 分红数据获取与入账
│
├── strategies/
│   ├── __init__.py
│   ├── base.py                 # BaseStrategy 抽象类
│   ├── momentum.py             # 策略1：量化动量
│   ├── dividend_lowvol.py      # 策略2：红利低波
│   ├── global_alloc.py         # 策略3：全球资产配置
│   ├── high_growth.py          # 策略4：高成长
│   └── personal.py             # 策略5：中国版永久组合
│
├── engine/
│   ├── __init__.py
│   ├── portfolio.py            # 持仓状态管理
│   ├── executor.py             # 虚拟交易执行（含 T+1 校验）
│   └── cost.py                 # 交易成本计算
│
├── database/
│   ├── __init__.py
│   ├── models.py               # SQLAlchemy 模型
│   └── operations.py           # CRUD 操作封装
│
├── report/
│   ├── __init__.py
│   ├── daily_report.py         # 日报内容生成
│   ├── analysis.py             # 策略绩效分析
│   └── feishu.py               # 飞书消息发送
│
└── scripts/
    ├── init_db.py              # 初始化数据库 + 插入策略元数据
    ├── init_positions.py       # 第一次建仓脚本
    └── backtest.py             # 简单回测验证工具
```

---

## 三、数据库 Schema（SQLite）

```sql
-- strategies: 策略元数据
CREATE TABLE strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,          -- 'momentum','dividend_lowvol','global_alloc','high_growth','personal'
    display_name TEXT NOT NULL,
    description TEXT,
    initial_capital REAL DEFAULT 200000.0,
    benchmark TEXT,                     -- '000905.SH','H00015.CSI','SPY' 等
    rebalance_frequency TEXT,           -- 'monthly','quarterly','dynamic'
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (date('now'))
);

-- portfolios: 每个策略的资金状态
CREATE TABLE portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL UNIQUE,
    cash REAL NOT NULL,
    last_updated TEXT,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);

-- positions: 当前持仓（每策略每股票一行）
CREATE TABLE positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,               -- '600036' (不含后缀)
    name TEXT,
    shares INTEGER NOT NULL,
    avg_cost REAL NOT NULL,             -- 含交易成本的实际均价
    buy_date TEXT NOT NULL,
    can_sell_date TEXT NOT NULL,        -- T+1 日期；ETF 当日即可
    is_etf INTEGER DEFAULT 0,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id),
    UNIQUE (strategy_id, symbol)
);

-- transactions: 交易流水
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT,
    action TEXT NOT NULL,               -- 'BUY','SELL'
    shares INTEGER NOT NULL,
    price REAL NOT NULL,                -- 执行价（前收盘价）
    amount REAL NOT NULL,               -- shares * price
    commission REAL NOT NULL DEFAULT 0,
    stamp_duty REAL NOT NULL DEFAULT 0,
    transfer_fee REAL NOT NULL DEFAULT 0,
    net_amount REAL NOT NULL,           -- BUY: amount+费用  SELL: amount-费用
    trade_date TEXT NOT NULL,
    reason TEXT,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);

-- daily_nav: 每日净值快照
CREATE TABLE daily_nav (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    total_nav REAL NOT NULL,
    cash REAL NOT NULL,
    stock_value REAL NOT NULL,
    daily_return_pct REAL,
    cumulative_return_pct REAL,
    benchmark_return_pct REAL,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id),
    UNIQUE (strategy_id, date)
);

-- signals: 策略生成的买卖信号
CREATE TABLE signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT,
    signal_type TEXT NOT NULL,          -- 'BUY','SELL','REBALANCE'
    ref_price REAL,                     -- 信号生成时的参考价
    target_shares INTEGER,
    reason TEXT,
    generated_at TEXT DEFAULT (datetime('now')),
    executed INTEGER DEFAULT 0,
    executed_at TEXT,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);

-- dividends: 分红到账记录
CREATE TABLE dividends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT,
    dividend_per_share REAL NOT NULL,
    shares_held INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    record_date TEXT,
    payment_date TEXT NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);
```

---

## 四、交易成本规则（engine/cost.py）

```python
# 股票（A股）
BUY_COMMISSION_RATE  = 0.00012  # 万1.2
SELL_COMMISSION_RATE = 0.00012
STAMP_DUTY_RATE      = 0.001    # 千1，仅卖出
TRANSFER_FEE_RATE    = 0.00002  # 万0.2，沪市；深市为0

MIN_COMMISSION = 5.0            # 单笔最低佣金 5 元

# ETF（沪深交易所）
ETF_BUY_COMMISSION_RATE  = 0.00012
ETF_SELL_COMMISSION_RATE = 0.00012
# ETF 无印花税、无过户费

def calc_buy_cost(amount: float, is_etf: bool, is_shanghai: bool) -> dict:
    commission = max(amount * BUY_COMMISSION_RATE, MIN_COMMISSION)
    transfer = amount * TRANSFER_FEE_RATE if (is_shanghai and not is_etf) else 0
    total_fee = commission + transfer
    return {"commission": commission, "transfer_fee": transfer, "total_fee": total_fee}

def calc_sell_cost(amount: float, is_etf: bool, is_shanghai: bool) -> dict:
    commission = max(amount * SELL_COMMISSION_RATE, MIN_COMMISSION)
    stamp = amount * STAMP_DUTY_RATE if not is_etf else 0
    transfer = amount * TRANSFER_FEE_RATE if (is_shanghai and not is_etf) else 0
    total_fee = commission + stamp + transfer
    return {"commission": commission, "stamp_duty": stamp, "transfer_fee": transfer, "total_fee": total_fee}
```

---

## 五、T+1 规则（engine/executor.py）

```python
from datetime import date, timedelta
import akshare as ak

def get_next_trading_day(trade_date: date) -> date:
    """返回 trade_date 之后第一个交易日（T+1），ETF 当日可售"""
    # 用 akshare 获取交易日历
    calendar = ak.tool_trade_date_hist_sina()  # 返回交易日列表
    trading_days = sorted(calendar['trade_date'].tolist())
    idx = trading_days.index(trade_date.strftime('%Y-%m-%d'))
    return date.fromisoformat(trading_days[idx + 1])

def can_sell(position, today: date) -> bool:
    """校验是否满足 T+1"""
    can_sell_date = date.fromisoformat(position.can_sell_date)
    return today >= can_sell_date
```

**重要**：每笔买入记录的 `can_sell_date` = 下一个交易日（ETF = 当日）。卖出前必须调用 `can_sell()` 校验。

---

## 六、股票池过滤规则（data/universe.py）

以下情况需自动排除，不纳入任何策略：
- 股票名称包含 `ST`、`*ST`、`退市`
- 最新价 < 2.0 元
- 当日停牌（无成交量）
- 上市时间 < 1 年（动量/高成长策略）或 < 2 年（红利低波策略）

持仓中若已有上述股票：
- 停牌：标记 `suspended=True`，不执行任何操作，日报中提示
- 跌破 2 元：策略引擎下一运行日生成强制 SELL 信号
- ST化：立即生成强制 SELL 信号（不受 T+1 限制，当日可挂单）

---

## 七、策略定义

### 策略1：量化动量（momentum.py）

**基本信息**
- 基准：中证500（000905.SH）
- 调仓频率：每月第一个交易日
- 持股数量：10 只
- 单股仓位：10%（等权）

**选股流程**
1. 从 AKShare 获取沪深 A 股全量列表
2. 过滤：市值 > 50 亿，非 ST，价格 ≥ 2 元，非停牌，上市 ≥ 1 年
3. 获取每只股票近 63 个交易日（约3个月）的收盘价
4. 计算动量得分：`score = ROC_60 * 0.6 + ROC_20 * 0.4`
   - ROC_60 = (今日收盘 / 60日前收盘 - 1) * 100
   - ROC_20 = (今日收盘 / 20日前收盘 - 1) * 100
5. 按得分降序排列，选取 Top 10
6. 等权建仓：每只股票分配 `(总净值 - 现金缓冲5%) / 10`

**信号生成**
- 非调仓日：无信号
- 调仓日：
  - 新选入但未持仓：BUY
  - 已持仓但未入新列表：SELL
  - 仍在列表但权重偏离 > 20%：REBALANCE

**止损规则**
- 任一持仓回撤超过 -20%（基于均价）：生成 SELL 信号，附注 `reason='stop_loss'`

---

### 策略2：红利低波（dividend_lowvol.py）

**基本信息**
- 基准：中证红利指数（000922.CSI）
- 调仓频率：每季度（3/6/9/12 月第一个交易日）
- 持股数量：15 只
- 单股仓位：约 6.7%（等权）

**选股流程**
1. 获取全 A 股列表，过滤 ST、停牌、市值 < 30 亿
2. 获取近 12 个月分红数据，计算 TTM 股息率：`dividend_yield = 年分红总额 / 当前股价`
3. 过滤：股息率 ≥ 3%，近 3 年连续分红
4. 计算 60 日年化波动率：`volatility = std(daily_return_60) * sqrt(252)`
5. 过滤：波动率 < 35%
6. 计算综合得分：`score = dividend_yield / volatility`（夏普风格）
7. 按得分降序取 Top 15

**特殊规则**
- 持仓中股息率跌破 2%：生成 SELL 信号（高估）
- 持仓中股价从买入价下跌 > 25%：生成 SELL 信号，附注 `reason='stop_loss'`

---

### 策略3：全球资产配置（global_alloc.py）

**基本信息**
- 标的：仅用 ETF（T+0）
- 基准：60/40 组合（沪深300 60% + 国债 40%）
- 调仓频率：月末最后一个交易日，或当任意资产偏离目标 > 8% 时触发
- 目标配置（固定）：

| 资产类别 | 代码 | 目标比例 |
|---------|------|---------|
| A股宽基 | 510300（沪深300ETF） | 25% |
| 美股 | 513500（标普500ETF） | 15% |
| 黄金 | 518880（黄金ETF） | 20% |
| 国债 | 511010（国债ETF） | 25% |
| 大宗商品 | 159980（有色金属ETF） | 15% |

**调仓逻辑**
1. 每日计算各资产当前市值占比
2. 若最大偏离 > 8%：生成再平衡信号，卖出超配部分，买入低配部分
3. 月末强制再平衡（无论偏离大小）

**注意**：ETF 均为 T+0，`can_sell_date = buy_date`

---

### 策略4：高成长（high_growth.py）

**基本信息**
- 基准：中证500（000905.SH）
- 调仓频率：季报/年报披露后（4月、8月、10月、次年4月各一次）
- 持股数量：10 只
- 单股仓位：10%（等权）

**选股流程**
1. 全 A 股过滤：排除金融、公用事业、房地产行业，市值 > 50 亿
2. 筛选财务指标（最新年报/半年报）：
   - 营收增速 YoY > 20%
   - 归母净利润增速 YoY > 20%
   - ROE（加权）> 15%
   - 0 < PE < 80（正盈利，不过度高估）
3. 计算综合成长得分：
   `score = revenue_growth * 0.3 + profit_growth * 0.3 + roe * 0.2 + (1/PE) * 100 * 0.2`
4. 取 Top 10

**止损规则**
- 持仓回撤 > -20%：SELL，附注 `reason='stop_loss'`

---

### 策略5：个人策略 — 中国版永久组合（personal.py）

**基本信息**
- 基准：上证指数（000001.SH）
- 调仓：动态触发（非周期性）
- 持股数量：6-9 只（3 类资产）

**目标仓位结构**

| 类别 | 目标占比 | 候选标的 |
|-----|---------|---------|
| 银行股 | 50% | 601009（南京银行）、600919（江苏银行）、601838（成都银行）|
| 黄金股 | 25% | 600547（山东黄金）、600988（赤峰黄金）|
| 铜/生产资料 | 25% | 601899（紫金矿业）、601168（西部矿业）、600362（江西铜业）|

**仓位动态管理（基于上证指数）**

```python
def get_target_position_ratio(shanghai_index: float) -> float:
    if shanghai_index < 3000:
        return 1.0      # 满仓
    elif shanghai_index < 3900:
        return 1.0      # 满仓，禁止杠杆
    elif shanghai_index < 5000:
        # 每涨100点减仓9%，从3900点开始
        steps = (shanghai_index - 3900) / 100
        return max(1.0 - steps * 0.09, 0.0)
    else:
        return 0.15     # 最多15%仓位
```

**银行股买入触发**：当候选标的的实时股息率（TTM） ≥ 6% 时，生成分批买入信号

**卖出规则**（满足任一即卖出）
- 30% 止盈：涨幅达 30% 时卖出该持仓 1/3；剩余 2/3 重置成本基础
- 股息率跌破 3%（仅银行股）：生成 SELL 信号
- 概念炒作期检测（需人工确认，日报中提示）
- 基本面恶化：矿难、资源枯竭等重大负面（暂不自动识别，日报提示人工判断）

**再平衡规则**：各类资产偏离目标比例 > 5% 时，月末触发再平衡

---

## 八、主要模块规格

### data/fetcher.py

```python
import akshare as ak
import pandas as pd
from functools import lru_cache
from pathlib import Path
import json, time

CACHE_DIR = Path("data/cache")
CACHE_EXPIRE_SECONDS = 3600  # 1小时

class DataFetcher:
    def get_stock_list(self) -> pd.DataFrame:
        """获取沪深A股全量列表（含代码、名称、市值、行业）"""
        # ak.stock_zh_a_spot_em()

    def get_daily_history(self, symbol: str, period: int = 120) -> pd.DataFrame:
        """获取个股近N个交易日历史（含前复权收盘价）"""
        # ak.stock_zh_a_hist(symbol, adjust='qfq', period='daily')

    def get_prev_close(self, symbol: str) -> float:
        """获取前日收盘价（前复权）——策略执行价"""
        # 从 daily_history 取最后一行

    def get_financial_indicators(self, symbol: str) -> dict:
        """获取财务指标：ROE、营收增速、利润增速、PE、PB"""
        # ak.stock_financial_analysis_indicator()

    def get_dividend_yield(self, symbol: str) -> float:
        """计算 TTM 股息率"""
        # ak.stock_dividend_cninfo() + 当前股价

    def get_index_close(self, index_code: str) -> float:
        """获取指数最新收盘价，用于个人策略仓位计算"""
        # ak.stock_zh_index_daily()

    def get_etf_history(self, symbol: str, period: int = 5) -> pd.DataFrame:
        """获取ETF历史数据"""
        # ak.fund_etf_hist_em()

    def is_trading_day(self, date_str: str) -> bool:
        """判断是否为交易日"""
        # ak.tool_trade_date_hist_sina()
```

**缓存策略**：当日数据缓存到 `data/cache/YYYYMMDD/`，超过 1 小时失效。避免重复调用 AKShare 导致被限流。

### engine/portfolio.py

```python
class PortfolioManager:
    def get_portfolio_value(self, strategy_id: int, prices: dict) -> float:
        """计算策略当前总净值 = 现金 + 持仓市值"""

    def record_daily_nav(self, strategy_id: int, prices: dict, date: str):
        """记录日净值快照，计算日收益率和累计收益率"""

    def apply_dividend(self, strategy_id: int, symbol: str, dividend_per_share: float, payment_date: str):
        """将分红金额加入该策略现金池，并记录 dividends 表"""

    def get_position_cost(self, strategy_id: int, symbol: str) -> float:
        """返回某持仓的加权均价"""
```

---

## 九、主程序入口（main.py）

```bash
# 每日 15:35 由 Vault 调用
python main.py --run daily

# 初始化（首次运行）
python scripts/init_db.py
python scripts/init_positions.py

# 手动触发某策略分析
python main.py --strategy momentum --debug
```

**daily 运行流程**
```
1. 检查当日是否为交易日（不是则退出）
2. 遍历 5 个策略：
   a. 获取当日收盘价（AKShare）
   b. 检查是否有分红到账（dividend.py）→ 更新现金
   c. 检查特殊情况：停牌、ST化、跌破2元
   d. 判断当日是否为调仓日
   e. 运行策略信号生成逻辑
   f. 执行信号（买卖）→ 记录 transactions
   g. 更新 positions 和 portfolios
   h. 记录 daily_nav
3. 生成日报（report/daily_report.py）
4. 通过飞书发送日报
5. 记录运行日志
```

---

## 十、日报格式（report/daily_report.py）

生成 Markdown 内容，通过飞书 `富文本消息` 发送。

```
# 📊 策略日报 - {日期}

## 市场概况
- 上证指数：{close} {change_pct%}
- 深证成指：{close} {change_pct%}

## 策略净值汇总
| 策略 | 当前净值 | 今日收益 | 累计收益 | vs基准 |
|-----|---------|---------|---------|-------|
| 量化动量 | ¥xxx,xxx | +0.xx% | +xx.x% | +x.x% |
| 红利低波 | ¥xxx,xxx | ... | ... | ... |
| 全球配置 | ¥xxx,xxx | ... | ... | ... |
| 高成长 | ¥xxx,xxx | ... | ... | ... |
| 个人组合 | ¥xxx,xxx | ... | ... | ... |

## 今日交易
| 策略 | 代码 | 名称 | 操作 | 价格 | 数量 | 金额 | 理由 |
|-----|-----|-----|-----|-----|-----|-----|-----|

## 持仓明细（各策略）
（5个策略各自的当前持仓，含成本、现价、浮动盈亏）

## 明日信号预告
（已生成但次日执行的信号）

## 异常提示
- 停牌标的：xxx
- 需关注（接近止盈/止损线）：xxx

## 📈 策略自评与改进建议
（此部分由 Vault 调用 Claude API 分析生成）
```

---

## 十一、.env 配置项

```
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
DB_PATH=data/portfolio.db
LOG_LEVEL=INFO
MIN_STOCK_PRICE=2.0
INITIAL_CAPITAL=200000.0
```

---

## 十二、requirements.txt

```
akshare>=1.14.0
sqlalchemy>=2.0
pandas>=2.0
numpy>=1.24
pyyaml>=6.0
requests>=2.31
python-dotenv>=1.0
loguru>=0.7
schedule>=1.2        # 备用，主调度由OpenClaw负责
```

---

## 十三、初始化数据（scripts/init_db.py 写入内容）

```python
STRATEGIES = [
    {"name": "momentum",         "display_name": "量化动量",   "benchmark": "000905.SH", "rebalance_frequency": "monthly"},
    {"name": "dividend_lowvol",  "display_name": "红利低波",   "benchmark": "000922.CSI","rebalance_frequency": "quarterly"},
    {"name": "global_alloc",     "display_name": "全球资产配置","benchmark": "000300.SH","rebalance_frequency": "monthly"},
    {"name": "high_growth",      "display_name": "高成长",     "benchmark": "000905.SH", "rebalance_frequency": "quarterly"},
    {"name": "personal",         "display_name": "个人组合",   "benchmark": "000001.SH", "rebalance_frequency": "dynamic"},
]
```

---

## 十四、注意事项 & 边界情况处理

1. **AKShare 限流**：全量股票财务数据遍历时，每次请求间隔 0.3 秒，失败重试 3 次
2. **前复权价格**：所有历史回报计算使用前复权（qfq），避免分红导致的虚假跌幅
3. **分红处理**：调用 `ak.stock_dividend_cninfo()` 检查当日是否有分红到账，金额入现金池
4. **调仓日判断**：用 `akshare` 获取交易日历，不要用 `datetime.weekday()` 硬编码
5. **首次建仓**：`init_positions.py` 以系统启动当日收盘价按目标配置全量建仓，不分批
6. **数据异常**：若某股票无法获取价格（停牌等），跳过该股票，日报中标记异常
7. **并发安全**：SQLite 在多进程场景有锁问题，确保整个 daily run 为单进程串行执行
