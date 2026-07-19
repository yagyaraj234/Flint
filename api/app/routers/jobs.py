"""Platform-cron endpoints. No in-process scheduler."""

import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.billing.entitlements import (
    flush_pending_usage,
    pause_connection_for_entitlement,
    queue_completed_scans,
    scan_entitlement,
)
from app.config import get_settings
from app.cron import sync_cron_matches
from app.db import get_supabase
from app.integrations.langsmith import sync_connection

router = APIRouter(prefix="/internal/jobs", tags=["jobs"])


def _now() -> datetime:
    return datetime.now(UTC)


@router.post("/langsmith-sync")
def langsmith_sync(x_cron_secret: Annotated[str | None, Header()] = None) -> dict[str, int]:
    settings = get_settings()
    expected = settings.cron_secret
    if not expected or not x_cron_secret or not secrets.compare_digest(x_cron_secret, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    db = get_supabase()
    flush_pending_usage(db)
    connections = (
        db.table("langsmith_connections")
        .select("id,user_id,sync_cron")
        .eq("status", "active")
        .execute()
        .data
    )
    scanned = 0
    now = _now()
    for connection in connections:
        user_id = str(connection["user_id"])
        entitlement = scan_entitlement(db, user_id, 0)
        if not entitlement.is_pro:
            pause_connection_for_entitlement(db, str(connection["id"]), user_id)
            continue
        if not sync_cron_matches(str(connection.get("sync_cron", "0 * * * *")), now):
            continue
        result = sync_connection(db, str(connection["id"]))
        scanned += result.scanned
        queue_completed_scans(db, entitlement, user_id, list(result.scan_slugs))
    return {"scanned": scanned}
