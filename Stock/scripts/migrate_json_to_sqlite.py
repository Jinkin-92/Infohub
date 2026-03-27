"""
One-off migration helper from legacy JSON stores to SQLite.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete, select

from database.models import DailyNav, Portfolio, Position, Signal, Strategy, Transaction
from database.operations import create_session_factory, init_database


def _strategy_name_map(payload: dict) -> dict[int, str]:
    return {item["id"]: item["name"] for item in payload.get("strategies", []) if "id" in item and "name" in item}


def main() -> None:
    db_path = init_database()
    json_path = Path("data/portfolio.json")
    if not json_path.exists():
        print("No portfolio.json found, skipping.")
        return

    payload = json.loads(json_path.read_text(encoding="utf-8"))
    legacy_map = _strategy_name_map(payload)
    session_factory = create_session_factory(db_path)

    with session_factory() as session:
        sqlite_map = {item.name: item for item in session.scalars(select(Strategy)).all()}
        id_map = {legacy_id: sqlite_map[name].id for legacy_id, name in legacy_map.items() if name in sqlite_map}

        session.execute(delete(Position))
        session.execute(delete(Transaction))
        session.execute(delete(DailyNav))
        session.execute(delete(Signal))

        for record in payload.get("portfolios", []):
            strategy_id = id_map.get(record.get("strategy_id"))
            if strategy_id is None:
                continue
            portfolio = session.scalar(select(Portfolio).where(Portfolio.strategy_id == strategy_id))
            if portfolio is not None:
                portfolio.cash = float(record.get("cash", portfolio.cash))
                portfolio.last_updated = record.get("last_updated")

        for record in payload.get("positions", []):
            strategy_id = id_map.get(record.get("strategy_id"))
            if strategy_id is None:
                continue
            session.add(
                Position(
                    strategy_id=strategy_id,
                    symbol=record["symbol"],
                    name=record.get("name"),
                    shares=int(record.get("shares", 0)),
                    avg_cost=float(record.get("avg_cost", 0.0)),
                    buy_date=record.get("buy_date", "1970-01-01"),
                    can_sell_date=record.get("can_sell_date", record.get("buy_date", "1970-01-01")),
                    is_etf=bool(record.get("is_etf", False)),
                )
            )

        for record in payload.get("transactions", []):
            strategy_id = id_map.get(record.get("strategy_id"))
            if strategy_id is None:
                continue
            session.add(
                Transaction(
                    strategy_id=strategy_id,
                    symbol=record["symbol"],
                    name=record.get("name"),
                    action=record["action"],
                    shares=int(record.get("shares", 0)),
                    price=float(record.get("price", 0.0)),
                    amount=float(record.get("amount", 0.0)),
                    commission=float(record.get("commission", 0.0)),
                    stamp_duty=float(record.get("stamp_duty", 0.0)),
                    transfer_fee=float(record.get("transfer_fee", 0.0)),
                    net_amount=float(record.get("net_amount", record.get("amount", 0.0))),
                    trade_date=record.get("trade_date", "1970-01-01"),
                    reason=record.get("reason"),
                )
            )

        for record in payload.get("daily_nav", []):
            strategy_id = id_map.get(record.get("strategy_id"))
            if strategy_id is None:
                continue
            session.add(
                DailyNav(
                    strategy_id=strategy_id,
                    date=record["date"],
                    total_nav=float(record.get("total_nav", 0.0)),
                    cash=float(record.get("cash", 0.0)),
                    stock_value=float(record.get("stock_value", 0.0)),
                    daily_return_pct=record.get("daily_return_pct"),
                    cumulative_return_pct=record.get("cumulative_return_pct"),
                    benchmark_return_pct=record.get("benchmark_return_pct"),
                )
            )

        for record in payload.get("signals", []):
            strategy_id = id_map.get(record.get("strategy_id"))
            if strategy_id is None:
                continue
            session.add(
                Signal(
                    strategy_id=strategy_id,
                    symbol=record["symbol"],
                    name=record.get("name"),
                    signal_type=record["signal_type"],
                    ref_price=record.get("ref_price"),
                    target_shares=record.get("target_shares"),
                    reason=record.get("reason"),
                    executed=bool(record.get("executed", False)),
                )
            )

        session.commit()

    print(f"Migrated portfolio.json into {db_path}")
    print("Note: legacy market_data.json and agent_decisions.json are not part of the canonical SQLite schema and were not imported.")


if __name__ == "__main__":
    main()
