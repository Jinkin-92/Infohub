"""
Market data providers for offline, AkShare, and InStock-backed runs.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Protocol
import importlib
import sys

from config.runtime_settings import settings


@dataclass(frozen=True, slots=True)
class StockSnapshot:
    symbol: str
    name: str
    close: float
    volume: float
    listed_days: int
    market_cap: float
    roc20: float
    roc60: float
    is_st: bool = False
    is_suspended: bool = False
    source: str = "unknown"


@dataclass(frozen=True, slots=True)
class DataSourceHealth:
    provider: str
    ok: bool
    detail: str
    sample_count: int = 0


class MarketDataProvider(Protocol):
    name: str

    def health_check(self) -> DataSourceHealth:
        ...

    def list_a_share_candidates(self) -> list[StockSnapshot]:
        ...


def _is_a_share_code(code: str) -> bool:
    return code.startswith(("600", "601", "603", "605", "000", "001", "002", "003", "300", "301", "688"))


def _safe_float(value: object, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _is_st_stock(name: str) -> bool:
    return "ST" in name.upper()


def _compute_roc(close_values: list[float], lookback: int) -> float:
    if len(close_values) <= lookback:
        return 0.0
    base = close_values[-(lookback + 1)]
    current = close_values[-1]
    if not base:
        return 0.0
    return (current / base - 1.0) * 100.0


class LocalMarketDataProvider:
    name = "local"

    def health_check(self) -> DataSourceHealth:
        count = len(self.list_a_share_candidates())
        return DataSourceHealth(provider=self.name, ok=True, detail="offline sample data ready", sample_count=count)

    def list_a_share_candidates(self) -> list[StockSnapshot]:
        return [
            StockSnapshot("600036", "招商银行", 34.10, 18_000_000, 6000, 950_000_000_000, 7.2, 18.4, source=self.name),
            StockSnapshot("600519", "贵州茅台", 1688.00, 2_100_000, 8000, 2_100_000_000_000, 4.1, 12.8, source=self.name),
            StockSnapshot("000333", "美的集团", 63.20, 9_000_000, 5000, 430_000_000_000, 6.8, 16.5, source=self.name),
            StockSnapshot("002415", "海康威视", 31.50, 6_500_000, 4500, 290_000_000_000, 3.4, 8.1, source=self.name),
            StockSnapshot("300750", "宁德时代", 201.80, 7_200_000, 2500, 880_000_000_000, 11.4, 24.8, source=self.name),
            StockSnapshot("601318", "中国平安", 47.60, 13_000_000, 6500, 870_000_000_000, 5.3, 10.9, source=self.name),
            StockSnapshot("688111", "金山办公", 289.00, 1_100_000, 1600, 135_000_000_000, 9.8, 22.2, source=self.name),
            StockSnapshot("002594", "比亚迪", 220.00, 8_700_000, 2200, 640_000_000_000, 13.6, 29.1, source=self.name),
            StockSnapshot("600887", "伊利股份", 27.40, 7_500_000, 7000, 175_000_000_000, 2.8, 7.5, source=self.name),
            StockSnapshot("603259", "药明康德", 48.30, 8_200_000, 2000, 140_000_000_000, 8.2, 19.3, source=self.name),
            StockSnapshot("000001", "平安银行", 11.20, 28_000_000, 7000, 220_000_000_000, 1.2, 5.1, source=self.name),
            StockSnapshot("600000", "浦发银行", 9.15, 24_000_000, 7000, 245_000_000_000, -0.6, 1.8, source=self.name),
            StockSnapshot("600905", "三峡能源", 4.35, 32_000_000, 1200, 124_000_000_000, 6.2, 14.3, source=self.name),
            StockSnapshot("600001", "ST示例", 5.00, 100_000, 1200, 10_000_000_000, 15.0, 30.0, is_st=True, source=self.name),
            StockSnapshot("300999", "停牌示例", 25.00, 0, 900, 50_000_000_000, 20.0, 35.0, is_suspended=True, source=self.name),
        ]


class AkshareMarketDataProvider:
    name = "akshare"

    def __init__(self, sample_size: int | None = None):
        self.sample_size = sample_size or settings.data.universe_sample_size
        self.ak = importlib.import_module("akshare")

    def health_check(self) -> DataSourceHealth:
        try:
            trade_dates = self.ak.tool_trade_date_hist_sina()
            spot = self.ak.stock_zh_a_spot_em()
            return DataSourceHealth(
                provider=self.name,
                ok=True,
                detail="AkShare spot and trade-date endpoints responded",
                sample_count=min(len(spot), len(trade_dates)),
            )
        except Exception as exc:
            return DataSourceHealth(provider=self.name, ok=False, detail=f"{type(exc).__name__}: {exc}")

    @lru_cache(maxsize=256)
    def _history(self, symbol: str) -> list[float]:
        history = self.ak.stock_zh_a_hist(symbol=symbol, period="daily", adjust="qfq")
        if history is None or history.empty:
            return []
        close_col = "收盘" if "收盘" in history.columns else history.columns[2]
        closes = history[close_col].dropna().tolist()
        return [_safe_float(value) for value in closes if _safe_float(value) > 0]

    def list_a_share_candidates(self) -> list[StockSnapshot]:
        spot = self.ak.stock_zh_a_spot_em()
        if spot is None or spot.empty:
            return []

        filtered = spot[spot["代码"].astype(str).map(_is_a_share_code)].copy()
        filtered = filtered.sort_values("总市值", ascending=False).head(self.sample_size)

        snapshots: list[StockSnapshot] = []
        for _, row in filtered.iterrows():
            symbol = str(row["代码"]).zfill(6)
            history = self._history(symbol)
            if len(history) < 61:
                continue
            name = str(row["名称"])
            close = _safe_float(row["最新价"])
            volume = _safe_float(row["成交量"])
            market_cap = _safe_float(row["总市值"])
            snapshots.append(
                StockSnapshot(
                    symbol=symbol,
                    name=name,
                    close=close,
                    volume=volume,
                    listed_days=max(len(history), 3650),
                    market_cap=market_cap,
                    roc20=_compute_roc(history, 20),
                    roc60=_compute_roc(history, 60),
                    is_st=_is_st_stock(name),
                    is_suspended=volume <= 0 or close <= 0,
                    source=self.name,
                )
            )
        return snapshots


class InStockMarketDataProvider:
    name = "instock"

    def __init__(self, project_path: Path | None = None, sample_size: int | None = None):
        self.project_path = project_path or settings.data.resolved_instock_path
        self.sample_size = sample_size or settings.data.universe_sample_size
        if str(self.project_path) not in sys.path:
            sys.path.insert(0, str(self.project_path))
        self.stockfetch = importlib.import_module("instock.core.stockfetch")

    def health_check(self) -> DataSourceHealth:
        try:
            selection = self.stockfetch.fetch_stock_selection()
            count = 0 if selection is None else len(selection)
            return DataSourceHealth(
                provider=self.name,
                ok=selection is not None and count > 0,
                detail="InStock selection endpoint responded" if count else "InStock returned no rows",
                sample_count=count,
            )
        except Exception as exc:
            return DataSourceHealth(provider=self.name, ok=False, detail=f"{type(exc).__name__}: {exc}")

    def list_a_share_candidates(self) -> list[StockSnapshot]:
        spot = self.stockfetch.fetch_stocks(None)
        if spot is None or spot.empty:
            spot = self.stockfetch.fetch_stock_selection()
        if spot is None or spot.empty:
            return []

        ranked = spot.sort_values("total_market_cap", ascending=False).head(self.sample_size)
        today = datetime.now().date()
        snapshots: list[StockSnapshot] = []
        for _, row in ranked.iterrows():
            symbol = str(row["code"]).zfill(6)
            history = self.stockfetch.fetch_stock_hist((today, symbol), is_cache=False)
            if history is None or history.empty:
                continue
            closes = [_safe_float(value) for value in history["close"].dropna().tolist() if _safe_float(value) > 0]
            if len(closes) < 61:
                continue
            name = str(row["name"])
            close = _safe_float(row["new_price"])
            volume = _safe_float(row.get("volume", row.get("volume_ratio", 0)))
            market_cap = _safe_float(row.get("total_market_cap", 0))
            snapshots.append(
                StockSnapshot(
                    symbol=symbol,
                    name=name,
                    close=close,
                    volume=volume,
                    listed_days=max(len(closes), 3650),
                    market_cap=market_cap,
                    roc20=_compute_roc(closes, 20),
                    roc60=_compute_roc(closes, 60),
                    is_st=_is_st_stock(name),
                    is_suspended=volume <= 0 or close <= 0,
                    source=self.name,
                )
            )
        return snapshots


def create_market_data_provider(provider_name: str | None = None) -> MarketDataProvider:
    name = (provider_name or settings.data.primary_provider).strip().lower()
    if name == "local":
        return LocalMarketDataProvider()
    if name == "akshare":
        return AkshareMarketDataProvider()
    if name == "instock":
        return InStockMarketDataProvider()
    raise ValueError(f"Unsupported provider '{name}'")


def available_provider_names() -> list[str]:
    return ["local", "akshare", "instock"]
