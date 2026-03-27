from report.daily_report import build_agent_decision_report, build_daily_report


def test_build_agent_decision_report_contains_signal_lines():
    summary = {
        "strategy": "momentum",
        "provider": "local",
        "source_fetched_at": "2026-03-26T00:00:00+00:00",
        "universe_count": 10,
        "signal_count": 1,
        "execution": {"executed_signal_count": 1, "cash": 100000.0, "total_nav": 200000.0},
        "signals": [
            {
                "signal_type": "BUY",
                "symbol": "600036",
                "name": "招商银行",
                "ref_price": 34.1,
                "reason": "top_momentum_candidate",
                "executed_price": 34.1,
            }
        ],
    }

    report = build_agent_decision_report(summary)

    assert "策略执行结果: momentum" in report
    assert "实际执行数: 1" in report
    assert "BUY 600036 招商银行" in report


def test_build_daily_report_contains_markdown_sections():
    report = build_daily_report(
        {
            "date": "2026-03-26",
            "provider": "local",
            "is_trading_day": True,
            "strategies": [
                {
                    "display_name": "量化动量",
                    "signal_count": 2,
                    "nav": {"total_nav": 200500.0, "daily_return_pct": 0.25, "cumulative_return_pct": 0.25},
                    "executions": [{"action": "BUY", "shares": 100, "price": 34.1}],
                }
            ],
        }
    )

    assert "# 策略日报 - 2026-03-26" in report
    assert "## 策略净值汇总" in report
    assert "量化动量" in report
