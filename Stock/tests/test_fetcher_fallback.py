from datetime import date

import akshare
import requests

from config.settings import settings
from data.fetcher import DataFetcher, LOCAL_SYMBOLS
from database.operations import init_database
from engine.daily_runner import run_daily


def _raise_request_exception(*args, **kwargs):
    raise requests.RequestException("eastmoney unavailable")


def test_akshare_stock_list_falls_back_to_local_sample(tmp_path, monkeypatch):
    monkeypatch.setattr(settings.data, "cache_dir", str(tmp_path / "cache"))
    monkeypatch.setattr(settings.data, "akshare_proxy_url", "")
    fetcher = DataFetcher("akshare")
    monkeypatch.setattr(fetcher._ak, "stock_zh_a_spot_em", _raise_request_exception)

    df = fetcher.get_stock_list()

    assert not df.empty
    assert df["symbol"].tolist()[:3] == [item["symbol"] for item in LOCAL_SYMBOLS if not item.get("is_etf")][:3]


def test_daily_runner_akshare_uses_fallback_samples_when_network_fails(tmp_path, monkeypatch):
    db_path = tmp_path / "fallback_daily.db"
    monkeypatch.setattr(settings.data, "cache_dir", str(tmp_path / "cache"))
    monkeypatch.setattr(settings.data, "akshare_proxy_url", "")
    init_database(db_path)

    monkeypatch.setattr(akshare, "stock_zh_a_spot_em", _raise_request_exception)
    monkeypatch.setattr(akshare, "stock_zh_a_hist", _raise_request_exception)
    monkeypatch.setattr(akshare, "stock_zh_index_daily", _raise_request_exception)
    monkeypatch.setattr(akshare, "fund_etf_hist_em", _raise_request_exception)
    monkeypatch.setattr(akshare, "tool_trade_date_hist_sina", _raise_request_exception)

    result = run_daily(provider="akshare", trade_date=date(2026, 3, 2), db_path=db_path)

    assert result["is_trading_day"] is True
    assert len(result["strategies"]) == 5
    assert any(item["executions"] for item in result["strategies"])
