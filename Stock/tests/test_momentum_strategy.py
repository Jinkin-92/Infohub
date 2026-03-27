from datetime import date

from data.fetcher import DataFetcher
from data.universe import filter_a_share_universe
from strategies.base import StrategyContext
from strategies.momentum import MomentumStrategy


def test_momentum_strategy_generates_buy_and_sell_signals():
    fetcher = DataFetcher("local")
    universe = filter_a_share_universe(fetcher.build_stock_snapshots())
    strategy = {"id": 1, "name": "momentum", "display_name": "量化动量", "initial_capital": 200000.0}
    held_position = {
        "strategy_id": 1,
        "symbol": "600000",
        "name": "浦发银行",
        "shares": 100,
        "avg_cost": 10.0,
        "buy_date": "2026-03-01",
        "can_sell_date": "2026-03-02",
        "is_etf": False,
    }

    context = StrategyContext(
        strategy=strategy,
        positions=[held_position],
        universe=universe,
        fetcher=fetcher,
        trade_date=date.today(),
        is_rebalance_day=True,
    )
    signals = MomentumStrategy(top_n=3).generate_signals(context)

    assert any(signal.signal_type == "SELL" and signal.symbol == "600000" for signal in signals)
    assert any(signal.signal_type == "BUY" for signal in signals)
