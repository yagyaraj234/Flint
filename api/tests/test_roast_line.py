import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.roast_line import FALLBACK_LINES, fallback_line, generate_roast_line
from tests.conftest import FakeSupabase

client = TestClient(app)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def test_fallback_line_per_tier() -> None:
    assert set(FALLBACK_LINES) == {"Rare", "Medium", "Well Done", "Charcoal"}
    assert all(len(line) <= 120 for line in FALLBACK_LINES.values())
    assert fallback_line("Charcoal") == FALLBACK_LINES["Charcoal"]
    assert fallback_line("unknown-tier") in FALLBACK_LINES.values()


def test_generate_returns_none_without_api_key(monkeypatch) -> None:
    # no key configured in tests -> must fail soft, never raise
    monkeypatch.setattr("app.roast_line.get_settings", lambda: type("S", (), {"openai_api_key": ""})())
    assert generate_roast_line([], 50, "Well Done") is None


def test_ingest_stores_fallback_line_immediately(fake_db: FakeSupabase, monkeypatch) -> None:
    # background task must not call OpenAI in tests
    monkeypatch.setattr("app.roast_line.generate_roast_line", lambda *a: None)
    trace = json.loads((FIXTURES / "leaked-key.json").read_text())
    resp = client.post("/ingest", json={"source": "upload", "trace": trace})
    assert resp.status_code == 200
    row = fake_db.rows[0]
    assert row["tier"] == "Charcoal"
    assert row["roast_line"] == FALLBACK_LINES["Charcoal"]
