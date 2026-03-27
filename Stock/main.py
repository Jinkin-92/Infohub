"""
CLI entrypoint aligned with SYSTEM_DESIGN.md.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

import click

from config.settings import settings
from config.runtime_logging import setup_logging
from database.operations import create_session_factory, init_database, list_strategy_statuses, serialize_statuses
from engine.daily_runner import run_daily
from report.daily_report import build_daily_report
from report.feishu import send_post_message


@click.group(invoke_without_command=True)
@click.option("--run", "run_mode", type=click.Choice(["daily"]), default=None)
@click.option("--provider", default=None)
@click.option("--strategy", default=None, help="Reserved for strategy-level debug runs.")
@click.option("--debug", is_flag=True, default=False)
@click.pass_context
def cli(ctx: click.Context, run_mode: str | None, provider: str | None, strategy: str | None, debug: bool) -> None:
    settings.ensure_directories()
    setup_logging(level=settings.log_level, log_file=str(settings.resolved_log_file))
    if run_mode == "daily":
        result = run_daily(provider=provider or settings.data.provider)
        report = build_daily_report({**result, "provider": provider or settings.data.provider})
        if settings.notification.is_configured:
            send_post_message(f"策略日报 - {result['date']}", report.splitlines())
        click.echo(json.dumps({"result": result, "report": report}, ensure_ascii=False, indent=2))
        return
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())


@cli.command("init-db")
def init_db_command() -> None:
    db_path = init_database()
    click.echo(f"Database initialized at {db_path}")


@cli.command("status")
@click.option("--json-output", is_flag=True)
def status_command(json_output: bool) -> None:
    session_factory = create_session_factory()
    with session_factory() as session:
        payload = serialize_statuses(list_strategy_statuses(session))
    if json_output:
        click.echo(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for item in payload:
            click.echo(
                f"{item['name']:16} | cash={item['cash']:.2f} | "
                f"positions={item['position_count']} | open_signals={item['signal_count']} | nav={item['total_nav']:.2f}"
            )


@cli.command("dashboard")
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default=8501, show_default=True, type=int)
@click.option("--headless/--no-headless", default=False, show_default=True)
def dashboard_command(host: str, port: int, headless: bool) -> None:
    app_path = Path(__file__).resolve().parent / "dashboard" / "app.py"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "streamlit",
            "run",
            str(app_path),
            "--server.address",
            host,
            "--server.port",
            str(port),
            "--server.headless",
            "true" if headless else "false",
        ],
        check=True,
    )


if __name__ == "__main__":
    cli()
