from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import BatchIngestResponse, BatchIngestResult
from app.routers import ingest, integrations, jobs

AUTH_HEADERS = {"Authorization": "Bearer good-token-user-1"}
UPGRADE_MESSAGE = "Upgrade to Pro to enable automatic sync"
client = TestClient(app)


class Query:
    def __init__(self, db: "FakeDb", table: str) -> None:
        self.db = db
        self.table = table
        self.filters: list[tuple[str, Any]] = []
        self.limit_value: int | None = None
        self.patch: dict[str, Any] | None = None

    def select(self, *_: Any, **__: Any) -> "Query":
        return self

    def eq(self, field: str, value: Any) -> "Query":
        self.filters.append((field, value))
        return self

    def limit(self, value: int) -> "Query":
        self.limit_value = value
        return self

    def update(self, patch: dict[str, Any]) -> "Query":
        self.patch = patch
        return self

    def execute(self) -> Any:
        rows = [
            row
            for row in self.db.rows[self.table]
            if all(row.get(field) == value for field, value in self.filters)
        ]
        if self.patch is not None:
            for row in rows:
                row.update(self.patch)
        if self.limit_value is not None:
            rows = rows[: self.limit_value]
        return SimpleNamespace(data=rows)


class Auth:
    def get_user(self, token: str) -> Any:
        if token != "good-token-user-1":
            raise ValueError("invalid token")
        return SimpleNamespace(user=SimpleNamespace(id="user-1"))


class FakeDb:
    def __init__(self) -> None:
        self.rows: dict[str, list[dict[str, Any]]] = {
            "subscriptions": [],
            "roasts": [],
            "langsmith_connections": [],
        }
        self.auth = Auth()

    def table(self, name: str) -> Query:
        return Query(self, name)


@pytest.fixture
def db(monkeypatch: pytest.MonkeyPatch) -> FakeDb:
    fake = FakeDb()
    settings = SimpleNamespace(
        cron_secret="cron",
        dodo_api_key="dodo-key",
        dodo_environment="test_mode",
        free_tier_monthly_scans=5,
    )
    monkeypatch.setattr("app.auth.get_supabase", lambda: fake)
    monkeypatch.setattr(integrations, "get_supabase", lambda: fake)
    monkeypatch.setattr(jobs, "get_supabase", lambda: fake)
    monkeypatch.setattr(ingest, "get_settings", lambda: settings)
    monkeypatch.setattr(jobs, "get_settings", lambda: settings)
    return fake


def _scan(user_id: str = "user-1") -> dict[str, str]:
    return {
        "user_id": user_id,
        "created_at": datetime.now(UTC).isoformat(),
    }


def _connection(connection_id: str, user_id: str) -> dict[str, Any]:
    return {
        "id": connection_id,
        "user_id": user_id,
        "label": "Production",
        "endpoint": "https://api.smith.langchain.com",
        "workspace_id": "workspace-1",
        "project_name": "project-1",
        "status": "active",
        "last_scan_count": 0,
        "last_error": None,
    }


