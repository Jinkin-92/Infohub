"""
Canonical application settings.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(ENV_PATH)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(slots=True)
class DatabaseConfig:
    path: str = field(default_factory=lambda: os.getenv("DB_PATH", "data/portfolio.db"))

    @property
    def resolved_path(self) -> Path:
        path = Path(self.path)
        return path if path.is_absolute() else ROOT_DIR / path


@dataclass(slots=True)
class TradingConfig:
    initial_capital: float = field(default_factory=lambda: float(os.getenv("INITIAL_CAPITAL", "200000.0")))
    min_stock_price: float = field(default_factory=lambda: float(os.getenv("MIN_STOCK_PRICE", "2.0")))
    stock_buy_commission_rate: float = field(default_factory=lambda: float(os.getenv("STOCK_BUY_COMMISSION_RATE", "0.00012")))
    stock_sell_commission_rate: float = field(default_factory=lambda: float(os.getenv("STOCK_SELL_COMMISSION_RATE", "0.00012")))
    stamp_duty_rate: float = field(default_factory=lambda: float(os.getenv("STAMP_DUTY_RATE", "0.001")))
    transfer_fee_rate: float = field(default_factory=lambda: float(os.getenv("TRANSFER_FEE_RATE", "0.00002")))
    min_commission: float = field(default_factory=lambda: float(os.getenv("MIN_COMMISSION", "5.0")))
    etf_buy_commission_rate: float = field(default_factory=lambda: float(os.getenv("ETF_BUY_COMMISSION_RATE", "0.00012")))
    etf_sell_commission_rate: float = field(default_factory=lambda: float(os.getenv("ETF_SELL_COMMISSION_RATE", "0.00012")))


@dataclass(slots=True)
class DataSourceConfig:
    provider: str = field(default_factory=lambda: os.getenv("DATA_PROVIDER", "akshare"))
    instock_project_path: str = field(default_factory=lambda: os.getenv("INSTOCK_PROJECT_PATH", "d:/code/stock-deploy"))
    instock_mysql_password: str = field(default_factory=lambda: os.getenv("INSTOCK_MYSQL_PASSWORD", ""))
    cache_dir: str = field(default_factory=lambda: os.getenv("CACHE_DIR", "data/cache"))
    cache_expire_seconds: int = field(default_factory=lambda: int(os.getenv("CACHE_EXPIRE_SECONDS", "3600")))
    universe_sample_size: int = field(default_factory=lambda: int(os.getenv("UNIVERSE_SAMPLE_SIZE", "20")))
    akshare_proxy_url: str = field(default_factory=lambda: os.getenv("AKSHARE_PROXY_URL", "http://127.0.0.1:7897"))

    @property
    def resolved_cache_dir(self) -> Path:
        path = Path(self.cache_dir)
        return path if path.is_absolute() else ROOT_DIR / path

    @property
    def resolved_instock_path(self) -> Path:
        path = Path(self.instock_project_path)
        return path if path.is_absolute() else ROOT_DIR / path

    @property
    def akshare_proxies(self) -> dict[str, str]:
        if not self.akshare_proxy_url:
            return {}
        return {"http": self.akshare_proxy_url, "https": self.akshare_proxy_url}


@dataclass(slots=True)
class NotificationConfig:
    feishu_webhook_url: str = field(default_factory=lambda: os.getenv("FEISHU_WEBHOOK_URL", ""))

    @property
    def is_configured(self) -> bool:
        return bool(self.feishu_webhook_url)


@dataclass(slots=True)
class AIConfig:
    enable_ai_analysis: bool = field(default_factory=lambda: _env_bool("ENABLE_AI_ANALYSIS", False))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))

    @property
    def is_configured(self) -> bool:
        return bool(self.anthropic_api_key)


@dataclass(slots=True)
class DashboardConfig:
    enable_dashboard: bool = field(default_factory=lambda: _env_bool("ENABLE_DASHBOARD", True))
    port: int = field(default_factory=lambda: int(os.getenv("DASHBOARD_PORT", "8501")))


@dataclass(slots=True)
class Settings:
    debug: bool = field(default_factory=lambda: _env_bool("DEBUG", False))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    log_file: str = field(default_factory=lambda: os.getenv("LOG_FILE", "logs/run.log"))
    db: DatabaseConfig = field(default_factory=DatabaseConfig)
    trading: TradingConfig = field(default_factory=TradingConfig)
    data: DataSourceConfig = field(default_factory=DataSourceConfig)
    notification: NotificationConfig = field(default_factory=NotificationConfig)
    ai: AIConfig = field(default_factory=AIConfig)
    dashboard: DashboardConfig = field(default_factory=DashboardConfig)

    @property
    def resolved_log_file(self) -> Path:
        path = Path(self.log_file)
        return path if path.is_absolute() else ROOT_DIR / path

    def ensure_directories(self) -> None:
        self.db.resolved_path.parent.mkdir(parents=True, exist_ok=True)
        self.resolved_log_file.parent.mkdir(parents=True, exist_ok=True)
        self.data.resolved_cache_dir.mkdir(parents=True, exist_ok=True)

    def validate(self) -> list[str]:
        errors: list[str] = []
        if self.data.provider not in {"local", "akshare", "instock"}:
            errors.append("DATA_PROVIDER must be one of: local, akshare, instock.")
        if self.ai.enable_ai_analysis and not self.ai.is_configured:
            errors.append("ENABLE_AI_ANALYSIS=true but ANTHROPIC_API_KEY is not configured.")
        return errors


settings = Settings()
