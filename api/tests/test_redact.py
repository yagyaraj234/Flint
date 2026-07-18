import json
from pathlib import Path

from app.normalize.openai_agents import parse
from app.normalize.redact import redact_trace, redact_value
from app.types import NormalizedTrace, Span

FIXTURES = Path(__file__).parents[2] / "fixtures"
FAKE_KEY = "sk-FAKE000000000000000000000000"


def test_leaked_key_is_removed_and_hit_has_correct_span_id() -> None:
    raw = json.loads((FIXTURES / "leaked-key.json").read_text())
    cleaned, hits = redact_trace(parse(raw))

    assert FAKE_KEY not in cleaned.model_dump_json()
    assert [hit.model_dump() for hit in hits] == [
        {"rule": "openai-key", "span_id": "span-deploy"}
    ]
    assert "«REDACTED:openai-key»" in cleaned.spans[1].input


def test_redact_trace_walks_input_output_and_nested_meta() -> None:
    trace = NormalizedTrace(
        trace_id="trace-redact",
        workflow="redaction test",
        spans=[
            Span(
                id="span-a",
                parent_id=None,
                type="tool",
                name="call_api",
                model=None,
                start_ms=None,
                duration_ms=None,
                tokens_in=None,
                tokens_out=None,
                token_source=None,
                input="Bearer abcdefghijklmnopqrstuvwxyz",
                output="AKIA1234567890ABCDEF",
                meta={"nested": [{"token": "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"}]},
            )
        ],
    )

    cleaned, hits = redact_trace(trace)

    assert [hit.rule for hit in hits] == ["bearer", "aws-key", "github-token"]
    assert all(hit.span_id == "span-a" for hit in hits)
    assert "Bearer abcdefghijklmnopqrstuvwxyz" not in cleaned.model_dump_json()
    assert "AKIA1234567890ABCDEF" not in cleaned.model_dump_json()
    assert "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" not in cleaned.model_dump_json()


def test_redact_value_recurses_without_span_attribution() -> None:
    raw: object = {"items": [FAKE_KEY, {"safe": "hello"}]}

    assert redact_value(raw) == {
        "items": ["«REDACTED:openai-key»", {"safe": "hello"}]
    }

