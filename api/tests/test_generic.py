import pytest

from app.normalize.generic import parse


def test_hand_written_generic_blob_parses_nested_span_array() -> None:
    raw = {
        "id": "generic-17",
        "name": "Support workflow",
        "payload": {
            "events": [
                {
                    "id": "ask",
                    "type": "llm_call",
                    "name": "draft",
                    "model": "demo-model",
                    "messages": [{"role": "user", "content": "Where is my order?"}],
                    "response": "Let me check.",
                    "vendor_field": "preserved",
                },
                {
                    "id": "lookup",
                    "type": "tool_call",
                    "name": "get_order",
                    "args": {"order_id": "R0-123"},
                    "result": {"status": "shipped"},
                },
            ]
        },
    }

    trace = parse(raw)

    assert trace.trace_id == "generic-17"
    assert trace.workflow == "Support workflow"
    assert [span.type for span in trace.spans] == ["llm", "tool"]
    assert trace.spans[0].tokens_in is not None
    assert trace.spans[0].tokens_out is not None
    assert trace.spans[0].token_source == "estimated"
    assert trace.spans[0].meta == {"vendor_field": "preserved"}
    assert trace.spans[1].name == "get_order"


@pytest.mark.parametrize(
    "raw",
    [None, {}, {"events": []}, {"events": [{"name": "missing prompt"}]}],
)
def test_generic_raises_only_when_no_span_like_items_exist(raw: object) -> None:
    with pytest.raises(ValueError):
        parse(raw)
