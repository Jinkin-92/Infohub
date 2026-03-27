"""
Strategy registry.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from config.settings import ROOT_DIR
from strategies.base import BaseStrategy
from strategies.dividend_lowvol import DividendLowVolStrategy
from strategies.global_alloc import GlobalAllocationStrategy
from strategies.high_growth import HighGrowthStrategy
from strategies.momentum import MomentumStrategy
from strategies.personal import PersonalStrategy


def _load_params() -> dict:
    path = ROOT_DIR / "config" / "strategy_params.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def get_strategy(strategy_name: str) -> BaseStrategy:
    params = _load_params()
    if strategy_name == "momentum":
        return MomentumStrategy(**params["momentum"])
    if strategy_name == "dividend_lowvol":
        return DividendLowVolStrategy(**params["dividend_lowvol"])
    if strategy_name == "global_alloc":
        return GlobalAllocationStrategy(**params["global_alloc"])
    if strategy_name == "high_growth":
        return HighGrowthStrategy(**params["high_growth"])
    if strategy_name == "personal":
        return PersonalStrategy()
    raise ValueError(f"Unsupported strategy '{strategy_name}'.")
