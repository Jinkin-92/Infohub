"""
SQLite repository helpers for the production data model.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
import os
from pathlib import Path

from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from config.settings import settings
from database.models import Base, DailyNav, DataSourceEvent, Dividend, Portfolio, Position, Signal, Strategy, Transaction


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


DEFAULT_STRATEGIES = [
    {
        "name": "momentum",
        "display_name": "量化动量",
        "description": "基于动量得分的月度轮动策略。",
        "benchmark": "000905.SH",
        "rebalance_frequency": "monthly",
    },
    {
        "name": "dividend_lowvol",
        "display_name": "红利低波",
        "description": "以股息率和波动率为核心的季度策略。",
        "benchmark": "000922.CSI",
        "rebalance_frequency": "quarterly",
    },
    {
        "name": "global_alloc",
        "display_name": "全球资产配置",
        "description": "固定 ETF 目标权重的再平衡策略。",
        "benchmark": "balanced",
        "rebalance_frequency": "monthly",
    },
    {
        "name": "high_growth",
        "display_name": "高成长",
        "description": "基于成长与估值筛选的季度策略。",
        "benchmark": "399006.SZ",
        "rebalance_frequency": "quarterly",
    },
    {
        "name": "personal",
        "display_name": "中国版永久组合",
        "description": "基于指数仓位规则的个人组合。",
        "benchmark": "000001.SH",
        "rebalance_frequency": "dynamic",
    },
]


@dataclass(slots=True)
class StrategyStatus:
    name: str
    display_name: str
    cash: float
    position_count: int
    signal_count: int
    total_nav: float
    last_updated: str | None


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def get_db_path(path: Path | None = None) -> Path:
    if path is not None:
        resolved = Path(path)
    else:
        env_path = os.getenv("DB_PATH")
        resolved = Path(env_path) if env_path else settings.db.resolved_path
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def create_db_engine(db_path: Path | None = None):
    return create_engine(_sqlite_url(get_db_path(db_path)), future=True)


def create_session_factory(db_path: Path | None = None):
    return sessionmaker(bind=create_db_engine(db_path), expire_on_commit=False, future=True)


def init_database(db_path: Path | None = None) -> Path:
    resolved = get_db_path(db_path)
    engine = create_db_engine(resolved)
    Base.metadata.create_all(engine)
    session_factory = create_session_factory(resolved)
    with session_factory() as session:
        existing = {item.name: item for item in session.scalars(select(Strategy)).all()}
        for strategy_def in DEFAULT_STRATEGIES:
            current = existing.get(strategy_def["name"])
            if current is None:
                strategy = Strategy(initial_capital=settings.trading.initial_capital, is_active=True, **strategy_def)
                session.add(strategy)
                session.flush()
                session.add(Portfolio(strategy_id=strategy.id, cash=strategy.initial_capital, last_updated=_utcnow_naive()))
                continue

            current.display_name = strategy_def["display_name"]
            current.description = strategy_def["description"]
            current.benchmark = strategy_def["benchmark"]
            current.rebalance_frequency = strategy_def["rebalance_frequency"]
            if current.portfolio is None:
                session.add(
                    Portfolio(
                        strategy_id=current.id,
                        cash=current.initial_capital,
                        last_updated=_utcnow_naive(),
                    )
                )
        session.commit()
    return resolved


def get_active_strategies(session: Session) -> list[Strategy]:
    return session.scalars(select(Strategy).where(Strategy.is_active.is_(True)).order_by(Strategy.id)).all()


def get_strategy_by_name(session: Session, strategy_name: str) -> Strategy | None:
    return session.scalar(select(Strategy).where(Strategy.name == strategy_name))


def get_positions_by_strategy(session: Session, strategy_id: int) -> list[Position]:
    return session.scalars(select(Position).where(Position.strategy_id == strategy_id)).all()


def get_signals_by_strategy(session: Session, strategy_id: int, open_only: bool = False) -> list[Signal]:
    stmt = select(Signal).where(Signal.strategy_id == strategy_id)
    if open_only:
        stmt = stmt.where(Signal.executed.is_(False))
    return session.scalars(stmt.order_by(Signal.id)).all()


def get_transactions_by_strategy(session: Session, strategy_id: int) -> list[Transaction]:
    return session.scalars(select(Transaction).where(Transaction.strategy_id == strategy_id).order_by(Transaction.id)).all()


def get_latest_nav(session: Session, strategy_id: int) -> DailyNav | None:
    return session.scalar(select(DailyNav).where(DailyNav.strategy_id == strategy_id).order_by(DailyNav.id.desc()))


def list_strategy_statuses(session: Session) -> list[StrategyStatus]:
    strategies = session.scalars(select(Strategy).order_by(Strategy.id)).all()
    results: list[StrategyStatus] = []
    for strategy in strategies:
        nav = get_latest_nav(session, strategy.id)
        portfolio = strategy.portfolio
        results.append(
            StrategyStatus(
                name=strategy.name,
                display_name=strategy.display_name,
                cash=portfolio.cash if portfolio else 0.0,
                position_count=len(strategy.positions),
                signal_count=len([signal for signal in strategy.signals if not signal.executed]),
                total_nav=nav.total_nav if nav else (portfolio.cash if portfolio else strategy.initial_capital),
                last_updated=(nav.date if nav else None),
            )
        )
    return results


def replace_strategy_signals(session: Session, strategy_id: int, new_signals: list[dict]) -> list[Signal]:
    session.execute(delete(Signal).where(Signal.strategy_id == strategy_id, Signal.executed.is_(False)))
    created = [Signal(strategy_id=strategy_id, **item) for item in new_signals]
    session.add_all(created)
    session.commit()
    return created


def upsert_position(session: Session, strategy_id: int, symbol: str, values: dict) -> Position:
    position = session.scalar(select(Position).where(Position.strategy_id == strategy_id, Position.symbol == symbol))
    if position is None:
        position = Position(strategy_id=strategy_id, symbol=symbol, **values)
        session.add(position)
    else:
        for key, value in values.items():
            setattr(position, key, value)
    session.flush()
    return position


def delete_position(session: Session, strategy_id: int, symbol: str) -> None:
    position = session.scalar(select(Position).where(Position.strategy_id == strategy_id, Position.symbol == symbol))
    if position is not None:
        session.delete(position)
        session.flush()


def add_transaction(session: Session, payload: dict) -> Transaction:
    transaction = Transaction(**payload)
    session.add(transaction)
    session.flush()
    return transaction


def add_dividend(session: Session, payload: dict) -> Dividend:
    dividend = Dividend(**payload)
    session.add(dividend)
    session.flush()
    return dividend


def record_daily_nav(session: Session, payload: dict) -> DailyNav:
    existing = session.scalar(select(DailyNav).where(DailyNav.strategy_id == payload["strategy_id"], DailyNav.date == payload["date"]))
    if existing is None:
        existing = DailyNav(**payload)
        session.add(existing)
    else:
        for key, value in payload.items():
            setattr(existing, key, value)
    session.flush()
    return existing


def replace_data_source_events(session: Session, trade_date: str, provider: str, events: list[dict]) -> list[DataSourceEvent]:
    session.execute(
        delete(DataSourceEvent).where(
            DataSourceEvent.trade_date == trade_date,
            DataSourceEvent.provider == provider,
        )
    )
    created = [DataSourceEvent(trade_date=trade_date, provider=provider, **event) for event in events]
    session.add_all(created)
    session.flush()
    return created


def serialize_statuses(statuses: list[StrategyStatus]) -> list[dict]:
    return [asdict(item) for item in statuses]
