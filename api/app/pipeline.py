"""Ingest pipeline: normalize -> redact -> analyze -> score -> insert, returns slug.

STUBBED until Track A lands (PLAN.md stages 1-2). The stub proves the route and
insert path end to end but stores placeholders instead of the submitted trace:
until redaction exists, the raw trace must never reach the database, so the
no-secrets-in-db guarantee holds from the first commit.
"""

import secrets
from typing import Any

from app.db import get_supabase
from app.models import IngestRequest
from app.types import CostReport, NormalizedTrace


def make_slug() -> str:
    return secrets.token_urlsafe(8)[:8]


def run_pipeline(req: IngestRequest) -> str:
    # TODO(track-a swap, checkpoint T+1:15/T+2:10):
    #   parsed = openai_agents.parse(req.trace) or generic.parse(req.trace)  (honor req.format)
    #   redacted, hits = redact.redact(parsed)
    #   findings = roast.analyze(redacted, hits) + cost_rules.analyze(redacted)
    #   report = cost.report(redacted); s = score.score(findings); tier = score.tier(s)
    slug = make_slug()
    row: dict[str, Any] = {
        "slug": slug,
        "title": req.title or "Untitled trace",
        "source": req.source,
        # Placeholders, NOT req.trace — see module docstring.
        "raw_trace": {"stub": True},
        "normalized": NormalizedTrace(trace_id=slug, workflow=req.title or "stub", spans=[]).model_dump(),
        "findings": [],
        "cost": CostReport(
            total_tokens_in=0,
            total_tokens_out=0,
            total_usd=0.0,
            waste_usd=0.0,
            token_source="estimated",
            monthly_projection_usd=0.0,
            projection_assumption="stub pipeline — analyzers not wired yet",
        ).model_dump(),
        "score": 100,
        "tier": "Rare",
        "roast_line": None,
    }
    get_supabase().table("roasts").insert(row).execute()
    return slug
