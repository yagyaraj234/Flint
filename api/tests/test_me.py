import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import FakeSupabase

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
CLEAN_TRACE = json.loads((FIXTURES / "clean.json").read_text())
HEADERS = {"Authorization": "Bearer good-token-user-1"}
OTHER_HEADERS = {"Authorization": "Bearer good-token-user-3"}


def test_owner_roasts_require_auth_and_filter_by_owner_and_batch(fake_db: FakeSupabase) -> None:
    assert client.get("/me/roasts").status_code == 401
    first = client.post(
        "/ingest/batch",
        json={"title": "owned", "traces": [CLEAN_TRACE, CLEAN_TRACE]},
        headers=HEADERS,
    ).json()
    second = client.post(
        "/ingest/batch",
        json={"title": "other batch", "traces": [CLEAN_TRACE]},
        headers=HEADERS,
    ).json()
    fake_db.rows.append({**fake_db.rows[0], "id": "other-user", "slug": "otherusr", "user_id": "user-2"})

    response = client.get("/me/roasts", headers=HEADERS)
    assert response.status_code == 200
    assert {row["user_id"] for row in fake_db.rows if row["slug"] != "otherusr"} == {"user-1"}
    assert {row["batch_id"] for row in response.json()} == {first["batch_id"], second["batch_id"]}
    filtered = client.get(f"/me/roasts?batch_id={first['batch_id']}", headers=HEADERS)
    assert {row["batch_id"] for row in filtered.json()} == {first["batch_id"]}
    assert len(filtered.json()) == 2


def test_owner_can_manage_visibility_and_shares(fake_db: FakeSupabase) -> None:
    slug = client.post(
        "/ingest/batch",
        json={"title": "owned", "traces": [CLEAN_TRACE]},
        headers=HEADERS,
    ).json()["results"][0]["slug"]
    sharing_url = f"/me/roasts/{slug}/sharing"

    assert client.get(sharing_url).status_code == 401
    assert client.get(sharing_url, headers=OTHER_HEADERS).status_code == 404
    assert client.get(sharing_url, headers=HEADERS).json() == {
        "visibility": "public",
        "shares": [],
    }

    private = client.put(
        f"/me/roasts/{slug}/visibility",
        json={"visibility": "private"},
        headers=HEADERS,
    )
    assert private.status_code == 200
    assert private.json() == {"visibility": "private", "shares": []}

    share_url = f"/me/roasts/{slug}/shares"
    for _ in range(2):
        response = client.post(
            share_url,
            json={"email": " Team@Example.COM "},
            headers=HEADERS,
        )
        assert response.status_code == 200
    assert response.json() == {
        "visibility": "private",
        "shares": [
            {
                "email": "team@example.com",
                "created_at": "2026-07-18T10:00:00Z",
            }
        ],
    }
    assert len(fake_db.report_shares) == 1
    assert client.post(share_url, json={"email": "invalid"}, headers=HEADERS).status_code == 422

    deleted = client.delete(
        f"{share_url}/TEAM%40EXAMPLE.COM",
        headers=HEADERS,
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"visibility": "private", "shares": []}

    public = client.put(
        f"/me/roasts/{slug}/visibility",
        json={"visibility": "public"},
        headers=HEADERS,
    )
    assert public.status_code == 200
    assert client.get(sharing_url, headers=HEADERS).json()["visibility"] == "public"
