"""API request/response models — the PLAN.md contract. snake_case everywhere."""

from typing import Any, Literal

from pydantic import BaseModel

from app.types import CostReport, Finding, NormalizedTrace

Source = Literal["synthetic", "upload", "bfcl", "gaia", "live"]
TraceFormat = Literal["openai-agents", "generic"]


class IngestRequest(BaseModel):
    source: Source
    title: str | None = None
    format: TraceFormat | None = None
    trace: Any


class IngestResponse(BaseModel):
    slug: str


class RoastRow(BaseModel):
    id: str
    slug: str
    title: str
    source: Source
    raw_trace: Any  # post-redaction JSON of the submitted trace
    normalized: NormalizedTrace
    findings: list[Finding]
    cost: CostReport
    score: int
    tier: str
    roast_line: str | None = None
    created_at: str


class RecentRoast(BaseModel):
    slug: str
    title: str
    score: int
    tier: str
    created_at: str
