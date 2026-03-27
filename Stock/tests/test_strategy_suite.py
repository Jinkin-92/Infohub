from datetime import date

from data.fetcher import DataFetcher
from data.universe import filter_for_strategy
from strategies.base import StrategyContext
from strategies.registry import get_strategy


def _build_context(strategy_name: str) -> StrategyContext:
    fetcher = DataFetcher("local")
    universe = filter_for_strategy(strategy_name, fetcher.build_stock_snapshots(include_etf=True))
    return StrategyContext(
        strategy={"id": 1, "name": strategy_name, "display_name": strategy_name, "initial_capital": 200000.0, "current_nav": 200000.0},
        positions=[],
        universe=universe,
        fetcher=fetcher,
        trade_date=date(2026, 3, 2),
        is_rebalance_day=True,
    )


def test_dividend_lowvol_strategy_generates_buy_signals():
    signals = get_strategy("dividend_lowvol").generate_signals(_build_context("dividend_lowvol"))
    assert signals
    assert any(item.signal_type == "BUY" for item in signals)


def test_global_alloc_strategy_generates_rebalance_orders():
    signals = get_strategy("global_alloc").generate_signals(_build_context("global_alloc"))
    assert len(signals) == 5
    assert all(item.signal_type in {"BUY", "REBALANCE"} for item in signals)


def test_high_growth_strategy_generates_buy_signals():
    signals = get_strategy("high_growth").generate_signals(_build_context("high_growth"))
    assert signals
    assert any(item.signal_type == "BUY" for item in signals)


def test_personal_strategy_generates_allocation_signals():
    signals = get_strategy("personal").generate_signals(_build_context("personal"))
    assert signals
    assert any(item.signal_type == "BUY" for item in signals)
