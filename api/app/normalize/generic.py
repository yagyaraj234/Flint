"""Best-effort normalizer for arbitrary JSON trace-like structures."""

import json
from typing import Any

from app.normalize.estimate_tokens import estimate_tokens
from app.types import NormalizedTrace, Span, SpanType

_IDENTITY_KEYS = ("name", "type", "span_type", "kind", "event", "operation", "tool_name", "model")
_PROMPT_KEYS = ("input", "prompt", "messages", "args", "arguments")
_OUTPUT_KEYS = ("output", "response", "result", "completion")


def _as_dict(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {str(key): item for key, item in value.items()}


def _first(mapping: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value is not None:
            return value
    return None


def _stringify(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return str(value)


def _looks_like_span(value: object) -> bool:
    item = _as_dict(value)
    return any(key in item for key in _IDENTITY_KEYS) and any(key in item for key in _PROMPT_KEYS)


def _find_span_array(value: object) -> list[object] | None:
    if isinstance(value, list):
        objects = [item for item in value if isinstance(item, dict)]
        if any(_looks_like_span(item) for item in objects):
            return [item for item in objects if any(key in item for key in _IDENTITY_KEYS)]
        for item in value:
            found = _find_span_array(item)
            if found is not None:
                return found
    elif isinstance(value, dict):
        for item in value.values():
            found = _find_span_array(item)
            if found is not None:
                return found
    return None


def _span_type(item: dict[str, Any]) -> SpanType:
    raw_type = str(_first(item, ("type", "span_type", "kind", "event", "operation")) or "").lower()
    name = str(_first(item, ("name", "tool_name", "model")) or "").lower()
    if "handoff" in raw_type:
        return "handoff"
    if "guardrail" in raw_type:
        return "guardrail"
    if any(marker in raw_type for marker in ("tool", "function")):
        return "tool"
    if any(marker in raw_type for marker in ("llm", "generation", "response", "chat", "completion", "model")):
        return "llm"
    if "handoff" in name:
        return "handoff"
    if "guardrail" in name:
        return "guardrail"
    if any(marker in name for marker in ("tool", "function")):
        return "tool"
    if any(marker in name for marker in ("llm", "generation", "response", "chat", "completion")):
        return "llm"
    if item.get("model") is not None or item.get("messages") is not None or item.get("prompt") is not None:
        return "llm"
    if item.get("tool_name") is not None or item.get("args") is not None or item.get("arguments") is not None:
        return "tool"
    return "other"


def _number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _token_count(value: object) -> int | None:
    number = _number(value)
    return int(number) if number is not None and number >= 0 else None


def _parse_span(value: object, index: int) -> Span:
    item = _as_dict(value)
    parsed_type = _span_type(item)
    input_text = _stringify(_first(item, _PROMPT_KEYS))
    output_text = _stringify(_first(item, _OUTPUT_KEYS))
    model_value = item.get("model")
    model = str(model_value) if model_value is not None and parsed_type == "llm" else None
    name_value = _first(item, ("name", "tool_name", "model", "operation", "event", "type"))
    name = str(name_value if name_value is not None else parsed_type)
    span_id = _first(item, ("id", "span_id"))
    parent_id = _first(item, ("parent_id", "parent_span_id"))
    start_ms = _number(_first(item, ("start_ms", "start_time", "start")))
    duration_ms = _number(_first(item, ("duration_ms", "duration")))

    usage = _as_dict(item.get("usage") or item.get("usage_metadata"))
    measured_in = _token_count(_first(usage, ("input_tokens", "prompt_tokens")))
    measured_out = _token_count(_first(usage, ("output_tokens", "completion_tokens")))
    if measured_in is None:
        measured_in = _token_count(item.get("input_tokens"))
    if measured_out is None:
        measured_out = _token_count(item.get("output_tokens"))
    has_measured_usage = measured_in is not None or measured_out is not None
    tokens_in = (measured_in if measured_in is not None else estimate_tokens(input_text)) if parsed_type == "llm" else None
    tokens_out = (measured_out if measured_out is not None else estimate_tokens(output_text)) if parsed_type == "llm" else None
    token_source = ("measured" if has_measured_usage else "estimated") if parsed_type == "llm" else None
    consumed = {
        *_IDENTITY_KEYS, *_PROMPT_KEYS, *_OUTPUT_KEYS, "id", "span_id", "parent_id",
        "parent_span_id", "start_ms", "start_time", "start", "duration_ms", "duration",
        "usage", "usage_metadata", "input_tokens", "output_tokens",
    }
    meta = {key: item_value for key, item_value in item.items() if key not in consumed}

    return Span(
        id=str(span_id if span_id is not None else f"span-{index + 1}"),
        parent_id=str(parent_id) if parent_id is not None else None,
        type=parsed_type,
        name=name,
        model=model,
        start_ms=start_ms,
        duration_ms=duration_ms,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        token_source=token_source,
        input=input_text,
        output=output_text,
        meta=meta,
    )


def parse(raw: object) -> NormalizedTrace:
    """Find and normalize the first trace-like array in arbitrary JSON."""

    candidates = _find_span_array(raw)
    if not candidates:
        raise ValueError("No span-like array found in generic trace")
    root = _as_dict(raw)
    trace_id = _first(root, ("trace_id", "id")) or "generic-trace"
    workflow = _first(root, ("workflow", "workflow_name", "name", "title")) or "generic"
    return NormalizedTrace(
        trace_id=str(trace_id),
        workflow=str(workflow),
        spans=[_parse_span(value, index) for index, value in enumerate(candidates)],
    )
