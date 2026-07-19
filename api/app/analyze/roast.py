"""Pure security and reliability analysis for normalized traces."""

from collections import defaultdict
from collections.abc import Sequence
import hashlib
import re

from app.types import Finding, NormalizedTrace, RedactionHit, Span

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
# 10+ digits so ISO dates (8 digits, e.g. 2026-07-20) don't read as phone numbers
_PHONE_RE = re.compile(r"(?<!\w)\+?\d(?:[\s().-]*\d){9,}(?!\w)")
_INSECURE_URL_RE = re.compile(
    r"http://(?!localhost(?:[:/]|$)|127\.0\.0\.1(?:[:/]|$))[^\s\"'<>]+",
    re.IGNORECASE,
)
_SLOW_SPAN_MS = 15_000


def _leaked_secret_findings(redaction_hits: Sequence[RedactionHit]) -> list[Finding]:
    if not redaction_hits:
        return []
    span_ids = list(dict.fromkeys(hit.span_id for hit in redaction_hits))
    return [
        Finding(
            rule="leaked-secret",
            category="security",
            severity=3,
            span_ids=span_ids,
            message=f"Redaction caught {len(redaction_hits)} exposed secret(s).",
        )
    ]


def _pii_findings(trace: NormalizedTrace) -> list[Finding]:
    findings: list[Finding] = []
    for span in trace.spans:
        if _EMAIL_RE.search(span.input) or _PHONE_RE.search(span.input):
            findings.append(
                Finding(
                    rule="pii-in-prompt",
                    category="security",
                    severity=1,
                    span_ids=[span.id],
                    message="The span input contains an email address or phone number.",
                )
            )
    return findings


def _insecure_url_findings(trace: NormalizedTrace) -> list[Finding]:
    return [
        Finding(
            rule="insecure-url",
            category="security",
            severity=1,
            span_ids=[span.id],
            message="Tool arguments send data over an insecure HTTP URL.",
        )
        for span in trace.spans
        if span.type == "tool" and _INSECURE_URL_RE.search(span.input)
    ]


def _args_hash(span: Span) -> str:
    return hashlib.sha256(span.input.encode("utf-8")).hexdigest()


def _tool_loop_findings(trace: NormalizedTrace) -> list[Finding]:
    groups: dict[tuple[str, str], list[Span]] = defaultdict(list)
    for span in trace.spans:
        if span.type == "tool":
            groups[(span.name, _args_hash(span))].append(span)

    findings: list[Finding] = []
    for spans in groups.values():
        count = len(spans)
        if count <= 3:
            continue
        severity = 3 if count > 8 else 2
        findings.append(
            Finding(
                rule="tool-loop",
                category="reliability",
                severity=severity,
                span_ids=[span.id for span in spans],
                message=f"The same tool call repeated {count} times.",
            )
        )
    return findings


def _error_tail_findings(trace: NormalizedTrace) -> list[Finding]:
    if not trace.spans:
        return []
    final_span = trace.spans[-1]
    status = final_span.meta.get("status")
    if not isinstance(status, str) or status.lower() != "error":
        return []
    return [
        Finding(
            rule="error-tail",
            category="reliability",
            severity=2,
            span_ids=[final_span.id],
            message="The trace ends with an error.",
        )
    ]


def _silent_tool_failure_findings(trace: NormalizedTrace) -> list[Finding]:
    findings: list[Finding] = []
    for index, span in enumerate(trace.spans[:-1]):
        if span.type != "tool" or span.meta.get("status") != "error":
            continue
        key = (span.name, _args_hash(span))
        if any((later.name, _args_hash(later)) == key for later in trace.spans[index + 1 :]):
            continue
        findings.append(
            Finding(
                rule="silent-tool-failure",
                category="reliability",
                severity=2,
                span_ids=[span.id],
                message=f"Tool {span.name} failed without a later retry.",
            )
        )
    return findings


def _slow_span_findings(trace: NormalizedTrace) -> list[Finding]:
    return [
        Finding(
            rule="slow-span",
            category="reliability",
            severity=1,
            span_ids=[span.id],
            message=f"This step took {span.duration_ms:g}ms, above the {_SLOW_SPAN_MS}ms threshold.",
        )
        for span in trace.spans
        if span.duration_ms is not None and span.duration_ms > _SLOW_SPAN_MS
    ]


def analyze_roast(
    trace: NormalizedTrace, redaction_hits: Sequence[RedactionHit]
) -> list[Finding]:
    """Return findings from deterministic security and reliability rules."""

    return [
        *_leaked_secret_findings(redaction_hits),
        *_pii_findings(trace),
        *_insecure_url_findings(trace),
        *_tool_loop_findings(trace),
        *_error_tail_findings(trace),
        *_silent_tool_failure_findings(trace),
        *_slow_span_findings(trace),
    ]
