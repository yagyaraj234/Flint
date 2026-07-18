"""Ingest pipeline: normalize -> redact -> analyze -> score -> insert, returns slug.

Raises ValueError when no parser can extract spans; the ingest router maps
that to a 422. Everything stored (raw_trace included) is post-redaction —
the database never contains a secret.
"""

import secrets
from typing import Any

from app.analyze.cost import analyze_cost
from app.analyze.roast import analyze_roast
from app.analyze.score import score, tier
from app.db import get_supabase
from app.models import IngestRequest
from app.normalize import generic, openai_agents
from app.normalize.redact import redact_trace, redact_value
from app.roast_line import fallback_line
from app.types import NormalizedTrace


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


def run_pipeline(req: IngestRequest) -> str:
    trace = _parse(req)
    redacted, hits = redact_trace(trace)
    cost_findings, report = analyze_cost(redacted)
    findings = [*analyze_roast(redacted, hits), *cost_findings]
    score_value = score(findings)

    slug = make_slug()
    row: dict[str, Any] = {
        "slug": slug,
        "title": req.title or redacted.workflow or "Untitled trace",
        "source": req.source,
        "raw_trace": redact_value(req.trace),
        "normalized": redacted.model_dump(),
        "findings": [f.model_dump() for f in findings],
        "cost": report.model_dump(),
        "score": score_value,
        "tier": tier(score_value),
        # per-tier fallback; the post-insert background task swaps in the LLM line
        "roast_line": fallback_line(tier(score_value)),
    }
    get_supabase().table("roasts").insert(row).execute()
    return slug
