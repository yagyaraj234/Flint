"""Authenticated owner-only roast reads."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import required_user_id
from app.db import get_supabase
from app.models import (
    DetailedReport,
    OwnerRoast,
    ShareCreate,
    SharingInfo,
    SharingShare,
    VisibilityUpdate,
)

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
            visibility=row.get("visibility", "public"),
        )
        for row in result.data
    ]


def _owned_roast(slug: str, user_id: str) -> dict[str, Any]:
    result = (
        get_supabase()
        .table("roasts")
        .select("id,visibility")
        .eq("slug", slug)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="roast not found")
    return result.data[0]


def _sharing_info(roast: dict[str, Any]) -> SharingInfo:
    result = (
        get_supabase()
        .table("report_shares")
        .select("email,created_at")
        .eq("roast_id", roast["id"])
        .order("created_at")
        .execute()
    )
    return SharingInfo(
        visibility=roast.get("visibility", "public"),
        shares=[SharingShare(**row) for row in result.data],
    )


@router.get("/roasts/{slug}/sharing", response_model=SharingInfo)
def roast_sharing(
    slug: str,
    user_id: str = Depends(required_user_id),
) -> SharingInfo:
    return _sharing_info(_owned_roast(slug, user_id))


@router.put("/roasts/{slug}/visibility", response_model=SharingInfo)
def update_roast_visibility(
    slug: str,
    update: VisibilityUpdate,
    user_id: str = Depends(required_user_id),
) -> SharingInfo:
    roast = _owned_roast(slug, user_id)
    get_supabase().table("roasts").update({"visibility": update.visibility}).eq(
        "id", roast["id"]
    ).execute()
    roast["visibility"] = update.visibility
    return _sharing_info(roast)


@router.post("/roasts/{slug}/shares", response_model=SharingInfo)
def create_roast_share(
    slug: str,
    share: ShareCreate,
    user_id: str = Depends(required_user_id),
) -> SharingInfo:
    roast = _owned_roast(slug, user_id)
    get_supabase().table("report_shares").upsert(
        {"roast_id": roast["id"], "email": share.email, "created_by": user_id},
        on_conflict="roast_id,email",
    ).execute()
    return _sharing_info(roast)


@router.delete("/roasts/{slug}/shares/{email:path}", response_model=SharingInfo)
def delete_roast_share(
    slug: str,
    email: str,
    user_id: str = Depends(required_user_id),
) -> SharingInfo:
    roast = _owned_roast(slug, user_id)
    (
        get_supabase()
        .table("report_shares")
        .delete()
        .eq("roast_id", roast["id"])
        .eq("email", email.strip().lower())
        .execute()
    )
    return _sharing_info(roast)
