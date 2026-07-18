from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.config import get_settings
from app.integrations import langsmith
from app.main import app
from app.models import IngestRequest
from app.security.credentials import decrypt_credential, encrypt_credential


class Query:
    def __init__(self, db: "FakeDb", table: str) -> None:
        self.db, self.table, self.filters, self.patch = db, table, [], None
        self.limit_value: int | None = None
        self.or_value = ""
        self.delete_row = False

    def select(self, *_: Any) -> "Query": return self
    def eq(self, field: str, value: Any) -> "Query": self.filters.append((field, value)); return self
    def order(self, *_: Any, **__: Any) -> "Query": return self
    def limit(self, value: int) -> "Query": self.limit_value = value; return self
    def or_(self, value: str) -> "Query": self.or_value = value; return self
    def update(self, patch: dict[str, Any]) -> "Query": self.patch = patch; return self
    def delete(self) -> "Query": self.delete_row = True; return self

    def insert(self, row: dict[str, Any]) -> "Query":
        stored = {"id": f"{self.table}-{len(self.db.rows[self.table]) + 1}", **row}
        self.db.rows[self.table].append(stored)
        self.inserted = stored
        return self

    def execute(self) -> Any:
        rows = [row for row in self.db.rows[self.table] if all(row.get(key) == value for key, value in self.filters)]
        if self.or_value:
            now = datetime.fromisoformat(self.or_value.split(".lt.", 1)[1])
            rows = [row for row in rows if not row.get("sync_locked_until") or datetime.fromisoformat(row["sync_locked_until"]) < now]
        if self.patch is not None:
            for row in rows: row.update(self.patch)
        if self.delete_row:
            self.db.rows[self.table] = [row for row in self.db.rows[self.table] if row not in rows]
        if self.limit_value is not None: rows = rows[: self.limit_value]
        return type("Result", (), {"data": rows})()


class FakeDb:
    def __init__(self) -> None:
        self.rows: dict[str, list[dict[str, Any]]] = {"langsmith_connections": [], "roasts": []}

    def table(self, name: str) -> Query:
        return Query(self, name)


def _settings(monkeypatch: Any) -> None:
    monkeypatch.setenv("LANGSMITH_CREDENTIAL_KEY", "MkNqWyi8O4u5mJ6Vtp79n4dQ0s2lhWJrYMrRrTctHLA=")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "internal")
    monkeypatch.setenv("CRON_SECRET", "cron")
    get_settings.cache_clear()


