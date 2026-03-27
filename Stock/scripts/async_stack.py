"""
Run both async workers together for local dogfooding.
"""

from __future__ import annotations

import asyncio

from scripts.market_data_worker import main as market_worker_main
from scripts.strategy_agent_worker import main as agent_worker_main


async def main() -> None:
    await asyncio.gather(
        market_worker_main(),
        agent_worker_main(),
    )


if __name__ == "__main__":
    asyncio.run(main())
