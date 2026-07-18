"""Ingest pipeline: normalize -> redact -> analyze -> score -> insert, returns slug.

Raises ValueError when no parser can extract spans; the ingest router maps
that to a 422. Everything stored (raw_trace included) is post-redaction —
the database never contains a secret.
"""

import secrets
import uuid
from typing import Any

from app.analyze.cost import analyze_cost
from app.analyze.roast import analyze_roast
from app.analyze.score import score, tier
from app.db import get_supabase
from app.models import (
    BatchIngestRequest,
    BatchIngestResponse,
    BatchIngestResult,
    IngestRequest,
    Source,
)
from app.normalize import generic, openai_agents
from app.normalize.redact import redact_trace, redact_value
from app.roast_line import fallback_detailed_report, fallback_line, generate_luna_assessment
from app.types import CostReport, NormalizedTrace


def make_slug() -> str:
    return secrets.token_urlsafe(8)[:8]


def _parse(req: IngestRequest) -> NormalizedTrace:
    if req.format == "openai-agents":
        return openai_agents.parse(req.trace)
    if req.format == "generic":
        return generic.parse(req.trace)
    try:
        return openai_agents.parse(req.trace)
    except ValueError:
        return generic.parse(req.trace)


def _insert_row(row: dict[str, Any]) -> None:
    """Keep ingest live until optional-report and integration migrations land."""
    try:
        get_supabase().table("roasts").insert(row).execute()
    except Exception as exc:
        optional_columns = (
            "detailed_report",
            "langsmith_connection_id",
            "external_trace_id",
        )
        if not any(column in str(exc) for column in optional_columns):
            raise
        legacy_row = {
            key: value for key, value in row.items() if key not in optional_columns
        }
        get_supabase().table("roasts").insert(legacy_row).execute()


def run_pipeline(
    req: IngestRequest,
    user_id: str | None = None,
    batch_id: str | None = None,
    title_override: str | None = None,
    langsmith_connection_id: str | None = None,
    external_trace_id: str | None = None,
) -> str:
    trace = _parse(req)
    redacted, hits = redact_trace(trace)
    cost_findings, report = analyze_cost(redacted)
    findings = [*analyze_roast(redacted, hits), *cost_findings]
    score_value = score(findings)
    tier_value = tier(score_value)
    luna = generate_luna_assessment(findings, report, redacted, score_value, tier_value)
    roast_line, detailed_report = (
        luna if luna is not None else (fallback_line(tier_value), fallback_detailed_report(findings, report))
    )

    slug = make_slug()
    row: dict[str, Any] = {
        "slug": slug,
        "title": title_override or req.title or redacted.workflow or "Untitled trace",
        "source": req.source,
        "raw_trace": redact_value(req.trace),
        "normalized": redacted.model_dump(),
        "findings": [f.model_dump() for f in findings],
        "cost": report.model_dump(),
        "score": score_value,
        "tier": tier_value,
        "roast_line": roast_line,
        "detailed_report": detailed_report.model_dump(),
        # pipeline is synchronous: a stored row is by definition done
        "status": "done",
        "user_id": user_id,
        "batch_id": batch_id,
        "langsmith_connection_id": langsmith_connection_id,
        "external_trace_id": external_trace_id,
    }
    _insert_row(row)
    return slug


def _failed_batch_row(
    trace: Any,
    title: str,
    source: Source,
    user_id: str,
    batch_id: str,
    error: ValueError,
) -> BatchIngestResult:
    slug = make_slug()
    message = str(error)[:240]
    empty_trace = NormalizedTrace(trace_id=slug, workflow=title, spans=[])
    empty_cost = CostReport(
        total_tokens_in=0,
        total_tokens_out=0,
        total_usd=0.0,
        waste_usd=0.0,
        token_source="estimated",
        monthly_projection_usd=0.0,
        projection_assumption="at 1,000 runs/day",
        unpriced_models=[],
    )
    _insert_row(
        {
            "slug": slug,
            "title": title,
            "source": source,
            "raw_trace": redact_value(trace),
            "normalized": empty_trace.model_dump(),
            "findings": [],
            "cost": empty_cost.model_dump(),
            "detailed_report": fallback_detailed_report([], empty_cost).model_dump(),
            "score": 0,
            "tier": "Unknown",
            "roast_line": None,
            "status": "failed",
            "error": message,
            "user_id": user_id,
            "batch_id": batch_id,
        }
    )
    return BatchIngestResult(slug=slug, status="failed", error=message)


def run_batch(req: BatchIngestRequest, user_id: str) -> BatchIngestResponse:
    """Run a user-owned batch, preserving an auditable row for parse failures."""

    batch_id = str(uuid.uuid4())
    multiple = len(req.traces) > 1
    results: list[BatchIngestResult] = []
    for index, trace in enumerate(req.traces):
        single = IngestRequest(source=req.source, title=req.title, format=req.format, trace=trace)
        try:
            parsed = _parse(single)
            base_title = req.title or parsed.workflow or "Untitled trace"
            title = f"{base_title} {index + 1}" if multiple else base_title
            slug = run_pipeline(
                single,
                user_id=user_id,
                batch_id=batch_id,
                title_override=title,
            )
            results.append(BatchIngestResult(slug=slug, status="done"))
        except ValueError as exc:
            base_title = req.title or "Untitled trace"
            title = f"{base_title} {index + 1}" if multiple else base_title
            results.append(
                _failed_batch_row(trace, title, req.source, user_id, batch_id, exc)
            )
    return BatchIngestResponse(batch_id=batch_id, results=results)
