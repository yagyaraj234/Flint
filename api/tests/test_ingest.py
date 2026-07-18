from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import FakeSupabase

client = TestClient(app)

FAKE_KEY = "sk-FAKE000000000000000000000000"


def test_ingest_returns_slug_and_inserts(fake_db: FakeSupabase) -> None:
    resp = client.post(
        "/ingest",
        json={"source": "upload", "title": "leaky", "trace": {"spans": [{"args": FAKE_KEY}]}},
    )
    assert resp.status_code == 200
    slug = resp.json()["slug"]
    assert len(slug) == 8
    assert len(fake_db.rows) == 1
    assert fake_db.rows[0]["slug"] == slug


def test_no_secret_ever_reaches_db(fake_db: FakeSupabase) -> None:
    # Holds for the stub (placeholders stored) and MUST keep holding once the
    # real pipeline lands (redaction stored). Do not delete this test.
    client.post("/ingest", json={"source": "upload", "trace": {"key": FAKE_KEY}})
    assert FAKE_KEY not in fake_db.dump()


def test_ingest_rejects_bad_source(fake_db: FakeSupabase) -> None:
    resp = client.post("/ingest", json={"source": "nope", "trace": {}})
    assert resp.status_code == 422
