"""Internal-only endpoints for user-owned provider connections."""

import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.billing.entitlements import (
    pause_connection_for_entitlement,
    queue_completed_scans,
    scan_entitlement,
)
from app.config import get_settings
from app.db import get_supabase
from app.integrations.langsmith import (
    LangSmithConnections,
    LangSmithError,
)
from app.models import (
    LangSmithConnectionCreate,
    LangSmithConnectionResponse,
    LangSmithConnectionUpdate,
    LangSmithDiscoverRequest,
    LangSmithValidateKeyRequest,
)
from app.security.credentials import CredentialError

router = APIRouter(prefix="/integrations/langsmith", tags=["integrations"])


def require_internal_user(
    x_internal_api_token: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> str:
    settings = get_settings()
    expected = settings.internal_api_token or (
        "helix-demo-internal-token" if getattr(settings, "helix_demo", False) else ""
    )
    if not expected or not x_internal_api_token or not secrets.compare_digest(x_internal_api_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user identity")
    return x_user_id


UserId = Annotated[str, Depends(require_internal_user)]


def _provider_error(exc: LangSmithError) -> HTTPException:
    code = status.HTTP_401_UNAUTHORIZED if exc.code == "invalid_key" else status.HTTP_502_BAD_GATEWAY
    return HTTPException(status_code=code, detail=exc.code)


def _workspace(value: dict[str, Any]) -> dict[str, str]:
    return {"id": str(value.get("id", "")), "name": str(value.get("display_name") or value.get("name") or "Workspace")}


def _project(value: dict[str, Any]) -> dict[str, str]:
    return {"name": str(value.get("name") or value.get("project_name") or value.get("id") or "")}


@router.post("/validate-key")
def validate_key(data: LangSmithValidateKeyRequest, _: UserId) -> dict[str, list[dict[str, str]]]:
    try:
        rows = LangSmithConnections(get_supabase()).workspaces(data.endpoint, data.api_key)
    except LangSmithError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {"workspaces": [_workspace(row) for row in rows if row.get("id")]}


@router.post("/discover")
def discover(data: LangSmithDiscoverRequest, _: UserId) -> dict[str, list[dict[str, str]]]:
    try:
        rows = LangSmithConnections(get_supabase()).projects(data.endpoint, data.api_key, data.workspace_id)
    except LangSmithError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {"projects": [_project(row) for row in rows if _project(row)["name"]]}


@router.post("", response_model=LangSmithConnectionResponse)
def connect(data: LangSmithConnectionCreate, user_id: UserId) -> LangSmithConnectionResponse:
    try:
        return LangSmithConnections(get_supabase()).create(user_id, data)
    except LangSmithError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.get("", response_model=list[LangSmithConnectionResponse])
def connections(user_id: UserId) -> list[LangSmithConnectionResponse]:
    return LangSmithConnections(get_supabase()).list(user_id)


@router.patch("/{connection_id}", response_model=LangSmithConnectionResponse)
def patch_connection(connection_id: str, data: LangSmithConnectionUpdate, user_id: UserId) -> LangSmithConnectionResponse:
    try:
        connection = LangSmithConnections(get_supabase()).update(user_id, connection_id, data)
    except HTTPException:
        raise
    except LangSmithError as exc:
        raise _provider_error(exc) from exc
    except CredentialError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Stored credential cannot be used. Reconnect with a new key.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    return connection


@router.post("/{connection_id}/sync")
def sync(connection_id: str, user_id: UserId) -> dict[str, object]:
    db = get_supabase()
    connections = LangSmithConnections(db)
    if not connections.get(user_id, connection_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    entitlement = scan_entitlement(db, user_id, 0)
    if not entitlement.is_pro:
        pause_connection_for_entitlement(db, connection_id, user_id)
        result = connections.get(user_id, connection_id)
        return {"scanned": 0, "connection": result.model_dump() if result else None}
    else:
        sync_result = connections.sync(connection_id)
        queue_completed_scans(db, entitlement, user_id, list(sync_result.scan_slugs))
    connection = connections.get(user_id, connection_id)
    return {"scanned": sync_result.scanned, "connection": connection.model_dump() if connection else None}


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(connection_id: str, user_id: UserId) -> None:
    if not LangSmithConnections(get_supabase()).delete(user_id, connection_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
