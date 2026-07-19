"""API request/response models — the PLAN.md contract. snake_case everywhere."""

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.cron import DEFAULT_SYNC_CRON, normalize_sync_cron
from app.types import CostReport, Finding, NormalizedTrace

Source = Literal["synthetic", "upload", "bfcl", "gaia", "live", "langsmith"]
TraceFormat = Literal["openai-agents", "generic"]
Visibility = Literal["private", "public"]


RoastStatus = Literal["processing", "done", "failed"]


class IngestRequest(BaseModel):
    source: Source
    title: str | None = None
    format: TraceFormat | None = None
    trace: Any
    user_id: str | None = None
    batch_id: str | None = None
    langsmith_connection_id: str | None = None
    external_trace_id: str | None = None


class BatchIngestRequest(BaseModel):
    source: Source = "upload"
    title: str | None = None
    format: TraceFormat | None = None
    traces: list[Any] = Field(min_length=1, max_length=25)


class IngestResponse(BaseModel):
    slug: str


class ReportAction(BaseModel):
    rule: str
    issue: str
    impact: str
    fix: str
    verification: str


class DetailedReport(BaseModel):
    summary: str = "Detailed assessment is unavailable for this report."
    actions: list[ReportAction] = Field(default_factory=list)
    generated: bool = False
    model: str | None = None


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
    detailed_report: DetailedReport
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
    detailed_report: DetailedReport
    normalized: NormalizedTrace
    created_at: str
    visibility: Visibility
    is_owner: bool = False


class OwnerRoast(BaseModel):
    id: str
    slug: str
    title: str
    source: Source
    score: int
    tier: str
    findings: list[Finding]
    cost: CostReport
    detailed_report: DetailedReport
    status: RoastStatus
    error: str | None = None
    created_at: str
    batch_id: str | None = None
    visibility: Visibility


class SharingShare(BaseModel):
    email: str
    created_at: str


class SharingInfo(BaseModel):
    visibility: Visibility
    shares: list[SharingShare]


class ShareCreate(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) is None:
            raise ValueError("invalid email address")
        return email


class VisibilityUpdate(BaseModel):
    visibility: Visibility


ConnectionStatus = Literal["active", "paused", "invalid", "disconnected"]


class LangSmithConnectionCreate(BaseModel):
    label: str
    endpoint: str
    api_key: str
    workspace_id: str
    project_name: str
    sync_cron: str = DEFAULT_SYNC_CRON

    @field_validator("sync_cron")
    @classmethod
    def validate_sync_cron(cls, value: str) -> str:
        return normalize_sync_cron(value)


class LangSmithConnectionUpdate(BaseModel):
    label: str | None = None
    endpoint: str | None = None
    api_key: str | None = None
    workspace_id: str | None = None
    project_name: str | None = None
    status: ConnectionStatus | None = None
    sync_cron: str | None = None

    @field_validator("sync_cron")
    @classmethod
    def validate_sync_cron(cls, value: str | None) -> str | None:
        return normalize_sync_cron(value) if value is not None else None


class LangSmithValidateKeyRequest(BaseModel):
    endpoint: str
    api_key: str


class LangSmithDiscoverRequest(LangSmithValidateKeyRequest):
    workspace_id: str


class LangSmithConnectionResponse(BaseModel):
    id: str
    label: str
    endpoint: str
    workspace_id: str
    project_name: str
    status: ConnectionStatus
    sync_cron: str = DEFAULT_SYNC_CRON
    last_sync_finished_at: str | None = None
    last_success_at: str | None = None
    last_scan_count: int = 0
    last_error: str | None = None
