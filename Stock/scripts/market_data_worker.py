"""
Deployment helper that runs the canonical daily workflow on schedule.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, time as dt_time, timedelta
import os


def _next_run(target: str) -> datetime:
    hour, minute = [int(part) for part in target.split(":", 1)]
    now = datetime.now()
    scheduled = datetime.combine(now.date(), dt_time(hour=hour, minute=minute))
    if scheduled <= now:
        scheduled += timedelta(days=1)
    return scheduled


def _run_once(provider: str) -> None:
    result = subprocess.run(
        [sys.executable, "main.py", "--run", "daily", "--provider", provider],
        check=True,
        capture_output=True,
        text=True,
    )
    print(result.stdout)


def main() -> None:
    provider = os.getenv("MARKET_WORKER_PROVIDER", os.getenv("DATA_PROVIDER", "akshare"))
    schedule_time = os.getenv("MARKET_UPDATE_TIME", "15:35")
    run_immediately = os.getenv("MARKET_RUN_IMMEDIATELY", "true").lower() in {"1", "true", "yes", "on"}

    if run_immediately:
        _run_once(provider)

    while True:
        next_run = _next_run(schedule_time)
        wait_seconds = max((next_run - datetime.now()).total_seconds(), 0)
        print(json.dumps({"next_run": next_run.isoformat(), "wait_seconds": wait_seconds}, ensure_ascii=False))
        __import__("time").sleep(wait_seconds)
        _run_once(provider)


if __name__ == "__main__":
    main()
