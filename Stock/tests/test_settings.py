from config.runtime_settings import Settings


def test_settings_validate_requires_anthropic_key_when_ai_enabled(monkeypatch):
    monkeypatch.setenv("ENABLE_AI_ANALYSIS", "true")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    validated = Settings()

    assert validated.validate() == ["ENABLE_AI_ANALYSIS=true but ANTHROPIC_API_KEY is not configured."]


def test_settings_validate_rejects_unknown_data_provider(monkeypatch):
    monkeypatch.setenv("DATA_PROVIDER", "bad-provider")

    validated = Settings()

    assert validated.validate() == ["DATA_PROVIDER must be one of: local, akshare, instock."]
