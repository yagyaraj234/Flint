import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import FakeSupabase

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
CLEAN_TRACE = json.loads((FIXTURES / "clean.json").read_text())
HEADERS = {"Authorization": "Bearer good-token-user-1"}


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