def test_free_ingest_quota_and_anonymous_bypass(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.rows["roasts"] = [_scan() for _ in range(5)]
    pipeline_users: list[str | None] = []
    dodo_calls: list[object] = []
    monkeypatch.setattr(
        ingest,
        "run_pipeline",
        lambda _req, user_id=None: pipeline_users.append(user_id) or "slug1234",
    )
    monkeypatch.setattr(
        ingest, "ingest_usage_event", lambda *_args, **_kwargs: dodo_calls.append(True)
    )

    blocked = client.post(
        "/ingest", json={"source": "upload", "trace": {}}, headers=AUTH_HEADERS
    )
    assert blocked.status_code == 402
    assert blocked.json() == {
        "detail": "free_tier_scan_limit",
        "scans_used": 5,
        "scans_included": 5,
    }

    anonymous = client.post("/ingest", json={"source": "upload", "trace": {}})
    assert anonymous.status_code == 200
    assert pipeline_users == [None]
    assert dodo_calls == []


def test_free_ingest_under_quota_succeeds(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.rows["roasts"] = [_scan() for _ in range(4)]
    calls: list[str] = []
    monkeypatch.setattr(
        ingest,
        "run_pipeline",
        lambda _req, user_id=None: calls.append(str(user_id)) or "slug1234",
    )
    monkeypatch.setattr(
        ingest,
        "ingest_usage_event",
        lambda *_args, **_kwargs: pytest.fail("free scan emitted Dodo usage"),
    )

    response = client.post(
        "/ingest", json={"source": "upload", "trace": {}}, headers=AUTH_HEADERS
    )
    assert response.status_code == 200
    assert calls == ["user-1"]


def test_batch_quota_reserves_every_requested_scan(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.rows["roasts"] = [_scan() for _ in range(4)]
    monkeypatch.setattr(
        ingest, "run_batch", lambda *_args: pytest.fail("over-quota batch ran")
    )

    response = client.post(
        "/ingest/batch",
        json={"traces": [{}, {}]},
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 402
    assert response.json() == {
        "detail": "free_tier_scan_limit",
        "scans_used": 4,
        "scans_included": 5,
    }


def test_pro_ingest_and_successful_batch_results_emit_usage(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.rows["subscriptions"].append(
        {
            "user_id": "user-1",
            "plan": "pro",
            "dodo_customer_id": "customer-1",
        }
    )
    db.rows["roasts"] = [_scan() for _ in range(20)]
    dodo_calls: list[tuple[str, dict[str, str]]] = []
    monkeypatch.setattr(ingest, "run_pipeline", lambda *_args, **_kwargs: "slug1234")
    monkeypatch.setattr(
        ingest,
        "run_batch",
        lambda *_args: BatchIngestResponse(
            batch_id="00000000-0000-0000-0000-000000000001",
            results=[
                BatchIngestResult(slug="one", status="done"),
                BatchIngestResult(slug="two", status="failed", error="bad trace"),
                BatchIngestResult(slug="three", status="done"),
            ],
        ),
    )
    monkeypatch.setattr(
        ingest,
        "ingest_usage_event",
        lambda customer_id, **kwargs: dodo_calls.append((customer_id, kwargs)),
    )

    single = client.post(
        "/ingest", json={"source": "upload", "trace": {}}, headers=AUTH_HEADERS
    )
    batch = client.post(
        "/ingest/batch",
        json={"traces": [{}, {}, {}]},
        headers=AUTH_HEADERS,
    )
    assert single.status_code == 200
    assert batch.status_code == 200
    assert dodo_calls == [
        ("customer-1", {"api_key": "dodo-key", "environment": "test_mode"}),
        ("customer-1", {"api_key": "dodo-key", "environment": "test_mode"}),
        ("customer-1", {"api_key": "dodo-key", "environment": "test_mode"}),
    ]


def test_hourly_sync_pauses_free_and_syncs_pro(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    free = _connection("free-connection", "free-user")
    pro = _connection("pro-connection", "pro-user")
    db.rows["langsmith_connections"] = [free, pro]
    db.rows["subscriptions"].append(
        {
            "user_id": "pro-user",
            "plan": "pro",
            "dodo_customer_id": "customer-pro",
        }
    )
    synced: list[str] = []
    dodo_calls: list[str] = []
    monkeypatch.setattr(
        jobs,
        "sync_connection",
        lambda _db, connection_id: synced.append(connection_id) or 3,
    )
    monkeypatch.setattr(
        jobs,
        "ingest_usage_event",
        lambda customer_id, **_kwargs: dodo_calls.append(customer_id),
    )

    assert jobs.langsmith_hourly("cron") == {"scanned": 3}
    assert synced == ["pro-connection"]
    assert dodo_calls == ["customer-pro"] * 3
    assert free["status"] == "paused"
    assert free["last_error"] == UPGRADE_MESSAGE
    assert pro["status"] == "active"


def test_manual_sync_no_ops_free_and_syncs_pro(
    db: FakeDb, monkeypatch: pytest.MonkeyPatch
) -> None:
    free = _connection("free-connection", "free-user")
    pro = _connection("pro-connection", "pro-user")
    db.rows["langsmith_connections"] = [free, pro]
    db.rows["subscriptions"].append(
        {
            "user_id": "pro-user",
            "plan": "pro",
            "dodo_customer_id": "customer-pro",
        }
    )
    synced: list[str] = []
    dodo_calls: list[str] = []
    monkeypatch.setattr(
        integrations,
        "sync_connection",
        lambda _db, connection_id: synced.append(connection_id) or 2,
    )
    monkeypatch.setattr(
        integrations,
        "ingest_usage_event",
        lambda customer_id, **_kwargs: dodo_calls.append(customer_id),
    )

    free_result = integrations.sync("free-connection", "free-user")
    pro_result = integrations.sync("pro-connection", "pro-user")

    assert free_result["scanned"] == 0
    assert free_result["connection"]["status"] == "paused"
    assert free_result["connection"]["last_error"] == UPGRADE_MESSAGE
    assert pro_result["scanned"] == 2
    assert synced == ["pro-connection"]
    assert dodo_calls == ["customer-pro"] * 2
