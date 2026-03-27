"""
Momentum strategy aligned with SYSTEM_DESIGN.md.
"""

from __future__ import annotations

from strategies.base import BaseStrategy, SignalCandidate, StrategyContext


class MomentumStrategy(BaseStrategy):
    name = "momentum"

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
                signals.append(
                    SignalCandidate(
                        symbol=current.symbol,
                        name=current.name,
                        signal_type="SELL",
                        ref_price=current.close,
                        target_shares=0,
                        reason="stop_loss",
                    )
                )

        if not context.is_rebalance_day:
            return signals

        ranked = sorted(context.universe, key=lambda item: item.roc60 * 0.6 + item.roc20 * 0.4, reverse=True)
        targets = ranked[: self.top_n]
        target_symbols = {item.symbol for item in targets}

        for position in context.positions:
            if position["symbol"] not in target_symbols:
                current = next((item for item in targets if item.symbol == position["symbol"]), None)
                ref_price = current.close if current is not None else position["avg_cost"]
                signals.append(
                    SignalCandidate(
                        symbol=position["symbol"],
                        name=position.get("name") or position["symbol"],
                        signal_type="SELL",
                        ref_price=ref_price,
                        target_shares=0,
                        reason="removed_from_top_momentum",
                    )
                )

        for snapshot in targets:
            if snapshot.symbol in held:
                continue
            signals.append(
                SignalCandidate(
                    symbol=snapshot.symbol,
                    name=snapshot.name,
                    signal_type="BUY",
                    ref_price=snapshot.close,
                    target_shares=None,
                    reason="top_momentum_candidate",
                )
            )
        return signals
