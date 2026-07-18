from fastapi import APIRouter, HTTPException

from app.db import get_supabase
from app.models import RecentRoast, RoastRow

router = APIRouter(prefix="/roasts", tags=["roasts"])


# /recent must be registered before /{slug} so it isn't captured as a slug.
@router.get("/recent", response_model=list[RecentRoast])
def recent_roasts() -> list[RecentRoast]:
    result = (
        get_supabase()
        .table("roasts")
        .select("slug,title,score,tier,status,created_at")
        .neq("source", "langsmith")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    return [RecentRoast(**row) for row in result.data]


@router.get("/{slug}", response_model=RoastRow)
def get_roast(slug: str) -> RoastRow:
    result = get_supabase().table("roasts").select("*").eq("slug", slug).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="roast not found")
    if result.data[0].get("source") == "langsmith":
        raise HTTPException(status_code=404, detail="roast not found")
    return RoastRow(**result.data[0])
