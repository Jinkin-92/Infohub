"""
Portfolio value and daily NAV helpers.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from data.fetcher import DataFetcher
from database.models import Strategy
from database.operations import add_dividend, get_latest_nav, get_positions_by_strategy, record_daily_nav


class PortfolioManager:
    def __init__(self, session: Session, fetcher: DataFetcher):
        self.session = session
        self.fetcher = fetcher

    def get_portfolio_value(self, strategy_id: int, prices: dict[str, float]) -> tuple[float, float]:
        positions = get_positions_by_strategy(self.session, strategy_id)
        stock_value = 0.0
        for position in positions:
            price = prices.get(position.symbol, self.fetcher.get_prev_close(position.symbol))
            stock_value += round(position.shares * price, 2)
        strategy_obj = self.session.get(Strategy, strategy_id)
        cash = strategy_obj.portfolio.cash if strategy_obj and strategy_obj.portfolio else 0.0
        return round(cash + stock_value, 2), round(stock_value, 2)

    def record_daily_nav(self, strategy_id: int, prices: dict[str, float], trade_date: str):
        strategy = self.session.get(Strategy, strategy_id)
        assert strategy is not None and strategy.portfolio is not None
        total_nav, stock_value = self.get_portfolio_value(strategy_id, prices)
        previous = get_latest_nav(self.session, strategy_id)
        daily_return = None
        if previous is not None and previous.date != trade_date and previous.total_nav:
            daily_return = round((total_nav / previous.total_nav - 1.0) * 100.0, 2)
        cumulative = round((total_nav / strategy.initial_capital - 1.0) * 100.0, 2)
        benchmark_return = 0.0
        benchmark = strategy.benchmark
        if benchmark:
            benchmark_close = self.fetcher.get_index_close(benchmark) if benchmark.endswith((".SH", ".SZ", ".CSI")) else 0.0
            if benchmark_close:
                benchmark_return = round((benchmark_close / benchmark_close - 1.0) * 100.0, 2)
        return record_daily_nav(
            self.session,
            {
                "strategy_id": strategy_id,
                "date": trade_date,
                "total_nav": total_nav,
                "cash": strategy.portfolio.cash,
                "stock_value": stock_value,
                "daily_return_pct": daily_return,
                "cumulative_return_pct": cumulative,
                "benchmark_return_pct": benchmark_return,
            },
        )

    def apply_dividend(self, strategy_id: int, symbol: str, dividend_per_share: float, payment_date: str):
        strategy = self.session.get(Strategy, strategy_id)
        positions = {item.symbol: item for item in get_positions_by_strategy(self.session, strategy_id)}
        position = positions.get(symbol)
        if strategy is None or strategy.portfolio is None or position is None:
            return None
        total_amount = round(position.shares * dividend_per_share, 2)
        strategy.portfolio.cash = round(strategy.portfolio.cash + total_amount, 2)
        add_dividend(
            self.session,
            {
                "strategy_id": strategy_id,
                "symbol": symbol,
                "name": position.name,
                "dividend_per_share": dividend_per_share,
                "shares_held": position.shares,
                "total_amount": total_amount,
                "record_date": payment_date,
                "payment_date": payment_date,
            },
        )
        self.session.flush()
        return total_amount

    def get_position_cost(self, strategy_id: int, symbol: str) -> float:
        for position in get_positions_by_strategy(self.session, strategy_id):
            if position.symbol == symbol:
                return position.avg_cost
        return 0.0
