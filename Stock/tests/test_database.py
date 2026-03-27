from datetime import date

from database.operations import (
    DEFAULT_STRATEGIES,
    create_session_factory,
    get_latest_nav,
    get_positions_by_strategy,
    get_transactions_by_strategy,
    init_database,
    list_strategy_statuses,
)
from engine.daily_runner import run_daily


def test_init_database_seeds_default_strategies(tmp_path):
    db_path = tmp_path / "portfolio.db"
    init_database(db_path)
    session_factory = create_session_factory(db_path)

    with session_factory() as session:
        statuses = list_strategy_statuses(session)

    assert len(statuses) == len(DEFAULT_STRATEGIES)
    assert {status.name for status in statuses} == {item["name"] for item in DEFAULT_STRATEGIES}


def test_daily_run_creates_positions_transactions_and_nav(tmp_path):
    db_path = tmp_path / "execution.db"
    init_database(db_path)
    run_daily(provider="local", trade_date=date(2026, 3, 2), db_path=db_path)
    session_factory = create_session_factory(db_path)

    with session_factory() as session:
        positions = get_positions_by_strategy(session, 1)
        transactions = get_transactions_by_strategy(session, 1)
        nav = get_latest_nav(session, 1)

    assert positions
    assert any(item.action == "BUY" for item in transactions)
    assert nav is not None
    assert nav.total_nav > 0
