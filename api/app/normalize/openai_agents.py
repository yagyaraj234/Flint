"""Normalizer for OpenAI Agents SDK trace exports."""

import json
from datetime import datetime
from typing import Any, Literal, cast

from app.types import NormalizedTrace, Span, SpanType


def _as_dict(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {str(key): item for key, item in value.items()}


def _stringify(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return str(value)


def _first(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value is not None:
            return value
    return None


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


def _integer(value: object) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def _timestamp_ms(value: object) -> float | None:
    numeric = _number(value)
    if numeric is not None:
        return numeric * 1_000 if abs(numeric) < 100_000_000_000 else numeric
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() * 1_000


def _span_type(raw_type: object) -> SpanType:
    value = str(raw_type or "").lower().replace("-", "_")
    if value in {"generation", "response", "llm", "chat", "completion", "model"}:
        return "llm"
    if value in {"function", "function_call", "tool", "tool_call", "custom_tool_call"}:
        return "tool"
    if "handoff" in value:
        return "handoff"
    if "guardrail" in value:
        return "guardrail"
    return "other"


def _usage(span: dict[str, Any], data: dict[str, Any]) -> tuple[int | None, int | None]:
    usage = _as_dict(_first(data, "usage", "token_usage"))
    if not usage:
        usage = _as_dict(_first(span, "usage", "token_usage"))
    if not usage:
        response = _as_dict(data.get("response"))
        usage = _as_dict(_first(response, "usage", "token_usage"))
    if not usage:
        return None, None
    tokens_in = _integer(_first(usage, "input_tokens", "prompt_tokens", "tokens_in"))
    tokens_out = _integer(_first(usage, "output_tokens", "completion_tokens", "tokens_out"))
    return tokens_in, tokens_out


def _timing(span: dict[str, Any]) -> tuple[float | None, float | None]:
    start_value = _first(span, "start_ms", "started_at", "start_time", "start")
    start_ms = _timestamp_ms(start_value)
    duration_ms = _number(_first(span, "duration_ms", "duration"))
    if duration_ms is None:
        end_ms = _timestamp_ms(_first(span, "ended_at", "end_time", "end"))
        if start_ms is not None and end_ms is not None:
            duration_ms = max(0.0, end_ms - start_ms)
    return start_ms, duration_ms


def _metadata(span: dict[str, Any], data: dict[str, Any], span_type: SpanType) -> dict[str, Any]:
    consumed_span = {
        "id", "span_id", "parent_id", "parent_span_id", "trace_id", "type", "span_type",
        "name", "model", "input", "prompt", "messages", "args", "arguments", "output",
        "response", "result", "usage", "token_usage", "start_ms", "started_at", "start_time",
        "start", "duration_ms", "duration", "ended_at", "end_time", "end", "span_data", "data",
    }
    consumed_data = {
        "type", "span_type", "name", "tool_name", "function_name", "model", "model_name",
        "input", "prompt", "messages", "args", "arguments", "output", "response", "result",
        "usage", "token_usage",
    }
    meta = _as_dict(span.get("meta") or span.get("metadata"))
    meta.update({key: value for key, value in span.items() if key not in consumed_span and key not in {"meta", "metadata"}})
    meta.update({key: value for key, value in data.items() if key not in consumed_data})
    if span_type == "other":
        meta["raw"] = span
    return meta


def _parse_span(value: object, index: int) -> Span | None:
    span = _as_dict(value)
    if not span:
        return None
    data = _as_dict(span.get("span_data") or span.get("data"))
    response = _as_dict(data.get("response"))
    raw_type = _first(data, "type", "span_type") or _first(span, "type", "span_type")
    parsed_type = _span_type(raw_type)

    input_value = _first(data, "input", "prompt", "messages", "args", "arguments")
    if input_value is None:
        input_value = _first(span, "input", "prompt", "messages", "args", "arguments")
    output_value = _first(data, "output", "result")
    if output_value is None:
        output_value = _first(response, "output", "result", "content")
    if output_value is None and data.get("response") is not None:
        output_value = data.get("response")
    if output_value is None:
        output_value = _first(span, "output", "response", "result")

    model_value = (
        _first(data, "model", "model_name")
        or _first(response, "model", "model_name")
        or _first(span, "model", "model_name")
    )
    model = str(model_value) if model_value is not None and parsed_type == "llm" else None
    name_value = _first(data, "name", "tool_name", "function_name") or span.get("name")
    if name_value is None:
        if parsed_type == "llm":
            name_value = model or "llm"
        else:
            name_value = str(raw_type or parsed_type)

    tokens_in: int | None = None
    tokens_out: int | None = None
    token_source: Literal["measured", "estimated"] | None = None
    if parsed_type == "llm":
        tokens_in, tokens_out = _usage(span, data)
        if tokens_in is not None or tokens_out is not None:
            token_source = "measured"

    start_ms, duration_ms = _timing(span)
    span_id = _first(span, "span_id", "id")
    parent_id = _first(span, "parent_id", "parent_span_id")
    return Span(
        id=str(span_id if span_id is not None else f"span-{index + 1}"),
        parent_id=str(parent_id) if parent_id is not None else None,
        type=parsed_type,
        name=str(name_value),
        model=model,
        start_ms=start_ms,
        duration_ms=duration_ms,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        token_source=token_source,
        input=_stringify(input_value),
        output=_stringify(output_value),
        meta=_metadata(span, data, parsed_type),
    )


def parse(raw: object) -> NormalizedTrace:
    """Parse an OpenAI Agents SDK trace export into the frozen internal schema."""

    root = _as_dict(raw)
    if not root:
        raise ValueError("OpenAI Agents trace must be a JSON object")
    wrapped = root.get("trace")
    trace = _as_dict(wrapped) if isinstance(wrapped, dict) else root
    raw_spans = trace.get("spans")
    if not isinstance(raw_spans, list):
        raw_spans = root.get("spans")
    if not isinstance(raw_spans, list):
        raise ValueError("Unrecognizable OpenAI Agents trace: expected a spans array")

    parsed_spans = [parsed for index, value in enumerate(raw_spans) if (parsed := _parse_span(value, index)) is not None]
    if not parsed_spans:
        raise ValueError("OpenAI Agents trace contains zero spans")

    trace_id_value = _first(trace, "trace_id", "id") or _first(root, "trace_id", "id") or "unknown-trace"
    workflow_value = _first(trace, "workflow_name", "workflow", "name") or _first(root, "workflow_name", "workflow", "name") or "unknown-workflow"
    return NormalizedTrace(
        trace_id=str(trace_id_value),
        workflow=str(workflow_value),
        spans=cast(list[Span], parsed_spans),
    )
