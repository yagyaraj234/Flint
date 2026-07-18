import json
from pathlib import Path

import pytest

from app.normalize.openai_agents import parse

FIXTURES = Path(__file__).parents[2] / "fixtures"


@pytest.mark.parametrize(
    "fixture_name",
    ["leaked-key.json", "loopy.json", "bloated-prompt.json", "clean.json"],
)
def test_each_sdk_fixture_parses(fixture_name: str) -> None:
    raw = json.loads((FIXTURES / fixture_name).read_text())

    trace = parse(raw)

    assert trace.trace_id
    assert trace.workflow
    assert trace.spans


def test_generation_usage_is_measured_and_tool_fields_are_mapped() -> None:
    raw = json.loads((FIXTURES / "clean.json").read_text())

    trace = parse(raw)

    assert [span.type for span in trace.spans] == ["llm", "tool", "llm"]
    assert trace.spans[0].model == "gpt-4.1-mini"
    assert trace.spans[0].tokens_in == 12
    assert trace.spans[0].tokens_out == 8
    assert trace.spans[0].token_source == "measured"
    assert trace.spans[1].name == "get_order_status"
    assert trace.spans[1].parent_id == "span-understand"


def test_missing_usage_is_unknown_and_unknown_span_keeps_raw_payload() -> None:
    raw = {
        "id": "trace-variants",
        "workflow_name": "Variants",
        "spans": [
            {
                "id": "span-no-usage",
                "span_data": {
                    "type": "generation",
                    "model": "gpt-test",
                    "input": "hello",
                    "output": "world",
                },
            },
            {"id": "span-mystery", "span_data": {"type": "mystery", "payload": 42}},
        ],
    }

    trace = parse(raw)

    assert trace.spans[0].tokens_in is None
    assert trace.spans[0].tokens_out is None
    assert trace.spans[0].token_source is None
    assert trace.spans[1].type == "other"
    assert trace.spans[1].meta["raw"]["id"] == "span-mystery"


@pytest.mark.parametrize("raw", [None, {}, {"spans": []}, {"events": []}])
def test_unrecognizable_or_empty_sdk_trace_raises(raw: object) -> None:
    with pytest.raises(ValueError):
        parse(raw)

