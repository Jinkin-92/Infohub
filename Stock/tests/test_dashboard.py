from datetime import date

from dashboard.monitor import build_dashboard_snapshot, format_datetime_shanghai
from database.operations import init_database
from engine.daily_runner import run_daily


def test_build_dashboard_snapshot_reads_sqlite_state(tmp_path):
    db_path = tmp_path / "dashboard.db"
    init_database(db_path)
    run_daily(provider="local", trade_date=date(2026, 3, 2), db_path=db_path)

    snapshot = build_dashboard_snapshot(db_path)

    assert snapshot["strategy_count"] == 5
    assert snapshot["total_cash"] >= 0
    assert snapshot["total_stock_value"] >= 0
    assert snapshot["overview_rows"]
    assert snapshot["overview_curve"]
    assert "data_source_summary" in snapshot
    assert "latest_run_provider" in snapshot
    assert "source_info" in snapshot
    assert "strategy_pages" in snapshot
    assert snapshot["strategy_pages"]["momentum"]["rule_text"]
    assert "数据库路径" in snapshot["source_info"]


def test_format_datetime_shanghai_converts_timezone():
    assert format_datetime_shanghai("2026-03-26T06:41:52.656989+00:00") == "2026-03-26 14:41:52"
