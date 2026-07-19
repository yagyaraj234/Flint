from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.config import get_settings
from app.integrations import langsmith
from app.main import app
from app.models import (
    IngestRequest,
    LangSmithConnectionCreate,
    LangSmithConnectionResponse,
    LangSmithConnectionUpdate,
    LangSmithDiscoverRequest,
    LangSmithValidateKeyRequest,
)
from app.routers import integrations
from app.security.credentials import CredentialError, decrypt_credential, encrypt_credential


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

    def pipeline(request: IngestRequest, **kwargs: Any) -> str:
        db.rows["roasts"].append({"id": "roast-1", "langsmith_connection_id": kwargs["langsmith_connection_id"], "external_trace_id": kwargs["external_trace_id"]})
        return "roast"

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    monkeypatch.setattr(langsmith, "run_pipeline", pipeline)
    assert langsmith.sync_connection(db, "connection-1").scanned == 1
    assert langsmith.sync_connection(db, "connection-1").scanned == 0
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
    def pipeline(_request: IngestRequest, **kwargs: Any) -> str:
        db.rows["roasts"].append({"id": "roast-3", "langsmith_connection_id": kwargs["langsmith_connection_id"], "external_trace_id": kwargs["external_trace_id"]})
        return "roast-3"

    monkeypatch.setattr(langsmith, "run_pipeline", pipeline)
    assert langsmith.sync_connection(db, "connection-1").scanned == 1
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
            attempts.append(langsmith.sync_connection(db, "connection-1").scanned)
            return []
        def trace_runs(self, *_: Any) -> list[dict[str, Any]]: return []

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    assert langsmith.sync_connection(db, "connection-1").scanned == 0
    assert attempts == [0]


