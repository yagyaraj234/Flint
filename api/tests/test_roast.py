from app.analyze.roast import analyze_roast
from app.types import NormalizedTrace, RedactionHit, Span, SpanType


def make_span(
    span_id: str,
    input_text: str,
    *,
    span_type: SpanType = "llm",
    name: str = "completion",
    status: str | None = None,
    duration_ms: int | None = None,
) -> Span:
    meta = {} if status is None else {"status": status}
    return Span(
        id=span_id,
        parent_id=None,
        type=span_type,
        name=name,
        model="test-model" if span_type == "llm" else None,
        start_ms=None,
        duration_ms=duration_ms,
        tokens_in=10,
        tokens_out=5,
        token_source="measured",
        input=input_text,
        output="done",
        meta=meta,
    )


def make_trace(spans: list[Span]) -> NormalizedTrace:
    return NormalizedTrace(trace_id="trace-1", workflow="test", spans=spans)


def test_leaked_secret_is_built_from_redaction_hits() -> None:
    hits = [
        RedactionHit(rule="openai-key", span_id="one"),
        RedactionHit(rule="github-token", span_id="two"),
    ]

    findings = analyze_roast(make_trace([]), hits)

    assert len(findings) == 1
    assert findings[0].rule == "leaked-secret"
    assert findings[0].severity == 3
    assert findings[0].category == "security"
    assert findings[0].span_ids == ["one", "two"]


def test_pii_email_and_phone_fire_but_clean_input_does_not() -> None:
    spans = [
        make_span("email", "Contact ada@example.com"),
        make_span("phone", "Call +1 (415) 555-0199"),
        make_span("clean", "No personal information here"),
    ]

    findings = analyze_roast(make_trace(spans), [])

    pii = [item for item in findings if item.rule == "pii-in-prompt"]
    assert [item.span_ids for item in pii] == [["email"], ["phone"]]
    assert all(item.severity == 1 and item.category == "security" for item in pii)


def test_insecure_url_excludes_local_development_hosts() -> None:
    spans = [
        make_span("external", '{"url":"http://example.com/data"}', span_type="tool"),
        make_span("localhost", '{"url":"http://localhost:8000/data"}', span_type="tool"),
        make_span("loopback", '{"url":"http://127.0.0.1/data"}', span_type="tool"),
        make_span("secure", '{"url":"https://example.com/data"}', span_type="tool"),
    ]

    findings = analyze_roast(make_trace(spans), [])

    insecure = [item for item in findings if item.rule == "insecure-url"]
    assert len(insecure) == 1
    assert insecure[0].span_ids == ["external"]
    assert insecure[0].severity == 1
    assert insecure[0].category == "security"


def test_tool_loop_severity_two_over_three_and_three_over_eight() -> None:
    spans = [
        *[
            make_span(f"four-{index}", '{"q":"same"}', span_type="tool", name="search")
            for index in range(4)
        ],
        *[
            make_span(f"nine-{index}", '{"path":"same"}', span_type="tool", name="read")
            for index in range(9)
        ],
        *[
            make_span(f"three-{index}", '{"id":1}', span_type="tool", name="lookup")
            for index in range(3)
        ],
    ]

    findings = analyze_roast(make_trace(spans), [])

    loops = [item for item in findings if item.rule == "tool-loop"]
    assert [(item.severity, len(item.span_ids)) for item in loops] == [(2, 4), (3, 9)]
    assert all(item.category == "reliability" for item in loops)


def test_error_tail_requires_the_final_span_to_have_error_status() -> None:
    nonfinal_error = make_span("failed", "first", status="error")
    success = make_span("success", "last", status="completed")
    error_tail = make_span("tail", "last", status="ERROR")

    no_finding = analyze_roast(make_trace([nonfinal_error, success]), [])
    findings = analyze_roast(make_trace([success, error_tail]), [])

    assert not any(item.rule == "error-tail" for item in no_finding)
    tail = next(item for item in findings if item.rule == "error-tail")
    assert tail.span_ids == ["tail"]
    assert tail.severity == 2
    assert tail.category == "reliability"


def test_silent_tool_failure_requires_no_later_retry_and_excludes_error_tail() -> None:
    failed = make_span("failed", "{\"q\":\"weather\"}", span_type="tool", name="search", status="error")
    retry = make_span("retry", "{\"q\":\"weather\"}", span_type="tool", name="search")
    continued = make_span("continued", "next")
    tail = make_span("tail", "{\"q\":\"news\"}", span_type="tool", name="search", status="error")

    no_retry = analyze_roast(make_trace([failed, continued]), [])
    retried = analyze_roast(make_trace([failed, retry, continued]), [])
    error_tail = analyze_roast(make_trace([continued, tail]), [])

    finding = next(item for item in no_retry if item.rule == "silent-tool-failure")
    assert finding.span_ids == ["failed"]
    assert finding.severity == 2
    assert finding.category == "reliability"
    assert not any(item.rule == "silent-tool-failure" for item in retried)
    assert not any(item.rule == "silent-tool-failure" for item in error_tail)


def test_slow_span_uses_fifteen_second_threshold() -> None:
    findings = analyze_roast(
        make_trace(
            [
                make_span("at-threshold", "", duration_ms=15_000),
                make_span("slow", "", duration_ms=15_001),
            ]
        ),
        [],
    )

    slow = next(item for item in findings if item.rule == "slow-span")
    assert slow.span_ids == ["slow"]
    assert slow.severity == 1
    assert slow.category == "reliability"


def test_empty_clean_trace_has_no_roast_findings() -> None:
    assert analyze_roast(make_trace([]), []) == []
