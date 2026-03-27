"""
Daily runner aligned with SYSTEM_DESIGN.md.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from data.dividend import DividendService
from data.fetcher import DataFetcher
from data.universe import filter_for_strategy, inspect_position_risks
from database.operations import (
    create_session_factory,
    get_active_strategies,
    get_positions_by_strategy,
    init_database,
    replace_strategy_signals,
)
from engine.executor import execute_signal
from engine.portfolio import PortfolioManager
from strategies.base import SignalCandidate, StrategyContext
from strategies.registry import get_strategy


def _is_rebalance_day(strategy_name: str, trade_date: date) -> bool:
    if strategy_name == "momentum":
        return trade_date.day <= 3
    if strategy_name == "dividend_lowvol":
        return trade_date.month in {3, 6, 9, 12} and trade_date.day <= 5
    if strategy_name == "global_alloc":
        return trade_date.day >= 25
    if strategy_name == "high_growth":
        return trade_date.month in {4, 8, 10, 12} and trade_date.day <= 10
    return True


def run_daily(provider: str | None = None, trade_date: date | None = None, notify: bool = False, db_path=None) -> dict:
    fetcher = DataFetcher(provider)
    run_date = trade_date or date.today()
    trade_date_str = run_date.strftime("%Y-%m-%d")
    if not fetcher.is_trading_day(trade_date_str):
        return {"date": trade_date_str, "is_trading_day": False, "strategies": []}

    db_path = init_database(db_path)
    session_factory = create_session_factory(db_path)
    daily_report_runs = []
    with session_factory() as session:
        dividend_service = DividendService(fetcher)
        portfolio_manager = PortfolioManager(session, fetcher)
        all_snapshots = fetcher.build_stock_snapshots(include_etf=True)
        snapshot_map = {item.symbol: item for item in all_snapshots}

        for strategy in get_active_strategies(session):
            positions = get_positions_by_strategy(session, strategy.id)
            for dividend in dividend_service.get_due_dividends(trade_date_str, [{"symbol": item.symbol, "shares": item.shares} for item in positions]):
                portfolio_manager.apply_dividend(strategy.id, dividend.symbol, dividend.dividend_per_share, dividend.payment_date)

            filtered = filter_for_strategy(strategy.name, all_snapshots)
            alerts = inspect_position_risks(strategy.name, [{"symbol": item.symbol, "avg_cost": item.avg_cost} for item in positions], snapshot_map)
            context = StrategyContext(
                strategy={
                    "id": strategy.id,
                    "name": strategy.name,
                    "display_name": strategy.display_name,
                    "initial_capital": strategy.initial_capital,
                    "current_nav": portfolio_manager.get_portfolio_value(strategy.id, {item.symbol: item.close for item in all_snapshots})[0],
                },
                positions=[
                    {
                        "strategy_id": item.strategy_id,
                        "symbol": item.symbol,
                        "name": item.name,
                        "shares": item.shares,
                        "avg_cost": item.avg_cost,
                        "buy_date": item.buy_date,
                        "can_sell_date": item.can_sell_date,
                        "is_etf": item.is_etf,
                    }
                    for item in positions
                ],
                universe=filtered,
                fetcher=fetcher,
                trade_date=run_date,
                is_rebalance_day=_is_rebalance_day(strategy.name, run_date),
            )
            generated = get_strategy(strategy.name).generate_signals(context)

            for alert in alerts:
                if alert["action"] == "sell":
                    snapshot = snapshot_map.get(alert["symbol"])
                    if snapshot is not None:
                        generated.append(
                            SignalCandidate(
                                symbol=snapshot.symbol,
                                name=snapshot.name,
                                signal_type="SELL",
                                ref_price=snapshot.close,
                                target_shares=0,
                                reason=alert["reason"],
                            )
                        )

            persisted = replace_strategy_signals(session, strategy.id, [item.to_record() for item in generated])
            pending_buys = [signal for signal in persisted if signal.signal_type == "BUY" and not signal.target_shares]
            if pending_buys and strategy.portfolio is not None:
                cash_per_signal = max(strategy.portfolio.cash * 0.98 / len(pending_buys), 0.0)
                for signal in pending_buys:
                    if not signal.ref_price or signal.ref_price <= 0:
                        continue
                    lot_size = 100
                    target_shares = int(cash_per_signal / signal.ref_price / lot_size) * lot_size
                    signal.target_shares = max(target_shares, lot_size if cash_per_signal >= signal.ref_price * lot_size else 0)
                session.flush()

            executed = []
            for signal in persisted:
                executed.append(execute_signal(session, strategy, signal, fetcher, run_date))
            session.commit()
            prices = {item.symbol: item.close for item in all_snapshots}
            nav = portfolio_manager.record_daily_nav(strategy.id, prices, trade_date_str)
            session.commit()
            daily_report_runs.append(
                {
                    "strategy": strategy.name,
                    "display_name": strategy.display_name,
                    "signal_count": len(persisted),
                    "executions": executed,
                    "nav": {
                        "total_nav": nav.total_nav,
                        "cash": nav.cash,
                        "stock_value": nav.stock_value,
                        "daily_return_pct": nav.daily_return_pct,
                        "cumulative_return_pct": nav.cumulative_return_pct,
                    },
                }
            )

    return {"date": trade_date_str, "is_trading_day": True, "db_path": str(db_path), "strategies": daily_report_runs}
