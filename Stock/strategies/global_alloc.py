"""
Global asset allocation strategy using ETFs only.
"""

from __future__ import annotations

from strategies.base import BaseStrategy, SignalCandidate, StrategyContext


class GlobalAllocationStrategy(BaseStrategy):
    name = "global_alloc"

    def __init__(self, targets: dict[str, float], drift_threshold_pct: float = 8.0):
        self.targets = targets
        self.drift_threshold_pct = drift_threshold_pct

    def generate_signals(self, context: StrategyContext) -> list[SignalCandidate]:
        prices = {item.symbol: item.close for item in context.universe}
        position_map = {item["symbol"]: item for item in context.positions}
        total_nav = context.strategy.get("current_nav", context.strategy.get("initial_capital", 200000.0))
        current_values = {
            symbol: position_map[symbol]["shares"] * prices.get(symbol, position_map[symbol]["avg_cost"])
            for symbol in position_map
        }
        signals: list[SignalCandidate] = []
        drift_triggered = context.is_rebalance_day
        for symbol, target_ratio in self.targets.items():
            current_ratio = (current_values.get(symbol, 0.0) / total_nav) if total_nav else 0.0
            if abs(current_ratio - target_ratio) * 100 > self.drift_threshold_pct:
                drift_triggered = True
        if not drift_triggered:
            return signals

        for symbol, target_ratio in self.targets.items():
            snapshot = next((item for item in context.universe if item.symbol == symbol), None)
            if snapshot is None:
                continue
            target_value = total_nav * target_ratio
            target_shares = int(target_value / snapshot.close / 100) * 100
            current_shares = position_map.get(symbol, {}).get("shares", 0)
            delta = target_shares - current_shares
            if delta == 0:
                continue
            signal_type = "BUY" if delta > 0 else "SELL"
            signals.append(SignalCandidate(snapshot.symbol, snapshot.name, signal_type if current_shares == 0 or target_shares == 0 else "REBALANCE", snapshot.close, abs(delta), "asset_rebalance"))
        return signals
