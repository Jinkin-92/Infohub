"""
Compatibility wrappers for strategy-agent style entrypoints.

The production path is `engine.daily_runner.run_daily`.
"""

from __future__ import annotations

import asyncio

from engine.daily_runner import run_daily


async def run_strategy_agent(
    strategy_name: str = "momentum",
    provider_name: str | None = None,
    market_db_path=None,
    state_db_path=None,
    decision_db_path=None,
) -> dict:
    result = await asyncio.to_thread(run_daily, provider_name, None, False, state_db_path)
    strategy_result = next((item for item in result["strategies"] if item["strategy"] == strategy_name), None)
    if strategy_result is None:
        raise RuntimeError(f"Strategy '{strategy_name}' not found in daily run result.")
    executions = [item for item in strategy_result.get("executions", []) if item.get("action") in {"BUY", "SELL"}]
    return {
        "provider": provider_name or "default",
        "strategy": strategy_name,
        "signal_count": strategy_result.get("signal_count", 0),
        "execution": {
            "executed_signal_count": len(executions),
            "executions": strategy_result.get("executions", []),
        },
        "daily": result,
    }


async def run_all_strategies(
    provider_name: str | None = None,
    market_db_path=None,
    state_db_path=None,
    decision_db_path=None,
) -> dict:
    result = await asyncio.to_thread(run_daily, provider_name, None, False, state_db_path)
    return {
        "provider": provider_name or "default",
        "strategy_count": len(result.get("strategies", [])),
        "strategies": [item["strategy"] for item in result.get("strategies", [])],
        "daily": result,
    }