def test_credentials_are_versioned_ciphertext(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    ciphertext = encrypt_credential("lsv2_secret")
    assert ciphertext.startswith("v1:")
    assert "lsv2_secret" not in ciphertext
    assert decrypt_credential(ciphertext) == "lsv2_secret"


def test_connection_response_excludes_api_key(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    connection = langsmith.create_connection(
        db,
        "user-1",
        langsmith.LangSmithConnectionCreate(
            label="Prod", endpoint="https://api.smith.langchain.com", api_key="lsv2_secret", workspace_id="tenant", project_name="support"
        ),
    )
    assert connection.id
    assert "api_key" not in connection.model_dump()
    assert db.rows["langsmith_connections"][0]["api_key_encrypted"] != "lsv2_secret"


def test_connection_rejects_unapproved_endpoint_and_duplicate_scope(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    data = langsmith.LangSmithConnectionCreate(
        label="Prod", endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="tenant", project_name="support"
    )
    langsmith.create_connection(db, "user-1", data)
    try:
        langsmith.create_connection(db, "user-1", data)
        assert False, "duplicate connections must be rejected"
    except ValueError as exc:
        assert "already connected" in str(exc)
    try:
        langsmith.create_connection(
            db,
            "user-1",
            langsmith.LangSmithConnectionCreate(
                label="Bad", endpoint="https://example.com", api_key="key", workspace_id="tenant", project_name="other"
            ),
        )
        assert False, "unapproved endpoints must be rejected"
    except ValueError as exc:
        assert "approved HTTPS" in str(exc)


def test_connection_crud_is_owner_scoped(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    connection = langsmith.create_connection(
        db,
        "user-1",
        langsmith.LangSmithConnectionCreate(
            label="Prod", endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="tenant", project_name="support"
        ),
    )
    assert langsmith.get_connection(db, "user-2", connection.id) is None
    assert langsmith.update_connection(
        db, "user-2", connection.id, langsmith.LangSmithConnectionUpdate(label="Other")
    ) is None
    assert not langsmith.delete_connection(db, "user-2", connection.id)


def test_sync_is_idempotent_and_releases_lease(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "label": "Prod", "endpoint": "https://api.smith.langchain.com",
        "workspace_id": "tenant", "project_name": "support", "status": "active", "api_key_encrypted": encrypt_credential("key"),
        "last_scan_count": 0, "sync_locked_until": None,
    })

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def completed_runs(self, *_: Any) -> list[dict[str, Any]]:
            return [{"id": "run-1", "trace_id": "trace-1", "run_type": "llm", "inputs": {"key": "sk-FAKE000000000000000000000000"}, "start_time": "2026-07-18T10:00:00Z", "end_time": "2026-07-18T10:00:01Z"}]
        def trace_runs(self, *_: Any) -> list[dict[str, Any]]: return []

    def pipeline(request: IngestRequest) -> str:
        db.rows["roasts"].append({"id": "roast-1", "langsmith_connection_id": request.langsmith_connection_id, "external_trace_id": request.external_trace_id})
        return "roast"

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    monkeypatch.setattr(langsmith, "run_pipeline", pipeline)
    assert langsmith.sync_connection(db, "connection-1") == 1
    assert langsmith.sync_connection(db, "connection-1") == 0
    connection = db.rows["langsmith_connections"][0]
    assert len(db.rows["roasts"]) == 1
    assert connection["sync_locked_until"] is None
    assert connection["cursor_run_id"] == "run-1"


def test_overlap_pagination_reaches_roots_after_existing_traces(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    monkeypatch.setenv("LANGSMITH_SYNC_BATCH_SIZE", "2")
    get_settings.cache_clear()
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "label": "Prod", "endpoint": "https://api.smith.langchain.com",
        "workspace_id": "tenant", "project_name": "support", "status": "active", "api_key_encrypted": encrypt_credential("key"),
        "cursor_time": "2026-07-18T09:00:00+00:00", "cursor_run_id": "run-0", "last_scan_count": 0, "sync_locked_until": None,
    })
    db.rows["roasts"].extend([
        {"id": "roast-1", "langsmith_connection_id": "connection-1", "external_trace_id": "trace-1"},
        {"id": "roast-2", "langsmith_connection_id": "connection-1", "external_trace_id": "trace-2"},
    ])
    calls: list[int] = []

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def completed_runs(self, *args: Any) -> list[dict[str, Any]]:
            offset = args[-1]
            calls.append(offset)
            if offset == 0:
                return [
                    {"id": "run-1", "trace_id": "trace-1", "run_type": "llm", "inputs": {}, "start_time": "2026-07-18T10:00:00Z", "end_time": "2026-07-18T10:00:01Z"},
                    {"id": "run-2", "trace_id": "trace-2", "run_type": "llm", "inputs": {}, "start_time": "2026-07-18T10:00:00Z", "end_time": "2026-07-18T10:00:01Z"},
                ]
            return [{"id": "run-3", "trace_id": "trace-3", "run_type": "llm", "inputs": {}, "start_time": "2026-07-18T10:00:00Z", "end_time": "2026-07-18T10:00:01Z"}]
        def trace_runs(self, *_: Any) -> list[dict[str, Any]]: return []

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    monkeypatch.setattr(langsmith, "run_pipeline", lambda request: db.rows["roasts"].append({"id": "roast-3", "langsmith_connection_id": request.langsmith_connection_id, "external_trace_id": request.external_trace_id}))
    assert langsmith.sync_connection(db, "connection-1") == 1
    assert calls == [0, 2]
    assert db.rows["langsmith_connections"][0]["cursor_run_id"] == "run-3"


def test_manual_sync_skips_when_hourly_sync_holds_the_lease(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "status": "active", "endpoint": "https://api.smith.langchain.com",
        "workspace_id": "tenant", "project_name": "support", "api_key_encrypted": encrypt_credential("key"),
        "last_scan_count": 0, "sync_locked_until": None,
    })
    attempts: list[int] = []

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def completed_runs(self, *_: Any) -> list[dict[str, Any]]:
            attempts.append(langsmith.sync_connection(db, "connection-1"))
            return []
        def trace_runs(self, *_: Any) -> list[dict[str, Any]]: return []

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    assert langsmith.sync_connection(db, "connection-1") == 0
    assert attempts == [0]


def test_held_lease_skips_sync(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "status": "active", "api_key_encrypted": encrypt_credential("key"),
        "sync_locked_until": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
    })
    assert langsmith.sync_connection(db, "connection-1") == 0


