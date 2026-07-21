"""Luna assessment generation for a redacted trace."""

import json
from typing import Any

from openai import OpenAI

from app.config import get_settings
from app.models import DetailedReport, ReportAction
from app.types import CostReport, Finding, NormalizedTrace

FALLBACK_LINES: dict[str, str] = {
    "Rare": "Annoyingly competent. We checked twice.",
    "Medium": "Works fine, leaks a little pride per run.",
    "Well Done": "This agent bills like a lawyer and loops like a screensaver.",
    "Charcoal": "This trace should be read to new hires as a cautionary tale.",
}

_PROMPT = """You judge redacted AI-agent traces. Return JSON only with this shape:
{"roast_line":"string","summary":"string","actions":[{"rule":"existing rule", "issue":"string", "impact":"string", "fix":"string", "verification":"string"}]}.
Use only supplied deterministic findings and trace metadata. Do not invent findings,
secrets, or numbers. Keep roast_line technical, under 120 characters, no profanity.
Good roast_line: "search retried 4x with identical args; cache it or stop retrying." Bad: "This trace has problems."
Write summary in plain English. Return up to four actions, ordered by risk. Each action's
fix and verification must reference its specific rule and affected span(s), never generic
boilerplate like "Fix the flagged step, then rerun this trace." Do not return two actions
for the same rule."""


def fallback_line(tier: str) -> str:
    return FALLBACK_LINES.get(tier, FALLBACK_LINES["Well Done"])


def fallback_detailed_report(findings: list[Finding], cost: CostReport) -> DetailedReport:
    """Useful report when Luna is unavailable; never blocks trace storage."""
    if not findings:
        return DetailedReport(summary="No deterministic security, reliability, or cost issue was found.")

    actions = [
        ReportAction(
            rule=finding.rule,
            issue=finding.message,
            impact=(
                f"Estimated waste: ${finding.est_waste_usd:.2f} per run."
                if finding.est_waste_usd is not None
                else f"Severity {finding.severity} {finding.category} finding."
            ),
            fix="Fix the flagged step, then rerun this trace.",
            verification="Confirm this rule no longer appears in the next report.",
        )
        for finding in findings[:4]
    ]
    return DetailedReport(
        summary=(
            f"{len(findings)} deterministic issue{'s' if len(findings) != 1 else ''} "
            f"found. Estimated waste is ${cost.waste_usd:.2f} per run."
        ),
        actions=actions,
    )


def _trace_summary(trace: NormalizedTrace) -> dict[str, Any]:
    return {
        "workflow": trace.workflow,
        "span_count": len(trace.spans),
        "spans": [
            {
                "type": span.type,
                "name": span.name,
                "model": span.model,
                "tokens_in": span.tokens_in,
                "tokens_out": span.tokens_out,
                "duration_ms": span.duration_ms,
                "status": span.meta.get("status"),
            }
            for span in trace.spans[:50]
        ],
    }


def generate_luna_assessment(
    findings: list[Finding],
    cost: CostReport,
    trace: NormalizedTrace,
    score: int,
    tier: str,
) -> tuple[str, DetailedReport] | None:
    """Generate a structured report from redacted metadata. None means fallback."""
    settings = get_settings()
    if getattr(settings, "helix_demo", False) or not settings.openai_api_key:
        return None
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.roast_model,
            messages=[
                {"role": "system", "content": _PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "score": score,
                            "tier": tier,
                            "findings": [finding.model_dump() for finding in findings],
                            "cost": cost.model_dump(),
                            "trace": _trace_summary(trace),
                        }
                    ),
                },
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=700,
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        report = DetailedReport.model_validate(
            {
                "summary": str(payload.get("summary", ""))[:600],
                "actions": payload.get("actions", []),
                "generated": True,
                "model": settings.roast_model,
            }
        )
        valid_rules = {finding.rule for finding in findings}
        report.actions = [action for action in report.actions if action.rule in valid_rules][:4]
        if not report.summary:
            return None
        line = str(payload.get("roast_line", "")).strip().strip('"')
        return (line[:120] if line else fallback_line(tier), report)
    except Exception:
        return None
