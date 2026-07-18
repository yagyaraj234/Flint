import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import FakeSupabase

client = TestClient(app)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
CLEAN_TRACE = json.loads((FIXTURES / "clean.json").read_text())


def _ingest(title: str) -> str:
    resp = client.post("/ingest", json={"source": "synthetic", "title": title, "trace": CLEAN_TRACE})
    return resp.json()["slug"]


def test_get_roast_roundtrip(fake_db: FakeSupabase) -> None:
    slug = _ingest("roundtrip")
    resp = client.get(f"/roasts/{slug}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == slug
    assert body["title"] == "roundtrip"
    # contract shape (snake_case) — the UI builds against these keys
    for key in ("normalized", "findings", "cost", "score", "tier", "created_at"):
        assert key in body


def test_get_roast_404(fake_db: FakeSupabase) -> None:
    assert client.get("/roasts/missing1").status_code == 404


def test_recent_lists_newest_first_capped_at_10(fake_db: FakeSupabase) -> None:
    for i in range(12):
        _ingest(f"trace-{i}")
    resp = client.get("/roasts/recent")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 10
    assert set(body[0]) == {"slug", "title", "score", "tier", "created_at"}
