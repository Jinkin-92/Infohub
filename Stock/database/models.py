"""
SQLAlchemy models aligned with SYSTEM_DESIGN.md.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_capital: Mapped[float] = mapped_column(Float, default=200000.0, nullable=False)
    benchmark: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rebalance_frequency: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, nullable=False)

    portfolio: Mapped["Portfolio | None"] = relationship(back_populates="strategy", uselist=False)
    positions: Mapped[list["Position"]] = relationship(back_populates="strategy")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="strategy")
    daily_navs: Mapped[list["DailyNav"]] = relationship(back_populates="strategy")
    signals: Mapped[list["Signal"]] = relationship(back_populates="strategy")
    dividends: Mapped[list["Dividend"]] = relationship(back_populates="strategy")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), unique=True, nullable=False)
    cash: Mapped[float] = mapped_column(Float, nullable=False)
    last_updated: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    strategy: Mapped[Strategy] = relationship(back_populates="portfolio")


class Position(Base):
    __tablename__ = "positions"
    __table_args__ = (UniqueConstraint("strategy_id", "symbol", name="uq_positions_strategy_symbol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    shares: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_cost: Mapped[float] = mapped_column(Float, nullable=False)
    buy_date: Mapped[str] = mapped_column(String(16), nullable=False)
    can_sell_date: Mapped[str] = mapped_column(String(16), nullable=False)
    is_etf: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    strategy: Mapped[Strategy] = relationship(back_populates="positions")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    shares: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    commission: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    stamp_duty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    transfer_fee: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    net_amount: Mapped[float] = mapped_column(Float, nullable=False)
    trade_date: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    strategy: Mapped[Strategy] = relationship(back_populates="transactions")


class DailyNav(Base):
    __tablename__ = "daily_nav"
    __table_args__ = (UniqueConstraint("strategy_id", "date", name="uq_daily_nav_strategy_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), nullable=False)
    date: Mapped[str] = mapped_column(String(16), nullable=False)
    total_nav: Mapped[float] = mapped_column(Float, nullable=False)
    cash: Mapped[float] = mapped_column(Float, nullable=False)
    stock_value: Mapped[float] = mapped_column(Float, nullable=False)
    daily_return_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    cumulative_return_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    benchmark_return_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    strategy: Mapped[Strategy] = relationship(back_populates="daily_navs")


class Signal(Base):
    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signal_type: Mapped[str] = mapped_column(String(16), nullable=False)
    ref_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_shares: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, nullable=False)
    executed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    strategy: Mapped[Strategy] = relationship(back_populates="signals")


class Dividend(Base):
    __tablename__ = "dividends"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    dividend_per_share: Mapped[float] = mapped_column(Float, nullable=False)
    shares_held: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    record_date: Mapped[str | None] = mapped_column(String(16), nullable=True)
    payment_date: Mapped[str] = mapped_column(String(16), nullable=False)

    strategy: Mapped[Strategy] = relationship(back_populates="dividends")
