"""
Persistent decision store for agent runs.
"""

from __future__ import annotations

from pathlib import Path
import json
import os

from config.runtime_settings import settings


def get_decision_db_path(path: Path | None = None) -> Path:
    if path is not None:
        resolved = path
    else:
        configured = Path(os.getenv("DECISION_DB_PATH", "data/agent_decisions.json"))
        resolved = configured if configured.is_absolute() else settings.db.resolved_path.parent.parent / configured
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def load_decision_db(path: Path | None = None) -> dict:
    db_path = get_decision_db_path(path)
    if not db_path.exists():
        return {"runs": []}
    return json.loads(db_path.read_text(encoding="utf-8"))


def append_agent_run(run_record: dict, path: Path | None = None) -> Path:
    db_path = get_decision_db_path(path)
    payload = load_decision_db(db_path)
    payload["runs"].append(run_record)
    db_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return db_path
