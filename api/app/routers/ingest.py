from fastapi import APIRouter

from app.models import IngestRequest, IngestResponse
from app.pipeline import run_pipeline

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest) -> IngestResponse:
    return IngestResponse(slug=run_pipeline(req))
