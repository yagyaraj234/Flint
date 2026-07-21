"""LangSmith connection client, adapter, and bounded sync orchestration."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.config import get_settings
from app.cron import DEFAULT_SYNC_CRON
from app.models import IngestRequest, LangSmithConnectionCreate, LangSmithConnectionResponse, LangSmithConnectionUpdate
from app.pipeline import run_pipeline
from app.security.credentials import CredentialError, decrypt_credential, encrypt_credential


class LangSmithError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class SyncResult:
    scanned: int = 0
    scan_slugs: tuple[str, ...] = ()


_DEMO_WORKSPACE = {"id": "demo-workspace", "display_name": "Demo workspace"}
_DEMO_PROJECT = {"name": "Demo support agent"}


def _demo_mode() -> bool:
    return bool(getattr(get_settings(), "helix_demo", False))


def _endpoint(value: str) -> str:
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    try:
        valid = (
            parsed.scheme == "https"
            and bool(host)
            and not parsed.username
            and not parsed.password
            and not parsed.port
            and parsed.path in ("", "/")
            and not parsed.query
            and not parsed.fragment
            and (host == "smith.langchain.com" or host.endswith(".smith.langchain.com"))
        )
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("LangSmith endpoint must be an approved HTTPS endpoint")
    return value.rstrip("/")


def _safe_rows(value: object) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        nested = value.get("data") or value.get("results") or value.get("items")
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
    return []


def _headers(api_key: str, workspace_id: str | None = None) -> dict[str, str]:
    headers = {"X-Api-Key": api_key}
    if workspace_id:
        headers["X-Tenant-Id"] = workspace_id
    return headers


class LangSmithClient:
    def __init__(self, endpoint: str, api_key: str, workspace_id: str | None = None) -> None:
        self.endpoint = _endpoint(endpoint)
        self.api_key = api_key
        self.workspace_id = workspace_id

    def _request(self, method: str, path: str, **kwargs: Any) -> object:
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.request(
                    method,
                    f"{self.endpoint}{path}",
                    headers=_headers(self.api_key, self.workspace_id),
                    **kwargs,
                )
        except httpx.TimeoutException as exc:
            raise LangSmithError("provider_timeout") from exc
        except httpx.HTTPError as exc:
            raise LangSmithError("provider_unavailable") from exc
        if response.status_code in (401, 403):
            raise LangSmithError("invalid_key")
        if response.status_code == 429:
            raise LangSmithError("rate_limited")
        if response.status_code >= 500:
            raise LangSmithError("provider_unavailable")
        if response.is_error:
            raise LangSmithError("provider_request_failed")
        try:
            return response.json()
        except ValueError as exc:
            raise LangSmithError("provider_response_invalid") from exc

    def list_workspaces(self) -> list[dict[str, Any]]:
        return _safe_rows(self._request("GET", "/api/v1/tenants"))

    def list_projects(self) -> list[dict[str, Any]]:
        return _safe_rows(self._request("GET", "/api/v1/sessions", params={"limit": 100}))

    def completed_runs(
        self, after: datetime, limit: int, project_name: str, offset: int = 0
    ) -> list[dict[str, Any]]:
        payload = {
            "project_name": project_name,
            "start_time": after.isoformat(),
            "limit": limit,
            "offset": offset,
            "is_root": True,
            "execution_order": "asc",
            "select": [
                "id", "trace_id", "parent_run_id", "run_type", "name", "inputs", "outputs",
                "error", "start_time", "end_time", "extra", "usage_metadata",
            ],
        }
        return [run for run in _safe_rows(self._request("POST", "/api/v1/runs/query", json=payload)) if run.get("end_time")]

    def trace_runs(
        self, trace_ids: list[str], limit: int, project_name: str, offset: int = 0
    ) -> list[dict[str, Any]]:
        if not trace_ids:
            return []
        return _safe_rows(
            self._request("POST", "/api/v1/runs/query", json={
                "trace_id": trace_ids,
                "project_name": project_name,
                "limit": limit,
                "offset": offset,
                "select": [
                    "id", "trace_id", "parent_run_id", "run_type", "name", "inputs", "outputs",
                    "error", "start_time", "end_time", "extra", "usage_metadata",
                ],
            })
        )


def _string(value: object, fallback: str = "") -> str:
    return value if isinstance(value, str) and value else fallback


def _time_ms(value: object) -> float | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return None


def _duration_ms(run: dict[str, Any]) -> float | None:
    start, end = _time_ms(run.get("start_time")), _time_ms(run.get("end_time"))
    return end - start if start is not None and end is not None and end >= start else None


def _usage(run: dict[str, Any]) -> dict[str, int]:
    extra = run.get("extra") if isinstance(run.get("extra"), dict) else {}
    metadata = extra.get("metadata") if isinstance(extra.get("metadata"), dict) else {}
    for value in (run.get("usage_metadata"), run.get("usage"), metadata.get("usage_metadata")):
        if not isinstance(value, dict):
            continue
        input_tokens = value.get("input_tokens", value.get("prompt_tokens"))
        output_tokens = value.get("output_tokens", value.get("completion_tokens"))
        result: dict[str, int] = {}
        if isinstance(input_tokens, (int, float)) and input_tokens >= 0:
            result["input_tokens"] = int(input_tokens)
        if isinstance(output_tokens, (int, float)) and output_tokens >= 0:
            result["output_tokens"] = int(output_tokens)
        if result:
            return result
    return {}


def to_generic_trace(root: dict[str, Any], child_runs: list[dict[str, Any]]) -> dict[str, Any]:
    """Turn one LangSmith trace plus descendants into the existing generic contract."""

    trace_id = _string(root.get("trace_id"), _string(root.get("id"), "langsmith-trace"))
    runs = [root, *[run for run in child_runs if _string(run.get("id")) != _string(root.get("id"))]]
    spans: list[dict[str, Any]] = []
    for run in runs:
        run_type = _string(run.get("run_type"), "other").lower()
        span_type = run_type if run_type in {"llm", "tool"} else "other"
        output: object = run.get("outputs", {})
        if run.get("error"):
            output = {"outputs": output, "error": run["error"]}
        spans.append(
            {
                "id": _string(run.get("id"), f"span-{len(spans) + 1}"),
                "parent_id": run.get("parent_run_id"),
                "type": span_type,
                "name": _string(run.get("name"), run_type),
                "model": run.get("extra", {}).get("metadata", {}).get("ls_model_name")
                if isinstance(run.get("extra"), dict) and isinstance(run.get("extra", {}).get("metadata"), dict)
                else None,
                "input": run.get("inputs", {}),
                "output": output,
                "start_ms": _time_ms(run.get("start_time")),
                "duration_ms": _duration_ms(run),
                "usage": _usage(run),
                "status": "error" if run.get("error") else "completed",
            }
        )
    return {
        "trace_id": trace_id,
        "workflow": _string(root.get("name"), "LangSmith trace"),
        "spans": spans,
    }


def connection_response(row: dict[str, Any]) -> LangSmithConnectionResponse:
    return LangSmithConnectionResponse(
        id=str(row["id"]),
        label=str(row["label"]),
        endpoint=str(row["endpoint"]),
        workspace_id=str(row["workspace_id"]),
        project_name=str(row["project_name"]),
        status=row.get("status", "active"),
        sync_cron=row.get("sync_cron", DEFAULT_SYNC_CRON),
        last_sync_finished_at=row.get("last_sync_finished_at"),
        last_success_at=row.get("last_success_at"),
        last_scan_count=row.get("last_scan_count", 0),
        last_error=row.get("last_error"),
    )


def list_connections(db: Any, user_id: str) -> list[LangSmithConnectionResponse]:
    result = db.table("langsmith_connections").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return [connection_response(row) for row in result.data]


def validate_connection_scope(
    endpoint: str, api_key: str, workspace_id: str, project_name: str
) -> None:
    if _demo_mode():
        return
    workspaces = LangSmithClient(endpoint, api_key).list_workspaces()
    if workspace_id not in {str(workspace.get("id")) for workspace in workspaces}:
        raise ValueError("Selected workspace is not available for this key")
    projects = LangSmithClient(endpoint, api_key, workspace_id).list_projects()
    project_names = {
        str(project.get("name") or project.get("project_name")) for project in projects
    }
    if project_name not in project_names:
        raise ValueError("Selected project is not available in this workspace")


def create_connection(db: Any, user_id: str, data: LangSmithConnectionCreate) -> LangSmithConnectionResponse:
    row = {
        "user_id": user_id,
        "label": data.label.strip(),
        "endpoint": _endpoint(data.endpoint),
        "workspace_id": data.workspace_id.strip(),
        "project_name": data.project_name.strip(),
        "sync_cron": data.sync_cron,
        "api_key_encrypted": "" if _demo_mode() else encrypt_credential(data.api_key),
        "key_version": 1,
    }
    if not row["label"] or not row["workspace_id"] or not row["project_name"]:
        raise ValueError("Connection label, workspace, and project are required")
    existing = (
        db.table("langsmith_connections")
        .select("id")
        .eq("user_id", user_id)
        .eq("endpoint", row["endpoint"])
        .eq("workspace_id", row["workspace_id"])
        .eq("project_name", row["project_name"])
        .limit(1)
        .execute()
    )
    if existing.data:
        raise ValueError("This LangSmith workspace and project are already connected")
    result = db.table("langsmith_connections").insert(row).execute()
    return connection_response(result.data[0])


def update_connection(db: Any, user_id: str, connection_id: str, data: LangSmithConnectionUpdate) -> LangSmithConnectionResponse | None:
    patch = data.model_dump(exclude_none=True)
    if "endpoint" in patch:
        patch["endpoint"] = _endpoint(str(patch["endpoint"]))
    for field in ("label", "workspace_id", "project_name"):
        if field in patch:
            patch[field] = str(patch[field]).strip()
            if not patch[field]:
                raise ValueError(f"{field} is required")
    if "api_key" in patch:
        api_key = str(patch.pop("api_key"))
        if not _demo_mode():
            patch["api_key_encrypted"] = encrypt_credential(api_key)
            patch["key_version"] = 1
    if {"endpoint", "workspace_id", "project_name"} & patch.keys():
        patch.update(
            {
                "cursor_time": None,
                "cursor_run_id": None,
                "last_scan_count": 0,
                "last_success_at": None,
                "last_error": None,
            }
        )
    if not patch:
        return get_connection(db, user_id, connection_id)
    result = db.table("langsmith_connections").update(patch).eq("id", connection_id).eq("user_id", user_id).execute()
    return connection_response(result.data[0]) if result.data else None


def get_connection(db: Any, user_id: str, connection_id: str) -> LangSmithConnectionResponse | None:
    result = db.table("langsmith_connections").select("*").eq("id", connection_id).eq("user_id", user_id).limit(1).execute()
    return connection_response(result.data[0]) if result.data else None


def get_connection_record(db: Any, user_id: str, connection_id: str) -> dict[str, Any] | None:
    result = (
        db.table("langsmith_connections")
        .select("*")
        .eq("id", connection_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def delete_connection(db: Any, user_id: str, connection_id: str) -> bool:
    result = db.table("langsmith_connections").delete().eq("id", connection_id).eq("user_id", user_id).execute()
    return bool(result.data)


def _now() -> datetime:
    return datetime.now(UTC)


def _load_connection(db: Any, connection_id: str) -> dict[str, Any] | None:
    result = db.table("langsmith_connections").select("*").eq("id", connection_id).limit(1).execute()
    return result.data[0] if result.data else None


def _acquire_lease(db: Any, connection: dict[str, Any], now: datetime) -> bool:
    until = now + timedelta(seconds=get_settings().langsmith_sync_lease_seconds)
    query = db.table("langsmith_connections").update(
        {"sync_locked_until": until.isoformat(), "last_sync_started_at": now.isoformat()}
    ).eq("id", connection["id"]).eq("status", "active")
    # ponytail: PostgREST conditional update gives one DB-enforced lease; use RPC only if query policy changes.
    query = query.or_(f"sync_locked_until.is.null,sync_locked_until.lt.{now.isoformat()}")
    return bool(query.execute().data)


def _finish_sync(db: Any, connection_id: str, patch: dict[str, Any]) -> None:
    db.table("langsmith_connections").update({"sync_locked_until": None, **patch}).eq("id", connection_id).execute()


def _cursor_time(connection: dict[str, Any], now: datetime) -> datetime:
    value = connection.get("cursor_time")
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")) - timedelta(seconds=get_settings().langsmith_sync_overlap_seconds)
        except ValueError:
            pass
    return now - timedelta(hours=get_settings().langsmith_initial_lookback_hours)


def _root_key(root: dict[str, Any]) -> tuple[str, str]:
    return (
        _string(root.get("start_time"), _string(root.get("end_time"))),
        _string(root.get("id")),
    )


def _roast_exists(db: Any, connection_id: str, trace_id: str) -> bool:
    result = (
        db.table("roasts")
        .select("id")
        .eq("langsmith_connection_id", connection_id)
        .eq("external_trace_id", trace_id)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def _pending_roots(
    db: Any, client: LangSmithClient, connection: dict[str, Any], now: datetime
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return at most one configured batch plus every safely checkpointed root."""

    limit = get_settings().langsmith_sync_batch_size
    offset = 0
    pending: list[dict[str, Any]] = []
    checkpointed: list[dict[str, Any]] = []
    seen_trace_ids: set[str] = set()
    while True:
        if len(pending) >= limit:
            return pending, checkpointed
        page = client.completed_runs(
            _cursor_time(connection, now), limit, str(connection["project_name"]), offset
        )
        if not page:
            break
        for root in sorted(page, key=_root_key):
            trace_id = _string(root.get("trace_id"), _string(root.get("id")))
            if not trace_id or trace_id in seen_trace_ids:
                continue
            seen_trace_ids.add(trace_id)
            if _roast_exists(db, str(connection["id"]), trace_id):
                checkpointed.append(root)
                continue
            if len(pending) == limit:
                return pending, checkpointed
            pending.append(root)
            checkpointed.append(root)
        if len(page) < limit:
            break
        offset += len(page)
    return pending, checkpointed


