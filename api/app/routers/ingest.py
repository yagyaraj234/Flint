from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.models import IngestRequest, IngestResponse
from app.pipeline import run_pipeline
from app.roast_line import update_roast_line

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest, background: BackgroundTasks) -> IngestResponse:
    if (
        req.source == "langsmith"
        or req.langsmith_connection_id is not None
        or req.external_trace_id is not None
    ):
        raise HTTPException(
            status_code=403,
            detail="LangSmith provenance is reserved for the internal sync service",
        )
    try:
        slug = run_pipeline(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"unparseable trace: {exc}") from exc
    background.add_task(update_roast_line, slug)
    return IngestResponse(slug=slug)
