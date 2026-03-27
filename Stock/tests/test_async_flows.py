from datetime import date

from database.operations import create_session_factory, get_positions_by_strategy, get_transactions_by_strategy, init_database
from engine.daily_runner import run_daily


def test_daily_runner_local_completes_main_flow(tmp_path, monkeypatch):
    db_path = tmp_path / "daily.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    init_database(db_path)

    result = run_daily(provider="local", trade_date=date(2026, 3, 2), db_path=db_path)

    assert result["is_trading_day"] is True
    assert len(result["strategies"]) == 5

    session_factory = create_session_factory(db_path)
    with session_factory() as session:
        positions = get_positions_by_strategy(session, 1)
        transactions = get_transactions_by_strategy(session, 1)

    assert positions
    assert transactions
