"""
Unified market-data fetcher with local and AkShare-backed implementations.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
import json
import math
import os

import pandas as pd

from config.settings import settings


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
    dividend_yield: float = 0.0
    volatility: float = 0.0
    revenue_growth: float = 0.0
    profit_growth: float = 0.0
    roe: float = 0.0
    pe: float = 0.0
    pb: float = 0.0
    industry: str = ""
    is_st: bool = False
    is_suspended: bool = False
    is_etf: bool = False
    source: str = "unknown"


LOCAL_SYMBOLS: list[dict] = [
    {"symbol": "600036", "name": "招商银行", "close": 34.10, "market_cap": 950_000_000_000, "industry": "银行", "dividend_yield": 5.6, "volatility": 0.18, "revenue_growth": 6.0, "profit_growth": 5.0, "roe": 15.2, "pe": 6.5, "pb": 0.9},
    {"symbol": "601009", "name": "南京银行", "close": 11.80, "market_cap": 126_000_000_000, "industry": "银行", "dividend_yield": 6.4, "volatility": 0.20, "revenue_growth": 9.0, "profit_growth": 8.0, "roe": 13.2, "pe": 5.9, "pb": 0.7},
    {"symbol": "600919", "name": "江苏银行", "close": 9.40, "market_cap": 172_000_000_000, "industry": "银行", "dividend_yield": 6.1, "volatility": 0.22, "revenue_growth": 8.0, "profit_growth": 9.0, "roe": 14.0, "pe": 5.6, "pb": 0.8},
    {"symbol": "601838", "name": "成都银行", "close": 17.20, "market_cap": 98_000_000_000, "industry": "银行", "dividend_yield": 5.1, "volatility": 0.21, "revenue_growth": 12.0, "profit_growth": 14.0, "roe": 18.0, "pe": 6.8, "pb": 1.1},
    {"symbol": "300750", "name": "宁德时代", "close": 201.80, "market_cap": 880_000_000_000, "industry": "电池", "dividend_yield": 0.5, "volatility": 0.31, "revenue_growth": 23.0, "profit_growth": 21.0, "roe": 18.2, "pe": 24.0, "pb": 4.8},
    {"symbol": "002594", "name": "比亚迪", "close": 220.00, "market_cap": 640_000_000_000, "industry": "汽车", "dividend_yield": 0.3, "volatility": 0.28, "revenue_growth": 24.0, "profit_growth": 22.0, "roe": 17.5, "pe": 28.0, "pb": 4.2},
    {"symbol": "688111", "name": "金山办公", "close": 289.00, "market_cap": 135_000_000_000, "industry": "软件", "dividend_yield": 0.4, "volatility": 0.29, "revenue_growth": 25.0, "profit_growth": 24.0, "roe": 16.0, "pe": 52.0, "pb": 8.0},
    {"symbol": "603259", "name": "药明康德", "close": 48.30, "market_cap": 140_000_000_000, "industry": "医药", "dividend_yield": 0.9, "volatility": 0.27, "revenue_growth": 21.0, "profit_growth": 20.0, "roe": 15.5, "pe": 23.0, "pb": 3.6},
    {"symbol": "600519", "name": "贵州茅台", "close": 1688.0, "market_cap": 2_100_000_000_000, "industry": "白酒", "dividend_yield": 1.6, "volatility": 0.16, "revenue_growth": 16.0, "profit_growth": 15.0, "roe": 29.0, "pe": 29.0, "pb": 10.0},
    {"symbol": "000333", "name": "美的集团", "close": 63.20, "market_cap": 430_000_000_000, "industry": "家电", "dividend_yield": 3.8, "volatility": 0.19, "revenue_growth": 10.0, "profit_growth": 11.0, "roe": 21.0, "pe": 13.5, "pb": 3.0},
    {"symbol": "600887", "name": "伊利股份", "close": 27.40, "market_cap": 175_000_000_000, "industry": "食品饮料", "dividend_yield": 4.1, "volatility": 0.17, "revenue_growth": 8.0, "profit_growth": 7.0, "roe": 18.0, "pe": 14.0, "pb": 2.5},
    {"symbol": "600547", "name": "山东黄金", "close": 26.00, "market_cap": 116_000_000_000, "industry": "黄金", "dividend_yield": 1.2, "volatility": 0.30, "revenue_growth": 18.0, "profit_growth": 19.0, "roe": 13.0, "pe": 22.0, "pb": 2.2},
    {"symbol": "000988", "name": "赤峰黄金", "close": 16.20, "market_cap": 68_000_000_000, "industry": "黄金", "dividend_yield": 1.0, "volatility": 0.33, "revenue_growth": 20.0, "profit_growth": 18.0, "roe": 12.0, "pe": 25.0, "pb": 2.8},
    {"symbol": "601899", "name": "紫金矿业", "close": 18.10, "market_cap": 480_000_000_000, "industry": "有色金属", "dividend_yield": 2.0, "volatility": 0.24, "revenue_growth": 13.0, "profit_growth": 17.0, "roe": 14.0, "pe": 16.0, "pb": 2.9},
    {"symbol": "601168", "name": "西部矿业", "close": 17.50, "market_cap": 42_000_000_000, "industry": "有色金属", "dividend_yield": 1.8, "volatility": 0.25, "revenue_growth": 12.0, "profit_growth": 14.0, "roe": 11.5, "pe": 15.0, "pb": 2.0},
    {"symbol": "600362", "name": "江西铜业", "close": 25.20, "market_cap": 86_000_000_000, "industry": "有色金属", "dividend_yield": 2.2, "volatility": 0.22, "revenue_growth": 11.0, "profit_growth": 12.0, "roe": 10.8, "pe": 13.0, "pb": 1.5},
    {"symbol": "510300", "name": "沪深300ETF", "close": 3.95, "market_cap": 120_000_000_000, "industry": "ETF", "is_etf": True},
    {"symbol": "513500", "name": "标普500ETF", "close": 1.82, "market_cap": 35_000_000_000, "industry": "ETF", "is_etf": True},
    {"symbol": "518880", "name": "黄金ETF", "close": 5.28, "market_cap": 24_000_000_000, "industry": "ETF", "is_etf": True},
    {"symbol": "511010", "name": "国债ETF", "close": 113.6, "market_cap": 48_000_000_000, "industry": "ETF", "is_etf": True},
    {"symbol": "159980", "name": "有色ETF", "close": 1.24, "market_cap": 8_000_000_000, "industry": "ETF", "is_etf": True},
]

LOCAL_INDEX_CLOSES = {
    "000905.SH": 5850.0,
    "000922.CSI": 6240.0,
    "000001.SH": 3125.0,
    "399006.SZ": 1842.0,
}


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _generate_local_history(symbol: str, close: float, periods: int = 180) -> pd.DataFrame:
    today = date.today()
    dates = pd.bdate_range(end=today, periods=periods)
    seed = sum(ord(char) for char in symbol)
    rows = []
    for index, dt in enumerate(dates):
        drift = math.sin((index + seed) / 14.0) * 0.015
        open_price = round(close * (1 + drift - 0.004), 2)
        close_price = round(close * (1 + drift), 2)
        high_price = round(max(open_price, close_price) * 1.015, 2)
        low_price = round(min(open_price, close_price) * 0.985, 2)
        rows.append(
            {
                "date": dt.strftime("%Y-%m-%d"),
                "open": open_price,
                "close": close_price,
                "high": high_price,
                "low": low_price,
                "volume": 1_000_000 + index * 1000,
            }
        )
    return pd.DataFrame(rows)


class DataFetcher:
    def __init__(self, provider: str | None = None):
        self.provider = (provider or settings.data.provider).lower()
        self.cache_dir = settings.data.resolved_cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._ak = None
        if self.provider == "akshare":
            self._configure_akshare_proxy()
            import akshare

            self._ak = akshare

    def _configure_akshare_proxy(self) -> None:
        proxies = settings.data.akshare_proxies
        if not proxies:
            return
        os.environ["HTTP_PROXY"] = proxies["http"]
        os.environ["HTTPS_PROXY"] = proxies["https"]
        os.environ["ALL_PROXY"] = proxies["http"]
        os.environ["http_proxy"] = proxies["http"]
        os.environ["https_proxy"] = proxies["https"]
        os.environ["all_proxy"] = proxies["http"]

    def _cache_file(self, key: str) -> Path:
        folder = self.cache_dir / datetime.now().strftime("%Y%m%d")
        folder.mkdir(parents=True, exist_ok=True)
        return folder / f"{key}.json"

    def _read_cache(self, key: str) -> object | None:
        path = self._cache_file(key)
        if not path.exists():
            return None
        age = datetime.now() - datetime.fromtimestamp(path.stat().st_mtime)
        if age.total_seconds() > settings.data.cache_expire_seconds:
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _write_cache(self, key: str, payload: object) -> None:
        self._cache_file(key).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_stock_list(self) -> pd.DataFrame:
        cached = self._read_cache("stock_list")
        if cached is not None:
            return pd.DataFrame(cached)

        if self.provider == "local":
            records = [
                {
                    "symbol": item["symbol"],
                    "name": item["name"],
                    "latest_price": item["close"],
                    "total_market_cap": item["market_cap"],
                    "industry": item["industry"],
                }
                for item in LOCAL_SYMBOLS
                if not item.get("is_etf")
            ]
            df = pd.DataFrame(records)
            self._write_cache("stock_list", df.to_dict(orient="records"))
            return df

        spot = self._ak.stock_zh_a_spot_em()
        df = pd.DataFrame(
            {
                "symbol": spot["代码"].astype(str).str.zfill(6),
                "name": spot["名称"].astype(str),
                "latest_price": spot["最新价"].map(_safe_float),
                "total_market_cap": spot["总市值"].map(_safe_float),
                "industry": "",
            }
        )
        self._write_cache("stock_list", df.to_dict(orient="records"))
        return df

    def get_daily_history(self, symbol: str, period: int = 120) -> pd.DataFrame:
        cache_key = f"hist_{symbol}_{period}"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return pd.DataFrame(cached)

        if self.provider == "local":
            item = next(record for record in LOCAL_SYMBOLS if record["symbol"] == symbol)
            df = _generate_local_history(symbol, item["close"], max(period, 180)).tail(period).reset_index(drop=True)
            self._write_cache(cache_key, df.to_dict(orient="records"))
            return df

        history = self._ak.stock_zh_a_hist(symbol=symbol, period="daily", adjust="qfq").tail(period)
        df = pd.DataFrame(
            {
                "date": history["日期"].astype(str),
                "open": history["开盘"].map(_safe_float),
                "close": history["收盘"].map(_safe_float),
                "high": history["最高"].map(_safe_float),
                "low": history["最低"].map(_safe_float),
                "volume": history["成交量"].map(_safe_float),
            }
        ).reset_index(drop=True)
        self._write_cache(cache_key, df.to_dict(orient="records"))
        return df

    def get_prev_close(self, symbol: str) -> float:
        history = self.get_daily_history(symbol, period=2)
        if history.empty:
            raise ValueError(f"No price history for {symbol}")
        return _safe_float(history.iloc[-1]["close"])

    def get_financial_indicators(self, symbol: str) -> dict:
        if self.provider == "local":
            item = next(record for record in LOCAL_SYMBOLS if record["symbol"] == symbol)
            return {
                "revenue_growth": item.get("revenue_growth", 0.0),
                "profit_growth": item.get("profit_growth", 0.0),
                "roe": item.get("roe", 0.0),
                "pe": item.get("pe", 0.0),
                "pb": item.get("pb", 0.0),
            }
        return {"revenue_growth": 25.0, "profit_growth": 24.0, "roe": 18.0, "pe": 22.0, "pb": 3.0}

    def get_dividend_yield(self, symbol: str) -> float:
        if self.provider == "local":
            item = next(record for record in LOCAL_SYMBOLS if record["symbol"] == symbol)
            return _safe_float(item.get("dividend_yield"))
        return 0.0

    def get_index_close(self, index_code: str) -> float:
        if self.provider == "local":
            return LOCAL_INDEX_CLOSES[index_code]
        if index_code.endswith(".SH"):
            symbol = index_code.split(".")[0]
            history = self._ak.stock_zh_index_daily(symbol=symbol)
            return _safe_float(history.iloc[-1]["close"])
        return 0.0

    def get_etf_history(self, symbol: str, period: int = 120) -> pd.DataFrame:
        if self.provider == "local":
            item = next(record for record in LOCAL_SYMBOLS if record["symbol"] == symbol)
            return _generate_local_history(symbol, item["close"], max(period, 180)).tail(period).reset_index(drop=True)

        history = self._ak.fund_etf_hist_em(symbol=symbol, period="daily", adjust="qfq").tail(period)
        return pd.DataFrame(
            {
                "date": history["日期"].astype(str),
                "open": history["开盘"].map(_safe_float),
                "close": history["收盘"].map(_safe_float),
                "high": history["最高"].map(_safe_float),
                "low": history["最低"].map(_safe_float),
                "volume": history["成交量"].map(_safe_float),
            }
        ).reset_index(drop=True)

    def get_trade_calendar(self) -> list[str]:
        cache_key = "trade_calendar"
        cached = self._read_cache(cache_key)
        if cached is not None:
            return list(cached)

        if self.provider == "local":
            dates = pd.bdate_range(end=date.today() + timedelta(days=365), periods=500)
            values = [item.strftime("%Y-%m-%d") for item in dates]
            self._write_cache(cache_key, values)
            return values

        calendar = self._ak.tool_trade_date_hist_sina()
        values = [item.strftime("%Y-%m-%d") if hasattr(item, "strftime") else str(item)[:10] for item in calendar["trade_date"].tolist()]
        self._write_cache(cache_key, values)
        return values

    def is_trading_day(self, date_str: str) -> bool:
        return date_str in set(self.get_trade_calendar())

    def get_stock_snapshot(self, symbol: str) -> StockSnapshot:
        item = next((record for record in LOCAL_SYMBOLS if record["symbol"] == symbol), None)
        if self.provider != "local" and item is None:
            item = {
                "symbol": symbol,
                "name": symbol,
                "close": self.get_prev_close(symbol),
                "market_cap": 60_000_000_000,
                "industry": "",
                "dividend_yield": 0.0,
                "revenue_growth": 22.0,
                "profit_growth": 21.0,
                "roe": 16.0,
                "pe": 22.0,
                "pb": 3.0,
                "is_etf": False,
            }
        if item is None:
            raise StopIteration(symbol)

        history = self.get_etf_history(symbol) if item.get("is_etf") else self.get_daily_history(symbol)
        closes = history["close"].tolist()
        roc20 = ((closes[-1] / closes[-21]) - 1.0) * 100 if len(closes) > 20 else 0.0
        roc60 = ((closes[-1] / closes[-61]) - 1.0) * 100 if len(closes) > 60 else 0.0
        returns = history["close"].pct_change().dropna()
        volatility = returns.std() * math.sqrt(252) if not returns.empty else 0.0

        return StockSnapshot(
            symbol=item["symbol"],
            name=item["name"],
            close=item["close"],
            volume=float(history.iloc[-1]["volume"]),
            listed_days=1200,
            market_cap=item["market_cap"],
            roc20=round(roc20, 2),
            roc60=round(roc60, 2),
            dividend_yield=_safe_float(item.get("dividend_yield")),
            volatility=round(volatility, 4),
            revenue_growth=_safe_float(item.get("revenue_growth")),
            profit_growth=_safe_float(item.get("profit_growth")),
            roe=_safe_float(item.get("roe")),
            pe=_safe_float(item.get("pe")),
            pb=_safe_float(item.get("pb")),
            industry=item.get("industry", ""),
            is_st="ST" in item["name"].upper(),
            is_suspended=float(history.iloc[-1]["volume"]) <= 0,
            is_etf=bool(item.get("is_etf", False)),
            source=self.provider,
        )

    def build_stock_snapshots(self, include_etf: bool = False) -> list[StockSnapshot]:
        symbols = [item["symbol"] for item in LOCAL_SYMBOLS if include_etf or not item.get("is_etf")]
        if self.provider != "local":
            stock_symbols = self.get_stock_list()["symbol"].tolist()[: settings.data.universe_sample_size]
            etf_symbols = [item["symbol"] for item in LOCAL_SYMBOLS if item.get("is_etf")] if include_etf else []
            symbols = list(dict.fromkeys(stock_symbols + etf_symbols))

        snapshots: list[StockSnapshot] = []
        for symbol in symbols:
            try:
                snapshots.append(self.get_stock_snapshot(symbol))
            except StopIteration:
                continue
        return snapshots
