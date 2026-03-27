"""
Compatibility wrapper for market update checks.

The production path reads directly via `DataFetcher` during the daily run.
"""

from __future__ import annotations

import asyncio

from data.fetcher import DataFetcher


async def update_market_database(provider_name: str | None = None, market_db_path=None) -> dict:
    fetcher = DataFetcher(provider_name)
    snapshots = await asyncio.to_thread(fetcher.build_stock_snapshots, True)
    return {
        "provider": fetcher.provider,
        "snapshot_count": len(snapshots),
        "market_db_path": str(market_db_path) if market_db_path else None,
    }
