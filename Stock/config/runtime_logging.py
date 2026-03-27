"""
Logging helpers shared by the CLI and background jobs.
"""

from __future__ import annotations

import sys
from functools import wraps
from pathlib import Path
from time import perf_counter

from loguru import logger


_CONFIGURED = False


def setup_logging(level: str = "INFO", log_file: str = "logs/run.log", json_format: bool = True):
    global _CONFIGURED

    if _CONFIGURED:
        return logger

    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    logger.remove()
    logger.add(
        sys.stdout,
        level=level.upper(),
        colorize=True,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
            "{message}"
        ),
    )
    logger.add(
        log_file,
        level=level.upper(),
        rotation="1 day",
        retention="30 days",
        compression="zip",
        serialize=json_format,
        format="{message}" if json_format else "{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
    )
    _CONFIGURED = True
    return logger


def log_execution_time(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = perf_counter()
        try:
            result = func(*args, **kwargs)
            logger.debug(f"{func.__name__} completed in {perf_counter() - start:.3f}s")
            return result
        except Exception:
            logger.exception(f"{func.__name__} failed after {perf_counter() - start:.3f}s")
            raise

    return wrapper
