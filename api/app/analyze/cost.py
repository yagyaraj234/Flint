"""Pure cost analysis for normalized traces."""

from collections import defaultdict
from collections.abc import Mapping
from math import ceil
from typing import Literal

from app.analyze.pricing import FALLBACK_PRICE, PRICING, RUNS_PER_DAY
from app.types import CostReport, Finding, NormalizedTrace, Span

_CHARS_PER_ESTIMATED_TOKEN = 4
_REPEATED_PREFIX_TOKENS = 2_000
_REPEATED_PREFIX_MIN_CHARS = (
    (_REPEATED_PREFIX_TOKENS - 1) * _CHARS_PER_ESTIMATED_TOKEN + 1
)


def _price_for(
    span: Span, pricing: Mapping[str, dict[str, float]]
) -> Mapping[str, float]:
    if span.model is None:
        return FALLBACK_PRICE
    return pricing.get(span.model, FALLBACK_PRICE)


def _span_cost(span: Span, pricing: Mapping[str, dict[str, float]]) -> float:
    price = _price_for(span, pricing)
    return (
        (span.tokens_in or 0) * price["in_per_m"]
        + (span.tokens_out or 0) * price["out_per_m"]
    ) / 1_000_000


def _common_prefix(values: list[str]) -> str:
    if not values:
        return ""
    first = values[0]
    end = len(first)
    for value in values[1:]:
        end = min(end, len(value))
        index = 0
        while index < end and first[index] == value[index]:
            index += 1
        end = index
        if end < _REPEATED_PREFIX_MIN_CHARS:
            break
    return first[:end]


def _duplicate_findings(
    llm_spans: list[Span], pricing: Mapping[str, dict[str, float]]
) -> list[Finding]:
    groups: dict[str, list[Span]] = defaultdict(list)
    for span in llm_spans:
        trimmed_input = span.input.strip()
        if trimmed_input:
            groups[trimmed_input].append(span)

    findings: list[Finding] = []
    for spans in groups.values():
        if len(spans) < 2:
            continue
        waste = sum(_span_cost(span, pricing) for span in spans[1:])
        findings.append(
            Finding(
                rule="duplicate-llm-call",
                category="cost",
                severity=2,
                span_ids=[span.id for span in spans],
                message=f"The same LLM input was sent {len(spans)} times.",
                est_waste_usd=waste,
            )
        )
    return findings


def _repeated_bloat_findings(
    llm_spans: list[Span], pricing: Mapping[str, dict[str, float]]
) -> list[Finding]:
    prefix_groups: dict[str, list[Span]] = defaultdict(list)
    for span in llm_spans:
        if len(span.input) >= _REPEATED_PREFIX_MIN_CHARS:
            prefix_groups[span.input[:_REPEATED_PREFIX_MIN_CHARS]].append(span)

    findings: list[Finding] = []
    for spans in prefix_groups.values():
        if len(spans) < 3:
            continue
        prefix = _common_prefix([span.input for span in spans])
        prefix_tokens = ceil(len(prefix) / _CHARS_PER_ESTIMATED_TOKEN)
        if prefix_tokens < _REPEATED_PREFIX_TOKENS:
            continue

        redundant_input_cost = sum(
            prefix_tokens * _price_for(span, pricing)["in_per_m"] / 1_000_000
            for span in spans[1:]
        )
        findings.append(
            Finding(
                rule="repeated-bloat",
                category="cost",
                severity=2,
                span_ids=[span.id for span in spans],
                message=(
                    f"A {prefix_tokens:,}-token prompt prefix was repeated "
                    f"across {len(spans)} LLM calls."
                ),
                est_waste_usd=redundant_input_cost,
            )
        )
    return findings


def _context_stuffing_findings(llm_spans: list[Span]) -> list[Finding]:
    return [
        Finding(
            rule="context-stuffing",
            category="cost",
            severity=1,
            span_ids=[span.id],
            message=f"This LLM call used {span.tokens_in:,} input tokens.",
        )
        for span in llm_spans
        if span.tokens_in is not None and span.tokens_in > 20_000
    ]


def _token_source(
    trace: NormalizedTrace,
) -> Literal["measured", "estimated", "mixed"]:
    sources = {span.token_source for span in trace.spans if span.token_source is not None}
    if sources == {"measured"}:
        return "measured"
    if sources == {"estimated"} or not sources:
        return "estimated"
    return "mixed"


def analyze_cost(
    trace: NormalizedTrace,
    pricing: Mapping[str, dict[str, float]] | None = None,
) -> tuple[list[Finding], CostReport]:
    """Return the three cost-rule findings and aggregate cost report."""

    active_pricing = PRICING if pricing is None else pricing
    llm_spans = [span for span in trace.spans if span.type == "llm"]

    findings = [
        *_duplicate_findings(llm_spans, active_pricing),
        *_repeated_bloat_findings(llm_spans, active_pricing),
        *_context_stuffing_findings(llm_spans),
    ]
    total_tokens_in = sum(span.tokens_in or 0 for span in trace.spans)
    total_tokens_out = sum(span.tokens_out or 0 for span in trace.spans)
    total_usd = sum(_span_cost(span, active_pricing) for span in llm_spans)
    waste_usd = sum(finding.est_waste_usd or 0.0 for finding in findings)

    report = CostReport(
        total_tokens_in=total_tokens_in,
        total_tokens_out=total_tokens_out,
        total_usd=total_usd,
        waste_usd=waste_usd,
        token_source=_token_source(trace),
        monthly_projection_usd=waste_usd * RUNS_PER_DAY * 30,
        projection_assumption="at 1,000 runs/day",
    )
    return findings, report
