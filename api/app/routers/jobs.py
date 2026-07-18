"""Platform-cron endpoints. No in-process scheduler."""

import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.config import get_settings
from app.db import get_supabase
from app.integrations.langsmith import sync_active_connections

router = APIRouter(prefix="/internal/jobs", tags=["jobs"])


@router.post("/langsmith-hourly")
def langsmith_hourly(x_cron_secret: Annotated[str | None, Header()] = None) -> dict[str, int]:
    expected = get_settings().cron_secret
    if not expected or not x_cron_secret or not secrets.compare_digest(x_cron_secret, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return {"scanned": sync_active_connections(get_supabase())}