def _children_by_trace(
    client: LangSmithClient, trace_ids: list[str], project_name: str
) -> dict[str, list[dict[str, Any]]]:
    children: dict[str, list[dict[str, Any]]] = defaultdict(list)
    limit = get_settings().langsmith_sync_batch_size
    offset = 0
    while True:
        page = client.trace_runs(trace_ids, limit, project_name, offset)
        for run in page:
            children[_string(run.get("trace_id"))].append(run)
        if len(page) < limit:
            return children
        offset += len(page)


def _demo_sync(db: Any, connection_id: str) -> SyncResult:
    connection = _load_connection(db, connection_id)
    if not connection or connection.get("status") != "active":
        return SyncResult()
    trace_id = f"demo-{uuid4()}"
    slug = run_pipeline(
        IngestRequest(
            source="langsmith",
            format="generic",
            title=f"{connection['label']} demo trace",
            trace={
                "trace_id": trace_id,
                "workflow": str(connection["project_name"]),
                "spans": [
                    {
                        "id": "draft",
                        "type": "llm",
                        "name": "draft response",
                        "model": "gpt-4o-mini",
                        "input": "Summarize this support request.",
                        "output": "Draft response ready.",
                        "usage": {"input_tokens": 120, "output_tokens": 60},
                    },
                    {
                        "id": "lookup",
                        "type": "tool",
                        "name": "get_order",
                        "args": {"order_id": "DEMO-123"},
                        "result": {"status": "shipped"},
                    },
                ],
            },
        ),
        user_id=str(connection["user_id"]),
        langsmith_connection_id=connection_id,
        external_trace_id=trace_id,
    )
    now = _now().isoformat()
    db.table("langsmith_connections").update(
        {
            "last_sync_finished_at": now,
            "last_success_at": now,
            "last_scan_count": 1,
            "last_error": None,
        }
    ).eq("id", connection_id).execute()
    return SyncResult(1, (slug,))


