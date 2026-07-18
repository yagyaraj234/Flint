"""Platform-cron endpoints. No in-process scheduler."""

import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.billing.dodo_client import ingest_usage_event
from app.config import get_settings
from app.db import get_supabase
from app.integrations.langsmith import sync_connection

router = APIRouter(prefix="/internal/jobs", tags=["jobs"])

_UPGRADE_MESSAGE = "Upgrade to Pro to enable automatic sync"


@router.post("/langsmith-hourly")
def langsmith_hourly(x_cron_secret: Annotated[str | None, Header()] = None) -> dict[str, int]:
    settings = get_settings()
    expected = settings.cron_secret
    if not expected or not x_cron_secret or not secrets.compare_digest(x_cron_secret, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    db = get_supabase()
    connections = (
        db.table("langsmith_connections")
        .select("id,user_id")
        .eq("status", "active")
        .execute()
        .data
    )
    scanned = 0
    for connection in connections:
        subscription = (
            db.table("subscriptions")
            .select("plan,dodo_customer_id")
            .eq("user_id", connection["user_id"])
            .limit(1)
            .execute()
            .data
        )
        if not subscription or subscription[0].get("plan") != "pro":
            db.table("langsmith_connections").update(
                {"status": "paused", "last_error": _UPGRADE_MESSAGE}
            ).eq("id", connection["id"]).execute()
            continue
        count = sync_connection(db, str(connection["id"]))
        scanned += count
        customer_id = subscription[0].get("dodo_customer_id")
        if isinstance(customer_id, str) and customer_id:
            for _ in range(count):
                ingest_usage_event(
                    customer_id,
                    api_key=settings.dodo_api_key,
                    environment=settings.dodo_environment,
                )
    return {"scanned": scanned}
