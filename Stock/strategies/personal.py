"""
Personal strategy for a China-style permanent portfolio.
"""

from __future__ import annotations

from strategies.base import BaseStrategy, SignalCandidate, StrategyContext


BANK_SYMBOLS = {"601009", "600919", "601838"}
GOLD_SYMBOLS = {"600547", "000988"}
METAL_SYMBOLS = {"601899", "601168", "600362"}


def get_target_position_ratio(shanghai_index: float) -> float:
    if shanghai_index < 3000:
        return 1.0
    if shanghai_index < 3900:
        return 1.0
    if shanghai_index < 5000:
        steps = (shanghai_index - 3900) / 100
        return max(1.0 - steps * 0.09, 0.0)
    return 0.15


class PersonalStrategy(BaseStrategy):
    name = "personal"

    def generate_signals(self, context: StrategyContext) -> list[SignalCandidate]:
        shanghai_index = context.fetcher.get_index_close("000001.SH")
        position_ratio = get_target_position_ratio(shanghai_index)
        candidates = {
            "bank": [item for item in context.universe if item.symbol in BANK_SYMBOLS and item.dividend_yield >= 6.0],
            "gold": [item for item in context.universe if item.symbol in GOLD_SYMBOLS],
            "metal": [item for item in context.universe if item.symbol in METAL_SYMBOLS],
        }
        targets = {}
        if candidates["bank"]:
            targets[candidates["bank"][0].symbol] = 0.50 * position_ratio
        if candidates["gold"]:
            targets[candidates["gold"][0].symbol] = 0.25 * position_ratio
        if candidates["metal"]:
            targets[candidates["metal"][0].symbol] = 0.25 * position_ratio

        prices = {item.symbol: item.close for item in context.universe}
        held = {item["symbol"]: item for item in context.positions}
        total_nav = context.strategy.get("current_nav", context.strategy.get("initial_capital", 200000.0))
        signals: list[SignalCandidate] = []

        for position in context.positions:
            snapshot = next((item for item in context.universe if item.symbol == position["symbol"]), None)
            if snapshot is None:
                continue
            gain = (snapshot.close / position["avg_cost"] - 1.0) * 100.0
            if gain >= 30.0:
                signals.append(SignalCandidate(snapshot.symbol, snapshot.name, "SELL", snapshot.close, max(position["shares"] // 3, 100), "take_profit"))
            elif snapshot.symbol in BANK_SYMBOLS and snapshot.dividend_yield < 3.0:
                signals.append(SignalCandidate(snapshot.symbol, snapshot.name, "SELL", snapshot.close, 0, "yield_drop"))

        for symbol, ratio in targets.items():
            snapshot = next((item for item in context.universe if item.symbol == symbol), None)
            if snapshot is None:
                continue
            target_shares = int((total_nav * ratio) / prices[symbol] / 100) * 100
            current_shares = held.get(symbol, {}).get("shares", 0)
            delta = target_shares - current_shares
            if delta > 0:
                signals.append(SignalCandidate(symbol, snapshot.name, "BUY", snapshot.close, delta, "personal_allocation"))
        return signals
