from fastapi import APIRouter, HTTPException

from app.db import get_supabase
from app.models import PublicRoast, RecentRoast

router = APIRouter(prefix="/roasts", tags=["roasts"])


# /recent must be registered before /{slug} so it isn't captured as a slug.
@router.get("/recent", response_model=list[RecentRoast])
def recent_roasts() -> list[RecentRoast]:
    result = (
        get_supabase()
        .table("roasts")
        .select("slug,title,score,tier,roast_line,status,created_at")
        .eq("status", "done")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    return [RecentRoast(**row) for row in result.data]


@router.get("/{slug}", response_model=PublicRoast)
def get_roast(slug: str) -> PublicRoast:
    result = (
        get_supabase()
        .table("roasts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "done")
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="roast not found")
    row = result.data[0]
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
        normalized=row["normalized"],
        created_at=row["created_at"],
    )
