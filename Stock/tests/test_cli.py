import json

from click.testing import CliRunner

from main import cli


def test_cli_daily_run_with_local_provider(monkeypatch, tmp_path):
    db_path = tmp_path / "cli_daily.db"
    monkeypatch.setenv("DB_PATH", str(db_path))

    runner = CliRunner()
    result = runner.invoke(cli, ["--run", "daily", "--provider", "local"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["result"]["is_trading_day"] is True
    assert len(payload["result"]["strategies"]) == 5


def test_cli_status_json_output(monkeypatch, tmp_path):
    db_path = tmp_path / "cli_status.db"
    monkeypatch.setenv("DB_PATH", str(db_path))

    runner = CliRunner()
    runner.invoke(cli, ["init-db"])
    result = runner.invoke(cli, ["status", "--json-output"])

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert len(payload) == 5
    assert {item["name"] for item in payload} == {
        "momentum",
        "dividend_lowvol",
        "global_alloc",
        "high_growth",
        "personal",
    }
