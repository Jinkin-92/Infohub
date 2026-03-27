"""
Universe filtering and position risk inspection helpers.
"""

from __future__ import annotations

from data.fetcher import StockSnapshot


def apply_base_filters(snapshots: list[StockSnapshot]) -> list[StockSnapshot]:
    results: list[StockSnapshot] = []
    for snapshot in snapshots:
        if snapshot.is_st or snapshot.is_suspended:
            continue
        if not snapshot.is_etf and snapshot.close < 2.0:
            continue
        if snapshot.volume <= 0:
            continue
        results.append(snapshot)
    return results


def filter_for_strategy(strategy_name: str, snapshots: list[StockSnapshot]) -> list[StockSnapshot]:
    if strategy_name == "global_alloc":
        return [item for item in snapshots if item.is_etf]

    min_days = 365
    if strategy_name == "dividend_lowvol":
        min_days = 730

    results = apply_base_filters([item for item in snapshots if not item.is_etf])
    return [item for item in results if item.listed_days >= min_days]


def filter_a_share_universe(snapshots: list[StockSnapshot]) -> list[StockSnapshot]:
    """
    Compatibility shim for older tests and callers.
    """

    return filter_for_strategy("momentum", snapshots)


def inspect_position_risks(
    strategy_name: str,
    positions: list[dict],
    snapshot_map: dict[str, StockSnapshot],
) -> list[dict]:
    alerts: list[dict] = []
    for position in positions:
        snapshot = snapshot_map.get(position["symbol"])
        if snapshot is None:
            continue
        if snapshot.is_suspended:
            alerts.append({"symbol": snapshot.symbol, "reason": "suspended", "action": "hold"})
        if snapshot.is_st:
            alerts.append({"symbol": snapshot.symbol, "reason": "st_flag", "action": "sell"})
        if not snapshot.is_etf and snapshot.close < 2.0:
            alerts.append({"symbol": snapshot.symbol, "reason": "below_min_price", "action": "sell"})
    return alerts
