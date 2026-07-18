from typing import Literal

import pytest

from app.analyze.score import score, tier
from app.types import Category, Finding


def make_finding(
    severity: Literal[1, 2, 3], category: Category = "cost"
) -> Finding:
    return Finding(
        rule="test-rule",
        category=category,
        severity=severity,
        span_ids=["span-1"],
        message="Test finding",
    )


def test_score_applies_each_severity_deduction() -> None:
    findings = [make_finding(1), make_finding(2), make_finding(3)]

    assert score(findings) == 58


def test_security_deductions_are_multiplied_and_rounded() -> None:
    findings = [
        make_finding(1, "security"),
        make_finding(2, "reliability"),
        make_finding(3, "security"),
    ]

    assert score(findings) == 42


def test_score_floors_at_zero() -> None:
    findings = [make_finding(3, "security") for _ in range(3)]

    assert score(findings) == 0


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (90, "Rare"),
        (89, "Medium"),
        (65, "Medium"),
        (64, "Well Done"),
        (35, "Well Done"),
        (34, "Charcoal"),
    ],
)
def test_tier_boundaries(value: int, expected: str) -> None:
    assert tier(value) == expected
