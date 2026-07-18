from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, optional_auth_user
from app.db import get_supabase
from app.models import DetailedReport, PublicRoast, RecentRoast

router = APIRouter(prefix="/roasts", tags=["roasts"])


# /recent must be registered before /{slug} so it isn't captured as a slug.
@router.get("/recent", response_model=list[RecentRoast])
def recent_roasts() -> list[RecentRoast]:
    result = (
        get_supabase()
        .table("roasts")
        .select("slug,title,score,tier,roast_line,status,created_at")
        .eq("status", "done")
        .eq("visibility", "public")
        .neq("source", "langsmith")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    return [RecentRoast(**row) for row in result.data]


@router.get("/{slug}", response_model=PublicRoast)
def get_roast(
    slug: str,
    user: AuthUser | None = Depends(optional_auth_user),
) -> PublicRoast:
    result = (
        get_supabase()
        .table("roasts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "done")
        .neq("source", "langsmith")
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="roast not found")
    row = result.data[0]
    visibility = row.get("visibility", "public")
    is_owner = user is not None and row.get("user_id") == user.id
    if visibility == "private" and not is_owner:
        if user is None or user.email is None:
            raise HTTPException(status_code=404, detail="roast not found")
        shares = (
            get_supabase()
            .table("report_shares")
            .select("id")
            .eq("roast_id", row["id"])
            .eq("email", user.email.lower())
            .limit(1)
            .execute()
        )
        if not shares.data:
            raise HTTPException(status_code=404, detail="roast not found")
    return PublicRoast(
        slug=row["slug"],
        title=row["title"],
        source=row["source"],
        score=row["score"],
        tier=row["tier"],
        roast_line=row.get("roast_line"),
        status=row["status"],
        findings=row["findings"],
        cost=row["cost"],
        detailed_report=DetailedReport.model_validate(row.get("detailed_report") or {}),
        normalized=row["normalized"],
        created_at=row["created_at"],
        visibility=visibility,
        is_owner=is_owner,
    )
