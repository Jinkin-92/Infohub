"""
Dividend low-volatility strategy.
"""

from __future__ import annotations

from strategies.base import BaseStrategy, SignalCandidate, StrategyContext


class DividendLowVolStrategy(BaseStrategy):
    name = "dividend_lowvol"

    def __init__(self, top_n: int = 15, min_dividend_yield: float = 3.0, max_volatility: float = 35.0, stop_loss_pct: float = -25.0):
        self.top_n = top_n
        self.min_dividend_yield = min_dividend_yield
        self.max_volatility = max_volatility
        self.stop_loss_pct = stop_loss_pct

    def generate_signals(self, context: StrategyContext) -> list[SignalCandidate]:
        signals: list[SignalCandidate] = []
        held_symbols = {item["symbol"] for item in context.positions}

        for position in context.positions:
            current = next((item for item in context.universe if item.symbol == position["symbol"]), None)
            if current is None:
                continue
            drawdown = (current.close / position["avg_cost"] - 1.0) * 100.0
            if current.dividend_yield < 2.0:
                signals.append(SignalCandidate(current.symbol, current.name, "SELL", current.close, 0, "yield_drop"))
            elif drawdown <= self.stop_loss_pct:
                signals.append(SignalCandidate(current.symbol, current.name, "SELL", current.close, 0, "stop_loss"))

        if not context.is_rebalance_day:
            return signals

        filtered = [
            item for item in context.universe if item.dividend_yield >= self.min_dividend_yield and item.volatility * 100 < self.max_volatility
        ]
        ranked = sorted(filtered, key=lambda item: (item.dividend_yield / max(item.volatility, 0.01)), reverse=True)
        targets = ranked[: self.top_n]
        target_symbols = {item.symbol for item in targets}

        for position in context.positions:
            if position["symbol"] not in target_symbols:
                signals.append(SignalCandidate(position["symbol"], position["name"], "SELL", position["avg_cost"], 0, "not_in_dividend_pool"))

        for snapshot in targets:
            if snapshot.symbol not in held_symbols:
                signals.append(SignalCandidate(snapshot.symbol, snapshot.name, "BUY", snapshot.close, None, "dividend_lowvol_pick"))
        return signals
