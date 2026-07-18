"""Authenticated owner-only roast reads."""

from fastapi import APIRouter, Depends, Query

from app.auth import required_user_id
from app.db import get_supabase
from app.models import DetailedReport, OwnerRoast

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/roasts", response_model=list[OwnerRoast])
def owner_roasts(
    user_id: str = Depends(required_user_id),
    batch_id: str | None = Query(default=None),
) -> list[OwnerRoast]:
    query = get_supabase().table("roasts").select("*").eq("user_id", user_id)
    if batch_id is not None:
        query = query.eq("batch_id", batch_id)
    result = query.order("created_at", desc=True).execute()
    return [
        OwnerRoast(
            id=row["id"],
            slug=row["slug"],
            title=row["title"],
            source=row["source"],
            score=row["score"],
            tier=row["tier"],
            findings=row["findings"],
            cost=row["cost"],
            detailed_report=DetailedReport.model_validate(row.get("detailed_report") or {}),
            status=row["status"],
            error=row.get("error"),
            created_at=row["created_at"],
            batch_id=row.get("batch_id"),
        )
        for row in result.data
    ]
