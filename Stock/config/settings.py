"""
全局配置模块
读取环境变量并提供配置对象
"""
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

# 加载 .env 文件
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)


@dataclass
class DatabaseConfig:
    """数据库配置"""
    path: str = os.getenv('DB_PATH', 'data/portfolio.db')

    @property
    def is_duckdb(self) -> bool:
        return self.path.endswith('.duckdb')

    @property
    def is_sqlite(self) -> bool:
        return self.path.endswith('.db') and not self.is_duckdb


@dataclass
class TradingConfig:
    """交易配置"""
    initial_capital: float = float(os.getenv('INITIAL_CAPITAL', '200000.0'))
    min_stock_price: float = float(os.getenv('MIN_STOCK_PRICE', '2.0'))

    # 股票交易成本
    stock_buy_commission_rate: float = float(os.getenv('STOCK_BUY_COMMISSION_RATE', '0.00012'))
    stock_sell_commission_rate: float = float(os.getenv('STOCK_SELL_COMMISSION_RATE', '0.00012'))
    stamp_duty_rate: float = float(os.getenv('STAMP_DUTY_RATE', '0.001'))
    transfer_fee_rate: float = float(os.getenv('TRANSFER_FEE_RATE', '0.00002'))
    min_commission: float = float(os.getenv('MIN_COMMISSION', '5.0'))

    # ETF 交易成本
    etf_buy_commission_rate: float = float(os.getenv('ETF_BUY_COMMISSION_RATE', '0.00012'))
    etf_sell_commission_rate: float = float(os.getenv('ETF_SELL_COMMISSION_RATE', '0.00012'))


@dataclass
class DataSourceConfig:
    """数据源配置"""
    use_instock: bool = os.getenv('USE_INSTOCK', 'false').lower() == 'true'

    # InStock MySQL 配置
    instock_mysql_host: str = os.getenv('INSTOCK_MYSQL_HOST', 'localhost')
    instock_mysql_port: int = int(os.getenv('INSTOCK_MYSQL_PORT', '3306'))
    instock_mysql_user: str = os.getenv('INSTOCK_MYSQL_USER', 'root')
    instock_mysql_password: str = os.getenv('INSTOCK_MYSQL_PASSWORD', '')
    instock_mysql_database: str = os.getenv('INSTOCK_MYSQL_DATABASE', 'instockdb')

    # 缓存配置
    cache_dir: str = os.getenv('CACHE_DIR', 'data/cache')
    cache_expire_seconds: int = int(os.getenv('CACHE_EXPIRE_SECONDS', '3600'))


@dataclass
class NotificationConfig:
    """通知配置"""
    feishu_webhook_url: str = os.getenv('FEISHU_WEBHOOK_URL', '')

    @property
    def is_configured(self) -> bool:
        return bool(self.feishu_webhook_url)


@dataclass
class AIConfig:
    """AI配置"""
    enable_ai_analysis: bool = os.getenv('ENABLE_AI_ANALYSIS', 'false').lower() == 'true'
    anthropic_api_key: str = os.getenv('ANTHROPIC_API_KEY', '')

    @property
    def is_configured(self) -> bool:
        return bool(self.anthropic_api_key)


@dataclass
class DashboardConfig:
    """仪表板配置"""
    enable_dashboard: bool = os.getenv('ENABLE_DASHBOARD', 'true').lower() == 'true'
    port: int = int(os.getenv('DASHBOARD_PORT', '8501'))


@dataclass
class Settings:
    """全局设置"""
    debug: bool = os.getenv('DEBUG', 'false').lower() == 'true'
    log_level: str = os.getenv('LOG_LEVEL', 'INFO')
    log_file: str = os.getenv('LOG_FILE', 'logs/run.log')

    # 子配置
    db: DatabaseConfig = DatabaseConfig()
    trading: TradingConfig = TradingConfig()
    data: DataSourceConfig = DataSourceConfig()
    notification: NotificationConfig = NotificationConfig()
    ai: AIConfig = AIConfig()
    dashboard: DashboardConfig = DashboardConfig()

    def validate(self) -> list[str]:
        """验证配置，返回错误列表"""
        errors = []

        if not self.notification.is_configured:
            errors.append("FEISHU_WEBHOOK_URL 未配置，无法发送日报")

        if self.data.use_instock:
            if not self.data.instock_mysql_password:
                errors.append("USE_INSTOCK=true 但未配置 INSTOCK_MYSQL_PASSWORD")

        if self.ai.enable_ai_analysis and not self.ai.is_configured:
            errors.append("ENABLE_AI_ANALYSIS=true 但未配置 ANTHROPIC_API_KEY")

        return errors


# 全局配置实例
settings = Settings()

__all__ = ['Settings', 'settings', 'DatabaseConfig', 'TradingConfig',
           'DataSourceConfig', 'NotificationConfig', 'AIConfig', 'DashboardConfig']
