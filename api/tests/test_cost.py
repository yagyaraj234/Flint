import pytest

from app.analyze.cost import analyze_cost
from app.types import NormalizedTrace, Span, TokenSource

TEST_PRICING = {"test-model": {"in_per_m": 2.0, "out_per_m": 4.0}}


def make_span(
    span_id: str,
    input_text: str,
    *,
    tokens_in: int | None = 100,
    tokens_out: int | None = 50,
    token_source: TokenSource | None = "measured",
) -> Span:
    return Span(
        id=span_id,
        parent_id=None,
        type="llm",
        name="completion",
        model="test-model",
        start_ms=None,
        duration_ms=None,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        token_source=token_source,
        input=input_text,
        output="done",
        meta={},
    )


def make_trace(spans: list[Span]) -> NormalizedTrace:
    return NormalizedTrace(trace_id="trace-1", workflow="test", spans=spans)


def test_duplicate_llm_call_uses_trimmed_input_and_prices_only_duplicates() -> None:
    first = make_span("first", " same prompt ", tokens_in=100, tokens_out=50)
    duplicate = make_span("duplicate", "same prompt", tokens_in=200, tokens_out=100)

    findings, report = analyze_cost(make_trace([first, duplicate]), TEST_PRICING)

    finding = next(item for item in findings if item.rule == "duplicate-llm-call")
    assert finding.severity == 2
    assert finding.category == "cost"
    assert finding.span_ids == ["first", "duplicate"]
    assert finding.est_waste_usd == pytest.approx(0.0008)
    assert report.total_tokens_in == 300
    assert report.total_tokens_out == 150
    assert report.total_usd == pytest.approx(0.0012)
    assert report.waste_usd == pytest.approx(0.0008)
    assert report.monthly_projection_usd == pytest.approx(24.0)
    assert report.projection_assumption == "at 1,000 runs/day"


def test_repeated_bloat_prices_redundant_prefix_tokens() -> None:
    prefix = "x" * 8_000
    spans = [
        make_span("one", prefix + "A", token_source="estimated"),
        make_span("two", prefix + "B", token_source="estimated"),
        make_span("three", prefix + "C", token_source="estimated"),
    ]

    findings, report = analyze_cost(make_trace(spans), TEST_PRICING)

    finding = next(item for item in findings if item.rule == "repeated-bloat")
    assert finding.severity == 2
    assert finding.span_ids == ["one", "two", "three"]
    assert finding.est_waste_usd == pytest.approx(0.008)
    # estimated per-finding waste exceeds measured spend here, so the report
    # caps waste at total_usd — a card never claims more waste than spend
    assert report.waste_usd == pytest.approx(report.total_usd)
    assert report.waste_usd < 0.008
    assert report.token_source == "estimated"


def test_context_stuffing_fires_only_over_twenty_thousand_tokens() -> None:
    boundary = make_span("boundary", "boundary", tokens_in=20_000)
    stuffed = make_span("stuffed", "stuffed", tokens_in=20_001)

    findings, _ = analyze_cost(make_trace([boundary, stuffed]), TEST_PRICING)

    context_findings = [item for item in findings if item.rule == "context-stuffing"]
    assert len(context_findings) == 1
    assert context_findings[0].span_ids == ["stuffed"]
    assert context_findings[0].severity == 1
    assert context_findings[0].est_waste_usd is None


def test_cost_rules_do_not_fire_below_their_boundaries() -> None:
    short_prefix = "x" * 7_996
    spans = [
        make_span("one", short_prefix + "A", tokens_in=20_000),
        make_span("two", short_prefix + "B", tokens_in=20_000),
    ]

    findings, _ = analyze_cost(make_trace(spans), TEST_PRICING)

    assert findings == []


def test_token_source_is_mixed_when_span_sources_differ() -> None:
    measured = make_span("measured", "one", token_source="measured")
    estimated = make_span("estimated", "two", token_source="estimated")

    _, report = analyze_cost(make_trace([measured, estimated]), TEST_PRICING)

    assert report.token_source == "mixed"


def test_cost_report_discloses_models_without_public_pricing() -> None:
    unknown = make_span("unknown", "one")
    unknown.model = "unpriced-model"
    _, unknown_report = analyze_cost(make_trace([unknown]))
    priced = make_span("priced", "two")
    priced.model = "gpt-4.1-mini"
    _, priced_report = analyze_cost(make_trace([priced]))

    assert unknown_report.unpriced_models == ["unpriced-model"]
    assert priced_report.unpriced_models == []
