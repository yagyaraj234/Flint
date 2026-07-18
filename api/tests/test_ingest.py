import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import FakeSupabase

client = TestClient(app)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
FAKE_KEY = "sk-FAKE000000000000000000000000"


def _leaked_key_trace() -> dict:
    return json.loads((FIXTURES / "leaked-key.json").read_text())


def test_ingest_returns_slug_and_inserts(fake_db: FakeSupabase) -> None:
    resp = client.post(
        "/ingest",
        json={"source": "upload", "title": "leaky", "trace": _leaked_key_trace()},
    )
    assert resp.status_code == 200
    slug = resp.json()["slug"]
    assert len(slug) == 8
    assert len(fake_db.rows) == 1
    row = fake_db.rows[0]
    assert row["slug"] == slug
    assert row["tier"] == "Charcoal"
    assert "leaked-secret" in {f["rule"] for f in row["findings"]}


def test_no_secret_ever_reaches_db(fake_db: FakeSupabase) -> None:
    # The headline guarantee: raw_trace and normalized are stored post-redaction.
    client.post("/ingest", json={"source": "upload", "trace": _leaked_key_trace()})
    assert FAKE_KEY not in fake_db.dump()
    assert "REDACTED:openai-key" in fake_db.dump()


def test_ingest_passes_through_user_and_batch(fake_db: FakeSupabase) -> None:
    resp = client.post(
        "/ingest",
        json={
            "source": "upload",
            "trace": _leaked_key_trace(),
            "user_id": "11111111-1111-1111-1111-111111111111",
            "batch_id": "22222222-2222-2222-2222-222222222222",
        },
    )
    assert resp.status_code == 200
    row = fake_db.rows[0]
    assert row["status"] == "done"
    assert row["user_id"] == "11111111-1111-1111-1111-111111111111"
    assert row["batch_id"] == "22222222-2222-2222-2222-222222222222"


def test_ingest_rejects_bad_source(fake_db: FakeSupabase) -> None:
    resp = client.post("/ingest", json={"source": "nope", "trace": {}})
    assert resp.status_code == 422


def test_ingest_rejects_unparseable_trace(fake_db: FakeSupabase) -> None:
    resp = client.post("/ingest", json={"source": "upload", "trace": 42})
    assert resp.status_code == 422
    assert len(fake_db.rows) == 0
