from database.operations import create_session_factory, get_strategy_by_name, init_database
from database.operations import replace_strategy_signals


if __name__ == "__main__":
    db_path = init_database()
    session_factory = create_session_factory(db_path)
    with session_factory() as session:
        strategy = get_strategy_by_name(session, "momentum")
        if strategy is not None:
            replace_strategy_signals(session, strategy.id, [])
            print(f"initialized positions for {strategy.name}")
