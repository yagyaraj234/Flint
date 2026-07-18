"""Secret redaction for normalized and raw JSON-like traces."""

import re
from collections.abc import Callable

from app.types import NormalizedTrace, RedactionHit, Span

SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("openai-key", re.compile(r"sk-[A-Za-z0-9_-]{20,}")),
    ("aws-key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("github-token", re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}")),
    ("slack-token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("google-key", re.compile(r"AIza[0-9A-Za-z_-]{35}")),
    ("jwt", re.compile(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")),
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("bearer", re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}")),
]


def _redact_string(text: str, on_hit: Callable[[str], None] | None = None) -> str:
    redacted = text
    for rule, pattern in SECRET_PATTERNS:
        def replace(_: re.Match[str], *, matched_rule: str = rule) -> str:
            if on_hit is not None:
                on_hit(matched_rule)
            return f"«REDACTED:{matched_rule}»"

        redacted = pattern.sub(replace, redacted)
    return redacted


def _redact_nested(value: object, on_hit: Callable[[str], None] | None = None) -> object:
    if isinstance(value, str):
        return _redact_string(value, on_hit)
    if isinstance(value, dict):
        return {key: _redact_nested(item, on_hit) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_nested(item, on_hit) for item in value]
    return value


def redact_trace(trace: NormalizedTrace) -> tuple[NormalizedTrace, list[RedactionHit]]:
    """Redact span text and metadata while recording every match's span."""

    hits: list[RedactionHit] = []
    cleaned_spans: list[Span] = []

    for span in trace.spans:
        def record(rule: str, *, span_id: str = span.id) -> None:
            hits.append(RedactionHit(rule=rule, span_id=span_id))

        cleaned_input = _redact_string(span.input, record)
        cleaned_output = _redact_string(span.output, record)
        cleaned_meta = _redact_nested(span.meta, record)
        if not isinstance(cleaned_meta, dict):
            raise TypeError("span metadata must remain a dictionary")
        cleaned_spans.append(
            span.model_copy(
                update={
                    "input": cleaned_input,
                    "output": cleaned_output,
                    "meta": cleaned_meta,
                }
            )
        )

    return trace.model_copy(update={"spans": cleaned_spans}), hits


def redact_value(value: object) -> object:
    """Recursively redact string values in a raw JSON-like value."""

    return _redact_nested(value)
