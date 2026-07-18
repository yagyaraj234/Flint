"""API request/response models — the PLAN.md contract. snake_case everywhere."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.types import CostReport, Finding, NormalizedTrace

Source = Literal["synthetic", "upload", "bfcl", "gaia", "live"]
TraceFormat = Literal["openai-agents", "generic"]


RoastStatus = Literal["processing", "done", "failed"]


class IngestRequest(BaseModel):
    source: Source
    title: str | None = None
    format: TraceFormat | None = None
    trace: Any


class BatchIngestRequest(BaseModel):
    source: Source = "upload"
    title: str | None = None
    format: TraceFormat | None = None
    traces: list[Any] = Field(min_length=1, max_length=25)


class IngestResponse(BaseModel):
    slug: str


class BatchIngestResult(BaseModel):
    slug: str
    status: Literal["done", "failed"]
    error: str | None = None


class BatchIngestResponse(BaseModel):
    batch_id: str
    results: list[BatchIngestResult]


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
    status: RoastStatus = "done"
    error: str | None = None
    user_id: str | None = None
    batch_id: str | None = None
    created_at: str


class RecentRoast(BaseModel):
    slug: str
    title: str
    score: int
    tier: str
    roast_line: str | None = None
    status: RoastStatus = "done"
    created_at: str


class PublicRoast(BaseModel):
    slug: str
    title: str
    source: Source
    score: int
    tier: str
    roast_line: str | None = None
    status: RoastStatus
    findings: list[Finding]
    cost: CostReport
    normalized: NormalizedTrace
    created_at: str


class OwnerRoast(BaseModel):
    id: str
    slug: str
    title: str
    source: Source
    score: int
    tier: str
    findings: list[Finding]
    cost: CostReport
    status: RoastStatus
    error: str | None = None
    created_at: str
    batch_id: str | None = None
