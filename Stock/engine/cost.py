"""
Trading cost rules aligned with SYSTEM_DESIGN.md.
"""

from __future__ import annotations

from config.settings import settings


def calc_buy_cost(amount: float, is_etf: bool, is_shanghai: bool) -> dict:
    commission_rate = settings.trading.etf_buy_commission_rate if is_etf else settings.trading.stock_buy_commission_rate
    commission = max(amount * commission_rate, settings.trading.min_commission)
    transfer_fee = 0.0 if is_etf or not is_shanghai else amount * settings.trading.transfer_fee_rate
    total_fee = commission + transfer_fee
    return {
        "commission": round(commission, 2),
        "transfer_fee": round(transfer_fee, 2),
        "stamp_duty": 0.0,
        "total_fee": round(total_fee, 2),
    }


def calc_sell_cost(amount: float, is_etf: bool, is_shanghai: bool) -> dict:
    commission_rate = settings.trading.etf_sell_commission_rate if is_etf else settings.trading.stock_sell_commission_rate
    commission = max(amount * commission_rate, settings.trading.min_commission)
    stamp_duty = 0.0 if is_etf else amount * settings.trading.stamp_duty_rate
    transfer_fee = 0.0 if is_etf or not is_shanghai else amount * settings.trading.transfer_fee_rate
    total_fee = commission + stamp_duty + transfer_fee
    return {
        "commission": round(commission, 2),
        "transfer_fee": round(transfer_fee, 2),
        "stamp_duty": round(stamp_duty, 2),
        "total_fee": round(total_fee, 2),
    }