def sync_connection(db: Any, connection_id: str) -> SyncResult:
    if _demo_mode():
        return _demo_sync(db, connection_id)
    now = _now()
    connection = _load_connection(db, connection_id)
    if not connection or connection.get("status") != "active" or not _acquire_lease(db, connection, now):
        return SyncResult()
    finish_patch: dict[str, Any] = {
        "last_sync_finished_at": _now().isoformat(),
        "last_error": "sync_failed",
    }
    try:
        api_key = decrypt_credential(str(connection["api_key_encrypted"]))
        client = LangSmithClient(str(connection["endpoint"]), api_key, str(connection["workspace_id"]))
        roots, checkpointed = _pending_roots(db, client, connection, now)
        trace_ids = [_string(root.get("trace_id"), _string(root.get("id"))) for root in roots]
        children_by_trace = _children_by_trace(
            client,
            [trace_id for trace_id in trace_ids if trace_id],
            str(connection["project_name"]),
        )

        scan_slugs: list[str] = []
        page_failed = False
        for root in roots:
            trace_id = _string(root.get("trace_id"), _string(root.get("id")))
            if not trace_id:
                continue
            try:
                trace = to_generic_trace(root, children_by_trace.get(trace_id, []))
                scan_slugs.append(run_pipeline(
                    IngestRequest(
                        source="langsmith",
                        format="generic",
                        title=_string(root.get("name"), "LangSmith trace"),
                        trace=trace,
                    ),
                    user_id=str(connection["user_id"]),
                    langsmith_connection_id=connection_id,
                    external_trace_id=trace_id,
                ))
            except Exception:
                # Keep the cursor behind this page so a pipeline failure retries from overlap.
                page_failed = True
        if page_failed:
            finish_patch = {
                "last_sync_finished_at": _now().isoformat(),
                "last_error": "pipeline_failed",
            }
            return SyncResult(len(scan_slugs), tuple(scan_slugs))
        cursor_time, cursor_run_id = (
            _string(connection.get("cursor_time")),
            _string(connection.get("cursor_run_id")),
        )
        for root in checkpointed:
            candidate = _root_key(root)
            if candidate > (cursor_time, cursor_run_id):
                cursor_time, cursor_run_id = candidate
        finish_patch = {
            "cursor_time": cursor_time or connection.get("cursor_time"),
            "cursor_run_id": cursor_run_id or connection.get("cursor_run_id"),
            "last_sync_finished_at": _now().isoformat(),
            "last_success_at": _now().isoformat(),
            "last_scan_count": len(scan_slugs),
            "last_error": None,
        }
        return SyncResult(len(scan_slugs), tuple(scan_slugs))
    except LangSmithError as exc:
        finish_patch = {"last_sync_finished_at": _now().isoformat(), "last_error": exc.code}
        if exc.code == "invalid_key":
            finish_patch["status"] = "invalid"
        return SyncResult()
    except (CredentialError, ValueError):
        finish_patch = {"last_sync_finished_at": _now().isoformat(), "last_error": "sync_failed"}
        return SyncResult()
    except Exception:
        finish_patch = {"last_sync_finished_at": _now().isoformat(), "last_error": "sync_failed"}
        return SyncResult()
    finally:
        _finish_sync(db, connection_id, finish_patch)