def test_provider_failure_preserves_cursor_and_marks_invalid_key(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "status": "active", "endpoint": "https://api.smith.langchain.com",
        "workspace_id": "tenant", "project_name": "support", "api_key_encrypted": encrypt_credential("key"),
        "cursor_time": "2026-07-18T09:00:00+00:00", "sync_locked_until": None,
    })

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def completed_runs(self, *_: Any) -> list[dict[str, Any]]: raise langsmith.LangSmithError("invalid_key")

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    assert langsmith.sync_connection(db, "connection-1") == 0
    connection = db.rows["langsmith_connections"][0]
    assert connection["status"] == "invalid"
    assert connection["cursor_time"] == "2026-07-18T09:00:00+00:00"


def test_rate_limit_preserves_cursor_and_keeps_connection_active(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "status": "active", "endpoint": "https://api.smith.langchain.com",
        "workspace_id": "tenant", "project_name": "support", "api_key_encrypted": encrypt_credential("key"),
        "cursor_time": "2026-07-18T09:00:00+00:00", "sync_locked_until": None,
    })

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def completed_runs(self, *_: Any) -> list[dict[str, Any]]: raise langsmith.LangSmithError("rate_limited")

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    assert langsmith.sync_connection(db, "connection-1") == 0
    connection = db.rows["langsmith_connections"][0]
    assert connection["status"] == "active"
    assert connection["last_error"] == "rate_limited"
    assert connection["cursor_time"] == "2026-07-18T09:00:00+00:00"


def test_pipeline_failure_does_not_advance_cursor(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "status": "active", "endpoint": "https://api.smith.langchain.com",
        "workspace_id": "tenant", "project_name": "support", "api_key_encrypted": encrypt_credential("key"),
        "cursor_time": "2026-07-18T09:00:00+00:00", "sync_locked_until": None,
    })

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def completed_runs(self, *_: Any) -> list[dict[str, Any]]: return [{"id": "run-2", "trace_id": "trace-2", "run_type": "llm", "inputs": {}, "end_time": "2026-07-18T10:00:01Z"}]
        def trace_runs(self, *_: Any) -> list[dict[str, Any]]: return []

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    monkeypatch.setattr(langsmith, "run_pipeline", lambda _: (_ for _ in ()).throw(RuntimeError("database unavailable")))
    assert langsmith.sync_connection(db, "connection-1") == 0
    connection = db.rows["langsmith_connections"][0]
    assert connection["last_error"] == "pipeline_failed"
    assert connection["cursor_time"] == "2026-07-18T09:00:00+00:00"


def test_internal_endpoints_reject_missing_or_wrong_secrets(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    client = TestClient(app)
    assert client.get("/integrations/langsmith").status_code == 401
    assert client.post("/internal/jobs/langsmith-hourly", headers={"x-cron-secret": "nope"}).status_code == 401


def test_discovery_returns_safe_workspace_and_project_metadata(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    client = TestClient(app)

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def list_workspaces(self) -> list[dict[str, Any]]:
            return [{"id": "workspace-1", "display_name": "Production", "api_key": "lsv2_secret"}]
        def list_projects(self) -> list[dict[str, Any]]:
            return [{"name": "support-agent", "api_key": "lsv2_secret"}]

    monkeypatch.setattr("app.routers.integrations.LangSmithClient", Client)
    headers = {"x-internal-api-token": "internal", "x-user-id": "user-1"}
    validate = client.post(
        "/integrations/langsmith/validate-key",
        headers=headers,
        json={"endpoint": "https://api.smith.langchain.com", "api_key": "lsv2_secret"},
    )
    discover = client.post(
        "/integrations/langsmith/discover",
        headers=headers,
        json={"endpoint": "https://api.smith.langchain.com", "api_key": "lsv2_secret", "workspace_id": "workspace-1"},
    )
    assert validate.json() == {"workspaces": [{"id": "workspace-1", "name": "Production"}]}
    assert discover.json() == {"projects": [{"name": "support-agent"}]}
