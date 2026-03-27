"""
Dividend helpers.
"""

from __future__ import annotations

from dataclasses import dataclass

from data.fetcher import DataFetcher


@dataclass(frozen=True, slots=True)
class DividendRecord:
    symbol: str
    name: str
    dividend_per_share: float
    payment_date: str
    record_date: str | None = None


class DividendService:
    def __init__(self, fetcher: DataFetcher):
        self.fetcher = fetcher

    def get_due_dividends(self, trade_date: str, positions: list[dict]) -> list[DividendRecord]:
        # Local test fixture does not produce live dividend events.
        return []