def sync_active_connections(db: Any) -> int:
    rows = db.table("langsmith_connections").select("id").eq("status", "active").execute().data
    return sum(sync_connection(db, str(row["id"])).scanned for row in rows)


class LangSmithConnections:
    """Connection lifecycle and sync behavior behind one module interface."""

    def __init__(self, db: Any) -> None:
        self._db = db

    def workspaces(self, endpoint: str, api_key: str) -> list[dict[str, Any]]:
        if _demo_mode():
            _endpoint(endpoint)
            return [_DEMO_WORKSPACE]
        return LangSmithClient(endpoint, api_key).list_workspaces()

    def projects(self, endpoint: str, api_key: str, workspace_id: str) -> list[dict[str, Any]]:
        if _demo_mode():
            _endpoint(endpoint)
            return [_DEMO_PROJECT]
        return LangSmithClient(endpoint, api_key, workspace_id).list_projects()

    def create(self, user_id: str, data: LangSmithConnectionCreate) -> LangSmithConnectionResponse:
        validate_connection_scope(data.endpoint, data.api_key, data.workspace_id, data.project_name)
        return create_connection(self._db, user_id, data)

    def list(self, user_id: str) -> list[LangSmithConnectionResponse]:
        return list_connections(self._db, user_id)

    def update(
        self, user_id: str, connection_id: str, data: LangSmithConnectionUpdate
    ) -> LangSmithConnectionResponse | None:
        current = get_connection_record(self._db, user_id, connection_id)
        if not current:
            return None
        if not _demo_mode() and any(value is not None for value in (data.endpoint, data.api_key, data.workspace_id, data.project_name)):
            validate_connection_scope(
                data.endpoint if data.endpoint is not None else str(current["endpoint"]),
                data.api_key if data.api_key is not None else decrypt_credential(str(current["api_key_encrypted"])),
                data.workspace_id if data.workspace_id is not None else str(current["workspace_id"]),
                data.project_name if data.project_name is not None else str(current["project_name"]),
            )
        return update_connection(self._db, user_id, connection_id, data)

    def get(self, user_id: str, connection_id: str) -> LangSmithConnectionResponse | None:
        return get_connection(self._db, user_id, connection_id)

    def sync(self, connection_id: str) -> SyncResult:
        return sync_connection(self._db, connection_id)

    def delete(self, user_id: str, connection_id: str) -> bool:
        return delete_connection(self._db, user_id, connection_id)
