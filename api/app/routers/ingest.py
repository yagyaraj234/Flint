from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app import auth
from app.auth import optional_user_id, required_user_id
from app.billing.dodo_client import ingest_usage_event
from app.billing.plans import FREE_PLAN, PRO_PLAN, scans_included_for
from app.config import get_settings
from app.models import BatchIngestRequest, BatchIngestResponse, IngestRequest, IngestResponse
from app.pipeline import run_batch, run_pipeline

router = APIRouter(tags=["ingest"])


def _billing_plan(user_id: str, requested_scans: int) -> tuple[str, str | None] | JSONResponse:
    db = auth.get_supabase()
    result = (
        db.table("subscriptions")
        .select("plan,dodo_customer_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    subscription: dict[str, Any] = result.data[0] if result.data else {}
    if subscription.get("plan") == PRO_PLAN:
        customer_id = subscription.get("dodo_customer_id")
        return PRO_PLAN, customer_id if isinstance(customer_id, str) else None

    settings = get_settings()
    included = scans_included_for(FREE_PLAN, settings.free_tier_monthly_scans)
    month = datetime.now(UTC).strftime("%Y-%m")
    rows = db.table("roasts").select("created_at").eq("user_id", user_id).execute().data
    used = sum(str(row.get("created_at", "")).startswith(month) for row in rows)
    if included is not None and used + requested_scans > included:
        return JSONResponse(
            status_code=402,
            content={
                "detail": "free_tier_scan_limit",
                "scans_used": used,
                "scans_included": included,
            },
        )
    return FREE_PLAN, None


def _emit_usage(customer_id: str) -> None:
    settings = get_settings()
    ingest_usage_event(
        customer_id,
        api_key=settings.dodo_api_key,
        environment=settings.dodo_environment,
    )


@router.post("/ingest", response_model=IngestResponse)
def ingest(
    req: IngestRequest,
    user_id: str | None = Depends(optional_user_id),
) -> IngestResponse | JSONResponse:
    if (
        req.source == "langsmith"
        or req.langsmith_connection_id is not None
        or req.external_trace_id is not None
    ):
        raise HTTPException(
            status_code=403,
            detail="LangSmith provenance is reserved for the internal sync service",
        )
    billing = _billing_plan(user_id, 1) if user_id else (FREE_PLAN, None)
    if isinstance(billing, JSONResponse):
        return billing
    try:
        slug = run_pipeline(req, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"unparseable trace: {exc}") from exc
    plan, customer_id = billing
    if plan == PRO_PLAN and customer_id:
        _emit_usage(customer_id)
    return IngestResponse(slug=slug)


@router.post("/ingest/batch", response_model=BatchIngestResponse)
def ingest_batch(
    req: BatchIngestRequest,
    user_id: str = Depends(required_user_id),
) -> BatchIngestResponse | JSONResponse:
    billing = _billing_plan(user_id, len(req.traces))
    if isinstance(billing, JSONResponse):
        return billing
    response = run_batch(req, user_id)
    plan, customer_id = billing
    if plan == PRO_PLAN and customer_id:
        for result in response.results:
            if result.status == "done":
                _emit_usage(customer_id)
    return response
