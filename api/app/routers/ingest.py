from fastapi import APIRouter, HTTPException

from app.models import IngestRequest, IngestResponse
from app.pipeline import run_pipeline

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest) -> IngestResponse:
    try:
        return IngestResponse(slug=run_pipeline(req))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"unparseable trace: {exc}") from exc
