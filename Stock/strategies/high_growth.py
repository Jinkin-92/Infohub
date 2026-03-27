"""
High-growth strategy.
"""

from __future__ import annotations

from strategies.base import BaseStrategy, SignalCandidate, StrategyContext


class HighGrowthStrategy(BaseStrategy):
    name = "high_growth"

    def __init__(self, top_n: int = 10, stop_loss_pct: float = -20.0):
        self.top_n = top_n
        self.stop_loss_pct = stop_loss_pct

    def generate_signals(self, context: StrategyContext) -> list[SignalCandidate]:
        held = {item["symbol"]: item for item in context.positions}
        signals: list[SignalCandidate] = []

        for position in context.positions:
            current = next((item for item in context.universe if item.symbol == position["symbol"]), None)
            if current is None:
                continue
            drawdown = (current.close / position["avg_cost"] - 1.0) * 100.0
            if drawdown <= self.stop_loss_pct:
                signals.append(SignalCandidate(current.symbol, current.name, "SELL", current.close, 0, "stop_loss"))

        if not context.is_rebalance_day:
            return signals

        candidates = [
            item
            for item in context.universe
            if item.industry not in {"金融", "公用事业", "房地产", "银行"}
            and item.market_cap >= 50_000_000_000
            and item.revenue_growth > 20
            and item.profit_growth > 20
            and item.roe > 15
            and 0 < item.pe < 80
        ]
        ranked = sorted(
            candidates,
            key=lambda item: item.revenue_growth * 0.3 + item.profit_growth * 0.3 + item.roe * 0.2 + (100 / item.pe) * 0.2,
            reverse=True,
        )
        targets = ranked[: self.top_n]
        target_symbols = {item.symbol for item in targets}

        for position in context.positions:
            if position["symbol"] not in target_symbols:
                signals.append(SignalCandidate(position["symbol"], position["name"], "SELL", position["avg_cost"], 0, "not_in_growth_pool"))

        for snapshot in targets:
            if snapshot.symbol not in held:
                signals.append(SignalCandidate(snapshot.symbol, snapshot.name, "BUY", snapshot.close, None, "growth_pick"))
        return signals
