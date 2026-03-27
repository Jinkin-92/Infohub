"""
JSON-backed repository helpers for the runnable project slice.

The repo keeps SQLAlchemy models for the future database layer, but the
runtime storage here uses JSON because SQLite file writes fail in the
current execution environment.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
import json
import math

from config.runtime_settings import settings


DEFAULT_STRATEGIES = [
    {
        "id": 1,
        "name": "momentum",
        "display_name": "量化动量",
        "description": "基于市场快照的简化动量策略。",
        "benchmark": "000905.SH",
        "rebalance_frequency": "monthly",
        "initial_capital": 200000.0,
        "is_active": True,
    },
    {
        "id": 2,
        "name": "dividend_lowvol",
        "display_name": "红利低波",
        "description": "预留策略占位。",
        "benchmark": "000922.CSI",
        "rebalance_frequency": "quarterly",
        "initial_capital": 200000.0,
        "is_active": True,
    },
    {
        "id": 3,
        "name": "global_alloc",
        "display_name": "全球资产配置",
        "description": "预留策略占位。",
        "benchmark": "balanced",
        "rebalance_frequency": "monthly",
        "initial_capital": 200000.0,
        "is_active": True,
    },
    {
        "id": 4,
        "name": "high_growth",
        "display_name": "高成长",
        "description": "预留策略占位。",
        "benchmark": "399006.SZ",
        "rebalance_frequency": "monthly",
        "initial_capital": 200000.0,
        "is_active": True,
    },
    {
        "id": 5,
        "name": "personal",
        "display_name": "中国版永久组合",
        "description": "预留策略占位。",
        "benchmark": "custom",
        "rebalance_frequency": "dynamic",
        "initial_capital": 200000.0,
        "is_active": True,
    },
]


@dataclass(slots=True)
class StrategyStatus:
    name: str
    display_name: str
    cash: float
    position_count: int
    signal_count: int


def get_state_path(db_path: Path | None = None) -> Path:
    resolved = db_path or settings.db.resolved_path
    if resolved.suffix:
        return resolved.with_suffix(".json")
    return resolved.parent / f"{resolved.name}.json"


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_state() -> dict:
    timestamp = _timestamp()
    strategies = []
    portfolios = []
    for strategy in DEFAULT_STRATEGIES:
        strategy_payload = dict(strategy)
        strategy_payload["created_at"] = timestamp
        strategies.append(strategy_payload)
        portfolios.append(
            {
                "strategy_id": strategy["id"],
                "cash": strategy["initial_capital"],
                "last_updated": timestamp,
            }
        )

    return {
        "strategies": strategies,
        "portfolios": portfolios,
        "positions": [],
        "signals": [],
        "transactions": [],
        "daily_nav": [],
    }


def _ensure_state_shape(state: dict) -> dict:
    state.setdefault("strategies", [])
    state.setdefault("portfolios", [])
    state.setdefault("positions", [])
    state.setdefault("signals", [])
    state.setdefault("transactions", [])
    state.setdefault("daily_nav", [])
    return state


def load_state(db_path: Path | None = None) -> dict:
    state_path = get_state_path(db_path)
    if not state_path.exists():
        return _default_state()
    state = json.loads(state_path.read_text(encoding="utf-8"))
    return _ensure_state_shape(state)


def save_state(state: dict, db_path: Path | None = None) -> None:
    state_path = get_state_path(db_path)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(_ensure_state_shape(state), ensure_ascii=False, indent=2), encoding="utf-8")


def init_database(db_path: Path | None = None) -> Path:
    state = load_state(db_path)
    if state["strategies"]:
        save_state(state, db_path)
        return get_state_path(db_path)

    save_state(_default_state(), db_path)
    return get_state_path(db_path)


def list_strategy_statuses(db_path: Path | None = None) -> list[StrategyStatus]:
    state = load_state(db_path)
    positions = state["positions"]
    signals = state["signals"]
    portfolios = {item["strategy_id"]: item for item in state["portfolios"]}

    results: list[StrategyStatus] = []
    for strategy in state["strategies"]:
        strategy_id = strategy["id"]
        results.append(
            StrategyStatus(
                name=strategy["name"],
                display_name=strategy["display_name"],
                cash=portfolios.get(strategy_id, {}).get("cash", 0.0),
                position_count=len([item for item in positions if item["strategy_id"] == strategy_id]),
                signal_count=len(
                    [item for item in signals if item["strategy_id"] == strategy_id and not item.get("executed", False)]
                ),
            )
        )
    return results


def get_strategy_by_name(strategy_name: str, db_path: Path | None = None) -> dict | None:
    state = load_state(db_path)
    return next((item for item in state["strategies"] if item["name"] == strategy_name), None)


def get_active_strategies(db_path: Path | None = None) -> list[dict]:
    state = load_state(db_path)
    return [item for item in state["strategies"] if item.get("is_active", True)]


def get_positions_by_strategy(strategy_id: int, db_path: Path | None = None) -> list[dict]:
    state = load_state(db_path)
    return [item for item in state["positions"] if item["strategy_id"] == strategy_id]


def get_signals_by_strategy(strategy_id: int, db_path: Path | None = None) -> list[dict]:
    state = load_state(db_path)
    return [item for item in state["signals"] if item["strategy_id"] == strategy_id]


def get_transactions_by_strategy(strategy_id: int, db_path: Path | None = None) -> list[dict]:
    state = load_state(db_path)
    return [item for item in state["transactions"] if item["strategy_id"] == strategy_id]


def get_latest_nav(strategy_id: int, db_path: Path | None = None) -> dict | None:
    state = load_state(db_path)
    entries = [item for item in state["daily_nav"] if item["strategy_id"] == strategy_id]
    return entries[-1] if entries else None


def _next_id(items: list[dict]) -> int:
    return max((item.get("id", 0) for item in items), default=0) + 1


def replace_strategy_signals(strategy_id: int, new_signals: list[dict], db_path: Path | None = None) -> list[dict]:
    state = load_state(db_path)
    retained_signals = [
        item
        for item in state["signals"]
        if not (item["strategy_id"] == strategy_id and not item.get("executed", False))
    ]

    next_id = _next_id(retained_signals)
    created: list[dict] = []
    now = _timestamp()
    for signal_data in new_signals:
        payload = {
            "id": next_id,
            "strategy_id": strategy_id,
            "generated_at": now,
            "executed": False,
            "executed_at": None,
            "executed_price": None,
            **signal_data,
        }
        next_id += 1
        created.append(payload)

    state["signals"] = retained_signals + created
    save_state(state, db_path)
    return created


def execute_strategy_signals(
    strategy_id: int,
    price_lookup: dict[str, float],
    db_path: Path | None = None,
) -> dict:
    state = load_state(db_path)
    strategy = next(item for item in state["strategies"] if item["id"] == strategy_id)
    portfolio = next(item for item in state["portfolios"] if item["strategy_id"] == strategy_id)
    executed_at = _timestamp()
    open_signals = [item for item in state["signals"] if item["strategy_id"] == strategy_id and not item.get("executed")]
    strategy_positions = [item for item in state["positions"] if item["strategy_id"] == strategy_id]
    position_by_symbol = {item["symbol"]: item for item in strategy_positions}
    transaction_id = _next_id(state["transactions"])

    buy_signals = [item for item in open_signals if item["signal_type"] == "BUY"]
    sell_signals = [item for item in open_signals if item["signal_type"] == "SELL"]

    buy_count = 0
    sell_count = 0

    for signal in sell_signals:
        position = position_by_symbol.get(signal["symbol"])
        if position is None:
            signal["executed"] = True
            signal["executed_at"] = executed_at
            signal["executed_price"] = None
            signal["execution_note"] = "position_not_found"
            continue

        executed_price = float(price_lookup.get(signal["symbol"], signal.get("ref_price") or position["avg_cost"]))
        shares = int(position["shares"])
        amount = round(executed_price * shares, 2)
        portfolio["cash"] = round(portfolio["cash"] + amount, 2)
        portfolio["last_updated"] = executed_at

        state["positions"] = [
            item
            for item in state["positions"]
            if not (item["strategy_id"] == strategy_id and item["symbol"] == signal["symbol"])
        ]
        position_by_symbol.pop(signal["symbol"], None)

        state["transactions"].append(
            {
                "id": transaction_id,
                "strategy_id": strategy_id,
                "symbol": signal["symbol"],
                "name": signal["name"],
                "action": "SELL",
                "shares": shares,
                "price": executed_price,
                "amount": amount,
                "net_amount": amount,
                "trade_date": executed_at,
                "reason": signal["reason"],
            }
        )
        transaction_id += 1

        signal["executed"] = True
        signal["executed_at"] = executed_at
        signal["executed_price"] = executed_price
        signal["target_shares"] = 0
        sell_count += 1

    for index, signal in enumerate(buy_signals):
        if signal["symbol"] in position_by_symbol:
            signal["executed"] = True
            signal["executed_at"] = executed_at
            signal["executed_price"] = None
            signal["execution_note"] = "position_already_exists"
            continue

        executed_price = float(price_lookup.get(signal["symbol"], signal["ref_price"]))
        remaining_slots = max(len(buy_signals) - index, 1)
        budget = portfolio["cash"] / remaining_slots
        raw_shares = signal.get("target_shares")
        if raw_shares is None:
            raw_shares = math.floor(budget / executed_price / 100) * 100

        shares = int(raw_shares)
        if shares <= 0:
            signal["executed"] = True
            signal["executed_at"] = executed_at
            signal["executed_price"] = executed_price
            signal["target_shares"] = 0
            signal["execution_note"] = "insufficient_cash"
            continue

        amount = round(executed_price * shares, 2)
        portfolio["cash"] = round(portfolio["cash"] - amount, 2)
        portfolio["last_updated"] = executed_at

        position = {
            "strategy_id": strategy_id,
            "symbol": signal["symbol"],
            "name": signal["name"],
            "shares": shares,
            "avg_cost": executed_price,
            "buy_date": executed_at,
            "can_sell_date": executed_at,
            "last_price": executed_price,
        }
        state["positions"].append(position)
        position_by_symbol[signal["symbol"]] = position

        state["transactions"].append(
            {
                "id": transaction_id,
                "strategy_id": strategy_id,
                "symbol": signal["symbol"],
                "name": signal["name"],
                "action": "BUY",
                "shares": shares,
                "price": executed_price,
                "amount": amount,
                "net_amount": amount,
                "trade_date": executed_at,
                "reason": signal["reason"],
            }
        )
        transaction_id += 1

        signal["executed"] = True
        signal["executed_at"] = executed_at
        signal["executed_price"] = executed_price
        signal["target_shares"] = shares
        buy_count += 1

    market_value = 0.0
    active_positions = []
    for position in state["positions"]:
        if position["strategy_id"] != strategy_id:
            continue
        last_price = float(price_lookup.get(position["symbol"], position.get("last_price", position["avg_cost"])))
        position["last_price"] = last_price
        market_value += round(position["shares"] * last_price, 2)
        active_positions.append(position)

    total_nav = round(portfolio["cash"] + market_value, 2)
    nav_record = {
        "strategy_id": strategy_id,
        "date": executed_at[:10],
        "total_nav": total_nav,
        "cash": round(portfolio["cash"], 2),
        "stock_value": round(market_value, 2),
        "position_count": len(active_positions),
        "updated_at": executed_at,
    }
    state["daily_nav"] = [
        item
        for item in state["daily_nav"]
        if not (item["strategy_id"] == strategy_id and item["date"] == nav_record["date"])
    ]
    state["daily_nav"].append(nav_record)

    save_state(state, db_path)
    return {
        "strategy": strategy["name"],
        "executed_at": executed_at,
        "executed_signal_count": buy_count + sell_count,
        "buy_count": buy_count,
        "sell_count": sell_count,
        "transaction_count": len(
            [item for item in state["transactions"] if item["strategy_id"] == strategy_id and item["trade_date"] == executed_at]
        ),
        "cash": round(portfolio["cash"], 2),
        "position_count": len(active_positions),
        "total_nav": total_nav,
    }


def serialize_statuses(statuses: list[StrategyStatus]) -> list[dict]:
    return [asdict(status) for status in statuses]
