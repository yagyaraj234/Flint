import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.roast_line import (
    FALLBACK_LINES,
    fallback_detailed_report,
    fallback_line,
    generate_luna_assessment,
)
from app.types import CostReport, Finding, NormalizedTrace
from tests.conftest import FakeSupabase

client = TestClient(app)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def test_fallback_line_per_tier() -> None:
    assert set(FALLBACK_LINES) == {"Rare", "Medium", "Well Done", "Charcoal"}
    assert all(len(line) <= 120 for line in FALLBACK_LINES.values())
    assert fallback_line("Charcoal") == FALLBACK_LINES["Charcoal"]
    assert fallback_line("unknown-tier") in FALLBACK_LINES.values()


def test_generate_returns_none_without_api_key(monkeypatch) -> None:
    # no key configured in tests -> must fail soft, never raise
    monkeypatch.setattr(
        "app.roast_line.get_settings",
        lambda: type("S", (), {"openai_api_key": "", "roast_model": "gpt-5.6-luna"})(),
    )
    assert generate_luna_assessment([], empty_cost(), empty_trace(), 50, "Well Done") is None


def test_fallback_report_explains_existing_findings() -> None:
    report = fallback_detailed_report(
        [
            Finding(
                rule="tool-loop",
                category="reliability",
                severity=2,
                span_ids=["tool-1"],
                message="Repeated weather tool call.",
            )
        ],
        empty_cost(),
    )
    assert report.generated is False
    assert report.actions[0].rule == "tool-loop"


def empty_trace() -> NormalizedTrace:
    return NormalizedTrace(trace_id="trace-1", workflow="test", spans=[])


def empty_cost() -> CostReport:
    return CostReport(
        total_tokens_in=0,
        total_tokens_out=0,
        total_usd=0,
        waste_usd=0,
        token_source="estimated",
        monthly_projection_usd=0,
        projection_assumption="at 1,000 runs/day",
        unpriced_models=[],
    )


def test_ingest_stores_fallback_report_immediately(fake_db: FakeSupabase) -> None:
    trace = json.loads((FIXTURES / "leaked-key.json").read_text())
    resp = client.post("/ingest", json={"source": "upload", "trace": trace})
    assert resp.status_code == 200
    row = fake_db.rows[0]
    assert row["tier"] == "Charcoal"
    assert row["roast_line"] == FALLBACK_LINES["Charcoal"]
    assert row["detailed_report"]["generated"] is False
