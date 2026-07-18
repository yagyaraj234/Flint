from fastapi import APIRouter, Depends, HTTPException

from app.auth import optional_user_id, required_user_id
from app.models import BatchIngestRequest, BatchIngestResponse, IngestRequest, IngestResponse
from app.pipeline import run_batch, run_pipeline

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
def ingest(
    req: IngestRequest,
    user_id: str | None = Depends(optional_user_id),
) -> IngestResponse:
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
        slug = run_pipeline(req, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"unparseable trace: {exc}") from exc
    return IngestResponse(slug=slug)


@router.post("/ingest/batch", response_model=BatchIngestResponse)
def ingest_batch(
    req: BatchIngestRequest,
    user_id: str = Depends(required_user_id),
) -> BatchIngestResponse:
    return run_batch(req, user_id)
