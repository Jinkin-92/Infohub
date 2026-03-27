from types import SimpleNamespace

import pandas as pd

from data.fetcher import DataFetcher


class _ProxyPool:
    def __init__(self):
        self.data = []


class _FetcherStub:
    def __init__(self):
        self.proxies = None
        self.session = SimpleNamespace(trust_env=True)


def test_instock_provider_reads_selection_and_history(monkeypatch, tmp_path):
    selection_fetcher = _FetcherStub()
    stock_hist_fetcher = _FetcherStub()
    etf_fetcher = _FetcherStub()

    modules = {
        "instock.core.crawling.stock_selection": SimpleNamespace(
            fetcher=selection_fetcher,
            stock_selection=lambda: pd.DataFrame(
                [
                    {
                        "SECURITY_CODE": "600036",
                        "SECURITY_NAME_ABBR": "招商银行",
                        "NEW_PRICE": 34.1,
                        "TOTAL_MARKET_CAP": 950_000_000_000,
                        "INDUSTRY": "银行",
                    }
                ]
            ),
        ),
        "instock.core.crawling.stock_hist_em": SimpleNamespace(
            fetcher=stock_hist_fetcher,
            stock_zh_a_hist=lambda **kwargs: pd.DataFrame(
                [
                    {"日期": "2026-03-25", "开盘": 33.8, "收盘": 34.0, "最高": 34.2, "最低": 33.7, "成交量": 1000},
                    {"日期": "2026-03-26", "开盘": 34.0, "收盘": 34.1, "最高": 34.3, "最低": 33.9, "成交量": 1100},
                ]
            ),
        ),
        "instock.core.crawling.fund_etf_em": SimpleNamespace(
            fetcher=etf_fetcher,
            fund_etf_hist_em=lambda **kwargs: pd.DataFrame(
                [
                    {"日期": "2026-03-25", "开盘": 3.9, "收盘": 3.94, "最高": 3.95, "最低": 3.88, "成交量": 2000},
                    {"日期": "2026-03-26", "开盘": 3.94, "收盘": 3.95, "最高": 3.96, "最低": 3.92, "成交量": 2100},
                ]
            ),
        ),
        "instock.core.crawling.trade_date_hist": SimpleNamespace(
            tool_trade_date_hist_sina=lambda: pd.DataFrame([{"trade_date": "2026-03-26"}, {"trade_date": "2026-03-27"}])
        ),
        "instock.core.singleton_proxy": SimpleNamespace(proxys=lambda: _ProxyPool()),
    }

    monkeypatch.setattr("data.fetcher.importlib.import_module", lambda name: modules[name])
    monkeypatch.setattr("data.fetcher.settings.data.instock_project_path", str(tmp_path))
    monkeypatch.setattr("data.fetcher.settings.data.cache_dir", str(tmp_path / "cache"))

    fetcher = DataFetcher("instock")
    stock_list = fetcher.get_stock_list()
    history = fetcher.get_daily_history("600036", period=2)
    etf_history = fetcher.get_etf_history("510300", period=2)
    calendar = fetcher.get_trade_calendar()

    assert stock_list.iloc[0]["name"] == "招商银行"
    assert history.iloc[-1]["close"] == 34.1
    assert etf_history.iloc[-1]["close"] == 3.95
    assert calendar[-1] == "2026-03-27"
