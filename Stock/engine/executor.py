"""
Signal execution and settlement rules.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from data.fetcher import DataFetcher
from database.models import Portfolio, Signal, Strategy
from database.operations import add_transaction, delete_position, get_positions_by_strategy, upsert_position
from engine.cost import calc_buy_cost, calc_sell_cost


def get_next_trading_day(fetcher: DataFetcher, trade_date: date) -> date:
    calendar = sorted(fetcher.get_trade_calendar())
    trade_value = trade_date.strftime("%Y-%m-%d")
    idx = calendar.index(trade_value)
    return date.fromisoformat(calendar[idx + 1])


def can_sell(position, today: date) -> bool:
    return today >= date.fromisoformat(position.can_sell_date)


def _is_shanghai(symbol: str) -> bool:
    return symbol.startswith(("5", "6", "9"))


def execute_signal(
    session: Session,
    strategy: Strategy,
    signal: Signal,
    fetcher: DataFetcher,
    trade_date: date,
) -> dict:
    portfolio = strategy.portfolio
    assert portfolio is not None
    positions = {item.symbol: item for item in get_positions_by_strategy(session, strategy.id)}
    is_etf = signal.symbol.startswith(("51", "15"))
    price = float(signal.ref_price if signal.ref_price is not None else fetcher.get_prev_close(signal.symbol))
    symbol_position = positions.get(signal.symbol)

    if signal.signal_type == "SELL":
        if symbol_position is None:
            signal.executed = True
            return {"action": "skip", "reason": "position_missing"}
        if not is_etf and not can_sell(symbol_position, trade_date):
            return {"action": "blocked", "reason": "t+1"}
        amount = round(symbol_position.shares * price, 2)
        fees = calc_sell_cost(amount, is_etf=is_etf, is_shanghai=_is_shanghai(signal.symbol))
        net_amount = round(amount - fees["total_fee"], 2)
        portfolio.cash = round(portfolio.cash + net_amount, 2)
        portfolio.last_updated = trade_date
        add_transaction(
            session,
            {
                "strategy_id": strategy.id,
                "symbol": signal.symbol,
                "name": signal.name,
                "action": "SELL",
                "shares": symbol_position.shares,
                "price": price,
                "amount": amount,
                "commission": fees["commission"],
                "stamp_duty": fees["stamp_duty"],
                "transfer_fee": fees["transfer_fee"],
                "net_amount": net_amount,
                "trade_date": trade_date.strftime("%Y-%m-%d"),
                "reason": signal.reason,
            },
        )
        delete_position(session, strategy.id, signal.symbol)
        signal.executed = True
        signal.executed_at = trade_date
        session.flush()
        return {"action": "SELL", "shares": symbol_position.shares, "price": price}

    target_shares = signal.target_shares or 0
    if target_shares <= 0 and signal.signal_type in {"BUY", "REBALANCE"}:
        return {"action": "skip", "reason": "zero_target"}

    if signal.signal_type == "REBALANCE" and symbol_position is not None:
        delta = target_shares - symbol_position.shares
        if delta == 0:
            signal.executed = True
            return {"action": "skip", "reason": "already_balanced"}
        signal.signal_type = "BUY" if delta > 0 else "SELL"
        signal.target_shares = abs(delta)
        session.flush()
        return execute_signal(session, strategy, signal, fetcher, trade_date)

    amount = round(target_shares * price, 2)
    fees = calc_buy_cost(amount, is_etf=is_etf, is_shanghai=_is_shanghai(signal.symbol))
    net_amount = round(amount + fees["total_fee"], 2)
    if portfolio.cash < net_amount:
        return {"action": "blocked", "reason": "insufficient_cash"}
    portfolio.cash = round(portfolio.cash - net_amount, 2)
    portfolio.last_updated = trade_date
    can_sell_date = trade_date if is_etf else get_next_trading_day(fetcher, trade_date)
    upsert_position(
        session,
        strategy.id,
        signal.symbol,
        {
            "name": signal.name,
            "shares": target_shares if symbol_position is None else symbol_position.shares + target_shares,
            "avg_cost": price,
            "buy_date": trade_date.strftime("%Y-%m-%d"),
            "can_sell_date": can_sell_date.strftime("%Y-%m-%d"),
            "is_etf": is_etf,
        },
    )
    add_transaction(
        session,
        {
            "strategy_id": strategy.id,
            "symbol": signal.symbol,
            "name": signal.name,
            "action": "BUY",
            "shares": target_shares,
            "price": price,
            "amount": amount,
            "commission": fees["commission"],
            "stamp_duty": fees["stamp_duty"],
            "transfer_fee": fees["transfer_fee"],
            "net_amount": net_amount,
            "trade_date": trade_date.strftime("%Y-%m-%d"),
            "reason": signal.reason,
        },
    )
    signal.executed = True
    signal.executed_at = trade_date
    session.flush()
    return {"action": "BUY", "shares": target_shares, "price": price}
