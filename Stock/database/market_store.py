"""
Persistent market-data store for provider snapshots.
"""

from __future__ import annotations

from pathlib import Path
import json
import os

from config.runtime_settings import settings


def get_market_db_path(path: Path | None = None) -> Path:
    if path is not None:
        resolved = path
    else:
        configured = Path(os.getenv("MARKET_DB_PATH", "data/market_data.json"))
        resolved = configured if configured.is_absolute() else settings.db.resolved_path.parent.parent / configured
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def load_market_db(path: Path | None = None) -> dict:
    db_path = get_market_db_path(path)
    if not db_path.exists():
        return {"snapshots": []}
    return json.loads(db_path.read_text(encoding="utf-8"))


def save_market_snapshot(record: dict, path: Path | None = None) -> Path:
    db_path = get_market_db_path(path)
    payload = load_market_db(db_path)
    snapshots = [item for item in payload["snapshots"] if item.get("provider") != record.get("provider")]
    snapshots.append(record)
    payload["snapshots"] = snapshots
    db_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return db_path


def get_market_snapshot(provider: str | None = None, path: Path | None = None) -> dict | None:
    payload = load_market_db(path)
    snapshots = payload.get("snapshots", [])
    if not snapshots:
        return None
    if provider is None:
        return snapshots[-1]
    for item in reversed(snapshots):
        if item.get("provider") == provider:
            return item
    return None
