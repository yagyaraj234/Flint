"""Contract-level end-to-end: fixture in through /ingest, out through the
public and owner read paths. Locks the v3 privacy boundary — this is the test
the recovery plan asked for, so keep it green before merging anything."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import FakeSupabase

client = TestClient(app)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
FAKE_KEY = "sk-FAKE000000000000000000000000"
AUTH = {"Authorization": "Bearer good-token-user-1"}

PRIVATE_KEYS = {"raw_trace", "user_id", "batch_id", "error", "id"}


def test_fixture_roundtrip_public_and_owner(fake_db: FakeSupabase) -> None:
    trace = json.loads((FIXTURES / "leaked-key.json").read_text())

    ingest = client.post(
        "/ingest", json={"source": "upload", "title": "e2e", "trace": trace}, headers=AUTH
    )
    assert ingest.status_code == 200
    slug = ingest.json()["slug"]

    public = client.get(f"/roasts/{slug}")
    assert public.status_code == 200
    body = public.json()
    assert PRIVATE_KEYS.isdisjoint(body)
    assert FAKE_KEY not in public.text
    assert body["tier"] == "Charcoal"
    assert "leaked-secret" in {f["rule"] for f in body["findings"]}
    assert "unpriced_models" in body["cost"]
    assert body["detailed_report"]["generated"] is False

    recent = client.get("/roasts/recent")
    assert recent.status_code == 200
    assert slug in {r["slug"] for r in recent.json()}

    owner = client.get("/me/roasts", headers=AUTH)
    assert owner.status_code == 200
    rows = owner.json()
    assert {r["slug"] for r in rows} == {slug}
    assert FAKE_KEY not in owner.text

    assert client.get("/me/roasts").status_code == 401
