"""Internal pipeline types — frozen per PLAN.md. Nothing downstream reinterprets these."""

from typing import Any, Literal

from pydantic import BaseModel

SpanType = Literal["llm", "tool", "handoff", "guardrail", "other"]
TokenSource = Literal["measured", "estimated"]
Category = Literal["security", "reliability", "cost"]


class Span(BaseModel):
    id: str
    parent_id: str | None
    type: SpanType
    name: str  # tool name, model name, agent name
    model: str | None  # for llm spans, needed for pricing
    start_ms: float | None
    duration_ms: float | None
    tokens_in: int | None
    tokens_out: int | None
    token_source: TokenSource | None
    input: str  # stringified, post-redaction
    output: str  # stringified, post-redaction
    meta: dict[str, Any]


class NormalizedTrace(BaseModel):
    trace_id: str
    workflow: str
    spans: list[Span]


class RedactionHit(BaseModel):
    rule: str
    span_id: str


class Finding(BaseModel):
    rule: str
    category: Category
    severity: Literal[1, 2, 3]
    span_ids: list[str]
    message: str  # plain language, shown on the card
    est_waste_usd: float | None = None


class CostReport(BaseModel):
    total_tokens_in: int
    total_tokens_out: int
    total_usd: float
    waste_usd: float
    token_source: Literal["measured", "estimated", "mixed"]
    monthly_projection_usd: float  # waste_usd * RUNS_PER_DAY * 30
    projection_assumption: str  # printed on the card, e.g. "at 1,000 runs/day"
    unpriced_models: list[str] = []
