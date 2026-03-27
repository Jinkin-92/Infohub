"""
SQLite-backed dashboard view helpers.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select

from config.settings import settings
from database.models import DailyNav, Position, Signal, Strategy, Transaction
from database.operations import create_session_factory


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


def format_datetime_shanghai(value: str | None) -> str:
    if not value:
        return "-"
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.strftime("%Y-%m-%d %H:%M:%S")
    return parsed.astimezone(SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M:%S")


def build_dashboard_snapshot(db_path: Path | None = None) -> dict:
    session_factory = create_session_factory(db_path or settings.db.resolved_path)
    with session_factory() as session:
        strategies = session.scalars(select(Strategy).order_by(Strategy.id)).all()
        positions = session.scalars(select(Position).order_by(Position.strategy_id, Position.symbol)).all()
        transactions = session.scalars(select(Transaction).order_by(Transaction.id.desc())).all()
        signals = session.scalars(select(Signal).order_by(Signal.id.desc())).all()
        navs = session.scalars(select(DailyNav).order_by(DailyNav.strategy_id, DailyNav.date)).all()
        strategy_meta = {
            strategy.id: {
                "name": strategy.name,
                "display_name": strategy.display_name,
                "initial_capital": strategy.initial_capital,
                "cash": strategy.portfolio.cash if strategy.portfolio else 0.0,
                "open_signal_count": len([item for item in strategy.signals if not item.executed]),
            }
            for strategy in strategies
        }

    nav_by_strategy: dict[int, list[DailyNav]] = {}
    for nav in navs:
        nav_by_strategy.setdefault(nav.strategy_id, []).append(nav)

    latest_nav_date = max((nav.date for nav in navs), default=None)
    total_cash = sum(item["cash"] for item in strategy_meta.values())
    total_stock_value = sum((nav_by_strategy.get(strategy_id, [])[-1].stock_value if nav_by_strategy.get(strategy_id) else 0.0) for strategy_id in strategy_meta)

    strategies_view = []
    nav_compare = []
    for strategy_id, meta in strategy_meta.items():
        latest_nav = nav_by_strategy.get(strategy_id, [])[-1] if nav_by_strategy.get(strategy_id) else None
        strategies_view.append(
            {
                "策略名称": meta["display_name"],
                "策略代码": meta["name"],
                "当前净值": round(latest_nav.total_nav if latest_nav else meta["initial_capital"], 2),
                "现金": round(meta["cash"], 2),
                "持仓市值": round(latest_nav.stock_value if latest_nav else 0.0, 2),
                "未执行信号": meta["open_signal_count"],
                "最近更新": latest_nav.date if latest_nav else "-",
            }
        )
        for nav in nav_by_strategy.get(strategy_id, []):
            nav_compare.append(
                {
                    "日期": nav.date,
                    "策略名称": meta["display_name"],
                    "策略代码": meta["name"],
                    "总资产": round(nav.total_nav, 2),
                    "累计收益率(%)": round(nav.cumulative_return_pct or 0.0, 2),
                    "日收益率(%)": round(nav.daily_return_pct or 0.0, 2),
                }
            )

    positions_view = [
        {
            "策略名称": strategy_meta.get(position.strategy_id, {}).get("display_name", str(position.strategy_id)),
            "代码": position.symbol,
            "名称": position.name or position.symbol,
            "持仓股数": position.shares,
            "持仓成本": round(position.avg_cost, 2),
            "可卖日期": position.can_sell_date,
            "是否ETF": "是" if position.is_etf else "否",
        }
        for position in positions
    ]
    transactions_view = [
        {
            "策略名称": strategy_meta.get(tx.strategy_id, {}).get("display_name", str(tx.strategy_id)),
            "动作": tx.action,
            "代码": tx.symbol,
            "名称": tx.name or tx.symbol,
            "股数": tx.shares,
            "成交价": round(tx.price, 2),
            "成交额": round(tx.amount, 2),
            "净额": round(tx.net_amount, 2),
            "交易日期": tx.trade_date,
            "原因": tx.reason or "-",
        }
        for tx in transactions
    ]
    signals_view = [
        {
            "策略名称": strategy_meta.get(signal.strategy_id, {}).get("display_name", str(signal.strategy_id)),
            "代码": signal.symbol,
            "名称": signal.name or signal.symbol,
            "信号类型": signal.signal_type,
            "参考价": round(signal.ref_price or 0.0, 2),
            "目标股数": signal.target_shares or 0,
            "原因": signal.reason or "-",
            "已执行": "是" if signal.executed else "否",
            "生成时间": format_datetime_shanghai(signal.generated_at.isoformat()) if signal.generated_at else "-",
        }
        for signal in signals
    ]

    return {
        "strategy_count": len(strategies),
        "total_cash": round(total_cash, 2),
        "total_stock_value": round(total_stock_value, 2),
        "latest_market_time_shanghai": latest_nav_date or "-",
        "strategies": strategies_view,
        "positions": positions_view,
        "transactions": transactions_view,
        "signals": signals_view,
        "nav_compare": nav_compare,
    }
