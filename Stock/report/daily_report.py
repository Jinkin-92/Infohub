"""
Markdown daily report rendering.
"""

from __future__ import annotations


def build_daily_report(summary: dict) -> str:
    lines = [f"# 策略日报 - {summary['date']}", ""]
    lines.extend(
        [
            "## 运行概况",
            f"- 数据源：{summary.get('provider', '-')}",
            f"- 是否交易日：{'是' if summary.get('is_trading_day') else '否'}",
            "",
            "## 策略净值汇总",
            "| 策略 | 当前净值 | 今日收益 | 累计收益 | 交易笔数 |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )
    for item in summary.get("strategies", []):
        nav = item.get("nav", {})
        executed_count = len([record for record in item.get("executions", []) if record.get("action") in {"BUY", "SELL"}])
        lines.append(
            f"| {item['display_name']} | {nav.get('total_nav', 0):.2f} | "
            f"{(nav.get('daily_return_pct') or 0):.2f}% | {(nav.get('cumulative_return_pct') or 0):.2f}% | {executed_count} |"
        )

    lines.extend(["", "## 今日交易"])
    trade_lines: list[str] = []
    for item in summary.get("strategies", []):
        for record in item.get("executions", []):
            if record.get("action") in {"BUY", "SELL"}:
                trade_lines.append(
                    f"- {item['display_name']}: {record['action']} {record.get('shares', 0)} 股 @ {record.get('price', 0):.2f}"
                )
    lines.extend(trade_lines or ["- 无成交"])

    lines.extend(["", "## 次日信号预告"])
    preview = [f"- {item['display_name']}: {item['signal_count']} 条信号" for item in summary.get("strategies", []) if item.get("signal_count", 0)]
    lines.extend(preview or ["- 无待执行信号"])

    lines.extend(
        [
            "",
            "## 异常提示",
            "- 暂无异常",
            "",
            "## 策略自评与改进建议",
            "- 当前版本已切换到 SQLite 主链路，后续建议继续补齐真实分红和更完整的基准收益计算。",
        ]
    )
    return "\n".join(lines)


def build_agent_decision_report(summary: dict) -> str:
    execution = summary.get("execution", {})
    signal_lines = []
    for item in summary.get("signals", []):
        signal_lines.append(
            f"- {item['signal_type']} {item['symbol']} {item.get('name', '')} @ {item.get('ref_price', 0)} | {item.get('reason', '-')}"
        )

    lines = [
        f"策略执行结果: {summary['strategy']}",
        f"数据源: {summary['provider']}",
        f"市场快照时间: {summary['source_fetched_at']}",
        f"候选池数量: {summary['universe_count']}",
        f"生成信号数: {summary['signal_count']}",
        f"实际执行数: {execution.get('executed_signal_count', 0)}",
    ]
    if signal_lines:
        lines.append("信号明细:")
        lines.extend(signal_lines)
    return "\n".join(lines)
