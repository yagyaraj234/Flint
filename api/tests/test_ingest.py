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


def test_ingest_uses_authenticated_user_and_ignores_body_identity(fake_db: FakeSupabase) -> None:
    resp = client.post(
        "/ingest",
        json={
            "source": "upload",
            "trace": _leaked_key_trace(),
            "user_id": "11111111-1111-1111-1111-111111111111",
            "batch_id": "22222222-2222-2222-2222-222222222222",
        },
        headers={"Authorization": "Bearer good-token-user-1"},
    )
    assert resp.status_code == 200
    row = fake_db.rows[0]
    assert row["status"] == "done"
    assert row["user_id"] == "user-1"
    assert row["batch_id"] is None


def test_ingest_without_auth_is_anonymous(fake_db: FakeSupabase) -> None:
    resp = client.post("/ingest", json={"source": "upload", "trace": _leaked_key_trace()})
    assert resp.status_code == 200
    assert fake_db.rows[0]["user_id"] is None


def test_ingest_rejects_invalid_bearer_token(fake_db: FakeSupabase) -> None:
    resp = client.post(
        "/ingest",
        json={"source": "upload", "trace": _leaked_key_trace()},
        headers={"Authorization": "Bearer bad-token"},
    )
    assert resp.status_code == 401
    assert fake_db.rows == []


def test_ingest_rejects_bad_source(fake_db: FakeSupabase) -> None:
    resp = client.post("/ingest", json={"source": "nope", "trace": {}})
    assert resp.status_code == 422


def test_ingest_rejects_forged_langsmith_provenance(fake_db: FakeSupabase) -> None:
    resp = client.post(
        "/ingest",
        json={
            "source": "langsmith",
            "trace": _leaked_key_trace(),
            "user_id": "11111111-1111-1111-1111-111111111111",
            "langsmith_connection_id": "22222222-2222-2222-2222-222222222222",
            "external_trace_id": "trace-1",
        },
    )
    assert resp.status_code == 403
    assert not fake_db.rows


def test_ingest_rejects_unparseable_trace(fake_db: FakeSupabase) -> None:
    resp = client.post("/ingest", json={"source": "upload", "trace": 42})
    assert resp.status_code == 422
    assert len(fake_db.rows) == 0


def test_batch_ingest_requires_auth_and_persists_failures(fake_db: FakeSupabase) -> None:
    payload = {
        "source": "upload",
        "title": "batch trace",
        "traces": [_leaked_key_trace(), 42, _leaked_key_trace()],
    }
    assert client.post("/ingest/batch", json=payload).status_code == 401

    resp = client.post(
        "/ingest/batch",
        json=payload,
        headers={"Authorization": "Bearer good-token-user-1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["batch_id"]) == 36
    assert [result["status"] for result in body["results"]] == ["done", "failed", "done"]
    assert body["results"][1]["error"]
    assert [row["title"] for row in fake_db.rows] == [
        "batch trace 1",
        "batch trace 2",
        "batch trace 3",
    ]
    assert {row["batch_id"] for row in fake_db.rows} == {body["batch_id"]}
    assert {row["user_id"] for row in fake_db.rows} == {"user-1"}
    failed = fake_db.rows[1]
    assert failed["status"] == "failed"
    assert failed["score"] == 0
    assert failed["tier"] == "Unknown"
    assert failed["findings"] == []
