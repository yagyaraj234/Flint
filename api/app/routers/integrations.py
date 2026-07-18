"""Internal-only endpoints for user-owned provider connections."""

import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.billing.dodo_client import ingest_usage_event
from app.config import get_settings
from app.db import get_supabase
from app.integrations.langsmith import (
    LangSmithClient,
    LangSmithError,
    create_connection,
    delete_connection,
    get_connection,
    get_connection_record,
    list_connections,
    sync_connection,
    update_connection,
    validate_connection_scope,
)
from app.models import (
    LangSmithConnectionCreate,
    LangSmithConnectionResponse,
    LangSmithConnectionUpdate,
    LangSmithDiscoverRequest,
    LangSmithValidateKeyRequest,
)
from app.security.credentials import CredentialError, decrypt_credential

router = APIRouter(prefix="/integrations/langsmith", tags=["integrations"])


def require_internal_user(
    x_internal_api_token: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> str:
    expected = get_settings().internal_api_token
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
        rows = LangSmithClient(data.endpoint, data.api_key).list_workspaces()
    except LangSmithError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {"workspaces": [_workspace(row) for row in rows if row.get("id")]}


@router.post("/discover")
def discover(data: LangSmithDiscoverRequest, _: UserId) -> dict[str, list[dict[str, str]]]:
    try:
        rows = LangSmithClient(data.endpoint, data.api_key, data.workspace_id).list_projects()
    except LangSmithError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {"projects": [_project(row) for row in rows if _project(row)["name"]]}


@router.post("", response_model=LangSmithConnectionResponse)
def connect(data: LangSmithConnectionCreate, user_id: UserId) -> LangSmithConnectionResponse:
    try:
        validate_connection_scope(
            data.endpoint, data.api_key, data.workspace_id, data.project_name
        )
        return create_connection(get_supabase(), user_id, data)
    except LangSmithError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.get("", response_model=list[LangSmithConnectionResponse])
def connections(user_id: UserId) -> list[LangSmithConnectionResponse]:
    return list_connections(get_supabase(), user_id)


@router.patch("/{connection_id}", response_model=LangSmithConnectionResponse)
def patch_connection(connection_id: str, data: LangSmithConnectionUpdate, user_id: UserId) -> LangSmithConnectionResponse:
    try:
        db = get_supabase()
        current = get_connection_record(db, user_id, connection_id)
        if not current:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
        if any(
            value is not None
            for value in (data.endpoint, data.api_key, data.workspace_id, data.project_name)
        ):
            validate_connection_scope(
                data.endpoint if data.endpoint is not None else str(current["endpoint"]),
                data.api_key
                if data.api_key is not None
                else decrypt_credential(str(current["api_key_encrypted"])),
                data.workspace_id
                if data.workspace_id is not None
                else str(current["workspace_id"]),
                data.project_name
                if data.project_name is not None
                else str(current["project_name"]),
            )
        connection = update_connection(db, user_id, connection_id, data)
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
    if not get_connection(db, user_id, connection_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    subscription = (
        db.table("subscriptions")
        .select("plan,dodo_customer_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    if not subscription or subscription[0].get("plan") != "pro":
        db.table("langsmith_connections").update(
            {
                "status": "paused",
                "last_error": "Upgrade to Pro to enable automatic sync",
            }
        ).eq("id", connection_id).eq("user_id", user_id).execute()
        count = 0
    else:
        count = sync_connection(db, connection_id)
        customer_id = subscription[0].get("dodo_customer_id")
        if isinstance(customer_id, str) and customer_id:
            settings = get_settings()
            for _ in range(count):
                ingest_usage_event(
                    customer_id,
                    api_key=settings.dodo_api_key,
                    environment=settings.dodo_environment,
                )
    connection = get_connection(db, user_id, connection_id)
    return {"scanned": count, "connection": connection.model_dump() if connection else None}


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(connection_id: str, user_id: UserId) -> None:
    if not delete_connection(get_supabase(), user_id, connection_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
