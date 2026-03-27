"""
Simple performance analysis helpers.
"""

from __future__ import annotations


def summarize_strategy_performance(rows: list[dict]) -> list[dict]:
    results = []
    for item in rows:
        nav = item.get("nav", {})
        executions = item.get("executions", [])
        results.append(
            {
                "strategy": item["strategy"],
                "display_name": item["display_name"],
                "total_nav": nav.get("total_nav", 0.0),
                "daily_return_pct": nav.get("daily_return_pct", 0.0) or 0.0,
                "cumulative_return_pct": nav.get("cumulative_return_pct", 0.0) or 0.0,
                "trade_count": len([record for record in executions if record.get("action") in {"BUY", "SELL"}]),
            }
        )
    return results