def test_held_lease_skips_sync(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    db.rows["langsmith_connections"].append({
        "id": "connection-1", "user_id": "user-1", "status": "active", "api_key_encrypted": encrypt_credential("key"),
        "sync_locked_until": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
    })
    assert langsmith.sync_connection(db, "connection-1").scanned == 0


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
    assert langsmith.sync_connection(db, "connection-1").scanned == 0
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
    assert langsmith.sync_connection(db, "connection-1").scanned == 0
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
    assert langsmith.sync_connection(db, "connection-1").scanned == 0
    connection = db.rows["langsmith_connections"][0]
    assert connection["last_error"] == "pipeline_failed"
    assert connection["cursor_time"] == "2026-07-18T09:00:00+00:00"


def test_internal_endpoints_reject_missing_or_wrong_secrets(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    client = TestClient(app)
    assert client.get("/integrations/langsmith").status_code == 401
    assert client.post("/internal/jobs/langsmith-sync", headers={"x-cron-secret": "nope"}).status_code == 401


def test_discovery_returns_safe_workspace_and_project_metadata(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    client = TestClient(app)

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def list_workspaces(self) -> list[dict[str, Any]]:
            return [{"id": "workspace-1", "display_name": "Production", "api_key": "lsv2_secret"}]
        def list_projects(self) -> list[dict[str, Any]]:
            return [{"name": "support-agent", "api_key": "lsv2_secret"}]

    monkeypatch.setattr("app.integrations.langsmith.LangSmithClient", Client)
    monkeypatch.setattr("app.routers.integrations.get_supabase", lambda: object())
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


def test_credentials_reject_invalid_or_unconfigured_values(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    for value in ("", "  "):
        try:
            encrypt_credential(value)
            assert False, "empty credentials must be rejected"
        except CredentialError as exc:
            assert "required" in str(exc)
    for value in ("invalid", "v2:token", "v1:"):
        try:
            decrypt_credential(value)
            assert False, "unsupported values must be rejected"
        except CredentialError:
            pass
    monkeypatch.setenv("LANGSMITH_CREDENTIAL_KEY", "")
    get_settings.cache_clear()
    try:
        encrypt_credential("key")
        assert False, "an absent encryption key must be rejected"
    except CredentialError as exc:
        assert "not configured" in str(exc)


def test_credentials_reject_invalid_key_and_corrupt_ciphertext(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    monkeypatch.setenv("LANGSMITH_CREDENTIAL_KEY", "not-a-fernet-key")
    get_settings.cache_clear()
    try:
        encrypt_credential("key")
        assert False, "an invalid encryption key must be rejected"
    except CredentialError as exc:
        assert "invalid" in str(exc)
    _settings(monkeypatch)
    try:
        decrypt_credential("v1:not-a-token")
        assert False, "corrupt ciphertext must be rejected"
    except CredentialError as exc:
        assert "cannot be decrypted" in str(exc)


def test_integration_router_maps_provider_and_validation_errors(monkeypatch: Any) -> None:
    _settings(monkeypatch)

    class Connections:
        def __init__(self, _: Any) -> None: pass
        def workspaces(self, *_: Any) -> list[dict[str, str]]: raise langsmith.LangSmithError("invalid_key")
        def projects(self, *_: Any) -> list[dict[str, str]]: raise ValueError("bad workspace")
        def create(self, *_: Any) -> LangSmithConnectionResponse: raise langsmith.LangSmithError("provider_unavailable")

    monkeypatch.setattr(integrations, "get_supabase", lambda: object())
    monkeypatch.setattr(integrations, "LangSmithConnections", Connections)
    for call, code, detail in (
        (lambda: integrations.validate_key(LangSmithValidateKeyRequest(endpoint="https://api.smith.langchain.com", api_key="key"), "user"), 401, "invalid_key"),
        (lambda: integrations.discover(LangSmithDiscoverRequest(endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="ws"), "user"), 422, "bad workspace"),
        (lambda: integrations.connect(LangSmithConnectionCreate(label="Prod", endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="ws", project_name="project"), "user"), 502, "provider_unavailable"),
    ):
        try:
            call()
            assert False, "provider failures must become HTTP responses"
        except HTTPException as exc:
            assert (exc.status_code, exc.detail) == (code, detail)


def test_integration_router_connection_lifecycle(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    connection = LangSmithConnectionResponse(
        id="connection-1", label="Prod", endpoint="https://api.smith.langchain.com", workspace_id="ws", project_name="project", status="active"
    )

    class SyncResult:
        scanned = 2
        scan_slugs = ("one", "two")

    class Connections:
        exists = True
        update_result: LangSmithConnectionResponse | None = connection
        delete_result = True
        def __init__(self, _: Any) -> None: pass
        def workspaces(self, *_: Any) -> list[dict[str, str]]: return [{"id": "ws", "name": "fallback"}, {"display_name": "missing"}]
        def projects(self, *_: Any) -> list[dict[str, str]]: return [{"project_name": "project"}, {"name": ""}]
        def create(self, *_: Any) -> LangSmithConnectionResponse: return connection
        def list(self, _: str) -> list[LangSmithConnectionResponse]: return [connection]
        def update(self, *_: Any) -> LangSmithConnectionResponse | None: return self.update_result
        def get(self, *_: Any) -> LangSmithConnectionResponse | None: return connection if self.exists else None
        def sync(self, _: str) -> SyncResult: return SyncResult()
        def delete(self, *_: Any) -> bool: return self.delete_result

    class Entitlement:
        is_pro = True

    monkeypatch.setattr(integrations, "get_supabase", lambda: object())
    monkeypatch.setattr(integrations, "LangSmithConnections", Connections)
    monkeypatch.setattr(integrations, "scan_entitlement", lambda *_: Entitlement())
    queued: list[tuple[Any, ...]] = []
    monkeypatch.setattr(integrations, "queue_completed_scans", lambda *args: queued.append(args))
    assert integrations.validate_key(LangSmithValidateKeyRequest(endpoint="https://api.smith.langchain.com", api_key="key"), "user") == {"workspaces": [{"id": "ws", "name": "fallback"}]}
    assert integrations.discover(LangSmithDiscoverRequest(endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="ws"), "user") == {"projects": [{"name": "project"}]}
    assert integrations.connect(LangSmithConnectionCreate(label="Prod", endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="ws", project_name="project"), "user") == connection
    assert integrations.connections("user") == [connection]
    assert integrations.patch_connection("connection-1", LangSmithConnectionUpdate(label="New"), "user") == connection
    assert integrations.sync("connection-1", "user") == {"scanned": 2, "connection": connection.model_dump()}
    assert len(queued) == 1
    assert integrations.disconnect("connection-1", "user") is None


def test_integration_router_handles_absent_connections_and_free_sync(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    connection = LangSmithConnectionResponse(
        id="connection-1", label="Prod", endpoint="https://api.smith.langchain.com", workspace_id="ws", project_name="project", status="paused"
    )

    class Connections:
        exists = False
        update_result: LangSmithConnectionResponse | None = None
        delete_result = False
        def __init__(self, _: Any) -> None: pass
        def update(self, *_: Any) -> LangSmithConnectionResponse | None: return self.update_result
        def get(self, *_: Any) -> LangSmithConnectionResponse | None: return connection if self.exists else None
        def delete(self, *_: Any) -> bool: return self.delete_result

    class Entitlement:
        is_pro = False

    monkeypatch.setattr(integrations, "get_supabase", lambda: object())
    monkeypatch.setattr(integrations, "LangSmithConnections", Connections)
    for call in (
        lambda: integrations.patch_connection("connection-1", LangSmithConnectionUpdate(label="New"), "user"),
        lambda: integrations.sync("connection-1", "user"),
        lambda: integrations.disconnect("connection-1", "user"),
    ):
        try:
            call()
            assert False, "missing connections must return 404"
        except HTTPException as exc:
            assert exc.status_code == 404
    Connections.exists = True
    monkeypatch.setattr(integrations, "scan_entitlement", lambda *_: Entitlement())
    paused: list[tuple[Any, ...]] = []
    monkeypatch.setattr(integrations, "pause_connection_for_entitlement", lambda *args: paused.append(args))
    assert integrations.sync("connection-1", "user") == {"scanned": 0, "connection": connection.model_dump()}
    assert len(paused) == 1


def test_integration_router_exposes_all_error_contracts(monkeypatch: Any) -> None:
    _settings(monkeypatch)

    class Connections:
        failure: Exception | None = None
        def __init__(self, _: Any) -> None: pass
        def workspaces(self, *_: Any) -> list[dict[str, str]]: raise self.failure or ValueError("workspace failed")
        def projects(self, *_: Any) -> list[dict[str, str]]: raise self.failure or ValueError("project failed")
        def create(self, *_: Any) -> LangSmithConnectionResponse: raise self.failure or ValueError("create failed")
        def update(self, *_: Any) -> LangSmithConnectionResponse: raise self.failure or ValueError("update failed")

    monkeypatch.setattr(integrations, "get_supabase", lambda: object())
    monkeypatch.setattr(integrations, "LangSmithConnections", Connections)
    create = LangSmithConnectionCreate(label="Prod", endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="ws", project_name="project")
    discover = LangSmithDiscoverRequest(endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="ws")
    update = LangSmithConnectionUpdate(label="New")
    calls = (
        lambda: integrations.require_internal_user("internal", None),
        lambda: integrations.validate_key(LangSmithValidateKeyRequest(endpoint="https://api.smith.langchain.com", api_key="key"), "user"),
        lambda: integrations.discover(discover, "user"),
        lambda: integrations.connect(create, "user"),
    )
    for call in calls:
        try:
            call()
            assert False, "invalid request state must be an HTTP response"
        except HTTPException as exc:
            assert exc.status_code in (400, 422)
    Connections.failure = langsmith.LangSmithError("rate_limited")
    try:
        integrations.discover(discover, "user")
        assert False, "provider errors must preserve their code"
    except HTTPException as exc:
        assert (exc.status_code, exc.detail) == (502, "rate_limited")
    for failure, code, detail in (
        (langsmith.LangSmithError("rate_limited"), 502, "rate_limited"),
        (CredentialError("bad credential"), 422, "Stored credential cannot be used. Reconnect with a new key."),
        (HTTPException(status_code=409, detail="conflict"), 409, "conflict"),
        (ValueError("update failed"), 422, "update failed"),
    ):
        Connections.failure = failure
        try:
            integrations.patch_connection("connection-1", update, "user")
            assert False, "updates must preserve their documented error response"
        except HTTPException as exc:
            assert (exc.status_code, exc.detail) == (code, detail)


def test_langsmith_client_and_adapter_boundary_cases(monkeypatch: Any) -> None:
    assert langsmith._endpoint("https://api.smith.langchain.com/") == "https://api.smith.langchain.com"
    for endpoint in ("http://api.smith.langchain.com", "https://example.com", "https://u:p@api.smith.langchain.com", "https://api.smith.langchain.com/path"):
        try:
            langsmith._endpoint(endpoint)
            assert False, "only approved root HTTPS endpoints are valid"
        except ValueError:
            pass
    assert langsmith._safe_rows([{}, "skip"]) == [{}]
    assert langsmith._safe_rows({"results": [{}, "skip"]}) == [{}]
    assert langsmith._safe_rows({"unknown": []}) == []
    assert langsmith._headers("key") == {"X-Api-Key": "key"}
    assert langsmith._headers("key", "workspace")["X-Tenant-Id"] == "workspace"

    class Response:
        def __init__(self, status: int, payload: object = {}) -> None:
            self.status_code, self.payload = status, payload
            self.is_error = status >= 400
        def json(self) -> object:
            if self.payload == "invalid": raise ValueError("bad JSON")
            return self.payload

    class Client:
        response: Response | Exception = Response(200, {"items": [{"id": "one"}]})
        def __init__(self, **_: Any) -> None: pass
        def __enter__(self) -> "Client": return self
        def __exit__(self, *_: Any) -> None: pass
        def request(self, *_: Any, **__: Any) -> Response:
            if isinstance(self.response, Exception): raise self.response
            return self.response

    monkeypatch.setattr(langsmith.httpx, "Client", Client)
    client = langsmith.LangSmithClient("https://api.smith.langchain.com", "key", "workspace")
    assert client.list_workspaces() == [{"id": "one"}]
    assert client.list_projects() == [{"id": "one"}]
    assert client.completed_runs(datetime(2026, 1, 1, tzinfo=UTC), 2, "project") == []
    assert client.trace_runs([], 2, "project") == []
    for response, code in ((Response(401), "invalid_key"), (Response(429), "rate_limited"), (Response(500), "provider_unavailable"), (Response(400), "provider_request_failed"), (Response(200, "invalid"), "provider_response_invalid"), (httpx.TimeoutException("slow"), "provider_timeout"), (httpx.ConnectError("down"), "provider_unavailable")):
        Client.response = response
        try:
            client._request("GET", "/path")
            assert False, "provider errors must be stable codes"
        except langsmith.LangSmithError as exc:
            assert exc.code == code

    root = {"id": "root", "trace_id": "trace", "run_type": "llm", "name": "root", "inputs": {"x": 1}, "outputs": {"y": 2}, "start_time": "2026-01-01T00:00:00Z", "end_time": "2026-01-01T00:00:01Z", "usage_metadata": {"prompt_tokens": 2, "completion_tokens": 3}}
    child = {"id": "child", "trace_id": "trace", "parent_run_id": "root", "run_type": "custom", "error": "failed", "extra": {"metadata": {"ls_model_name": "model"}}}
    trace = langsmith.to_generic_trace(root, [root, child])
    assert trace["trace_id"] == "trace" and len(trace["spans"]) == 2
    assert trace["spans"][0]["usage"] == {"input_tokens": 2, "output_tokens": 3}
    assert trace["spans"][1]["output"]["error"] == "failed"
    assert langsmith._time_ms("bad") is None and langsmith._duration_ms({"start_time": "bad", "end_time": "bad"}) is None


def test_langsmith_lifecycle_helpers_and_facade(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    row = {"id": "connection-1", "user_id": "user", "label": "Prod", "endpoint": "https://api.smith.langchain.com", "workspace_id": "workspace", "project_name": "project", "status": "active", "api_key_encrypted": encrypt_credential("key"), "last_scan_count": 0}
    db.rows["langsmith_connections"].append(row)

    class Client:
        def __init__(self, *_: Any) -> None: pass
        def list_workspaces(self) -> list[dict[str, str]]: return [{"id": "workspace"}]
        def list_projects(self) -> list[dict[str, str]]: return [{"name": "project"}]

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    langsmith.validate_connection_scope(row["endpoint"], "key", "workspace", "project")
    for workspace, project in (("missing", "project"), ("workspace", "missing")):
        try:
            langsmith.validate_connection_scope(row["endpoint"], "key", workspace, project)
            assert False, "provider scope must be verified"
        except ValueError:
            pass
    assert langsmith.list_connections(db, "user")[0].id == "connection-1"
    assert langsmith.get_connection_record(db, "user", "connection-1") == row
    assert langsmith.get_connection_record(db, "user", "missing") is None
    assert langsmith.update_connection(db, "user", "connection-1", LangSmithConnectionUpdate())
    try:
        langsmith.update_connection(db, "user", "connection-1", LangSmithConnectionUpdate(label=" "))
        assert False, "blank lifecycle fields are invalid"
    except ValueError:
        pass
    monkeypatch.setattr(langsmith, "validate_connection_scope", lambda *_: None)
    assert langsmith.update_connection(db, "user", "connection-1", LangSmithConnectionUpdate(api_key="new"))
    assert langsmith.update_connection(db, "user", "connection-1", LangSmithConnectionUpdate(project_name="new"))
    calls: list[str] = []
    monkeypatch.setattr(langsmith, "create_connection", lambda *_: calls.append("create") or langsmith.connection_response(row))
    monkeypatch.setattr(langsmith, "list_connections", lambda *_: calls.append("list") or [langsmith.connection_response(row)])
    monkeypatch.setattr(langsmith, "get_connection", lambda *_: calls.append("get") or langsmith.connection_response(row))
    monkeypatch.setattr(langsmith, "sync_connection", lambda *_: calls.append("sync") or langsmith.SyncResult(1, ("slug",)))
    monkeypatch.setattr(langsmith, "delete_connection", lambda *_: calls.append("delete") or True)
    facade = langsmith.LangSmithConnections(db)
    assert facade.workspaces(row["endpoint"], "key") == [{"id": "workspace"}]
    assert facade.projects(row["endpoint"], "key", "workspace") == [{"name": "project"}]
    assert facade.create("user", LangSmithConnectionCreate(label="Prod", endpoint=row["endpoint"], api_key="key", workspace_id="workspace", project_name="project"))
    assert facade.list("user") and facade.get("user", "connection-1") and facade.sync("connection-1").scanned == 1 and facade.delete("user", "connection-1")
    assert {"create", "list", "get", "sync", "delete"} <= set(calls)


def test_langsmith_facade_update_missing_and_active_syncs(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    facade = langsmith.LangSmithConnections(db)
    assert facade.update("user", "missing", LangSmithConnectionUpdate(label="new")) is None
    db.rows["langsmith_connections"].extend([
        {"id": "one", "user_id": "user", "label": "one", "endpoint": "https://api.smith.langchain.com", "workspace_id": "workspace", "project_name": "project", "status": "active", "api_key_encrypted": encrypt_credential("key")},
        {"id": "two", "user_id": "user", "label": "two", "endpoint": "https://api.smith.langchain.com", "workspace_id": "workspace", "project_name": "project", "status": "paused", "api_key_encrypted": encrypt_credential("key")},
    ])
    monkeypatch.setattr(langsmith, "validate_connection_scope", lambda *_: None)
    assert facade.update("user", "one", LangSmithConnectionUpdate(project_name="next"))
    monkeypatch.setattr(langsmith, "sync_connection", lambda _, connection_id: langsmith.SyncResult(1 if connection_id == "one" else 0))
    assert langsmith.sync_active_connections(db) == 1


def test_langsmith_remaining_helper_edges(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    try:
        langsmith._endpoint("https://api.smith.langchain.com:bad")
        assert False, "invalid ports are invalid endpoints"
    except ValueError:
        pass


def test_langsmith_pagination_and_sync_failure_edges(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    monkeypatch.setenv("LANGSMITH_SYNC_BATCH_SIZE", "1")
    get_settings.cache_clear()
    db = FakeDb()
    connection = {"id": "connection", "project_name": "project", "cursor_time": None}

    class Client:
        completed_calls = 0
        trace_calls = 0
        def completed_runs(self, *_: Any) -> list[dict[str, Any]]:
            self.completed_calls += 1
            return [{"id": "one", "trace_id": "one"}, {"id": "duplicate", "trace_id": "one"}, {"id": "two", "trace_id": "two"}] if self.completed_calls == 1 else []
        def trace_runs(self, *_: Any) -> list[dict[str, Any]]:
            self.trace_calls += 1
            return [{"trace_id": "one"}] if self.trace_calls == 1 else []

    client = Client()
    pending, checkpointed = langsmith._pending_roots(db, client, connection, datetime(2026, 1, 1, tzinfo=UTC))
    assert [root["id"] for root in pending] == ["duplicate"] and [root["id"] for root in checkpointed] == ["duplicate"]
    assert langsmith._children_by_trace(client, ["one"], "project") == {"one": [{"trace_id": "one"}]}
    assert langsmith._pending_roots(db, type("OnePage", (), {"completed_runs": lambda *_: [{"id": "only", "trace_id": "only"}]})(), connection, datetime(2026, 1, 1, tzinfo=UTC))[0] == [{"id": "only", "trace_id": "only"}]
    db.rows["langsmith_connections"].append({"id": "bad", "user_id": "user", "status": "active", "api_key_encrypted": "v1:bad", "endpoint": "https://api.smith.langchain.com", "workspace_id": "workspace", "project_name": "project", "sync_locked_until": None})
    assert langsmith.sync_connection(db, "bad") == langsmith.SyncResult()
    assert db.rows["langsmith_connections"][0]["last_error"] == "sync_failed"
    db.rows["langsmith_connections"].append({"id": "unexpected", "user_id": "user", "status": "active", "api_key_encrypted": encrypt_credential("key"), "endpoint": "https://api.smith.langchain.com", "workspace_id": "workspace", "project_name": "project", "sync_locked_until": None})
    client_class = langsmith.LangSmithClient
    monkeypatch.setattr(langsmith, "LangSmithClient", lambda *_: (_ for _ in ()).throw(RuntimeError("unexpected")))
    assert langsmith.sync_connection(db, "unexpected") == langsmith.SyncResult()
    assert db.rows["langsmith_connections"][1]["last_error"] == "sync_failed"
    monkeypatch.setattr(langsmith, "LangSmithClient", client_class)
    assert langsmith._safe_rows({"data": "bad", "results": "bad", "items": "bad"}) == []
    assert langsmith._safe_rows("bad") == []
    client = langsmith.LangSmithClient("https://api.smith.langchain.com", "key")
    monkeypatch.setattr(client, "_request", lambda *_args, **_kwargs: [{"id": "open"}, {"id": "done", "end_time": "now"}])
    assert client.trace_runs(["trace"], 2, "project") == [{"id": "open"}, {"id": "done", "end_time": "now"}]
    assert client.completed_runs(datetime(2026, 1, 1, tzinfo=UTC), 2, "project") == [{"id": "done", "end_time": "now"}]
    assert langsmith._usage({"usage_metadata": {"input_tokens": "bad"}, "extra": {"metadata": {"usage_metadata": {"completion_tokens": 2}}}}) == {"output_tokens": 2}
    assert langsmith._cursor_time({"cursor_time": "bad"}, datetime(2026, 1, 1, tzinfo=UTC)).year == 2025
    db = FakeDb()
    try:
        langsmith.create_connection(db, "user", LangSmithConnectionCreate(label=" ", endpoint="https://api.smith.langchain.com", api_key="key", workspace_id="workspace", project_name="project"))
        assert False, "blank connection labels are invalid"
    except ValueError:
        pass


def test_langsmith_skips_roots_without_identifiers_and_updates_label(monkeypatch: Any) -> None:
    _settings(monkeypatch)
    db = FakeDb()
    row = {"id": "connection", "user_id": "user", "label": "old", "endpoint": "https://api.smith.langchain.com", "workspace_id": "workspace", "project_name": "project", "status": "active", "api_key_encrypted": encrypt_credential("key"), "sync_locked_until": None}
    db.rows["langsmith_connections"].append(row)

    class Client:
        def __init__(self, *_: Any) -> None: pass

    monkeypatch.setattr(langsmith, "LangSmithClient", Client)
    monkeypatch.setattr(langsmith, "_pending_roots", lambda *_: ([{}], [{}]))
    monkeypatch.setattr(langsmith, "_children_by_trace", lambda *_: {})
    assert langsmith.sync_connection(db, "connection") == langsmith.SyncResult()
    assert langsmith.LangSmithConnections(db).update("user", "connection", LangSmithConnectionUpdate(label="new"))
    try:
        langsmith.update_connection(db, "user", "missing", LangSmithConnectionUpdate(endpoint="https://example.com"))
        assert False, "updated endpoints are also constrained"
    except ValueError:
        pass
