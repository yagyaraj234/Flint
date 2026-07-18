"""API request/response models — the PLAN.md contract. snake_case everywhere."""

from typing import Any, Literal

from pydantic import BaseModel

from app.types import CostReport, Finding, NormalizedTrace

Source = Literal["synthetic", "upload", "bfcl", "gaia", "live", "langsmith"]
TraceFormat = Literal["openai-agents", "generic"]


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
    status: RoastStatus = "done"
    error: str | None = None
    user_id: str | None = None
    batch_id: str | None = None
    langsmith_connection_id: str | None = None
    external_trace_id: str | None = None
    created_at: str


ConnectionStatus = Literal["active", "paused", "invalid", "disconnected"]


class LangSmithConnectionCreate(BaseModel):
    label: str
    endpoint: str
    api_key: str
    workspace_id: str
    project_name: str


class LangSmithConnectionUpdate(BaseModel):
    label: str | None = None
    endpoint: str | None = None
    api_key: str | None = None
    workspace_id: str | None = None
    project_name: str | None = None
    status: ConnectionStatus | None = None


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
    last_sync_finished_at: str | None = None
    last_success_at: str | None = None
    last_scan_count: int = 0
    last_error: str | None = None


class RecentRoast(BaseModel):
    slug: str
    title: str
    score: int
    tier: str
    status: RoastStatus = "done"
    created_at: str
