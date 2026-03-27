"""
Base types for strategy generation.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date

from data.fetcher import DataFetcher, StockSnapshot


@dataclass(frozen=True, slots=True)
class SignalCandidate:
    symbol: str
    name: str
    signal_type: str
    ref_price: float
    target_shares: int | None
    reason: str

    def to_record(self) -> dict:
        return {
            "symbol": self.symbol,
            "name": self.name,
            "signal_type": self.signal_type,
            "ref_price": self.ref_price,
            "target_shares": self.target_shares,
            "reason": self.reason,
        }


@dataclass(slots=True)
class StrategyContext:
    strategy: dict
    positions: list[dict]
    universe: list[StockSnapshot]
    fetcher: DataFetcher
    trade_date: date
    is_rebalance_day: bool
    debug: bool = False


class BaseStrategy(ABC):
    name: str

    @abstractmethod
    def generate_signals(self, context: StrategyContext) -> list[SignalCandidate]:
        raise NotImplementedError
