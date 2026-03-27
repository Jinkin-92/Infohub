"""
SQLite-backed dashboard view helpers.
"""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select

from config.settings import settings
from data.fetcher import DataFetcher, LOCAL_INDEX_CLOSES, LOCAL_SYMBOLS
from database.models import DailyNav, DataSourceEvent, Position, Signal, Strategy, Transaction
from database.operations import create_session_factory


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")

RULES_BY_STRATEGY = {
    "momentum": "每日可调仓；优先保留动量得分靠前标的；若持仓跌破止损阈值则卖出；A股卖出遵循 T+1。",
    "dividend_lowvol": "每日可调仓；优先保留高股息且低波动标的；股息率明显下滑或触发止损时卖出；A股卖出遵循 T+1。",
    "global_alloc": "每日可调仓；按目标 ETF 权重进行再平衡；权重偏离越大越优先调整；ETF 可当日卖出。",
    "high_growth": "每日可调仓；优先保留营收和利润高增长标的；不再满足成长条件或触发止损时卖出；A股卖出遵循 T+1。",
    "personal": "每日可调仓；依据上证指数区间动态调整总仓位，并在银行/黄金/金属之间分配；A股卖出遵循 T+1。",
}


def format_datetime_shanghai(value: str | None) -> str:
    if not value:
        return "-"
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.strftime("%Y-%m-%d %H:%M:%S")
    return parsed.astimezone(SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _data_source_summary(events: list[DataSourceEvent], latest_nav_date: str | None) -> dict[str, object]:
    warning_count = sum(1 for item in events if item.severity != "info")
    fallback_count = sum(1 for item in events if item.fallback_mode and item.fallback_mode not in {"skipped"})
    skipped_count = sum(1 for item in events if item.fallback_mode == "skipped")
    degraded = any(item.fallback_mode == "provider_degraded" for item in events)
    status = "正常"
    if degraded or skipped_count:
        status = "降级运行"
    if not events and not latest_nav_date:
        status = "暂无记录"
    return {
        "状态": status,
        "事件数": len(events),
        "告警数": warning_count,
        "降级次数": fallback_count,
        "跳过标的数": skipped_count,
    }


def _load_market_stats(provider: str) -> dict[str, object]:
    stock_count = 0
    error = None
    try:
        fetcher = DataFetcher(provider)
        stock_count = len(fetcher.get_stock_list())
    except Exception as exc:  # pragma: no cover
        error = str(exc)
    return {
        "stock_count": stock_count,
        "etf_count": len([item for item in LOCAL_SYMBOLS if item.get("is_etf")]),
        "index_count": len(LOCAL_INDEX_CLOSES),
        "error": error,
    }


def _resolve_latest_prices(provider: str, symbols: list[str]) -> dict[str, float]:
    prices: dict[str, float] = {}
    if not symbols:
        return prices
    try:
        fetcher = DataFetcher(provider)
        for symbol in symbols:
            try:
                prices[symbol] = fetcher.get_stock_snapshot(symbol).close
            except Exception:
                continue
    except Exception:
        return prices
    return prices


def _daily_pnl_amount(navs: list[DailyNav], latest: DailyNav | None) -> float:
    if latest is None or len(navs) < 2:
        return 0.0
    return round(latest.total_nav - navs[-2].total_nav, 2)


def _holding_days(latest_date: str | None, buy_date: str) -> int:
    if not latest_date:
        return 0
    try:
        return max((date.fromisoformat(latest_date) - date.fromisoformat(buy_date)).days, 0)
    except ValueError:
        return 0


def build_dashboard_snapshot(db_path: Path | None = None) -> dict[str, object]:
    resolved_db_path = (db_path or settings.db.resolved_path).resolve()
    session_factory = create_session_factory(resolved_db_path)
    with session_factory() as session:
        strategies = session.scalars(select(Strategy).order_by(Strategy.id)).all()
        positions = session.scalars(select(Position).order_by(Position.strategy_id, Position.symbol)).all()
        transactions = session.scalars(select(Transaction).order_by(Transaction.id.desc())).all()
        signals = session.scalars(select(Signal).order_by(Signal.id.desc())).all()
        navs = session.scalars(select(DailyNav).order_by(DailyNav.strategy_id, DailyNav.date)).all()
        source_events = session.scalars(select(DataSourceEvent).order_by(DataSourceEvent.id.desc())).all()
        strategy_core = {
            strategy.id: {
                "name": strategy.name,
                "display_name": strategy.display_name,
                "benchmark": strategy.benchmark or "-",
                "initial_capital": strategy.initial_capital,
                "cash": strategy.portfolio.cash if strategy.portfolio else strategy.initial_capital,
            }
            for strategy in strategies
        }

    navs_by_strategy: dict[int, list[DailyNav]] = {}
    for nav in navs:
        navs_by_strategy.setdefault(nav.strategy_id, []).append(nav)

    latest_nav_date = max((nav.date for nav in navs), default=None)
    latest_run_provider = source_events[0].provider if source_events else settings.data.provider
    latest_run_date = source_events[0].trade_date if source_events else latest_nav_date or "-"
    latest_run_time = format_datetime_shanghai(source_events[0].created_at.isoformat() + "+00:00") if source_events else "-"
    summary = _data_source_summary(source_events, latest_nav_date)
    market_stats = _load_market_stats(latest_run_provider)
    current_prices = _resolve_latest_prices(latest_run_provider, [position.symbol for position in positions])

    total_cash = sum(item["cash"] for item in strategy_core.values())
    total_stock_value = sum(
        (navs_by_strategy.get(strategy.id, [])[-1].stock_value if navs_by_strategy.get(strategy.id) else 0.0)
        for strategy in strategies
    )
    latest_transactions_date = max((tx.trade_date for tx in transactions), default=latest_run_date)

    overview_rows: list[dict[str, object]] = []
    overview_curve: list[dict[str, object]] = []
    execution_rows: list[dict[str, object]] = []
    strategy_pages: dict[str, dict[str, object]] = {}

    for strategy in strategies:
        core = strategy_core[strategy.id]
        nav_list = navs_by_strategy.get(strategy.id, [])
        latest_nav = nav_list[-1] if nav_list else None
        positions_for_strategy = [item for item in positions if item.strategy_id == strategy.id]
        transactions_for_strategy = [item for item in transactions if item.strategy_id == strategy.id]
        signals_for_strategy = [item for item in signals if item.strategy_id == strategy.id]

        total_asset = round(latest_nav.total_nav if latest_nav else core["cash"], 2)
        stock_value = round(latest_nav.stock_value if latest_nav else 0.0, 2)
        floating_pnl = round(total_asset - core["initial_capital"], 2)
        reference_daily_pnl = _daily_pnl_amount(nav_list, latest_nav)
        holding_ratio = round((stock_value / total_asset) * 100, 2) if total_asset else 0.0

        overview_rows.append(
            {
                "策略": core["display_name"],
                "策略代码": core["name"],
                "数据状态": summary["状态"],
                "总资产": total_asset,
                "总市值": stock_value,
                "浮动盈亏": floating_pnl,
                "当日参考盈亏": reference_daily_pnl,
                "持仓比例(%)": holding_ratio,
            }
        )

        for nav in nav_list:
            overview_curve.append(
                {
                    "日期": nav.date,
                    "策略": core["display_name"],
                    "策略代码": core["name"],
                    "总资产": round(nav.total_nav, 2),
                    "累计收益率(%)": round(nav.cumulative_return_pct or 0.0, 2),
                    "日收益率(%)": round(nav.daily_return_pct or 0.0, 2),
                }
            )

        latest_tx = [tx for tx in transactions_for_strategy if tx.trade_date == latest_transactions_date]
        execution_rows.append(
            {
                "策略": core["display_name"],
                "交易日": latest_transactions_date,
                "买入笔数": sum(1 for tx in latest_tx if tx.action == "BUY"),
                "卖出笔数": sum(1 for tx in latest_tx if tx.action == "SELL"),
            }
        )

        detail_positions: list[dict[str, object]] = []
        for position in positions_for_strategy:
            current_price = current_prices.get(position.symbol, position.avg_cost)
            market_value = round(position.shares * current_price, 2)
            weight = round((market_value / total_asset) * 100, 2) if total_asset else 0.0
            pnl_amount = round((current_price - position.avg_cost) * position.shares, 2)
            pnl_ratio = round(((current_price / position.avg_cost) - 1.0) * 100, 2) if position.avg_cost else 0.0
            detail_positions.append(
                {
                    "代码": position.symbol,
                    "名称": position.name or position.symbol,
                    "持仓股数": position.shares,
                    "个股仓位(%)": weight,
                    "成本": round(position.avg_cost, 2),
                    "现价": round(current_price, 2),
                    "持股天数": _holding_days(latest_nav_date, position.buy_date),
                    "浮盈亏金额": pnl_amount,
                    "浮盈亏比例(%)": pnl_ratio,
                }
            )

        detail_curve = [
            {
                "日期": nav.date,
                "总资产": round(nav.total_nav, 2),
                "累计收益率(%)": round(nav.cumulative_return_pct or 0.0, 2),
                "日收益率(%)": round(nav.daily_return_pct or 0.0, 2),
            }
            for nav in nav_list
        ]

        detail_records = [
            {
                "日期": tx.trade_date,
                "时间": tx.trade_date,
                "动作": "买入" if tx.action == "BUY" else "卖出",
                "代码": tx.symbol,
                "数量": tx.shares,
                "价格": round(tx.price, 2),
                "说明": tx.reason or "-",
                "记录类型": "交易记录",
            }
            for tx in transactions_for_strategy
        ] + [
            {
                "日期": signal.generated_at.date().isoformat() if signal.generated_at else latest_run_date,
                "时间": format_datetime_shanghai(signal.generated_at.isoformat() + "+00:00") if signal.generated_at else latest_run_time,
                "动作": "信号",
                "代码": signal.symbol,
                "数量": signal.target_shares or 0,
                "价格": round(signal.ref_price or 0.0, 2),
                "说明": signal.reason or "-",
                "记录类型": "信号说明",
            }
            for signal in signals_for_strategy
        ]
        detail_records = sorted(detail_records, key=lambda item: (item["日期"], item["时间"]), reverse=True)

        strategy_pages[strategy.name] = {
            "display_name": core["display_name"],
            "benchmark": core["benchmark"],
            "rule_text": RULES_BY_STRATEGY.get(strategy.name, "每日可调仓，遵循交易日与 A 股 T+1。"),
            "current_total_asset": total_asset,
            "cash": round(core["cash"], 2),
            "stock_value": stock_value,
            "month_trade_count": len(transactions_for_strategy),
            "signal_status": "有待处理" if any(not signal.executed for signal in signals_for_strategy) else "已执行",
            "data_status": summary["状态"],
            "positions": detail_positions,
            "curve": detail_curve,
            "records": detail_records,
        }

    data_source_events = [
        {
            "交易日": event.trade_date,
            "数据源": event.provider,
            "级别": event.severity,
            "目标": event.target,
            "处理方式": event.fallback_mode or "-",
            "说明": event.message,
            "记录时间": format_datetime_shanghai(event.created_at.isoformat() + "+00:00"),
        }
        for event in source_events[:50]
    ]

    source_info = {
        "最新更新时间": latest_run_time,
        "数据状态": summary["状态"],
        "数据库路径": str(resolved_db_path),
        "数据库标的总数量": f"A股 {market_stats['stock_count']} / ETF {market_stats['etf_count']} / 指数 {market_stats['index_count']}",
        "数据库更新频率": "开市日每日执行，支持手动补跑",
    }

    return {
        "strategy_count": len(strategies),
        "total_cash": round(total_cash, 2),
        "total_stock_value": round(total_stock_value, 2),
        "latest_run_provider": latest_run_provider,
        "latest_run_date": latest_run_date,
        "latest_run_time_shanghai": latest_run_time,
        "data_source_summary": summary,
        "source_info": source_info,
        "overview_rows": overview_rows,
        "overview_curve": overview_curve,
        "latest_trade_execution_rows": execution_rows,
        "strategy_pages": strategy_pages,
        "data_source_events": data_source_events,
    }
