import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import FakeSupabase

client = TestClient(app)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
CLEAN_TRACE = json.loads((FIXTURES / "clean.json").read_text())
OWNER_HEADERS = {"Authorization": "Bearer good-token-user-1"}
SHARED_HEADERS = {"Authorization": "Bearer good-token-user-2"}
OTHER_HEADERS = {"Authorization": "Bearer good-token-user-3"}


def _ingest(title: str, headers: dict[str, str] | None = None) -> str:
    resp = client.post(
        "/ingest",
        json={"source": "synthetic", "title": title, "trace": CLEAN_TRACE},
        headers=headers,
    )
    return resp.json()["slug"]


def test_get_roast_roundtrip(fake_db: FakeSupabase) -> None:
    slug = _ingest("roundtrip")
    resp = client.get(f"/roasts/{slug}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["slug"] == slug
    assert body["title"] == "roundtrip"
    # contract shape (snake_case) — the UI builds against these keys
    for key in (
        "normalized",
        "findings",
        "cost",
        "detailed_report",
        "score",
        "tier",
        "roast_line",
        "created_at",
    ):
        assert key in body
    assert not {"raw_trace", "user_id", "batch_id", "error", "id"} & body.keys()


def test_get_roast_404(fake_db: FakeSupabase) -> None:
    assert client.get("/roasts/missing1").status_code == 404


def test_recent_lists_newest_first_capped_at_10(fake_db: FakeSupabase) -> None:
    for i in range(12):
        _ingest(f"trace-{i}")
    resp = client.get("/roasts/recent")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 10
    assert set(body[0]) == {
        "slug",
        "title",
        "score",
        "tier",
        "roast_line",
        "status",
        "created_at",
    }


def test_public_reads_exclude_failed_rows(fake_db: FakeSupabase) -> None:
    fake_db.rows.append(
        {
            "id": "failed-id",
            "slug": "failed01",
            "title": "failed",
            "source": "upload",
            "raw_trace": {},
            "normalized": {"trace_id": "failed01", "workflow": "failed", "spans": []},
            "findings": [],
            "cost": {
                "total_tokens_in": 0,
                "total_tokens_out": 0,
                "total_usd": 0,
                "waste_usd": 0,
                "token_source": "estimated",
                "monthly_projection_usd": 0,
                "projection_assumption": "at 1,000 runs/day",
                "unpriced_models": [],
            },
            "score": 0,
            "tier": "Unknown",
            "roast_line": None,
            "status": "failed",
            "error": "bad trace",
            "user_id": "user-1",
            "batch_id": "batch-1",
            "created_at": "2026-07-18T10:00:00Z",
        }
    )
    assert client.get("/roasts/failed01").status_code == 404
    assert client.get("/roasts/recent").json() == []


def test_private_roast_only_serves_owner_or_shared_email(fake_db: FakeSupabase) -> None:
    slug = _ingest("private", OWNER_HEADERS)
    row = fake_db.rows[0]
    row["visibility"] = "private"

    assert client.get(f"/roasts/{slug}").status_code == 404
    assert client.get(f"/roasts/{slug}", headers=OTHER_HEADERS).status_code == 404

    owner_response = client.get(f"/roasts/{slug}", headers=OWNER_HEADERS)
    assert owner_response.status_code == 200
    assert owner_response.json()["is_owner"] is True
    assert owner_response.json()["visibility"] == "private"

    fake_db.report_shares.append(
        {
            "id": "share-1",
            "roast_id": row["id"],
            "email": "shared@example.com",
            "created_by": "user-1",
            "created_at": "2026-07-18T10:00:00Z",
        }
    )
    shared_response = client.get(f"/roasts/{slug}", headers=SHARED_HEADERS)
    assert shared_response.status_code == 200
    assert shared_response.json()["is_owner"] is False


def test_recent_excludes_private_roasts(fake_db: FakeSupabase) -> None:
    _ingest("public")
    _ingest("private")
    fake_db.rows[1]["visibility"] = "private"

    response = client.get("/roasts/recent")
    assert response.status_code == 200
    assert [row["title"] for row in response.json()] == ["public"]
